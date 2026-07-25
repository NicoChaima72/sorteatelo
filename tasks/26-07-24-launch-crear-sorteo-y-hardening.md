---
slug: launch-crear-sorteo-y-hardening
status: planning              # planning | implementing | testing | done
owner: nicolas
created: 2026-07-24
related_adrs: [ADR-0001, ADR-0005, ADR-0006, ADR-0008, ADR-0018, ADR-0019]
related_context: [Sorteo, Raffle, RaffleEntry, Orden, Payment, Tenant]

features:
  - id: F01
    behavior: "El Organizador crea un Raffle ACTIVO desde admin/sorteo (nombre, premio, fechaFin, bases opcional); el use case rechaza si ya hay uno ACTIVO en su Tienda"
    state: not_started

  - id: F02
    behavior: "El Organizador edita el Raffle ACTIVO (nombre, premio, fechaFin, bases) antes de ejecutarlo; una vez CERRADO ya no se edita"
    state: not_started

  - id: F03
    behavior: "El webhook de Flow compara el amount de getStatus contra el monto esperado del Payment antes de marcar PAGADO; si difiere, no transiciona (log + ack 200)"
    state: not_started

  - id: F04
    behavior: "Se elimina la superficie muerta/insegura: /api/dev/login, /api/dev/echo-tenant y el router post boilerplate + su registro en el root router"
    state: not_started

  - id: F05
    behavior: "E2E automatizado del flujo de pago (Playwright + Flow sandbox) — feature de menor prioridad, puede diferirse"
    state: not_started

  - id: F06
    behavior: "CSP Report-Only → enforcing con nonce en script-src (quitar 'unsafe-inline' en prod) — ÚLTIMO paso, alto riesgo, coordinado con catálogo-v2; DIFERIDO pendiente de decisión del usuario"
    state: not_started
---

# Crear sorteo desde el panel + hardening de launch-readiness

## Contexto

