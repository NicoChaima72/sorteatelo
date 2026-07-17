---
slug: efectos-post-pago-tenant
status: testing               # planning | implementing | testing | done
owner: nicolas
created: 2026-07-16
related_adrs: [ADR-0001, ADR-0002, ADR-0005, ADR-0006]
related_context: [Orden, ÍtemDeOrden, Pago, Entitlement, Sorteo, Participación, Producto, Tienda, Comprador]

features:
  - id: F01
    behavior: "Modelos post-pago per-tenant: DownloadGrant / Raffle / RaffleEntry (+ enum RaffleStatus) con tenantId, onDelete/índices/uniques compuestos donde aplique, aplicados con db push aditivo, y seed del Raffle ACTIVO por tenant vía scripts/"
    state: active

  - id: F02
    behavior: "Use case aplicarEfectosPostPago tenant-aware: al confirmar el pago crea N DownloadGrant (uno por OrderItem) + 1 RaffleEntry en el Raffle ACTIVO de ESA Tienda, idempotente, dentro de la MISMA $transaction, cableado en lugar de noopEfectosPostPago sin tocar el núcleo del webhook"
    state: active
---

# Efectos post-pago per-tenant — Entitlement (DownloadGrant) + Participación (RaffleEntry)

> **Fase F02 del roadmap** (`tasks/26-07-16-saas-roadmap.md`). Adapta el plan superseded
> `tasks/26-07-08-efectos-post-pago.md` (su contrato sigue válido) agregando el scoping por
> `tenantId` (ADR-0005). Se ejecuta **en paralelo con F05** (otra terminal) — ver D8
> (coordinación de zonas compartidas).

## Contexto

F01 del roadmap cerró (done, prueba de fuego D1 cumplida): el webhook de Flow confirma el pago
**server-side con las credenciales del tenant dueño de la orden** (ruteo token⇒Payment⇒tenant),
avanza `Order`/`Payment` `PENDIENTE → PAGADO` idempotentemente dentro de una `prisma.$transaction`,
e invoca **una sola vez, solo en esa transición**, el hook post-pago que hoy es no-op:
`src/server/domain/pago/efectosPostPago.ts` define el contrato
`({ tx, orderId }) => Promise<void>` y `noopEfectosPostPago` está cableado en el wrapper
`src/pages/api/webhooks/flow.ts`. **F02 rellena ese hook, no lo reescribe.**

Al confirmarse un pago hay que materializar los dos efectos de negocio de una venta pagada — el
**Entitlement** (`DownloadGrant`, autoridad de descarga por producto, ADR-0002) y la
**Participación** (`RaffleEntry`, inscripción en el **Sorteo activo de ESA Tienda**, CONTEXT §
Sorteo) — en la **misma transacción** que la transición de estado, de forma **idempotente**. Todo
scoped por tenant: los tres modelos nuevos llevan `tenantId`, el `Raffle` activo se busca dentro de
la Tienda de la orden (nunca globalmente), y el `tenantId` de los efectos se deriva **server-side
de la orden cargada vía `tx`** — jamás de input.

Alcance estricto (criterio de hecho del roadmap): pago confirmado ⇒ N grants + 1 entry del sorteo
ACTIVO **de esa Tienda**, una sola vez; sin sorteo activo, la entry se omite y la venta **NO se
compromete**. **NO** hay entrega física del PDF (URL firmada / R2 → F03), **NO** hay correo (F04),
**NO** hay UI ni panel (F05/F06). El `Raffle` activo se **siembra vía script** por tenant (el CRUD
del sorteo llega en F05).

## Decisiones

Por instrucción explícita del usuario esta fase se planifica **sin grill extenso**: decisiones
resueltas por criterio, marcadas como Supuestos revisables donde corresponde. Sin `AWAITING ANSWER`
(ninguna pregunta resultó estructural imposible de asumir).

- **D1 — El hook post-pago ya existe; F02 solo lo rellena.** El contrato
  `EfectosPostPago = ({ tx: Prisma.TransactionClient; orderId: string }) => Promise<void>`
  está definido en `src/server/domain/pago/efectosPostPago.ts` y garantizado aguas arriba por el
  núcleo del webhook (una invocación, dentro de la `$transaction`, solo en `PENDIENTE→PAGADO`,
  nunca en replay ni en fallido — I3 del roadmap, verificado por los tests de F01). F02 implementa
  `aplicarEfectosPostPago` cumpliendo ese tipo y **reemplaza `noopEfectosPostPago` en el wrapper**
  `src/pages/api/webhooks/flow.ts`. El núcleo del webhook (`webhookFlow.ts`) y el contrato quedan
  intactos. Razón: I2/I3 del roadmap sin reescribir nada; si la transacción se revierte, los
  efectos se revierten con ella.

