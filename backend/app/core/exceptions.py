class DomainError(Exception):
    """Excepción base de dominio."""


class ImmutableRaffleError(DomainError):
    """Se intentó modificar una rifa con números ya generados."""


class ReservationLockedError(DomainError):
    """No se permite reservar (ventana bloqueada antes del sorteo)."""


class TicketUnavailableError(DomainError):
    """La boleta no está disponible."""


class PaymentAlreadyConfirmedError(DomainError):
    pass


class InvalidStateTransition(DomainError):
    pass
