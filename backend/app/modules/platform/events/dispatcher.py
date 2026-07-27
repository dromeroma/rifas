"""Dispatcher — worker asíncrono que consume el outbox y ejecuta handlers.

Modelo simplificado para MVP:
  - Poll cada `poll_interval` segundos (default 0.5s).
  - Batch: hasta `batch_size` eventos por tick.
  - SELECT ... FOR UPDATE SKIP LOCKED → seguro con múltiples workers.
  - Por cada evento: itera handlers registrados en el bus, ejecuta con
    retry exponencial. Guarda resultado en event_handled con PK
    compuesta (event_id, handler_id) → doble ejecución imposible.

Loop de vida:

    dispatcher = Dispatcher(sessionmaker=AsyncSessionLocal, registry=registry)
    await dispatcher.start()   # devuelve control; corre en el event loop
    ...
    await dispatcher.stop()    # espera al drain del batch actual

En Fase 1 corremos el dispatcher como task del mismo proceso FastAPI.
Cuando el volumen lo requiera, se separa a servicio Render aparte con
el mismo código (ver ADR-002 en docs/decisions/).
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.modules.platform.events.bus import EventRegistry, registry as default_registry
from app.modules.platform.events.envelope import (
    Actor,
    Event,
    EventContext,
    Subject,
)
from app.modules.platform.events.errors import HandlerFailedError
from app.modules.platform.events.models import (
    EventHandled,
    EventOutbox,
    HandledStatus,
    OutboxStatus,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DispatcherConfig:
    """Parámetros de operación del dispatcher."""

    poll_interval: float = 0.5     # segundos entre ticks vacíos
    batch_size: int = 20           # eventos por tick
    max_handler_attempts: int = 5  # antes de marcar DEAD
    handler_timeout: float = 30.0  # timeout por handler (segundos)
    backoff_base: float = 2.0      # multiplicador exponencial
    backoff_max: float = 300.0     # tope del delay


class Dispatcher:
    """Worker asíncrono del event bus.

    No es thread-safe — corre en el event loop de asyncio. Múltiples
    dispatchers pueden coexistir en procesos distintos (SKIP LOCKED
    los coordina).
    """

    def __init__(
        self,
        sessionmaker: "async_sessionmaker[AsyncSession]",
        *,
        registry: EventRegistry | None = None,
        config: DispatcherConfig | None = None,
    ) -> None:
        self._sessionmaker = sessionmaker
        self._registry = registry or default_registry
        self._config = config or DispatcherConfig()
        self._running = False
        self._task: asyncio.Task[None] | None = None

    # ------------------------------------------------------------------
    # Ciclo de vida
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Arranca el loop de dispatch en background."""
        if self._running:
            logger.warning("Dispatcher.start() llamado con dispatcher ya corriendo")
            return
        self._running = True
        self._task = asyncio.create_task(self._run(), name="savvy-event-dispatcher")
        logger.info("event dispatcher iniciado")

    async def stop(self) -> None:
        """Detiene el loop. Espera al batch actual en curso."""
        self._running = False
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=10.0)
            except asyncio.TimeoutError:
                logger.error("dispatcher no terminó en 10s — cancelando")
                self._task.cancel()
        self._task = None
        logger.info("event dispatcher detenido")

    async def _run(self) -> None:
        while self._running:
            try:
                processed = await self.tick()
                if processed == 0:
                    await asyncio.sleep(self._config.poll_interval)
            except asyncio.CancelledError:
                raise
            except Exception:
                # Nunca dejamos morir el loop por una excepción no manejada.
                logger.exception("error inesperado en el loop del dispatcher")
                await asyncio.sleep(self._config.poll_interval)

    # ------------------------------------------------------------------
    # Batch / tick
    # ------------------------------------------------------------------

    async def tick(self) -> int:
        """Procesa un batch. Devuelve cuántos eventos se despacharon.

        Método público y agnóstico del loop — sirve para tests y para
        ejecutar el dispatcher "un paso a la vez" desde un cron.
        """
        async with self._sessionmaker() as db:
            events = await self._claim_batch(db)
            if not events:
                return 0

            for row in events:
                await self._process_one(row, db)

            await db.commit()
            return len(events)

    async def _claim_batch(self, db: "AsyncSession") -> list[EventOutbox]:
        """Toma hasta `batch_size` pendings con SKIP LOCKED."""
        stmt = (
            select(EventOutbox)
            .where(EventOutbox.status == OutboxStatus.PENDING)
            .order_by(EventOutbox.id.asc())
            .limit(self._config.batch_size)
            .with_for_update(skip_locked=True)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Procesamiento por evento
    # ------------------------------------------------------------------

    async def _process_one(
        self,
        row: EventOutbox,
        db: "AsyncSession",
    ) -> None:
        """Ejecuta todos los handlers de un evento y marca el outbox."""
        event = self._rehydrate(row)
        handlers = self._registry.handlers_for(event.type)

        if not handlers:
            logger.debug(
                "sin handlers registrados para %r — marcando dispatched",
                event.type,
            )
            await self._mark_dispatched(row, db)
            return

        all_terminal = True
        for handler_id, handler_fn in handlers:
            outcome = await self._run_handler(event, handler_id, handler_fn, db)
            if outcome == HandledStatus.FAILED:
                # No es terminal: el evento se queda en PENDING para retry.
                all_terminal = False

        if all_terminal:
            await self._mark_dispatched(row, db)
        else:
            # Bump attempts; el poll re-lo tomará en el próximo tick.
            row.attempts += 1

    async def _run_handler(
        self,
        event: Event,
        handler_id: str,
        handler_fn,
        db: "AsyncSession",
    ) -> HandledStatus:
        """Ejecuta un handler con timeout + registro de resultado.

        Devuelve el HandledStatus final (SUCCESS, FAILED o DEAD).
        Idempotencia: si (event_id, handler_id) ya está en SUCCESS o
        DEAD, se saltea sin volver a ejecutar.
        """
        prior = await db.get(EventHandled, (event.id, handler_id))
        if prior is not None and prior.status in (
            HandledStatus.SUCCESS,
            HandledStatus.DEAD,
        ):
            return prior.status

        attempts_so_far = prior.attempts if prior is not None else 0
        try:
            await asyncio.wait_for(
                handler_fn(event, db),
                timeout=self._config.handler_timeout,
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — el bus captura todo
            attempts = attempts_so_far + 1
            terminal = attempts >= self._config.max_handler_attempts
            new_status = HandledStatus.DEAD if terminal else HandledStatus.FAILED
            await self._upsert_handled(
                db,
                event_id=event.id,
                handler_id=handler_id,
                status=new_status,
                attempts=attempts,
                last_error=repr(exc),
            )
            logger.warning(
                "handler %r falló en %s (intento %d/%d, status=%s): %s",
                handler_id,
                event.id,
                attempts,
                self._config.max_handler_attempts,
                new_status.value,
                exc,
            )
            if terminal:
                raise HandlerFailedError(event.id, handler_id, exc) from exc
            return new_status

        attempts = attempts_so_far + 1
        await self._upsert_handled(
            db,
            event_id=event.id,
            handler_id=handler_id,
            status=HandledStatus.SUCCESS,
            attempts=attempts,
            last_error=None,
        )
        return HandledStatus.SUCCESS

    async def _upsert_handled(
        self,
        db: "AsyncSession",
        *,
        event_id: str,
        handler_id: str,
        status: HandledStatus,
        attempts: int,
        last_error: str | None,
    ) -> None:
        """INSERT ... ON CONFLICT UPDATE sobre event_handled."""
        stmt = pg_insert(EventHandled).values(
            event_id=event_id,
            handler_id=handler_id,
            status=status,
            attempts=attempts,
            last_error=last_error,
            handled_at=datetime.now(timezone.utc),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[EventHandled.event_id, EventHandled.handler_id],
            set_={
                "status": status,
                "attempts": attempts,
                "last_error": last_error,
                "handled_at": datetime.now(timezone.utc),
            },
        )
        await db.execute(stmt)

    async def _mark_dispatched(
        self,
        row: EventOutbox,
        db: "AsyncSession",
    ) -> None:
        row.status = OutboxStatus.DISPATCHED
        row.dispatched_at = datetime.now(timezone.utc)

    def _rehydrate(self, row: EventOutbox) -> Event:
        """Reconstruye el envelope tipado desde la fila del outbox."""
        return Event(
            id=row.event_id,
            type=row.type,
            version=row.version,
            occurred_at=row.occurred_at,
            tenant_id=row.tenant_id,
            actor=Actor.model_validate(row.actor),
            subject=Subject.model_validate(row.subject),
            context=EventContext.model_validate(row.context or {}),
            data=dict(row.data or {}),
            idempotency_key=row.idempotency_key,
        )