- **D2 — Granularidad del Entitlement: un `DownloadGrant` por `OrderItem`.** Una orden con N
  productos ⇒ N grants. Razón: CONTEXT define el Entitlement como "liga una Orden pagada a un
  producto" (singular) y la descarga es por-producto (ADR-0002). Idempotencia a nivel DB con
  `@@unique([orderId, productId])` — **sin `tenantId`** porque `orderId` ya es tenant-bound (mismo
  criterio aprobado por schema-guardian para `OrderItem` en F01).

- **D3 — Granularidad de la Participación: una `RaffleEntry` por Orden, en el Raffle de SU
  Tienda.** Se crea una entry por orden en el `Raffle` `ACTIVO` **del `tenantId` de la orden**
  (lookup `WHERE tenantId = order.tenantId AND estado = ACTIVO` — nunca global, ADR-0005). Más
  compras = más chances (CONTEXT: "cada compra inscribe"; no se deduplica por correo). Idempotencia
  con `@@unique([raffleId, orderId])`. Se **denormaliza `email`** (snapshot de `Order.email`)
  porque la Participación es "por su correo" y el panel del sorteo (F05) lista por correo.

- **D4 — Sin `Raffle` ACTIVO en ESA Tienda ⇒ el pago NO se compromete.** Se crean igual los
  `DownloadGrant` y **se omite** la `RaffleEntry` sin lanzar error (la venta es lo primario; el
  sorteo es promocional). Que OTRA tienda tenga un sorteo activo es irrelevante: la búsqueda es
  tenant-scoped. Se registra el skip con log inocuo (sin email, sin token, sin secretos).

- **D5 — El grant nace con `token` opaco + `expiresAt`.** `token` aleatorio inadivinable
  (`crypto.randomBytes` → base64url), `@unique` **global** (no compuesto con tenantId): es
  crypto-random sin riesgo de colisión entre tenants, y F03 lo resolverá token⇒grant⇒tenant igual
  que el webhook resuelve `Payment.token` (precedente aprobado por schema-guardian en F01).
  `expiresAt` = ventana de validez del derecho (S3: default 30 días; política final en F03). Este
  token es la autoridad intrínseca — **distinto** de la URL firmada corta de R2 que genera F03.

- **D6 — El `Raffle` activo se siembra vía script, uno por tenant.** `scripts/seed-raffles.ts`
  (núcleo `sembrarRafflesActivos({ db, specs })` testeable + wrapper `main()`, patrón
  `backend-conventions.md` § Scripts CLI) asegura un `Raffle` `ACTIVO` por tenant seed: `autora`
  (premio piloto: "2 entradas a un recital de BTS") y `prueba` (premio de prueba). Idempotente.
  Script **nuevo y separado** de `seed-tenants.ts` (no se toca lo que F01 dejó verde).

- **D7 — Scoping por tenant en los 3 modelos** (ADR-0005, I1 del roadmap): `Raffle`, `RaffleEntry`
  y `DownloadGrant` llevan `tenantId` + FK a `Tenant` con `onDelete: Restrict` (un tenant se
  suspende, no se borra — mismo criterio F01) + índices con `tenantId` donde la query lo pide
  (`Raffle @@index([tenantId, estado])` para el lookup del activo). El `tenantId` que se escribe en
  grants/entry es el de la **orden cargada vía `tx`** — server-side, nunca input (lección H1).

