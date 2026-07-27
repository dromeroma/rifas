# 01 · Principios

Reglas de decisión del producto y de la arquitectura. Cualquier propuesta que las rompa, se rechaza — o abre un ADR para cambiarlas de forma consciente.

---

## Filtro maestro

> **¿Ayuda a que el cliente vuelva?**
> Si la respuesta no es un sí evidente y medible, no pertenece al producto.

Se aplica en:
- Roadmap → antes de aceptar un feature request.
- Diseño → antes de agregar un campo a un formulario.
- Arquitectura → antes de agregar un servicio o integración.
- UI → antes de agregar un botón, tab o setting.

---

## Principios de producto

**P1. Customer-centric, no feature-centric.**
Toda pantalla, tabla y endpoint gira alrededor del cliente final del tenant. Si un feature no tiene un `customer_id` involucrado, es sospechoso.

**P2. Cero fricción para el cliente final.**
El cliente NUNCA debe descargar una app, crear una cuenta o aprender un botón para ganar un perk. El evento del mundo real (comprar, pagar, cumplir años) es lo que dispara la recompensa. Todo lo demás es opcional.

**P3. El admin de la empresa no es programador.**
Reglas, campañas y recompensas se configuran con lenguaje humano y drag-drop. Ningún flujo esencial exige entender JSON, SQL o webhooks.

**P4. Latam-first.**
Precios en pesos, WhatsApp como canal principal, Nequi/Daviplata/PSE nativos, contenido en español natural (no traducido). Antes de "internacionalizar", ganemos la región.

**P5. Cada feature nace con métrica.**
Si un feature no tiene una métrica que demuestre que "funciona", no se merge a main. La métrica se define en el PRD antes del PR.

**P6. Ley del segundo caso de uso.**
No abstraigas hasta tener dos casos reales que compartan el patrón. Repetir código es más barato que revertir una mala abstracción.

**P7. No feature flags como muleta.**
Los flags sirven para experimentos y rollout gradual, no para acumular deuda de "código muerto que quizá vuelve".

---

## Principios de arquitectura

**A1. Multi-tenant desde el primer commit.**
Cada tabla nueva lleva `tenant_id` obligatorio y se filtra por scope. Cross-tenant queries solo por SUPER_ADMIN y con auditoría.

**A2. API-first.**
Todo lo que hace la UI se puede hacer por API pública documentada. La UI es un cliente más. OpenAPI generado, contratos versionados.

**A3. Event-driven interno.**
Cada acción de dominio emite un evento. La lógica cross-módulo se conecta por eventos, no por llamadas directas. Facilita: reglas, campañas, integraciones, auditoría, testing.

**A4. Modular monolith, no microservicios prematuros.**
Un solo deploy hasta que la evidencia (tráfico, equipo, dominio) obligue a partir. Boundaries limpios por módulo permiten cortar cuando toque.

**A5. Base de datos como fuente de verdad.**
No hay caches ni derivados sin invalidación clara. Postgres primero; Redis solo cuando duela.

**A6. Idempotencia en todo lo que cruza red.**
Eventos, webhooks, endpoints de pago, notificaciones. Cada operación acepta un `idempotency_key` o deriva uno determinístico.

**A7. Trazabilidad total.**
Todo cambio de estado deja `audit_log` con actor, IP, request-id, before/after. Los eventos son inmutables. Los pagos jamás se eliminan — se anulan.

**A8. Seguridad por defecto.**
- Autenticación obligatoria excepto endpoints públicos explícitos.
- Rate limiting por tenant + por IP.
- Secretos en variables de entorno, nunca en repo.
- PII cifrada en reposo (Postgres) para campos sensibles.

**A9. Diseñado para migración.**
El día que un módulo (rewards, campaigns, AI) crezca, debe salir a un servicio separado sin reescribir el resto. Boundaries respetados.

---

## Principios de diseño (UX)

**U1. Un producto de consumo con capacidades B2B.**
La UI de admin se siente como Linear o Arc, no como SAP.

**U2. Reducir cognitive load antes de agregar potencia.**
Cada tab, badge o filtro nuevo pasa por revisión: ¿cabe en la pantalla mental del usuario?

**U3. Motion tiene significado.**
Cada animación comunica cambio de estado, jerarquía o feedback. No animaciones decorativas.

**U4. Datos densos, jerarquía clara.**
Las tablas son inevitables. Pero cada una respeta: contraste, tabular numerics, primary/secondary information, sticky headers, filtros aparentes.

**U5. Dark mode nativo desde MVP.**
Los tokens de color se diseñan para ambos temas al mismo tiempo.

**U6. Móvil first para el cliente final, desktop first para el admin.**
El admin trabaja en compu; el cliente final vive en el celular.

---

## Anti-patrones prohibidos

- **"Lo hacemos por si acaso"** — sin caso real, no se hace.
- **"Después lo generalizo"** — no. Se generaliza cuando aparezca el segundo caso.
- **"El usuario lo pidió"** — la mitad de las veces el usuario pide el síntoma, no el problema. Preguntamos por qué.
- **"Ya lo tenemos en otro sistema, copiémoslo"** — cada dominio merece su modelo. Copia-pega mata productos.
- **"Config en la base"** — la config del sistema vive en código y migraciones; solo la config del **negocio** vive en BD.
- **"UI custom por cliente"** — no. White-label sí (colores, logo, dominio). Formularios custom no.
