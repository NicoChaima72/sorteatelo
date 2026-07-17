---
slug: panel-auth-organizadores
status: testing               # planning | implementing | testing | done
owner: nicolas
created: 2026-07-16
related_adrs: [ADR-0004, ADR-0005, ADR-0006, ADR-0007, ADR-0008]
related_context: [Organizador, Operador de plataforma, Tienda, Producto, Orden, Pago, CredencialFlow, Bases del sorteo, Sorteo, Participación, Plantilla]

features:
  - id: F01
    behavior: "Cuentas de Organizador (Google OAuth sin allowlist) + membresía User↔Tenant con unique compuesto + rol Operador por env var + guard server-side por tenant (panelProcedure fail-closed): un Organizador solo opera SU tienda, el Operador todas, cero cross-tenant"
    state: active

  - id: F02
    behavior: "CRUD de Productos del panel conectado a datos reales, scoped al tenant autorizado, SIN subida real de PDF (seam pdfPath para F03)"
    state: active

  - id: F03
    behavior: "Ventas/órdenes reales en el panel (listado con paginación por cursor) + dashboard con KPIs reales del tenant, montos como Decimal de punta a punta"
    state: active

  - id: F04
    behavior: "Configuración de la tienda: carga de CredencialFlow (cifrada, write-only), bases del sorteo como texto, y config básica de plantilla (logo/color/descripción)"
    state: active

  - id: F05
    behavior: "Sorteo en el panel: ver sorteo activo + participaciones reales y ejecutarlo de forma auditable — BLOQUEADA hasta que la fase F02 del roadmap landee los modelos Raffle/RaffleEntry"
    state: active
---

# Fase F05 del roadmap — Auth de Organizadores + panel de tienda

## Contexto

Es la **fase F05** de `tasks/26-07-16-saas-roadmap.md`. F01 (fundación multi-tenant + pago
BYO-Flow) está **done** con la prueba de fuego D1 cumplida: existen `Tenant`/`FlowCredential`/
`Product`/`Order`/`OrderItem`/`Payment` reales en la DB, `tenantProcedure` para el borde del
Comprador, cifrado AES-256-GCM (`src/server/services/cifrado.ts`) y 2 tenants seed (`autora`,
`prueba`) con ventas E2E reales. El panel admin (`src/pages/admin/{index,libros,ventas,sorteo,
configuracion}.tsx`) sigue siendo maqueta sobre `mock-data.ts`.

En el **working tree hay rescate F05 sin commitear** (del plan superseded
`tasks/26-07-08-auth-admin-google.md`): `src/server/auth.ts` ya cablea Google OAuth con
`PrismaAdapter`, `src/server/authPolicy.ts` tiene la política pura (allowlist + `resolverGuard`),
`src/pages/login.tsx` existe, las 5 páginas admin ya tienen guard `requireSession`, y
`src/__tests__/server/authPolicy.test.ts` tiene 8 tests verdes. **Esta fase parte de ese rescate
y lo adapta**: muere la allowlist mono-usuario como autorización del panel; nace la **membresía
User↔Tenant** (S6 del roadmap: un Organizador dueño por Tienda; el Operador de plataforma como
flag). El panel se conecta a datos reales: CRUD de Productos (sin PDF real — F03), ventas,
CredencialFlow cifrada, bases del sorteo (texto) y config básica de plantilla. La gestión del
Sorteo depende de los modelos que la **fase F02 del roadmap está creando EN PARALELO** — es la
sub-feature final, explícitamente bloqueada.

`.env` tiene `GOOGLE_CLIENT_ID/SECRET` como **placeholders**: el OAuth client real de Google
Cloud Console es un trámite del usuario. Los Vitest no lo necesitan; el E2E del login PARA con
AWAITING USER en la pantalla de Google.

## Decisiones

Por instrucción explícita del usuario NO hubo grill extenso: decisiones resueltas por criterio,
las revisables marcadas como Supuestos (ver sección Supuestos).

- **D1 — Partir del rescate, adaptándolo.** Se conservan: Google OAuth + `PrismaAdapter` en
  `auth.ts`, `pages.signIn = "/login"`, `login.tsx`, `requireSession`/`resolverGuard` y el guard
  imperativo en las 5 páginas, y las funciones puras `parsearAllowlist`/`emailEnLista` (con sus
  tests). Muere: la allowlist como gate del `signIn` y la env var `ADMIN_ALLOWLIST` con ese rol.
  Razón: el rescate ya pasó backend-reviewer y sus piezas puras son exactamente la base que la
  membresía necesita (S8 del roadmap).
- **D2 — Autenticación abierta, autorización por membresía** (Supuesto S1). El callback `signIn`
  deja de rechazar: cualquier cuenta Google obtiene sesión (el adapter crea su `User`). La
  autorización REAL es fail-closed en la capa de datos: sin `TenantMembership` y sin rol Operador,
  ningún procedure del panel devuelve ni muta nada (`FORBIDDEN`), y la UI muestra un empty state
  "tu cuenta no tiene una tienda asignada". Razón: prepara F08 (self-service), elimina el gate
  que ya no representa el modelo, y un `User` huérfano es inocuo — la seguridad vive donde están
  los datos, no en la puerta de la sesión.
- **D3 — Modelo `TenantMembership`**: `userId` + `tenantId`, `@@unique([userId, tenantId])`
  (lección datawalt-app), sin campo `rol` (S6: un Organizador dueño por Tienda; roles finos
  post-MVP). `onDelete`: `Cascade` desde `User` (la membresía es del usuario), `Restrict` hacia
  `Tenant` (un tenant no se borra, se suspende — coherente con el schema F01). Índices per
  prisma-conventions. Estructuralmente un User puede tener N membresías (Supuesto S8).
- **D4 — Operador de plataforma = env var `PLATFORM_OPERATOR_EMAILS`** (CSV, Supuesto S2),
  evaluada server-side reutilizando `parsearAllowlist`/`emailEnLista`. Fail-closed: var ausente o
  vacía ⇒ nadie es Operador. Razón: cero UI de gestión en F05 (el panel del Operador es F08),
  bootstrap trivial, y reusa la política pura rescatada tal cual. La allowlist renace con otro rol.
- **D5 — Guard por tenant: `panelProcedure` + decisión pura `resolverTenantAutorizado`.**
  `panelProcedure` (nuevo en `trpc.ts`, zona exclusiva F05) exige sesión y carga server-side
  `{ userId, esOperador, membresías }`. La decisión pura
  `resolverTenantAutorizado({ esOperador, tenantIdsDeMembresia, tenantIdSolicitado })` (en
  `authPolicy.ts`, testeable sin DB/NextAuth) resuelve el tenant sobre el que opera el request:
  - **Organizador**: SIEMPRE el tenant de su membresía — un `tenantIdSolicitado` que no sea suyo
    ⇒ `FORBIDDEN`; sin membresía ⇒ `FORBIDDEN` (fail-closed).
  - **Operador**: puede indicar `tenantIdSolicitado` explícito (así "ve todas"); sin indicarlo y
    sin membresía propia ⇒ error claro.
  Esto NO viola I1/lección H1: la **autorización** jamás viene del input (sale de la membresía o
  del flag Operador, ambos server-side); el input del Operador solo **selecciona** entre tiendas a
  las que ya está autorizado. Cero query del panel usa un tenantId que no haya pasado por acá.
- **D6 — Módulo `domain/panel/` + router `panel`** (append-only a `root.ts`), per layering de
  backend-conventions: procedures finos → `runDomain()` → use cases con `{ db, session, input }`.
  Use cases previstos: productos (`listarProductosDelPanel`, `crearProducto`,
  `actualizarProducto`), ventas (`listarVentas`, `getResumenTienda`), configuración
  (`guardarCredencialFlow`, `getEstadoCredencialFlow`, `guardarConfiguracionTienda`,
  `getConfiguracionTienda`), acceso (`getAccesoActual`: membresías + esOperador, para que el
  layout decida qué renderizar). El implementer puede ajustar nombres espejando en español.