- **D8 — Coordinación con F05 (paralelo en otra terminal).** Reglas duras de esta fase:
  - `prisma/schema.prisma` es **ZONA COMPARTIDA**: cambios **append-only** (modelos/enum nuevos +
    back-relations como líneas nuevas dentro de `Tenant`/`Order`/`Product`), **releer el archivo
    justo antes de cada edición** (F05 puede haberlo tocado), y **anotar en la Bitácora del
    roadmap con tag `[F02]`** cada vez que se toca. `db push` es aditivo.
  - `src/server/api/root.ts`: compartido append-only **solo si** se agrega router — F02 **no
    prevé router nuevo** (backend puro, sin UI), así que en principio no se toca.
  - `src/server/api/trpc.ts` es **EXCLUSIVO de F05** — F02 NO lo toca. Tampoco `src/server/auth*`,
    `src/pages/login*`, `src/pages/admin/*` (territorio F05).
  - Zona exclusiva F02: `src/server/domain/pago/` (y `domain/sorteo|entrega` si el implementer
    decide extraer), `src/pages/api/webhooks/`, `scripts/seed-raffles.ts` + sus tests.
  - Hay un `next dev` corriendo en `:3001` de la sesión principal — **no levantar otro** (memoria:
    una sola instancia; corromper `.next` da errores fantasma).

## Plan

Dos features. F01 (modelos + seed) primero; F02 (use case + cableado) tipa contra el client
generado por F01.

1. **Invocar `schema-guardian`** con la forma propuesta de abajo ANTES de tocar
   `prisma/schema.prisma` (naming, `onDelete`, índices, uniques, clasificación aditiva). (F01)
2. **Editar el schema** — releyéndolo justo antes (D8): enum `RaffleStatus`, modelos `Raffle`,
   `RaffleEntry`, `DownloadGrant` con `tenantId`, back-relations en `Tenant`/`Order`/`Product`
   (líneas append-only dentro de esos modelos). `npm run db:push` (aditivo) + `prisma generate`.
   Anotar en Bitácora del roadmap con tag `[F02]`. (F01)
3. **Seed** `scripts/seed-raffles.ts`: núcleo `sembrarRafflesActivos` idempotente (find-or-create
   del Raffle ACTIVO por tenant) + wrapper `main()`; script npm `seed:raffles` en `package.json`.
   Documentar en `.env.example` si consume env nueva (no se prevé). (F01)
4. **Use case** `aplicarEfectosPostPago` en `src/server/domain/pago/` cumpliendo el tipo
   `EfectosPostPago`: vía `tx` carga la orden (con `tenantId`, `email`, ítems con `productId`);
   crea los `DownloadGrant` (uno por ítem, `tenantId` de la orden, token + expiresAt,
   idempotente); busca el `Raffle` `ACTIVO` **de ese tenant** y crea la `RaffleEntry`
   (idempotente); sin raffle activo ⇒ omite la entry con log inocuo. TDD con vitest filtrado. (F02)
5. **Cablear**: en `src/pages/api/webhooks/flow.ts` reemplazar `noopEfectosPostPago` por
   `aplicarEfectosPostPago`. Núcleo del webhook intacto. (F02)
6. Cierre: `backend-reviewer` (use case + seed + cableado + layering) y `change-set-reviewer`
   (diff completo de la fase, con la lista de archivos de la sesión).

### Forma de schema propuesta (borrador — la finaliza `schema-guardian`)

```prisma
enum RaffleStatus {
  ACTIVO
  CERRADO
}

// El sorteo promocional de una Tienda (CONTEXT § Sorteo). Per-tenant (ADR-0005).
model Raffle {
  id          String       @id @default(cuid())
  tenantId    String
  nombre      String
  premio      String
  estado      RaffleStatus @default(ACTIVO)
  fechaInicio DateTime
  fechaFin    DateTime
  basesUrl    String?      // bases del sorteo (del Organizador, ADR-0008); carga real en F05
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  tenant  Tenant        @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  entries RaffleEntry[]

  @@index([tenantId, estado]) // lookup del ACTIVO de ESA tienda
}

// Participación (CONTEXT): una por Orden pagada, en el Raffle ACTIVO de su Tienda. Inmutable.
model RaffleEntry {
  id        String   @id @default(cuid())
  tenantId  String
  raffleId  String
  orderId   String
  email     String   // snapshot de Order.email (I6)
  createdAt DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  raffle Raffle @relation(fields: [raffleId], references: [id], onDelete: Restrict)
  order  Order  @relation(fields: [orderId], references: [id], onDelete: Restrict)

  @@unique([raffleId, orderId]) // idempotencia: una entry por compra por sorteo (prefijo cubre raffleId)
  @@index([tenantId])
  @@index([orderId])
}

// Entitlement (CONTEXT, ADR-0002): autoridad de descarga por (Orden pagada, Producto). Inmutable.
model DownloadGrant {
  id        String   @id @default(cuid())
  tenantId  String
  orderId   String
  productId String
  token     String   @unique // opaco crypto-random; global como Payment.token (F03 rutea token⇒grant⇒tenant)
  expiresAt DateTime // ventana de validez del derecho (S3; política final en F03)
  createdAt DateTime @default(now())

  tenant  Tenant  @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  order   Order   @relation(fields: [orderId], references: [id], onDelete: Restrict)
  product Product @relation(fields: [productId], references: [id], onDelete: Restrict)

  @@unique([orderId, productId]) // idempotencia: un grant por (orden, producto); orderId ya es tenant-bound
  @@index([tenantId])
  @@index([productId])
}
```