Auditoría de launch-readiness del SaaS Sortéatelo. El usuario aprobó atacar dos frentes
(#1 y #4 de la auditoría); descartó la infra (#2), el piloto (#3) lo lleva un agente
paralelo, y legal (#5) / go-live (#6) van después.

**Frente 1 — bloqueador de PRODUCTO.** Hoy NO existe forma de crear un `Raffle` desde el
panel: `raffle.create` solo vive en `scripts/seed-*.ts`. El router `panel` solo expone
`getSorteo` + `ejecutarSorteo`. Consecuencia verificada: un Organizador marca un producto
`participaEnSorteo`, publica y vende, pero como no hay `Raffle` ACTIVO,
`aplicarEfectosPostPago` DESCARTA los tickets en silencio. Además el dashboard
(`admin/index.tsx`) invita "Crea un sorteo → Ir al sorteo", pero `admin/sorteo.tsx` solo
tiene empty-state sin formulario de creación. El sorteo es el diferenciador del producto.

**Frente 2 — hardening (punch-list de la auditoría).** Cuatro correcciones verificadas:
chequeo de monto en el webhook (defensa en profundidad del dinero), borrado de superficie
muerta/insegura (endpoints dev + router boilerplate), E2E automatizado del pago (lift mayor,
diferible) y el flip de la CSP a enforcing con nonce (alto riesgo, coordinado con el agente
paralelo de catálogo-v2 que construye los embeds sandbox AHORA).

**Cordón de árbol compartido (DURO).** Un agente paralelo (catálogo-v2 / builder visual)
muta EN VIVO el mismo working tree: `prisma/schema.prisma`, `_app.tsx`,
`src/components/editor/**`, `src/lib/editor/**`, `src/components/storefront/**`,
`src/lib/pagebuilder/**`, `docs/design.md`. **NO tocamos nada de eso.** Este trabajo vive en
`src/server/domain/panel|tenants`, `src/server/api/routers/panel.ts`,
`src/pages/admin/sorteo.tsx`, `src/pages/admin/index.tsx` (solo copy), `src/server/pago/*`,
los endpoints `src/pages/api/dev/*` (borrado) y `src/server/api/routers/post.ts` + root
(borrado). El único archivo compartido inevitable es `src/server/api/root.ts` (F04, quitar
una línea) — riesgo mínimo, pero coordinar el timing con el agente paralelo. La CSP
(`csp.ts`/`middleware.ts`) es F06 y va diferida.

**El modelo `Raffle` YA ESTÁ COMPLETO — NO se toca el schema** (verificado: `nombre`,
`premio`, `estado RaffleStatus @default ACTIVO`, `fechaInicio`, `fechaFin`, `basesUrl?`,
`premioImageUrl?`, `ganadorEmail?/ejecutadoAt?/ejecutadoPor?`, `tenantId`, `@@index
[tenantId, estado]`). El invariante "1 Raffle ACTIVO por tenant" es guard de use case, NO
constraint de DB (comentario S5 del schema).

## Decisiones

- **D1: `crearSorteo` es un use case nuevo en `src/server/domain/panel/crearSorteo.ts`**,
  scoped por `resolverTenantAutorizado({ esOperador, tenantIdsDeMembresia })` (server-side,
  I1/ADR-0005 — el `tenantId` JAMÁS del input). Sigue el patrón fino router→runDomain→use
  case del resto de `panel`. Razón: consistencia con `ejecutarSorteo`/`publicarTienda`.

- **D2: `crearSorteo` corre dentro de `db.$transaction` y RECHAZA fail-closed si ya existe
  un Raffle ACTIVO del tenant** (`tx.raffle.findFirst({ where: { tenantId, estado: "ACTIVO" }})`
  → si existe, `DomainError("CONFLICT", …)`). El chequeo + el `create` van en la MISMA tx
  para que el guard no quede obsoleto entre el check y el insert (mismo criterio que la
  carrera D8 de `crearTienda` y el guard atómico de `ejecutarSorteo`). Razón: el invariante
  1-ACTIVO es de use case (S5), y sin constraint de DB la única defensa es el guard atómico.

- **D3: la creación es `estado: ACTIVO` (default del schema), `fechaInicio = ahora`
  inyectable, `fechaFin` obligatoria y validada > `fechaInicio` server-side.** `ahora = new
  Date()` inyectable como en `ejecutarSorteo` (testear sin reloj). Razón: un sorteo se crea
  para estar activo ya; el opt-in por producto (`participaEnSorteo`) ya existe.

- **D4: el input `crearSorteoInput` = `{ nombre, premio, fechaFin, basesUrl? }`.** `nombre`
  y `premio` strings 1..200 trim; `fechaFin` `z.coerce.date()` validada futura en el use
  case (mensaje humano, no solo Zod); `basesUrl` opcional (`z.string().url().optional().or(
  z.literal(""))`) → persiste en `Raffle.basesUrl` (campo del schema hoy sin uso). NO incluye
  `premioImageUrl` (ver D5) ni `fechaInicio` (server-side). Razón: mínimo viable; el resto
  se deriva o se sube aparte.

- **D5: la imagen del premio NO va en el form de creación — se sube con el `AssetUploader`
  YA EXISTENTE de `admin/sorteo.tsx`, que exige un `raffleId`.** El `AssetUploader` con
  `destino={{ destino: "premio", raffleId }}` (presigned PUT al bucket público, plantilla-rica
  F03/ADR-0013) ya está cableado y solo se muestra cuando hay sorteo y `!ejecutado`. La imagen
  se agrega DESPUÉS de crear el sorteo (patrón "recurso con id ya existente" de
  `use-subir-imagen.ts`; los recursos sin id difieren la subida). Razón: reusar exactamente
  lo que ya funciona; cero código nuevo de subida.

- **D6: EDITAR es un use case aparte `editarSorteo` (`src/server/domain/panel/editarSorteo.ts`)**
  que solo permite editar un Raffle cuando `ejecutadoAt IS NULL` (ACTIVO, no ejecutado). Si
  el sorteo ya se ejecutó (CERRADO) → `DomainError("CONFLICT", …)`. Edita `nombre`, `premio`,
  `fechaFin`, `basesUrl` (NO `estado`, NO `premioImageUrl` que va por el AssetUploader, NO
  campos de ejecución). Scoped por tenant + `raffleId` del input validado contra el tenant.
  Razón: separar crear/editar mantiene cada use case fino y testeable; el gate `!ejecutado`
  espeja el que ya usa la UI.

- **D7: interacción con el gate de publicación (ADR-0008) — SIN CAMBIOS de código.** El gate
  (`_publicacion.ts` vía `publicarTienda`) ya exige `Tenant.basesSorteo` (texto legal a nivel
  Tienda, editado en Configuración) cuando `hayRaffleActivo`. Crear un Raffle ACTIVO ACTIVA
  ese requisito automáticamente. NO duplicar bases: `Raffle.basesUrl` (D4) es un enlace
  opcional informativo del sorteo, distinto del `Tenant.basesSorteo` legal del gate. La UI de
  sorteo muestra un hint: "Para publicar con un sorteo activo, carga las bases legales en
  Configuración". Razón: el gate ya está implementado y probado; no re-tocarlo.

- **D8: el copy del dashboard deja de mentir con cambios mínimos en `admin/index.tsx`.** Una
  vez que existe el form (F01), el empty-state "Crea un sorteo… → Ir al sorteo" ya es honesto
  (el link `/admin/sorteo` ahora lleva a un form real). Ajustar solo el texto del botón/CTA si
  hace falta para que apunte a "Crear sorteo" en vez de "Ir al sorteo". Sin lógica nueva.
  Razón: el mentir era la ausencia del form, no el copy en sí.

- **D9: el chequeo de monto (F03) compara `flowPago.amount` (número, getStatus) contra
  `Payment.monto` (Decimal, = Order.total).** El enrutador (`enrutarPagoFlow.ts`) ya lee el
  `Payment`; se le agrega `montoEsperado` (de `Payment.monto`) al `FlowRuteado`. En
  `webhookFlow.ts`, ANTES de `confirmarPago` en la rama PAGADO: si `flowPago.amount` está
  presente y NO iguala `montoEsperado` (comparación entera CLP), NO transicionar → log
  estructurado + ack 200 (`{ received: true, ignorado: "amount_mismatch" }`). Si `amount`
  viene `undefined`, log de warning pero proceder (Flow puede omitirlo; no romper pagos
  legítimos). Razón: defensa en profundidad del dinero server-side (regla de oro), sin
  falsos negativos que bloqueen ventas reales.

- **D10: F03 preserva el patrón núcleo + wrapper (I7).** El chequeo vive en el núcleo puro
  `manejarWebhookFlow` (testeable con Vitest, sin DB); el wrapper `flow.ts` y el repo
  `crearRepoRuteoFlow` solo cablean `montoEsperado` desde `Payment.monto`. Razón: mantener la
  testabilidad ya existente del webhook.

- **D11: F06 (CSP enforcing) se DIFIERE.** La CSP está en Report-Only A PROPÓSITO para no
  romper los estilos inline de Mantine ni el HMR; pasar a enforcing con nonce en `script-src`
  puede ROMPER el storefront y los embeds sandbox que el agente paralelo de catálogo-v2
  construye AHORA. Recomendación: NO ejecutar F06 hasta que el storefront/embeds estén
  estables y el agente paralelo haya cerrado. Es la única decisión de producto/coordinación
  bloqueante → **AWAITING USER**.

## Plan

1. **Red de seguridad (previo, recomendación al usuario):** commitear el trabajo admin no
   commiteado del working tree (`admin/*`, `panel-card.tsx`, etc.) ANTES de implementar. El
   árbol está frágil por el agente paralelo; un commit limpio da punto de retorno. (previo)

2. Definir `crearSorteoInput` y `editarSorteoInput` en `src/server/domain/panel/schemas.ts`
   (D4/D6). (F01, F02)

3. Implementar `crearSorteo` en `src/server/domain/panel/crearSorteo.ts`: resolver tenant
   server-side, $tx con guard atómico 1-ACTIVO (D2), validar `fechaFin` futura, crear con
   `fechaInicio = ahora` (inyectable) y `estado ACTIVO`. (F01)

4. Implementar `editarSorteo` en `src/server/domain/panel/editarSorteo.ts`: resolver tenant,
   cargar el raffle del tenant por `raffleId`, rechazar si `ejecutadoAt != null` (D6),
   actualizar campos editables. (F02)

5. Registrar `crearSorteo` y `editarSorteo` como `panelProcedure` en `panel.ts`
   (`crearSorteo` mutation, `editarSorteo` mutation), delegando vía `runDomain`. (F01, F02)

6. UI en `admin/sorteo.tsx`: cuando NO hay sorteo, mostrar un form de creación (Mantine
   `useForm`: nombre, premio, `DateInput`/`DateTimePicker` fechaFin, bases opcional) en vez
   del `EmptyState` puro. Cuando hay sorteo ACTIVO no ejecutado, agregar un modo edición
   (form pre-poblado) junto al `AssetUploader` de premio ya existente (D5) y el hint de bases
   del gate (D7). Cuando está CERRADO, todo read-only (como hoy). (F01, F02)

7. Ajustar el copy del CTA del dashboard en `admin/index.tsx` para que sea honesto (D8). (F01)

8. F03 — Chequeo de monto: agregar `montoEsperado` (de `Payment.monto`) al `PagoConCredencial`
   / `FlowRuteado` en `enrutarPagoFlow.ts` (repo select + retorno); comparar en
   `manejarWebhookFlow` antes de `confirmarPago` en la rama PAGADO (D9/D10). (F03)

9. F04 — Borrar `src/pages/api/dev/login.ts`, `src/pages/api/dev/echo-tenant.ts`,
   `src/server/api/routers/post.ts` y su registro `post: postRouter` en `src/server/api/root.ts`.
   ANTES de borrar, `Grep` de usos de `api.post.*`, `dev/login`, `dev/echo-tenant`,
   `postRouter` en todo el repo para confirmar cero referencias de producción. (F04)

10. F05 — E2E automatizado del pago (Playwright + Flow sandbox): planificado como feature de
    MENOR prioridad; puede quedar para después del launch inmediato. NO implementar en esta
    sesión salvo indicación. (F05)

11. F06 — CSP enforcing con nonce: DIFERIDO (D11). Documentado como último paso, coordinado
    con catálogo-v2. NO implementar hasta visto bueno explícito. (F06)

## Validaciones

### F01 — Crear sorteo desde el panel

**Vitest** (integration):
- [ ] `crearSorteo` crea un Raffle ACTIVO del tenant resuelto server-side con nombre/premio/fechaFin correctos y `fechaInicio = ahora`
- [ ] `crearSorteo` RECHAZA (CONFLICT) si el tenant ya tiene un Raffle ACTIVO, sin crear un segundo
- [ ] `crearSorteo` RECHAZA (INVALID) si `fechaFin` no es futura respecto a `ahora`
- [ ] `crearSorteo` permite crear un nuevo ACTIVO si el único raffle previo del tenant está CERRADO
- [ ] `crearSorteo` sin membresía / tenant ajeno → FORBIDDEN (nunca usa `tenantId` del input)
- [ ] `basesUrl` opcional: vacío persiste como null/ausente; una URL válida se persiste en `Raffle.basesUrl`

**E2E** (browser):
- [ ] Desde `admin/sorteo` sin sorteo, el Organizador completa el form y crea un sorteo ACTIVO que aparece en la vista y en la card del dashboard
- [ ] Tras crear, el `AssetUploader` de imagen del premio queda disponible y sube una imagen (reuso existente)

### F02 — Editar el sorteo ACTIVO

**Vitest** (integration):
- [ ] `editarSorteo` actualiza nombre/premio/fechaFin/basesUrl del Raffle ACTIVO del tenant
- [ ] `editarSorteo` RECHAZA (CONFLICT) si el Raffle ya fue ejecutado (`ejecutadoAt != null`)
- [ ] `editarSorteo` con `raffleId` de otro tenant → NOT_FOUND/FORBIDDEN
- [ ] `editarSorteo` no permite mutar `estado`, `premioImageUrl` ni campos de ejecución

**E2E** (browser):
- [ ] El Organizador edita el sorteo activo desde el panel y ve los cambios reflejados
- [ ] Un sorteo ya ejecutado (CERRADO) se muestra read-only, sin form de edición

### F03 — Chequeo de monto en el webhook

**Vitest** (integration):
- [ ] Con `flowPago.amount` == `montoEsperado`, el webhook transiciona a PAGADO normalmente
- [ ] Con `flowPago.amount` != `montoEsperado`, el webhook NO transiciona (no llama `confirmarPago`), loguea y responde 200 con `ignorado: "amount_mismatch"`
- [ ] Con `flowPago.amount` undefined, el webhook procede (log de warning) — no bloquea pagos legítimos
- [ ] El enrutador expone `montoEsperado` derivado de `Payment.monto` para el token ruteado

**E2E** (browser):
- [ ] (no aplica — backend-only; cubierto por Vitest del núcleo + verificación de la corrida real de Flow sandbox si se hace F05)

### F04 — Borrar superficie muerta/insegura

**Vitest** (integration):
- [ ] La suite completa sigue verde tras borrar `post` router y los endpoints dev (cero regresión; ningún test dependía de ellos)

**E2E** (browser):
- [ ] (no aplica — es un borrado; validación = `npm run check` verde + Grep de cero referencias a `api.post.*`, `dev/login`, `dev/echo-tenant`, `postRouter`)

### F05 — E2E automatizado del flujo de pago

**Vitest**:
- [ ] (no aplica — es infra de test E2E, no lógica de dominio)

**E2E** (browser):
- [ ] (a definir en su propia sesión — Playwright + Flow sandbox; feature diferible)

### F06 — CSP Report-Only → enforcing con nonce

**Vitest**:
- [ ] (a definir cuando se apruebe — `construirCSP` con nonce en `script-src`, `frame-ancestors` de preview intacto)

**E2E** (browser):
- [ ] (a definir cuando se apruebe — storefront, panel, editor y embeds sandbox NO se rompen con la CSP enforcing)

## Invariantes

- I1: **NO tocar `prisma/schema.prisma`.** El modelo `Raffle` ya está completo; un agente
  paralelo edita el schema — cualquier cambio de schema desde esta tarea es colisión.
- I2: El `tenantId` se resuelve SIEMPRE server-side (`resolverTenantAutorizado`), JAMÁS del
  input (ADR-0005). Los nuevos use cases siguen el patrón fino router→runDomain→domain.
- I3: El guard "1 Raffle ACTIVO por tenant" es de use case, dentro de `$transaction`, atómico
  (check + create en la misma tx). No se agrega constraint de DB.
- I4: `editarSorteo` solo opera sobre raffles NO ejecutados; nunca muta `estado`,
  `premioImageUrl` ni campos de ejecución.
- I5: El webhook conserva núcleo + wrapper (I7 del repo): el chequeo de monto va en el núcleo
  puro; el borde solo cabla `montoEsperado`. El chequeo NUNCA bloquea un pago cuyo `amount`
  Flow no informa (undefined).
- I6: F04 solo borra si un Grep confirma cero referencias de producción. El feature-tester usa
  login OAuth manual (no `dev/login`), así que su borrado no rompe el testing autenticado.
- I7: El único archivo compartido con el agente paralelo que se toca es `src/server/api/root.ts`
  (F04, quitar `post`). Coordinar el timing; no tocar ningún otro archivo del cordón.
- I8: F06 (CSP enforcing) NO se implementa sin visto bueno explícito del usuario y coordinación
  con el cierre de catálogo-v2.

## Out of scope

- Cualquier cambio de `prisma/schema.prisma` (I1).
- El builder visual, editor, storefront, pagebuilder, `_app.tsx`, `docs/design.md` (cordón del
  agente paralelo).
- Duplicar las bases legales del sorteo: el gate sigue usando `Tenant.basesSorteo`; `Raffle.basesUrl`
  es solo un enlace informativo (D7).
- Subir la imagen del premio DESDE el form de creación (se hace con el `AssetUploader` existente
  tras crear, D5).
- Implementar F05 (E2E Playwright) y F06 (CSP enforcing) en esta sesión — quedan planificados
  pero diferidos.
- Modificar el algoritmo de `ejecutarSorteo` o `getSorteoDelPanel` (solo se consume la lectura).

## Especialistas a consultar

- `backend-reviewer` — los use cases nuevos (`crearSorteo`/`editarSorteo`), el procedure de
  `panel.ts` y el cambio del webhook/enrutador (auth, tenancy, dinero server-side).
- `frontend-reviewer` — el form de creación/edición en `admin/sorteo.tsx` (Mantine, convenciones
  visuales del panel) y el ajuste de copy del dashboard.
- `change-set-reviewer` — review final del diff antes de commit, con la lista explícita de
  archivos de la sesión + este plan. CRÍTICO por el árbol compartido.
- `feature-tester` — Vitest + E2E asistido (crear/editar sorteo con sesión OAuth; el webhook es
  backend-only).

## Bitácora

- [2026-07-24 00:00] [planner-grill] Plan escrito en UNA pasada por instrucción del usuario (no grill interactivo). Contexto reconstruido leyendo: `panel.ts`, `getSorteoDelPanel.ts`, `ejecutarSorteo.ts`, `admin/sorteo.tsx`, `admin/index.tsx`, `publicarTienda.ts`, `_publicacion` (vía publicarTienda), `asset-uploader.tsx`, `use-subir-imagen.ts`, `schemas.ts` del panel, `webhookFlow.ts`, `enrutarPagoFlow.ts`, `confirmarPagoDeOrden.ts`, `flow.ts` (FlowGetStatusResponse), y el schema (`Raffle`, `RaffleEntry`, `Order`, `Payment`) SIN editarlo.
- [2026-07-24 00:00] [planner-grill] Hallazgos que moldearon el plan: (1) el `AssetUploader` de premio YA está cableado en `admin/sorteo.tsx` y exige `raffleId` ⇒ la imagen se sube tras crear, no en el form (D5). (2) El gate de publicación ya exige `Tenant.basesSorteo` cuando `hayRaffleActivo` ⇒ crear un ACTIVO activa el requisito sin código nuevo (D7). (3) `Payment.monto` (= Order.total) ya existe ⇒ el chequeo de monto del webhook compara contra él sin join a Order (D9). (4) `ejecutarSorteo`/`crearTienda` establecen el patrón de guard atómico en $tx que `crearSorteo` reusa (D2).
- [2026-07-24 00:00] [planner-grill] Única decisión bloqueante dejada AWAITING: el timing de F06 (CSP enforcing) — recomendación DIFERIR hasta que catálogo-v2/embeds estén estables (D11/I8).