- **D7 — CredencialFlow write-only desde el panel.** El use case recibe apiKey/secretKey/sandbox,
  cifra con `cifrado.ts` + `claveDeCifradoDeEnv` (seam existente de F01) y **upsertea**
  `FlowCredential` (mismo patrón que el seed: pisa la previa). Ninguna respuesta ni query devuelve
  secretos, ni cifrados: el estado leíble expone solo `{ configurada: boolean, sandbox, updatedAt }`
  (I5/ADR-0006).
- **D8 — Bases del sorteo + config básica de plantilla = columnas opcionales en `Tenant`**
  (Supuesto S4): `basesSorteo String?` (texto largo; el archivo/PDF real es F03),
  `descripcion String?`, `logoUrl String?`, `colorPrimario String?`. Aditivo (append-only sobre
  la zona compartida). Razón: F06 diseñará la plantilla de verdad; F05 solo necesita dónde
  persistir la config que el Organizador carga. Si F02 (roadmap) landea `Raffle` antes de que se
  implemente F04 de este plan, se evalúa con el usuario si `basesSorteo` vive mejor en `Raffle`
  (nota en Bitácora al momento).
- **D9 — Ventas: paginación por cursor** per backend-conventions (orden `[createdAt desc, id desc]`,
  `take: PAGE_SIZE + 1`, `nextCursor`), y se resuelve el NIT pendiente de F01-C sobre `Decimal`:
  **registrar `Prisma.Decimal` como custom type de superjson** (server en `trpc.ts` + cliente en
  `src/utils/api.ts`) para que los montos viajen sin pasar por `number` (Supuesto S5; fallback si
  el transformer pelea con el bundle: serializar a string en el borde del use case y documentarlo).
  UI formatea con `Intl.NumberFormat` CLP.
- **D10 — Sorteo en el panel = sub-feature FINAL bloqueada** hasta que la fase F02 del roadmap
  landee `Raffle`/`RaffleEntry` en el schema. Al desbloquear: releer `prisma/schema.prisma` (no
  asumir shape), y si la ejecución auditable necesita campos que F02 no creó (p. ej. ganador/fecha
  de ejecución), coordinar el append aditivo vía `schema-guardian` + Bitácora del roadmap con tag
  `[F05]` — jamás editar lo que F02 creó.
- **D11 — Bootstrap de membresías: CLI `scripts/otorgar-membresia.ts`** (patrón núcleo testeable +
  wrapper tsx de backend-conventions): recibe email + slug de tienda, busca el `User` (debe haber
  hecho login al menos una vez) y el `Tenant`, y upsertea la membresía. Idempotente. NO se toca
  `scripts/seed-tenants.ts` (evita fricción con la terminal paralela y el seed ya validado).
- **D12 — Rename de página `/admin/libros` → `/admin/productos`** (D3 del roadmap: `Libro` es
  _Avoid_ en CONTEXT.md). Se actualizan los links del `AdminLayout`.
- **D13 — Coordinación con la fase F02 del roadmap (paralela)**: `prisma/schema.prisma` y
  `src/server/api/root.ts` son zona compartida **append-only** — releer JUSTO antes de editar,
  `schema-guardian` antes de cualquier cambio de schema, `db push` aditivo, anotar en la Bitácora
  del roadmap con tag `[F05]`. `src/server/api/trpc.ts` y `src/env.js` son **exclusivos de F05**.
  `src/server/domain/pago/` y los scripts/seed de sorteo son **territorio F02 — no tocar**. Hay un
  `next dev` corriendo en `:3001` de la sesión principal — **no levantar otro**.

## Plan

1. **Schema** (F01, F04): releer `prisma/schema.prisma` (F02 paralelo puede haberlo tocado),
   invocar `schema-guardian`, y agregar: modelo `TenantMembership` (D3) + relaciones en
   `User`/`Tenant` + columnas opcionales de `Tenant` (D8). `npx prisma generate` + `db push`
   aditivo. Anotar en Bitácora del roadmap `[F05]`. (F01, F04)
2. **Env vars** (F01): en `src/env.js` (zona exclusiva) retirar `ADMIN_ALLOWLIST`, agregar
   `PLATFORM_OPERATOR_EMAILS: z.string().optional()`. Reflejar en `runtimeEnv` y `.env.example`.
   `GOOGLE_CLIENT_ID/SECRET` quedan como están (placeholders en `.env` — suficiente para
   arrancar; el OAuth client real es trámite del usuario). (F01)
3. **authPolicy** (F01): retirar el gate de allowlist del callback `signIn` (pasa a permitir —
   D2); agregar la decisión pura `resolverTenantAutorizado` (D5) + helper `esOperador(email)`
   sobre `parsearAllowlist`/`emailEnLista` reutilizadas. Adaptar los describes/comentarios de
   `authPolicy.test.ts` que hablan de "allowlist del admin" al rol nuevo (tests puros se
   conservan; TDD para lo nuevo). `resolverGuard`/`requireSession` intactos. (F01)
4. **`panelProcedure`** (F01): en `trpc.ts`, middleware que exige sesión y carga membresías +
   flag Operador; expone al use case el acceso resuelto server-side. Procedure `getAccesoActual`
   para el layout (empty state "sin tienda"). (F01)
5. **CLI de membresías** (F01): `scripts/otorgar-membresia.ts` (D11) + script npm. (F01)
6. **Productos** (F02): use cases + router `panel` + página `/admin/productos` (rename D12)
   conectada con formularios reales (crear/editar/activar-desactivar). `pdfPath` como campo de
   texto/placeholder claramente marcado "la subida real llega con F03" (seam). Retirar los mocks
   de productos. (F02)
7. **Ventas + dashboard** (F03): `listarVentas` con cursor (D9) + `getResumenTienda` (KPIs:
   ventas pagadas, ingresos como Decimal, órdenes pendientes); transformer de Decimal en
   superjson; páginas `/admin` y `/admin/ventas` conectadas; retirar mocks correspondientes. (F03)
8. **Configuración** (F04): `guardarCredencialFlow` (D7), `getEstadoCredencialFlow`,
   `guardarConfiguracionTienda`/`getConfiguracionTienda` (D8, incluye bases del sorteo como
   textarea); página `/admin/configuracion` conectada. (F04)
9. **Sorteo** (F05 — **BLOQUEADA**): NO arrancar hasta que la Bitácora del roadmap registre que
   F02 landeó `Raffle`/`RaffleEntry`. Entonces: releer schema, listar sorteo activo +
   participaciones del tenant en `/admin/sorteo`, y ejecución auditable (marcar ganador una sola
   vez, con quién/cuándo). Si faltan campos: D10. (F05)
10. **Cierre**: `frontend-reviewer` (páginas del panel), `backend-reviewer` (auth/membresía/
    procedures), `change-set-reviewer` con la lista explícita de archivos de la sesión. (todas)

## Validaciones

Checkboxes puros — los archivos/IDs de test los completa el `feature-implementer`.

### F01 — Membresía + guard por tenant