> Back-relations a agregar (líneas append-only dentro de modelos existentes): `Tenant` →
> `raffles Raffle[]`, `raffleEntries RaffleEntry[]`, `downloadGrants DownloadGrant[]`; `Order` →
> `downloadGrants DownloadGrant[]`, `raffleEntries RaffleEntry[]`; `Product` →
> `downloadGrants DownloadGrant[]`. `onDelete: Restrict` en todas las FKs: modelos auditables
> (dinero + sorteo) no se borran teniendo hijos.

## Validaciones

### F01 — Modelos + seed del Raffle ACTIVO por tenant

**Vitest** (integration):
- [x] `sembrarRafflesActivos` crea un `Raffle` `ACTIVO` por tenant seed, con nombre, premio, fechas y el `tenantId` de ESA tienda. — `src/__tests__/scripts/seed-raffles.test.ts::seed.raffles.001` ✅ 2026-07-17
- [x] Correr `sembrarRafflesActivos` dos veces NO duplica el `Raffle` activo de ningún tenant (idempotente). — `src/__tests__/scripts/seed-raffles.test.ts::seed.raffles.002` (+ `seed.raffles.003`: tenant inexistente se omite sin crashear) ✅ 2026-07-17

**E2E** (browser):
- [x] (no aplica — schema/backend-only) Verificación manual: tras `npm run seed:raffles`, cada tenant seed tiene su `Raffle` `ACTIVO` en Prisma Studio. ✅ 2026-07-17 (evidencia DB read-only: `autora`→"Sorteo de lanzamiento" ACTIVO + `prueba`→"Sorteo de prueba" ACTIVO, uno por tenant seed)

### F02 — aplicarEfectosPostPago (Entitlement + Participación per-tenant, idempotentes)

**Vitest** (integration) — todas en `src/__tests__/server/pago/aplicarEfectosPostPago.test.ts` (DB-backed):
- [x] Dada una orden confirmada con N ítems, crea exactamente N `DownloadGrant` — uno por `OrderItem`/producto — cada uno con `token` único, `expiresAt` y el `tenantId` de la orden. — `::efectos.001` ✅ 2026-07-17
- [x] Crea exactamente una `RaffleEntry` en el `Raffle` `ACTIVO` **del tenant de la orden**, con `tenantId` de la orden y `email` copiado desde `Order.email`. — `::efectos.002` ✅ 2026-07-17
- [x] Aislamiento cross-tenant: con dos tiendas con sorteos activos propios, la entry de una orden de la tienda A cae en el raffle de A — jamás en el de B. — `::efectos.003` ✅ 2026-07-17
- [x] Idempotencia: invocar `aplicarEfectosPostPago` dos veces sobre la misma orden deja exactamente N grants + 1 entry (sin duplicados — garantizado por los `@@unique`). — `::efectos.004` ✅ 2026-07-17
- [x] Los efectos viven en la MISMA transacción que la transición: si la `$transaction` se revierte, no persiste ningún `DownloadGrant` ni `RaffleEntry`. — `::efectos.005` ✅ 2026-07-17
- [x] Sin `Raffle` `ACTIVO` en la tienda de la orden (aunque OTRA tienda tenga uno activo): se crean los `DownloadGrant` igual, NO se crea `RaffleEntry`, y no se lanza error (la venta no se compromete). — `::efectos.006` ✅ 2026-07-17
- [x] Un `Raffle` `CERRADO` no recibe `RaffleEntry` (solo el `ACTIVO` cuenta). — `::efectos.007` ✅ 2026-07-17
- [x] Con el cableado real del webhook: la transición `PENDIENTE→PAGADO` produce grants + entry; el replay del webhook y el resultado `FALLIDO` no producen ningún efecto. — `::efectos.008` ✅ 2026-07-17
- [x] El `token` del grant y el `email` del comprador no aparecen en logs (el log del skip de raffle es inocuo). — `::efectos.009` ✅ 2026-07-17

