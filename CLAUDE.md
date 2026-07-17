# libros-iselk

**SaaS multi-tenant de tiendas con sorteo** (pivote 2026-07-16, ADR-0005): Organizadores crean su cuenta, configuran su Tienda sobre una plantilla (logo/colores/textos — NO builder visual), suben productos digitales (MVP: PDF), montan su sorteo promocional y venden — cada tienda en su **subdominio**, cobrando con **su propia cuenta de Flow** (BYO-Flow). La autora ARMY original del encargo es el **tenant #1 / piloto**, y su tienda operativa es un hito con fecha propia (F07 del roadmap). Lo desarrolla y opera un freelancer (el **Operador de plataforma**).

T3 stack: Next.js 14 (pages router) + tRPC 11 + NextAuth 4 (Google OAuth para Organizadores) + Prisma 5 + PostgreSQL + shadcn/ui + Tailwind.

## Propósito y alcance

- **Qué es**: plataforma multi-tenant — storefront por subdominio (catálogo + carrito + checkout Flow por tenant) + entrega segura de PDFs + sorteo por tienda + panel de Organizador + self-service de alta + panel del Operador.
- **Principio rector**: sigue siendo **simple y barato** de construir y mantener. La plataforma NUNCA mueve plata de terceros (ADR-0006). No sobre-ingenierizar; MVP funcional sobre features avanzadas; el piloto (F07) antes que el self-service (F08).
- **Decisiones cerradas**: ver `docs/adr/` — Flow server-side (0001), entrega por URL firmada (0002), sin cuentas de comprador (0004), multi-tenant por `tenantId` en DB compartida (0005), BYO-Flow con credenciales cifradas (0006), resolución por subdominio (0007), responsabilidad legal del sorteo = del Organizador (0008), storage Cloudflare R2 (0009), correo Resend (0010). **Hermes (ADR-0003) fue RETIRADO del producto el 2026-07-17** por decisión del usuario — no construir features de copy IA.
- **Decisiones abiertas**: ver `docs/decisiones-abiertas.md` (#4 dominio de la plataforma con wildcard, #5 hosting con wildcard, #6 marca de agua). **No las cierres sin consultar al usuario.**
- **Vocabulario del dominio**: `CONTEXT.md` (Tienda/`Tenant`, Organizador, Operador, `Product`, `FlowCredential`…). Roadmap vigente: `tasks/26-07-16-saas-roadmap.md`.
- **Fuera de alcance (MVP)**: builder visual de tiendas, split de pagos / custodia de fondos, dominios custom por tenant, herramientas de copy IA (Hermes — retirado del producto), Mercado Pago directo, boletas SII automáticas, cuentas/login de compradores.
- **Legal/tributario**: cada Organizador responde por lo suyo (Inicio de Actividades SII, boleta, IVA 19%, bases del sorteo). La plataforma exige ToS + bases + muestra disclaimer (ADR-0008); validación por abogado pendiente antes del go-live público (F10).

## Reglas de oro del dominio

**Dinero: `Decimal`, NUNCA `Float`** ni aritmética con `number`. Aplica a precios, IVA (19%), comisiones de Flow (~3,44%) y el neto al vendedor. Operaciones que mueven plata van en `prisma.$transaction`. Montos en UI con `Intl.NumberFormat` (CLP).

**Tenancy: todo dato del dominio comercial lleva `tenantId` y toda query se filtra por el tenant resuelto SERVER-SIDE** (subdominio o sesión), nunca por input del cliente (ADR-0005; lección del bug H1 de datawalt-app). Uniques compuestos con `tenantId`.

Tres invariantes críticos más:
- **Pagos**: confirmación **server-side contra la API de Flow con las credenciales del tenant dueño de la orden**, nunca el redirect del navegador; webhook idempotente que rutea por tenant (ADR-0001/0006).
- **PDFs**: nunca enlace público; **R2 privado con paths per-tenant + URL prefirmada con expiración**, autorizada por el `Entitlement` de una orden pagada (ADR-0002/0009).
- **Credenciales de tenant** (`FlowCredential`): cifradas at-rest; secretos jamás en texto plano en DB, logs ni respuestas (ADR-0006).

## Harness de subagentes

El trabajo no trivial fluye por el **tridente**: `planner` (o `domain-planner` si el vocabulario importa) → `feature-implementer` → `feature-tester`. Satélites: `schema-guardian`, `backend-reviewer`, `frontend-reviewer`, `change-set-reviewer`, `troubleshooter`.

Reglas del orquestador (sesión principal):

- Pedido vago de feature/fix/refactor sin plan escrito → invocar `planner`. Si introduce conceptos nuevos del dominio → `domain-planner`.
- **Implementación solo tras visto bueno explícito del usuario al plan.** Nunca saltar del grill a escribir código.
- Relevar los mensajes de los subagentes al usuario tal cual (especialmente los `AWAITING ANSWER` / `AWAITING USER APPROVAL`) y re-invocarlos con las respuestas.
- Al invocar `change-set-reviewer`, pasarle la **lista explícita de archivos de la sesión** + el plan asociado.
- Bug o código que no se entiende → `troubleshooter`.

### Gestión de tareas

- Los planes del tridente viven en `tasks/` con naming `YY-MM-DD-<modulo>-<slug>.md`, formato en `tasks/_template.md`.
- `tasks/INDEX.md` es el índice autoritativo de qué está activo — lo mantienen los agentes.
- La **Bitácora** de cada task file es append-only: es la memoria compartida entre agentes y sesiones.
- Estados: `planning → implementing → testing → done`. Solo el `feature-tester` marca checkboxes `[x]`; los cambios de `state`/`status` finales los decide el usuario.
- PRDs e issues (skills `to-prd`, `to-issues`, `triage`) viven en `.scratch/<feature>/` — son sistemas separados: `.scratch/` para descubrimiento/triage, `tasks/` para ejecución del tridente.

### Gates

- `npm run check` = `check:types` (tsc) + `check:lint` (next lint) + `check:test` (vitest run). Lo corre el `change-set-reviewer` al cierre; el implementer NO lo corre (solo vitest filtrado durante TDD).
- Convenciones por capa en `docs/agents/*-conventions.md` (backend, frontend, prisma, commits, data-fetching) + rúbrica compartida en `docs/agents/evaluator-rubric.md`. Son seeds: crecen con cada decisión aprobada.

## Agent skills

### Issue tracker

Issues y PRDs viven como markdown local en `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Vocabulario por defecto: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: un `CONTEXT.md` + `docs/adr/` en la raíz. See `docs/agents/domain.md`.

## Diseño

- UI con shadcn/ui (new-york, CSS variables, lucide). Convenciones en `docs/agents/frontend-conventions.md`.
- **Línea gráfica completa en `docs/design.md`** — fuente de verdad de todo artefacto visual. Leerlo antes de generar cualquier cosa visual.
- **La paleta de marca y el nombre están PENDIENTES** (decisiones abiertas + identidad fandom/ARMY a definir). Resolver en una sesión de `frontend-design` / `domain-planner` antes de construir UI de marca — no inventar dirección visual propia.