**Vitest** (integration):
- [x] `resolverTenantAutorizado`: un Organizador con membresía resuelve SU tenantId, ignorando/rechazando cualquier `tenantIdSolicitado` ajeno (`FORBIDDEN`). — `src/__tests__/server/authPolicy.test.ts::authPolicy.resolverTenantAutorizado` (SU tenant sin selección / SU tenant solicitado / tenant AJENO ⇒ FORBIDDEN) ✅ 2026-07-17
- [x] `resolverTenantAutorizado`: sesión sin membresía y sin rol Operador ⇒ `FORBIDDEN` (fail-closed). — `src/__tests__/server/authPolicy.test.ts::authPolicy.resolverTenantAutorizado` ("sesión sin membresía y sin rol Operador ⇒ FORBIDDEN") ✅ 2026-07-17
- [x] `resolverTenantAutorizado`: un Operador con `tenantIdSolicitado` explícito resuelve ese tenant; sin indicarlo (y sin membresía propia) ⇒ error claro, nunca un tenant "por defecto". — `src/__tests__/server/authPolicy.test.ts::authPolicy.resolverTenantAutorizado` (Operador con selección / sin selección ⇒ INVALID / con membresía cae a la primera) ✅ 2026-07-17
- [x] `esOperador`: email presente en `PLATFORM_OPERATOR_EMAILS` ⇒ true; var vacía/ausente ⇒ false para cualquier email (fail-closed); comparación normalizada (case/trim). — `src/__tests__/server/authPolicy.test.ts::authPolicy.esOperador` (4 casos) ✅ 2026-07-17
- [x] Un procedure del panel invocado con sesión de un Organizador de la tienda A jamás lee ni escribe datos de la tienda B (aislamiento a nivel de use case, verificable con fake db). — `src/__tests__/server/panel/getAccesoActual.test.ts::panel.acceso.001` (solo Tiendas de la membresía) + `src/__tests__/server/panel/listarProductosDelPanel.test.ts` (scoping de lectura por tenantId resuelto — F02) ✅ 2026-07-17
- [x] `resolverGuard` sigue: sin sesión ⇒ redirect a `/login`; con sesión ⇒ props (tests rescatados se conservan). — `src/__tests__/server/authPolicy.test.ts::authPolicy.resolverGuard` (2 tests rescatados, intactos) ✅ 2026-07-17
- [x] Núcleo del CLI `otorgar-membresia`: crea la membresía por email+slug, es idempotente, y falla claro si el User no existe aún (no lo inventa). — `src/__tests__/scripts/otorgar-membresia.test.ts::otorgar.membresia.001..005` ✅ 2026-07-17

**E2E** (browser):
- [ ] Visitar las 5 rutas del panel sin sesión ⇒ redirect a `/login` (verificable SIN OAuth real). — `tasks/e2e-panel-organizadores.md#panel.auth.redirect.001` (verificable ya, sin OAuth) — ⏳ NO verificado en esta corrida: instrucción explícita "NO browser". Cubierto por Vitest `authPolicy.resolverGuard` (sin sesión ⇒ redirect `/login`) y por el login en vivo de la sesión principal (arrancó en `/login`); el barrido explícito de las 5 rutas sin cookie queda para una corrida browser.
- [x] Login con Google de una cuenta CON membresía ⇒ aterriza en el panel y ve SU tienda; una cuenta SIN membresía ⇒ sesión pero empty state "sin tienda" (REQUIERE OAuth client real — el tester PARA en el login de Google con AWAITING USER). — `tasks/e2e-panel-organizadores.md#panel.auth.membresia.001` ✅ 2026-07-17 (E2E en vivo de la sesión principal + evidencia DB read-only: login Google real → `/admin` con sesión; Operador SIN membresía → empty state "tu cuenta no tiene una tienda asignada"; tras CLI `otorgar-membresia` → panel con "Tienda de la Autora (piloto)". DB: user `nikochaima72@gmail.com` con 1 membresía → tenant `autora`)

### F02 — CRUD de Productos

**Vitest**:
- [x] `listarProductosDelPanel` devuelve solo productos del tenant autorizado, incluidos los inactivos. — `src/__tests__/server/panel/listarProductosDelPanel.test.ts::panel.productos.listar.001` (+ 002: sin membresía ⇒ FORBIDDEN) ✅ 2026-07-17
- [x] `crearProducto` persiste con el `tenantId` resuelto server-side (nunca del input), precio como `Decimal`, y `pdfPath` del seam. — `src/__tests__/server/panel/crearProducto.test.ts::panel.productos.crear.001` (+ 002: sin membresía ⇒ FORBIDDEN, no crea) ✅ 2026-07-17
- [x] `actualizarProducto` sobre un producto de OTRO tenant ⇒ `NOT_FOUND` (sin fuga de existencia). — `src/__tests__/server/panel/actualizarProducto.test.ts::panel.productos.actualizar.002` (updateMany scoped por tenantId ⇒ count 0 ⇒ NOT_FOUND) ✅ 2026-07-17
- [x] Activar/desactivar un producto cambia `activo` y el catálogo del storefront deja de listarlo (query `activo: true` existente). — `src/__tests__/server/panel/actualizarProducto.test.ts::panel.productos.actualizar.003` (escribe activo:false) + `src/__tests__/server/checkout/listarProductos.test.ts::checkout.listar.storefront.001` (el catálogo excluye inactivos) ✅ 2026-07-17

**E2E**:
- [ ] En `/admin/productos`, crear un producto y verlo aparecer en la lista real; editarlo y ver el cambio (requiere sesión — mismo bloqueo OAuth). — `tasks/e2e-panel-organizadores.md#panel.productos.crud.001` (AWAITING USER: OAuth client real) — ⏳ NO cubierto por la evidencia de esta corrida (el E2E en vivo de la sesión principal cubrió login + sorteo, no el CRUD de productos); backend verde por Vitest. Queda para una corrida browser con sesión.

### F03 — Ventas + dashboard reales

**Vitest**:
- [x] `listarVentas` devuelve solo órdenes del tenant autorizado, orden estable `[createdAt desc, id desc]`. — `src/__tests__/server/panel/listarVentas.test.ts::panel.ventas.listar.001` (+ 003: sin membresía ⇒ FORBIDDEN) ✅ 2026-07-17
- [x] Paginación por cursor: la página siguiente no repite ni saltea filas; última página ⇒ `nextCursor: null`. — `src/__tests__/server/panel/listarVentas.test.ts::panel.ventas.listar.002` (recorre todas las páginas con pageSize inyectado, junta ids sin repetir/saltear) ✅ 2026-07-17
- [x] `getResumenTienda` calcula KPIs solo del tenant (conteos por estado; ingresos como `Decimal`, sin aritmética `number`). — `src/__tests__/server/panel/getResumenTienda.test.ts::panel.resumen.001` (+ 002: sin ventas ⇒ "0", + 003: sin membresía ⇒ FORBIDDEN) ✅ 2026-07-17
- [x] Los montos llegan al cliente sin conversión con pérdida (transformer de `Decimal` o string — según D9/S5). — **Elegido el FALLBACK de S5/D9: string en el borde del use case** (ver Bitácora). Verificado en `listarVentas.test.ts::panel.ventas.listar.001` (total/comision/neto como string Decimal, neto = total−fee server-side) + `getResumenTienda.test.ts::panel.resumen.001` (ingresos `_sum` Decimal → string). En el server el monto es Decimal de punta a punta; el cruce a Number vive solo en `~/lib/formato` (borde de presentación, CLP entero — seguro). ✅ 2026-07-17

**E2E**:
- [ ] `/admin/ventas` muestra las órdenes reales del seed/E2E de F01 (la venta pagada de `autora` con su total CLP formateado); `/admin` muestra KPIs coherentes con la DB. — `tasks/e2e-panel-organizadores.md#panel.ventas.dashboard.001` (AWAITING USER: OAuth client real) — ⏳ NO cubierto por la evidencia de esta corrida (el E2E en vivo cubrió login + sorteo, no ventas/dashboard). La orden real que debería aparecer SÍ existe en DB (order `cmrogl4pi0002egexv45st4a5` PAGADO de `autora`). Queda para una corrida browser con sesión.

### F04 — Configuración: CredencialFlow + bases + plantilla