**E2E** (browser):
- [x] (no aplica browser — backend-only) Verificación manual enganchada al flujo sandbox de F01: tras pagar con tarjeta de prueba en un subdominio, la orden `PAGADO` tiene sus `DownloadGrant` + `RaffleEntry` del raffle de SU tienda en Prisma Studio, una sola vez. ✅ 2026-07-17 (evidencia DB del E2E de la sesión principal: order `cmrogl4pi0002egexv45st4a5` tenant `autora` PAGADO/pago PAGADO fee=96, 1 `DownloadGrant` token presente expira 2026-08-16, 1 `RaffleEntry` en "Sorteo de lanzamiento" del MISMO tenant — una sola vez)

## Invariantes

- **I1 — Tenancy** (ADR-0005): los 3 modelos nuevos llevan `tenantId`; el `Raffle` activo se busca
  SIEMPRE scoped al `tenantId` de la orden; ese `tenantId` se deriva de la orden cargada vía `tx`,
  nunca de input del cliente ni de parámetro redundante.
- **I2**: Los efectos post-pago se ejecutan **dentro de la misma `prisma.$transaction`** que la
  transición `PENDIENTE→PAGADO`, **una sola vez por pago** (idempotentes por `@@unique`). Si la
  transacción se revierte, los efectos se revierten (ADR-0001, I3 del roadmap).
- **I3**: Una orden pagada **nunca** se revierte ni falla por un problema del sorteo (D4): sin
  `Raffle` activo se omite la entry, no se lanza.
- **I4**: El `token` del `DownloadGrant` es aleatorio inadivinable (`crypto`), `@unique`, y
  **nunca** se loguea. La entrega física del PDF NO se materializa acá (F03; I9 del roadmap rige:
  nada de enlaces públicos "provisorios").
- **I5**: `RaffleEntry.email` es un **snapshot** de `Order.email` al crear la entry (como el precio
  en `OrderItem`); no se re-referencia en vivo.
- **I6 — Layering** (I7 del roadmap): `aplicarEfectosPostPago` vive en `domain/`, cumple el tipo
  `EfectosPostPago` tal cual (`{ tx, orderId }`), no toca env/res/Flow, y se cablea desde el borde
  (wrapper del webhook). El núcleo del webhook (`webhookFlow.ts`) y el contrato
  (`efectosPostPago.ts`) NO se modifican.
- **I7 — Schema**: `schema-guardian` ANTES de tocar el schema; `onDelete` explícito, `@@index` en
  FKs queriables; cambio **aditivo** con `db push` (sin migraciones hasta F10).
- **I8 — Coordinación F05** (D8): `schema.prisma` append-only + releer antes de editar + Bitácora
  del roadmap `[F02]`; `trpc.ts`/auth/login/admin intocables; no levantar un segundo `next dev`
  (hay uno en `:3001`).

## Out of scope