**Vitest**:
- [x] `guardarCredencialFlow` cifra ambas keys (roundtrip con `descifrar` recupera; ciphertext no contiene el plaintext) y upsertea (pisa la credencial previa). — `src/__tests__/server/panel/credencialFlow.test.ts::panel.cred.guardar.001` (roundtrip + ciphertext sin plaintext + upsert create/update) ✅ 2026-07-17
- [x] Ninguna respuesta del panel contiene secretos ni ciphertexts: el estado leíble expone solo `{ configurada, sandbox, updatedAt }`. — `src/__tests__/server/panel/credencialFlow.test.ts::panel.cred.guardar.001` (respuesta sin secretos) + `panel.cred.estado.001/002` (getEstadoCredencialFlow: select sin columnas cifradas) ✅ 2026-07-17
- [x] `guardarConfiguracionTienda` persiste bases del sorteo + campos de plantilla SOLO en el tenant autorizado; intento sobre otro tenant ⇒ `FORBIDDEN`/`NOT_FOUND`. — `src/__tests__/server/panel/configuracionTienda.test.ts::panel.config.guardar.001` (escribe en el tenant del acceso, no del input) + `panel.config.guardar.003` (sin membresía ⇒ FORBIDDEN; el input no lleva tenantId ⇒ imposible targetear otra Tienda) ✅ 2026-07-17
- [x] Sin `CREDENTIALS_ENCRYPTION_KEY` el guardado falla claro sin filtrar la clave ni los secretos (fail-fast existente). — cubierto por el borde `claveDeCifradoDeEnv` (`src/server/pago/flowDeTenant.ts`, throw sin el valor de la clave) + `src/__tests__/server/services/cifrado.test.ts::cifrado.005` (parsearClave: error sin filtrar la clave). El router evalúa `claveDeCifradoDeEnv()` dentro de `runDomain` ⇒ 500 explícito. ✅ 2026-07-17

**E2E**:
- [ ] En `/admin/configuracion`, cargar una credencial y ver el estado "configurada" sin que ningún secreto aparezca en la UI ni en la respuesta de red; guardar bases del sorteo y verlas persistidas al recargar (requiere sesión). — `tasks/e2e-panel-organizadores.md#panel.config.credencial.001` (AWAITING USER: OAuth client real) — ⏳ NO cubierto por la evidencia de esta corrida (el E2E en vivo cubrió login + sorteo, no configuración). Backend verde por Vitest (write-only, sin fuga de secretos). Queda para una corrida browser con sesión + revisión de la pestaña Network.

### F05 — Sorteo en el panel (DESBLOQUEADA: F02 landeó Raffle/RaffleEntry + pasó a testing)

**Vitest**:
- [x] `getSorteoDelPanel` devuelve el sorteo del tenant con sus participaciones reales; sin sorteo ⇒ null; sin membresía ⇒ FORBIDDEN. — `src/__tests__/server/panel/getSorteoDelPanel.test.ts::panel.sorteo.get.001/002/003` ✅ 2026-07-17
- [x] `ejecutarSorteo` elige un ganador y registra quién (email del ejecutor) y cuándo, transiciona ACTIVO→CERRADO. — `src/__tests__/server/panel/ejecutarSorteo.test.ts::panel.sorteo.ejecutar.001` ✅ 2026-07-17
- [x] `ejecutarSorteo` es IDEMPOTENTE: re-ejecutar NO vuelve a sortear (devuelve el ganador guardado, misma fecha). — `src/__tests__/server/panel/ejecutarSorteo.test.ts::panel.sorteo.ejecutar.002` (guard doble: chequeo temprano + updateMany WHERE ejecutadoAt IS NULL) ✅ 2026-07-17
- [x] `ejecutarSorteo`: 0 participantes ⇒ INVALID; raffle de otra Tienda ⇒ NOT_FOUND; sin membresía ⇒ FORBIDDEN. — `src/__tests__/server/panel/ejecutarSorteo.test.ts::panel.sorteo.ejecutar.003/004/005` ✅ 2026-07-17

**E2E**:
- [ ] `/admin/sorteo` muestra el sorteo activo y las participaciones reales de la tienda; ejecutar marca el ganador y lo muestra. — `tasks/e2e-panel-organizadores.md#panel.sorteo.ejecutar.001` (AWAITING USER: OAuth client real + sorteo sembrado por F02) — ⏳ PARCIAL: la mitad de "ver sorteo activo + participaciones reales" SÍ está verificada en vivo por la sesión principal (`/admin/sorteo` → "Sorteo · Tienda de la Autora (piloto)", sorteo "Sorteo de lanzamiento" ACTIVO con 1 participante + botón Ejecutar; DB: `ejecutadoAt=null`, `ganadorEmail=null`, 1 `RaffleEntry` de `nikochaima72+e2ef02@gmail.com`). La EJECUCIÓN **NO se corre** (irreversible; el usuario quiere presenciarla). Queda [ ] hasta que el usuario ejecute el sorteo.

## Invariantes

- **I1 — Tenancy del panel**: toda query/mutación del panel se scopea por el tenant que resuelve
  `resolverTenantAutorizado` (membresía o flag Operador, ambos server-side). Un `tenantId` del
  input JAMÁS autoriza nada — solo selecciona, y solo para el Operador (D5). Uniques compuestos
  con `tenantId` donde aplique (ADR-0005).
- **I2 — Fail-closed**: sin membresía y sin rol Operador ⇒ `FORBIDDEN` en procedures y empty
  state en UI. `PLATFORM_OPERATOR_EMAILS` vacía ⇒ nadie es Operador.
- **I3 — Secretos**: las keys de Flow entran write-only, se cifran con el seam existente
  (`cifrado.ts`/`claveDeCifradoDeEnv`) y nunca aparecen — ni en claro ni cifradas — en
  respuestas, logs ni props de página (ADR-0006/I5 del roadmap).
- **I4 — Dinero**: `Decimal` de punta a punta; nada de aritmética `number`; UI con
  `Intl.NumberFormat` CLP.
- **I5 — Zonas compartidas (F02 paralelo)**: `schema.prisma` y `root.ts` append-only + releer
  antes de editar + `schema-guardian` + Bitácora del roadmap `[F05]`; `db push` aditivo;
  `domain/pago/` y seeds de sorteo NO se tocan; `trpc.ts` y `env.js` son exclusivos de F05.
- **I6 — Sin PDF real**: F05 no sube ni sirve archivos; `pdfPath` queda como seam textual para
  F03 (I9 del roadmap: nada "provisorio" que viole la entrega firmada).
- **I7 — Layering**: routers finos → `runDomain()` → use cases `domain/panel/` → services;
  env vía `src/env.js` + `.env.example`; sin barrels; cero `any`.
- **I8 — Un solo dev server**: hay un `next dev` en `:3001` de la sesión principal; no levantar
  otro (memoria del proyecto: corrompe `.next`).
- **I9 — OAuth real = trámite del usuario**: el implementer/tester NO crea el OAuth client de
  Google Cloud; si un flujo browser llega al login de Google, PARA con **AWAITING USER**.
- **I10 — Auth existente**: `getServerAuthSession`/`requireSession` son LA vía — nunca
  reimplementar `getServerSession` ni duplicar la política en otro archivo.

## Out of scope

- Subida/entrega real de PDFs (F03) — solo el seam `pdfPath`.
- Panel del Operador con UI propia (alta/suspensión/supervisión) y gestión de operadores en DB (F08).
- Self-service de registro/alta de Tiendas y aceptación de ToS (F08).
- Theming real del storefront con la config de plantilla (F06) — F05 solo la persiste y edita.
- Crear el OAuth client de Google Cloud Console / `NEXTAUTH_URL` de producción (trámite del
  usuario; decisión abierta #4).
- Equipos/roles finos por tienda (S6: un dueño por Tienda).
- Crear los modelos `Raffle`/`RaffleEntry` (territorio de la fase F02 del roadmap).
- Pulido visual / marca (identidad de plataforma PENDIENTE — F06; el panel usa shadcn neutro
  como las maquetas).

## Supuestos (resueltos por criterio, revisables)

- **S1**: `signIn` abierto (cualquier cuenta Google crea `User`); la autorización completa es la
  membresía, fail-closed. Revisable si el usuario prefiere un gate de plataforma hasta F08.
- **S2**: Operador designado por env var `PLATFORM_OPERATOR_EMAILS` (CSV, reusa la política pura
  rescatada). Revisable a flag en DB cuando F08 construya el panel del Operador.
- **S3**: `TenantMembership` sin campo `rol` — dueño implícito (S6 del roadmap).
- **S4**: Bases del sorteo + config de plantilla = columnas opcionales de `Tenant` (no modelo
  aparte, no en `Raffle`). Revisable cuando F02 landee sus modelos / en F06.
- **S5**: Montos al cliente vía transformer de `Prisma.Decimal` en superjson; fallback a string
  en el borde del use case si el transformer complica el bundle.
- **S6**: `/admin/libros` se renombra a `/admin/productos` (CONTEXT: `Libro` es _Avoid_).
- **S7**: El Operador selecciona tienda vía input explícito autorizado server-side por su flag —
  no viola I1 (la autorización nunca sale del input).
- **S8**: Un User puede tener N membresías estructuralmente; la UI del MVP asume 1 (la primera).
  El selector multi-tienda llega con F08 si hace falta.

## Especialistas a consultar

- `schema-guardian` — ANTES de tocar `schema.prisma`: `TenantMembership` (unique compuesto,
  `onDelete`, índices) + columnas nuevas de `Tenant`. Recordar zona compartida con F02.
- `backend-reviewer` — evolución de `auth.ts`/`authPolicy.ts`, `panelProcedure`, use cases del
  panel (aislamiento cross-tenant, write-only de credenciales), env vars.
- `frontend-reviewer` — páginas del panel conectadas (formularios, estados de carga/error,
  `Intl.NumberFormat`, convenciones shadcn).
- `feature-tester` — Vitest + E2E asistido; el E2E con sesión queda AWAITING USER hasta tener el
  OAuth client real (el redirect sin sesión sí es verificable ya).
- `change-set-reviewer` — diff completo al cierre, con foco en las zonas compartidas con F02.

## Bitácora

- [2026-07-16 22:10] [planner-grill] Task file de la fase F05 del roadmap creado
  (`panel-auth-organizadores`). Por instrucción explícita del usuario NO hubo grill extenso:
  decisiones D1–D13 resueltas por criterio, revisables marcadas como Supuestos S1–S8; ninguna
  resultó estructural imposible de asumir (todas tienen default fail-closed). Contexto observado:
  rescate F05 sin commitear en el working tree (auth.ts con Google OAuth, authPolicy.ts pura,
  login.tsx, guard en las 5 páginas admin, 8 tests verdes de authPolicy) — el plan lo adapta, no
  lo reescribe; schema F01 done (Tenant/FlowCredential/Product/Order/OrderItem/Payment);
  `cifrado.ts` + `claveDeCifradoDeEnv` listos para reusar en la carga de CredencialFlow;
  `GOOGLE_CLIENT_ID/SECRET` placeholders en `.env` (OAuth client real = trámite del usuario);
  fase F02 del roadmap corriendo EN PARALELO (zonas compartidas anotadas en D13/I5; sub-feature
  Sorteo del panel BLOQUEADA hasta que F02 landee Raffle/RaffleEntry — D10). Tests existentes
  revisados: los 8 de `authPolicy.test.ts` se conservan (funciones puras reutilizadas; solo se
  adaptan describes que digan "allowlist del admin"); ningún E2E checklist previo aplica.
  Registrado en INDEX (Activas) y en la Bitácora del roadmap con tag [F05]. **AWAITING USER
  APPROVAL** — la implementación no arranca sin visto bueno explícito.
- [2026-07-16 23:30] [feature-implementer] Arranca implementación (usuario dio visto bueno
  explícito; sesión Terminal 2, F05 del roadmap, paralela a F02). Features internas pendientes:
  F01 (membresía + guard), F02 (CRUD productos), F03 (ventas + dashboard), F04 (config), F05
  (sorteo — BLOQUEADA hasta que F02 del roadmap landee Raffle/RaffleEntry; verificado en la
  Bitácora del roadmap que F02 sigue en planning/AWAITING APPROVAL, sin schema landeado). Read
  pass completo hecho: template, CLAUDE.md, ADR-0004/0005/0006/0007/0008, backend/frontend/prisma/
  data-fetching/commit conventions, design.md, rescate F05 del working tree, schema, trpc.ts,
  env.js, root.ts, cifrado.ts, flowDeTenant.ts, use cases de checkout + sus tests (patrón fake db
  a espejar), seed-tenants (patrón núcleo+wrapper CLI), páginas admin + mock-data.
- [2026-07-16 23:40] [feature-implementer] [F05→schema] **F02 landeó su schema MID-SESIÓN** (roadmap
  Bitácora [F02] 23:35): `Raffle`/`RaffleEntry`/`DownloadGrant` + enum `RaffleStatus` YA están en
  `prisma/schema.prisma` y en la DB (db push aditivo). F02 sigue MID-FLIGHT (su implementer construye
  ahora los use cases post-pago; su status propio = implementing). Consecuencias: (a) re-leí el schema
  JUSTO antes de editar (I5); (b) `schema-guardian` invocado → **APPROVE** para mi append aditivo
  (`TenantMembership` + 4 columnas opcionales de Tenant); (c) db push aditivo OK (DB en sync) —
  `prisma generate` regeneró los tipos TS (TenantMembership/basesSorteo presentes) pero el copiado del
  engine `.dll.node` dio EPERM por el lock del `next dev` :3001 (mismo síntoma inocuo que reportó F02;
  no afecta tipos). **Decisión D8 (bases del sorteo)**: `schema-guardian` señaló que `Raffle.basesUrl`
  (F02) ya existe. Mantengo `basesSorteo String?` en `Tenant` (default del plan, S4): es el TEXTO
  borrador editable a nivel Tienda (F05), semánticamente distinto de `Raffle.basesUrl` que es el
  enlace al ARCHIVO de bases (lo sube F03), y la config de Tienda existe aunque no haya Raffle sembrado
  todavía. Coexisten a propósito (documentado en el schema). **FLAG para el usuario** (D8 pide
  "evaluar con el usuario" si Raffle landeó): si prefieren una sola representación en `Raffle`, es un
  cambio menor pero destructivo (drop de columna) — dejo la decisión abierta en el reporte final.
- [2026-07-16 23:55] [feature-implementer] **F01 (interna) implementada.** Archivos NUEVOS:
  `src/server/domain/panel/getAccesoActual.ts` (use case Tiendas-de-la-membresía + esOperador para el
  layout), `src/server/api/routers/panel.ts` (router del panel, arranca con getAccesoActual),
  `scripts/otorgar-membresia.ts` (CLI núcleo+wrapper de bootstrap de membresías, D11),
  `src/lib/formato.ts` (clp/num compartidos, retiran los de mock-data), + tests
  `src/__tests__/server/authPolicy.test.ts` (+11: esOperador, resolverTenantAutorizado),
  `src/__tests__/server/panel/getAccesoActual.test.ts`, `src/__tests__/scripts/otorgar-membresia.test.ts`.
  MODIFICADOS: `prisma/schema.prisma` (TenantMembership + columnas Tenant), `src/server/authPolicy.ts`
  (esOperador + resolverTenantAutorizado puros + AccesoPanel; muere la allowlist como gate — parsear/
  emailEnLista se conservan y se reusan para el Operador), `src/server/auth.ts` (retirado el gate del
  signIn, D2), `src/env.js` + `.env.example` (−ADMIN_ALLOWLIST, +PLATFORM_OPERATOR_EMAILS opcional),
  `src/server/api/trpc.ts` (+panelProcedure), `src/server/api/root.ts` (+panel, append-only),
  `src/components/admin/admin-layout.tsx` (gate real vía getAccesoActual: loading/error/empty-state
  "sin tienda"; logout con signOut; nombre real de la Tienda; rename nav Libros→Productos = D12),
  `src/components/admin/estado-badge.tsx` (usa el enum OrderStatus real), `package.json` (+script
  otorgar:membresia). Vitest filtrado: **27/27 verde** (authPolicy 19, getAccesoActual 3, otorgar 5).
  Decisiones tácticas (cubiertas por plan): resolverTenantAutorizado lanza DomainError (FORBIDDEN para
  ajeno/sin-membresía, INVALID para Operador-sin-selección) que runDomain mapea; use cases del panel
  reciben `{ db, acceso }` (acceso = el "session" del panel, espeja la firma { db, session, input }) y
  resuelven el tenantId internamente. TDD red→green por función pura y por use case.
- [2026-07-16 23:56] [feature-implementer] [F01] **Auto-chequeo design.md (UI tocada = AdminLayout/
  EstadoBadge/formato)**: tokens semánticos (bg-sidebar/text-muted-foreground/text-destructive/bg-muted,
  cero hex inline salvo el punto de color del EstadoBadge, que es la excepción data-viz ya establecida
  y documentada — la semántica de color de comercio sigue PENDIENTE en design.md §9, NO inventé
  semántica financiera); Tabler icons; los 3 estados (loading Skeleton / error+Reintentar / empty
  "sin tienda") resueltos por data-fetching-conventions; motion existente (transition duration-200).
  OK. El frontend-reviewer de las páginas se difiere al cierre de F02–F04 (para revisar layout+páginas
  juntos, con contexto completo).
- [2026-07-16 23:57] [feature-implementer] [F01] `backend-reviewer`: **APPROVE**, cero blockers
  (Corrección A / Compliance A / Naming A / Tests A). Verificó los 3 focos de riesgo: (1) ningún camino
  por el que un tenantId del input autorice — solo selecciona entre lo ya autorizado server-side; (2)
  fail-closed sostenido en dos capas (resolverTenantAutorizado FORBIDDEN + getAccesoActual devuelve
  tenants:[] sin datos ajenos); (3) el CLI no puede inventar un User (findUnique→throw). **NITs (no
  aplicados aún)**: (a) DRIFT `docs/agents/backend-conventions.md` § Auth describe la ADMIN_ALLOWLIST
  retirada + tabla de Procedures no lista `panelProcedure` — draft de drift acumulado para el cierre
  (Step 4.5: requiere OK del usuario; lo presento consolidado en el reporte final). (b) resolverTenant-
  Autorizado aún sin caller real (F02+ lo cablea) — el checklist de F02 ya cubre el aislamiento.
- [2026-07-17 00:20] [feature-implementer] **F02 (CRUD Productos) implementada.** NUEVOS use cases
  `src/server/domain/panel/{listarProductosDelPanel,crearProducto,actualizarProducto}.ts` +
  `schemas.ts` (Zod, sin tenantId en ningún input — se resuelve server-side), procedures en
  `panel.ts`; página `src/pages/admin/productos.tsx` (rename D12 de libros.tsx, ELIMINADO) conectada a
  datos reales (crear/editar con mutations + invalidate; loading/error/empty). Tests fake-db:
  `listarProductosDelPanel` (aislamiento A/B + incluye inactivos), `crearProducto` (tenantId del acceso
  NO del input, precio Decimal, pdfPath seam), `actualizarProducto` (updateMany scoped ⇒ producto de
  otro tenant = NOT_FOUND sin fuga; toggle activo), + `checkout/listarProductos` (storefront excluye
  inactivos). **11/11 verde.** Decisión táctica: crear ⇒ producto activo por defecto (el Estado
  select para desactivar aparece solo en edición — crear-borrador se logra creando y desactivando; no
  agregué `activo` al input de crear para no ampliar scope). `pdfPath` = campo de texto marcado "la
  subida real llega con F03" (seam I6, sin subida real).
- [2026-07-17 00:45] [feature-implementer] **F03 (Ventas + dashboard) implementada.** NUEVOS use cases
  `src/server/domain/panel/{listarVentas,getResumenTienda}.ts`; procedures en `panel.ts`; páginas
  `src/pages/admin/ventas.tsx` (infinite query por cursor + "Cargar más") y `src/pages/admin/index.tsx`
  (KPIs reales + últimas 5 ventas); helper `~/lib/formato.ts` (+fechaHora). Tests fake-db:
  `listarVentas` (aislamiento, orden estable [createdAt desc, id desc], paginación por cursor con
  pageSize inyectado —sin repetir/saltear, última página nextCursor null—, neto = total−fee Decimal
  server-side), `getResumenTienda` (KPIs solo del tenant, ingresos `_sum` Decimal, sin ventas ⇒ "0").
  **6/6 verde.** **DECISIÓN D9/S5 (montos al cliente)**: elegido el **FALLBACK de S5** (string en el
  borde del use case) en vez del transformer superjson de `Prisma.Decimal`. Razón: registrar
  `Prisma.Decimal` como custom type SIMÉTRICO exige importar `@prisma/client` en el bundle del cliente
  (arrastra el client Prisma al browser) — es exactamente "el transformer pelea con el bundle" que S5
  contempla. Además `frontend-conventions.md` § Formato de dinero YA prescribe que los montos llegan
  como string y se cruzan a Number SOLO en el borde de presentación (`~/lib/formato`), así el cliente
  nunca necesita `Decimal`. En el SERVER el monto es Decimal de punta a punta (`_sum`, `total.minus(fee)`),
  sin aritmética `number`. Es la opción MÁS alineada con las convenciones y evita el riesgo de bundle
  — dentro de lo que D9 sanciona, no es desvío. Decisión táctica: la página de ventas dropea el
  buscador/filtro del mock (un filtro client-side sobre páginas cargadas por cursor sería engañoso —
  solo filtraría lo ya cargado); el dashboard dropea el gráfico mensual mock (los ingresos-por-mes
  reales exigen agregación temporal — fuera de scope F05) y la card de sorteo mock (Sorteo BLOQUEADA).
- [2026-07-17 01:10] [feature-implementer] **F04 (Configuración) implementada.** NUEVOS use cases
  `src/server/domain/panel/{guardarCredencialFlow,getEstadoCredencialFlow,guardarConfiguracionTienda,
  getConfiguracionTienda}.ts`; procedures en `panel.ts`; página `src/pages/admin/configuracion.tsx`
  conectada (CredencialFlow write-only + config de tienda + bases del sorteo textarea). Tests fake-db:
  credencial cifra roundtrip + ciphertext sin plaintext + upsert + respuesta sin secretos + estado
  leíble sin columnas cifradas; config guarda en el tenant del acceso (no del input) + campos vacíos ⇒
  null + FORBIDDEN sin membresía. **9/9 verde.** `guardarCredencialFlow` recibe la clave AES INYECTADA
  desde el router (`claveDeCifradoDeEnv()` evaluada dentro de runDomain ⇒ 500 fail-fast sin filtrar la
  clave si falta CREDENTIALS_ENCRYPTION_KEY).
- [2026-07-17 01:40] [feature-implementer] [F05→DESBLOQUEO] **Sorteo del panel DESBLOQUEADO e
  implementado.** Gatillo: F02 landeó Raffle/RaffleEntry/DownloadGrant (schema+DB) Y su task file pasó a
  `status: testing` (estable, ya no mid-flight) — condición de la regla operativa #4 cumplida; re-leí el
  schema (D10). `schema-guardian` **APPROVE** para el append aditivo a `Raffle`: `ganadorEmail String?` +
  `ejecutadoAt DateTime?` + `ejecutadoPor String?` (los 3 nullable, jamás editando campos de F02).
  Decisión (feedback schema-guardian): `ejecutadoPor` guarda el **email** del ejecutor (durable si el
  User se borra, ADR-0004), no un userId que dangle — agregué `email?` a `AccesoPanel` (opcional, backcompat)
  y `panelProcedure` lo puebla de la sesión. **MVP: UN ganador, criterio random uniforme (implícito)** —
  divergencia consciente con CONTEXT §Participación ("ganador/es, criterio"); no es bug (schema-guardian
  confirmó que no requiere tocar CONTEXT). NUEVOS use cases `getSorteoDelPanel` (ver sorteo actual +
  participaciones) y `ejecutarSorteo` (auditable + idempotente: elige ganador, marca quién/cuándo,
  ACTIVO→CERRADO; idempotencia en 2 capas: chequeo temprano `ejecutadoAt!=null` + guard atómico
  `updateMany WHERE ejecutadoAt IS NULL`); procedures en `panel.ts`; página `src/pages/admin/sorteo.tsx`
  con confirm dialog para la ejecución irreversible. Tests fake-db (incl. carrera concurrente count===0):
  **9/9 verde** (8 + el de la carrera agregado por NIT del backend-reviewer). `ahora`/`elegirIndice`
  inyectados para testear sin reloj/azar. Retirados `mock-data.ts` + `sales-chart.tsx` (dead code tras
  conectar todo a datos reales).
- [2026-07-17 01:50] [feature-implementer] [F02–F05] `backend-reviewer`: **APPROVE**, cero blockers
  (Compliance A / Naming B / Tests B). Verificó los 4 focos: (1) todos los use cases pasan por
  resolverTenantAutorizado y ningún input lleva tenantId — update/updateMany scopeados; (2) credenciales
  write-only, select sin columnas cifradas, respuestas sin secretos; (3) cero aritmética number en server
  (Decimal `_sum` / `total.minus(fee)`); (4) idempotencia del sorteo sólida (guard SQL WHERE ejecutadoAt
  IS NULL serializa la carrera bajo READ COMMITTED). NIT aplicado: agregado el test de la rama count===0
  (carrera concurrente). NIT naming (procedure `listarProductos` vs use case `listarProductosDelPanel`) —
  desvío menor consistente (el namespace `panel.*` compensa), no corregido.
- [2026-07-17 01:55] [feature-implementer] [F02–F05] **Auto-chequeo design.md + `frontend-reviewer`**.
  Auto-chequeo (UI real): tokens semánticos, cero hex inline salvo EstadoBadge (excepción data-viz
  documentada; NO inventé semántica financiera — la de comercio sigue PENDIENTE §9); montos con clp()+
  tabular-nums; 3 estados por pantalla; Tabler; DialogDescription en ambos diálogos. `frontend-reviewer`
  1ª pasada: **REQUEST_CHANGES** con 3 blockers → arreglé 2 en el acto (`configuracion.tsx`): (B2)
  CredencialFlowCard ahora tiene rama isError (un fetch fallido ya no se disfraza de "No conectada");
  (B3, riesgo de PÉRDIDA DE DATOS) ConfiguracionTiendaCard early-return en isError — no renderiza el form
  en blanco que al Guardar pisaría bases/config reales con vacíos. + NIT: productos invalida también
  getResumenTienda. 2ª pasada del reviewer: **B2 y B3 CERRADOS**. **BLOCKER 1 PENDIENTE (AWAITING
  USER)**: 3 `<textarea>` nativos a mano en vez del componente `Textarea` de shadcn — el fix es
  `npx shadcn@latest add textarea`, una ADICIÓN DE COMPONENTE que mis reglas de autonomía me obligan a
  autorizar con el usuario antes de correr (bounded autonomy). El panel FUNCIONA con los textarea a mano
  (compila, tsc verde); es una violación de convención, no un defecto funcional. Queda como el único
  ítem para que el frontend pase a APPROVE. **NO lo apliqué sin autorización.**
- [2026-07-17 02:00] [feature-implementer] **DRIFT de documentación detectado (Step 4.5, requiere OK
  del usuario — NO aplicado)**. (a) `docs/agents/backend-conventions.md` § Auth describe la
  `ADMIN_ALLOWLIST` como gate activo del signIn (retirada, D2) y la tabla § Procedures lista solo 3
  procedures (falta `panelProcedure`). (b) `docs/agents/frontend-conventions.md` § Data fetching
  referencia "Paginación por cursor" que no existe como sección propia (la usa ventas.tsx con
  useInfiniteQuery); + candidatos de consolidación que emergieron: helper de dinero `~/lib/formato`
  (primer uso real de formato CLP), patrón input de dinero (prefijo `$` + tabular-nums + inputMode), y
  el orden de sub-formularios hidratados-desde-query (query antes de useState). Presento los diffs
  concretos en el reporte final con las 4 opciones. Drafts, sin aplicar.
- [2026-07-17 02:05] [feature-implementer] **Implementación completa — status → testing.** Features
  internas F01..F05 implementadas (las 5, incluida F05/Sorteo que se DESBLOQUEÓ al landear F02). Vitest
  filtrado durante TDD: **59/59 verde** en los archivos de esta sesión (authPolicy 19, panel 35, otorgar
  5). Backend-reviewer: APPROVE (F01 y F02–F05). Frontend-reviewer: blockers funcionales B2/B3 CERRADOS;
  **1 ítem AWAITING USER** — autorizar `npx shadcn@latest add textarea` (adición de componente, bounded
  autonomy) para reemplazar 3 `<textarea>` a mano; el panel funciona sin eso. `tsc --noEmit` exit 0.
  NO corrí `npm run check` completo ni la suite Vitest entera (es del feature-tester); NO commit; NO
  invoqué change-set-reviewer (lo orquesta la sesión principal). **PENDIENTES para el usuario/orquestador**:
  (1) autorizar el componente Textarea (frontend blocker 1); (2) evaluar D8 (basesSorteo en Tenant vs
  Raffle) — dejé el default S4; (3) OK a los drifts de doc (backend/frontend conventions); (4) el OAuth
  client de Google (E2E con sesión AWAITING, I9). Listo para el `feature-tester` (Vitest completo + E2E
  del redirect sin sesión, que SÍ es verificable ya).
- [2026-07-17 05:00] [feature-implementer] [F05] **Cierre de fixes puntuales post-implementación** — el
  usuario decidió los 4 pendientes; aplico SOLO estos, sin re-implementar nada.
  **(1) Lint limpio** (`npx next lint` ⇒ *"No ESLint warnings or errors"*):
  (a) retirado el import muerto `IconExternalLink` de `admin-layout.tsx` (warning `no-unused-vars`);
  (b) los 3 `no-unsafe-argument` de `authPolicy.test.ts` resueltos con un helper tipado
  `codeDeErrorLanzado(fn)` que captura el `DomainError` y devuelve su `code` (reemplaza el matcher
  `expect.objectContaining({code})`, tipado `any`, y de paso aserta que lo lanzado ES un `DomainError`);
  (c) los 6 `prefer-nullish-coalescing` (ternario identidad `x ? x : null` en `crearProducto`/
  `actualizarProducto`/`guardarConfiguracionTienda`) **NO** se resolvieron con `?? null` —eso cambiaría
  la semántica "vacío ⇒ null" que los tests fijan pasando `""` DIRECTO al use case (bypass de Zod:
  `crearProducto.test.ts::…crear.001` y `configuracionTienda.test.ts::…guardar.002` esperan
  `toBeNull()`)— sino extrayendo el helper `textoOpcionalANull(valor)` a nuevo `domain/panel/_internal.ts`
  (uso en 3 archivos ⇒ shared por backend-conventions). Behavior-preserving. **Vitest filtrado** de los 4
  archivos tocados: **29/29 verde** (authPolicy 19, crearProducto 2, actualizarProducto 3, configTienda 5);
  `npx tsc --noEmit` **exit 0**.
  **(2) Drift de docs APLICADO** (el usuario dio OK): `backend-conventions.md` — header + § Auth reescrita
  (muere `ADMIN_ALLOWLIST` como gate del `signIn`; nace autenticación abierta + autorización por
  `TenantMembership` + Operador vía `PLATFORM_OPERATOR_EMAILS`; `parsearAllowlist`/`emailEnLista` renacen
  sirviendo al Operador; `resolverTenantAutorizado` documentado) + guard subsection (allowlist→política,
  `libros`→`productos`, sesión ≠ autorización) + tabla § Procedures ahora con **4 filas** (agregado
  `panelProcedure`, actualizado `protectedProcedure`). `frontend-conventions.md` — § Data fetching
  (+listas por cursor con `useInfiniteQuery`/"Cargar más", que resuelve el cross-ref pendiente de
  backend § Paginación; +formularios hidratados-desde-query con `useEffect` + early-return `isError`
  anti-pérdida-de-datos) + § Formato de dinero (+helpers `~/lib/formato` `clp`/`num`/`fechaHora`;
  +patrón input de monto: `$` afijo visual + `pl-7 tabular-nums` + `inputMode`).
  **(3) Decisiones cerradas sin código**: bases del sorteo **QUEDAN en `Tenant.basesSorteo`** (default
  S4/D8 confirmado por el usuario — NO se migra a `Raffle`, se descarta el FLAG que dejé abierto en la
  Bitácora del 23:40). El blocker del `frontend-reviewer` (3 `<textarea>` nativos en vez del componente
  shadcn `Textarea`) **SE OMITE DELIBERADAMENTE**: el panel migra a **Mantine** en la próxima task
  (decisión del usuario; **ADR-0011 vendrá**) ⇒ el `change-set-reviewer` NO debe contarlo como gap.
  **(4) Env verificado en sync** (no requirió cambio): `env.js` ya NO declara `ADMIN_ALLOWLIST` y tiene
  `PLATFORM_OPERATOR_EMAILS` opcional; `GOOGLE_CLIENT_ID/SECRET` siguen requeridas, coherente con el
  `.env` que ahora trae los valores reales del OAuth client `sortealo-dev` +
  `PLATFORM_OPERATOR_EMAILS=nikochaima72@gmail.com`. `.env.example` sincronizado (documenta
  `PLATFORM_OPERATOR_EMAILS`, sin var `ADMIN_ALLOWLIST` — solo referencias históricas en comentarios).
  **NO commit, NO push, NO feature-tester, NO dev server nuevo.**
- [2026-07-17 05:20] [feature-implementer] [F05] **Fix post-review del `change-set-reviewer`
  (REQUEST_CHANGES: 1 blocker + 3 nits).** Aplicado EXACTAMENTE lo pedido, nada más:
  **(BLOCKER) `src/pages/admin/index.tsx`** — la grilla de KPIs colapsaba loading+error en
  `resumen.isLoading || !kpis`, dejando los 4 skeletons perpetuos ante fallo (con `retry:false`,
  `getResumenTienda` no reintenta). Agregada la rama `resumen.isError || !kpis` con mensaje
  `text-destructive` + botón `Reintentar` (`variant="outline" size="sm"`, `onClick refetch`),
  espejando el patrón de tres estados que la MISMA página ya usa en la tabla de ventas (data-fetching
  conventions). `col-span-full` para ocupar el ancho de la grilla.
  **(NIT) keys duplicadas del sorteo** — `getSorteoDelPanel.ts`: `id` agregado al `select` de `entries`
  y al tipo `SorteoDelPanel.participantes`; `sorteo.tsx` L197 `key={p.id}` en vez de `key={p.email}`
  (un mismo email puede tener 2+ `RaffleEntry`, keys duplicadas en React). `getSorteoDelPanel.test.ts`
  NO tocado (no asserta `id`, sigue verde).
  **(NIT) `login.tsx`** — eliminada la rama `error === "AccessDenied"` ("Ese correo no tiene acceso al
  panel"): resabio de la allowlist muerta (D2), hoy el `signIn` no rechaza a nadie.
  **(NIT) `getResumenTienda.test.ts`** — el fake `aggregate` ahora devuelve `_sum: { total: null }`
  cuando no hay filas (como Prisma real), ejercitando el coalesce `?? new Prisma.Decimal(0)` de
  `getResumenTienda.ts` (antes devolvía `Decimal(0)` y ese camino quedaba sin cubrir).
  **NO tocado** (diferido a la task Mantine por el reviewer): naming de procedures, voseo del CLI.
  **Verificación**: `npx next lint` sin warnings/errors; `npx tsc --noEmit` exit 0; Vitest filtrado de
  los archivos tocados **6/6 verde** (getResumenTienda 3, getSorteoDelPanel 3). NO commit, NO push, NO
  dev server nuevo (el de :3001 sigue vivo).
- [2026-07-17 00:59] [feature-tester] **Corrida de validación F05.** `vitest run` COMPLETO **verde: 28
  archivos / 145 tests, 0 fallos** (misma corrida que valida F02). Cobertura del task file (23 checkboxes
  Vitest, todos con artefacto verde) ⇒ marcados `[x]`: **F01** authPolicy 19 + getAccesoActual 3 +
  otorgar-membresia 5 (resolverTenantAutorizado / esOperador / resolverGuard / aislamiento A↔B / CLI
  idempotente); **F02** listarProductosDelPanel 2 + crearProducto 2 + actualizarProducto 3 +
  checkout/listarProductos 1; **F03** listarVentas 3 + getResumenTienda 3 (Decimal string en el borde,
  D9/S5 fallback); **F04** credencialFlow 4 + configuracionTienda 5 (write-only, sin fuga de secretos);
  **F05/Sorteo** getSorteoDelPanel 3 + ejecutarSorteo 6 (elige ganador / idempotente 2-capas / edges +
  carrera count===0). **E2E** (por evidencia del E2E en vivo de la sesión principal + DB read-only
  `tmp/check-f05.ts`; NO browser por instrucción): **`panel.auth.membresia.001` ✅** (login Google real →
  `/admin`; Operador SIN membresía → empty state fail-closed; CLI `otorgar-membresia` → panel con
  "Tienda de la Autora (piloto)"; DB: user `nikochaima72@gmail.com` con 1 membresía → `autora`).
  **Quedan `[ ]`**: `panel.auth.redirect.001` (⏳ no re-corrido en browser; guard cubierto por Vitest
  resolverGuard + login en vivo), `panel.productos.crud.001` / `panel.ventas.dashboard.001` /
  `panel.config.credencial.001` (⏳ no cubiertos por el E2E en vivo — solo login+sorteo; backend verde),
  y **`panel.sorteo.ejecutar.001` (⏳ PARCIAL)**: "ver sorteo activo + participaciones" SÍ verificado en
  vivo (sorteo "Sorteo de lanzamiento" ACTIVO de `autora`, 1 participante `nikochaima72+e2ef02@gmail.com`,
  botón Ejecutar; DB `ejecutadoAt=null`/`ganadorEmail=null`), pero la **EJECUCIÓN NO se corre**
  (irreversible; el usuario quiere presenciarla). **NO cambié `state`/`status`**, **NO commit, NO browser,
  NO dev server nuevo, NO ejecuté el sorteo, NO hice pagos.** Veredicto: **Vitest 100% verde; E2E cubierto
  parcialmente por evidencia** (los flujos con sesión no cubiertos en vivo quedan para una corrida browser
  y la ejecución del sorteo la reserva el usuario).