- Entrega física del PDF: URL firmada, R2, endpoint de descarga, marca de agua (#6) → F03.
- Correo con el enlace de descarga → F04.
- CRUD/gestión del sorteo, carga de bases, ejecución auditable (elegir ganador), panel → F05.
- UI del comprador / storefront → F06.
- Reescribir el núcleo del webhook o el contrato del hook (D1: solo se rellena el cableado).
- IVA/boleta/neto-al-vendedor, cómputo de comisiones.
- Constraint DB "un solo Raffle ACTIVO por tenant" (S5: invariante de sembrado; Prisma no expresa
  partial unique index — se revisa en F05 cuando el Organizador gestione sorteos).
- Tocar `seed-tenants.ts`, `trpc.ts`, `root.ts` (salvo que apareciera un router — no previsto),
  auth, páginas.

## Especialistas a consultar

- `schema-guardian` — **antes** de agregar `Raffle`/`RaffleEntry`/`DownloadGrant` + enum +
  back-relations: naming, `onDelete`, índices/uniques compuestos con tenantId, clasificación
  aditiva del `db push`.
- `backend-reviewer` — use case (layering, idempotencia, transacción, scoping del raffle lookup),
  cableado en el wrapper, seed núcleo+wrapper, no-fuga de token/email en logs.
- `feature-tester` — Vitest (grants/entry/aislamiento/idempotencia/rollback) + verificación manual
  asistida enganchada al flujo sandbox de F01 (Prisma Studio).
- `change-set-reviewer` — diff completo de F02 antes de commit, con la lista de archivos de la
  sesión.

## Supuestos (resueltos por criterio, revisables)

- **S1**: Un `DownloadGrant` por `OrderItem` (D2).
- **S2**: Una `RaffleEntry` por **orden** (no dedup por email); `email` denormalizado (D3).
- **S3**: `expiresAt` del grant = **30 días** desde la confirmación (default tentativo). La
  política definitiva se decide en el planning de F03 (puede ser sin expiración + solo URL firmada
  corta). Revisable.
- **S4**: Sin `Raffle` `ACTIVO` en la tienda de la orden ⇒ omitir la entry, no fallar (D4).
- **S5**: A lo sumo **un** `Raffle` `ACTIVO` **por tenant** a la vez — invariante de sembrado (el
  seed lo garantiza), NO constraint de DB. El use case toma el único ACTIVO del tenant; dos activos
  en una tienda serían error de sembrado. Se re-evalúa en F05 (gestión de sorteos).
- **S6**: `DownloadGrant.token` = valor opaco crypto-random `@unique` **global** (como
  `Payment.token`), distinto de la URL firmada corta de F03 (D5).
- **S7**: Los uniques de idempotencia van **sin `tenantId`** (`[orderId, productId]`,
  `[raffleId, orderId]`) porque `orderId`/`raffleId` ya son tenant-bound — mismo criterio que
  `OrderItem` en F01. `schema-guardian` lo confirma.
- **S8**: El use case vive en `src/server/domain/pago/` (es un efecto del pago). Extraer
  `domain/sorteo/`/`domain/entrega/` recién cuando F03/F05 traigan más lógica de esos módulos — no
  antes (no sobre-ingenierizar).
- **S9**: Los tests de integración del use case son **DB-backed** (Supabase está despausado desde
  el cierre de F01); donde el rollback/aislamiento se pueda cubrir igual de bien con el fake db de
  `confirmarPagoDeOrden.test.ts`, el implementer decide — el feature-tester valida contra DB real.
- **S10**: Fechas del raffle seed: ventana amplia que cubra el desarrollo (ej. inicio hoy, fin
  +90 días); las fechas reales del sorteo del piloto las carga el Organizador en F05/F07.

## Bitácora

- [2026-07-16 22:00] [planner-grill] F02 del roadmap pasa a planning con task file propio. Por
  instrucción explícita del usuario NO hubo grill extenso: decisiones por criterio + Supuestos
  revisables; sin `AWAITING ANSWER` (nada estructural imposible de asumir). Contexto cargado:
  CLAUDE.md, CONTEXT.md, ADR-0002/0005, roadmap SaaS (F01 done — hook no-op cableado y verificado),
  plan superseded `26-07-08-efectos-post-pago.md` (contrato reutilizado), `schema.prisma` actual
  (patrón de scoping F01: Restrict a padres auditables, índices `[tenantId, …]`, uniques
  tenant-bound sin tenantId redundante), `efectosPostPago.ts` (contrato + noop).
- [2026-07-16 23:30] [feature-implementer] [F02] Arranca implementación. Features pendientes del task
  file: F01 (schema + seed), F02 (use case + cableado). Modo D8: F05 corre en paralelo en otra
  terminal; `schema.prisma` append-only + releer antes de editar + Bitácora del roadmap con tag `[F02]`.
  Contexto releído: contrato `EfectosPostPago`, núcleo `webhookFlow.ts` (intacto), `confirmarPagoDeOrden`
  (hook dentro de `$transaction`, solo en PAGADO), `seed-tenants.ts` (patrón núcleo+wrapper), schema
  actual, convenciones backend/prisma.
- [2026-07-16 23:45] [feature-implementer] [F02] **F01 (del task file) implementada**: schema + seed.
  (1) `schema-guardian`: **APPROVE** de la forma propuesta (enum `RaffleStatus` + `Raffle`/`RaffleEntry`/
  `DownloadGrant`, todos con `tenantId` + FK Restrict, uniques de idempotencia sin tenantId redundante,
  `token @unique` global, `Raffle @@index([tenantId, estado])`). (2) Schema editado APPEND-ONLY (releído
  justo antes — F05 no lo había tocado): back-relations dentro de `Tenant`/`Order`/`Product` + enum y 3
  modelos al final; `prisma format` (indentación resultante: 2 espacios); `npm run db:push` aditivo OK (DB en sync);
  `prisma generate` regeneró los tipos (index.d.ts con los 3 modelos) — engine `.dll` EPERM por el
  dev server de :3001, inocuo (engine schema-agnóstico; verificado: los tests DB-backed corren). Anotado
  en la Bitácora del **roadmap** con tag `[F02]`. (3) `scripts/seed-raffles.ts` — núcleo
  `sembrarRafflesActivos({ db, specs })` idempotente (find-or-create del ACTIVO por tenant, S5) + wrapper
  `main()` (autora premio "2 entradas a un recital de BTS" + prueba; fechas inicio hoy / +90d, S10) +
  script npm `seed:raffles`. **Vitest DB-backed 3/3 verde** (`seed.raffles.001/002/003`).
  **Decisión táctica** (cubierta por S5 + precedente seed-tenants): tenant inexistente ⇒ `omitido:true`
  sin crashear (orden de sembrado, no error del seed; el wrapper avisa "corré primero seed:tenants").
- [2026-07-17 00:10] [feature-implementer] [F02] **F02 (del task file) implementada**: use case +
  cableado. (4) `src/server/domain/pago/aplicarEfectosPostPago.ts` — cumple el contrato `EfectosPostPago`
  tal cual (`const aplicarEfectosPostPago: EfectosPostPago = async ({ tx, orderId }) => …`, garantiza
  conformidad de tipo). Carga la orden por `tx` (tenantId/email/ítems), crea N `DownloadGrant` (uno por
  ítem, `createMany({ skipDuplicates })` idempotente, token `crypto.randomBytes(32).base64url`, expiresAt
  = +30d S3), busca el `Raffle` ACTIVO **del tenantId de la orden** (`findFirst` scoped, `orderBy
  createdAt asc` determinista) y crea 1 `RaffleEntry` idempotente (email snapshot I5). Sin ACTIVO ⇒ log
  inocuo (orderId+tenantId, sin email/token I4) y omite la entry SIN lanzar (I3). (5) Cableado:
  `src/pages/api/webhooks/flow.ts` reemplaza `noopEfectosPostPago` por `aplicarEfectosPostPago`; núcleo
  `webhookFlow.ts` y contrato `efectosPostPago.ts` **intactos** (I6). **Vitest DB-backed 9/9 verde**
  (`efectos.001`..`009`; incl. aislamiento cross-tenant, rollback en `$transaction`, replay+FALLIDO sin
  efectos con el webhook real cableado, no-fuga de token/email en logs). Scoped `tsc --noEmit`: sin
  errores en archivos F02. **Decisión táctica** (cubierta por I3 + S5; el schema-guardian sugirió fallar
  ruidoso si hubiera 2 raffles ACTIVOS, pero I3 PROHÍBE comprometer la venta por un problema del sorteo):
  ante el edge de sembrado (S5 violado, 2 ACTIVOS) se elige el más antiguo de forma determinista con
  `orderBy createdAt asc` — nunca se lanza. **Idempotencia** vía `createMany({ skipDuplicates })`
  apoyada en los `@@unique` (belt-and-suspenders sobre la garantía del núcleo de invocar el hook una vez).
  Comandos vitest: `npx vitest run src/__tests__/scripts/seed-raffles.test.ts` (3/3) +
  `npx vitest run src/__tests__/server/pago/aplicarEfectosPostPago.test.ts` (9/9).
- [2026-07-17 00:20] [feature-implementer] [F02] **`backend-reviewer`: APPROVE** (Corrección A /
  Compliance A / Naming A / Tests A), cero blockers. Verificó los 7 focos: sin fuga cross-tenant
  (tenantId siempre de la orden vía `tx`), idempotencia por `@@unique` + `skipDuplicates`, efectos en la
  MISMA `$transaction` (solo `tx`, sin conexión propia), I3 respetado (sin ACTIVO ⇒ `return` sin lanzar;
  el único `throw` es integridad, no sorteo), token/email nunca logueados, layering intacto (use case en
  `domain/` sin tRPC/env/res/Flow; núcleo del webhook y contrato intactos; seed núcleo+wrapper), email
  snapshot. **NIT no bloqueante NO aplicado — DEFERIDO a F05 por decisión del plan**: agregar un
  `console.warn` inocuo si el lookup detecta >1 `Raffle` ACTIVO por tenant (error de sembrado S5). El
  plan lo asigna explícitamente a F05 (Out of scope: "constraint 'un solo Raffle ACTIVO por tenant'…
  se revisa en F05 cuando el Organizador gestione sorteos"); agregar detección en el hot path del pago
  para un invariante de sembrado sería prematuro. Anotado para el planning de F05.
- [2026-07-17 00:20] [feature-implementer] [F02] **Implementación completa. status → testing.** F01
  (schema + seed) y F02 (use case + cableado) del task file escritas; `schema-guardian` y
  `backend-reviewer` verdes. Coordinación D8 OK: `schema.prisma` tocado append-only (Bitácora del roadmap
  con tag `[F02]`); F05 agregó `otorgar:membresia` a package.json en paralelo sin colisión (mi
  `seed:raffles` intacto); zona F05 (`trpc.ts`/auth/login/admin/root.ts) NO tocada. Listo para el
  `feature-tester` (Vitest 12/12 + verificación manual asistida en Prisma Studio enganchada al flujo
  sandbox de F01). NO marco checkboxes de Validaciones (es del feature-tester).
- [2026-07-17 00:59] [feature-tester] **Corrida de validación F02.** `vitest run` COMPLETO **verde: 28
  archivos / 145 tests, 0 fallos** (dur. ~162s; los DB-backed contra Supabase real). Cobertura del task
  file: **seed-raffles 3/3** (`seed.raffles.001/002/003`) + **aplicarEfectosPostPago 9/9**
  (`efectos.001..009`, incl. aislamiento cross-tenant, rollback en `$transaction`, replay+FALLIDO sin
  efectos con el webhook real cableado, no-fuga token/email) = **12/12** ⇒ marqué los 11 checkboxes
  Vitest `[x]`. **E2E verificado por evidencia DB read-only** (NO browser, NO pagos nuevos, por
  instrucción): `tmp/check-f02.ts` confirmó el E2E de la sesión principal — order
  `cmrogl4pi0002egexv45st4a5` (tenant `autora`) `estado=PAGADO`, `payment=PAGADO`, `fee=96`; **1
  DownloadGrant** (token presente, `expiresAt=2026-08-16`, +30d); **1 RaffleEntry** en "Sorteo de
  lanzamiento" con `tenant del raffle coincide=true` — una sola vez. Seed raffles: DB muestra 1 `Raffle`
  ACTIVO por tenant seed (`autora`→"Sorteo de lanzamiento", `prueba`→"Sorteo de prueba") ⇒ marqué los 2
  checkboxes E2E backend-only `[x]`. **NO cambié `state`/`status`** (lo decide el usuario). **NO commit,
  NO browser, NO dev server nuevo.** Veredicto: **todo verde**; pregunta de cierre con 4 opciones al
  orquestador/usuario.
- [2026-07-16 22:00] [planner-grill] Plan escrito. Adaptaciones vs el plan superseded: (1) los 3
  modelos llevan `tenantId` + FK Restrict + `Raffle @@index([tenantId, estado])`; (2) el Raffle
  ACTIVO se busca scoped al `tenantId` de la orden (derivado server-side vía `tx`, nunca input);
  (3) `bookId`→`productId` (rename D3 del roadmap); (4) seed per-tenant (`scripts/seed-raffles.ts`,
  separado de `seed-tenants.ts`); (5) test de aislamiento cross-tenant nuevo (entry de la tienda A
  jamás en el raffle de B); (6) D8 de coordinación con F05 en paralelo (schema append-only + releer
  antes de editar + Bitácora roadmap `[F02]`; `trpc.ts`/auth/admin intocables; no segundo dev
  server). Supuestos S1–S10 asentados. **AWAITING USER APPROVAL** — la implementación no arranca
  sin visto bueno explícito del usuario.
