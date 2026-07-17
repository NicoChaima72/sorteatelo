# Backend conventions

Convenciones del backend de libros-iselk: Next.js 14 (pages router) + tRPC 11 + NextAuth 4 (Google OAuth para Organizadores, autorización por membresía User↔Tenant + rol Operador de plataforma) + Prisma 5 + PostgreSQL.

**Estado**: seed mínimo de un proyecto joven (aún sin features implementadas). Este doc captura las reglas genéricas de arquitectura del stack T3 que ya valen, y crece con cada decisión aprobada en features reales. No inventar reglas que el proyecto no decidió ni consolidaciones que no ocurrieron.

## Auth

- NextAuth 4 con **Google OAuth** para el panel de Organizadores (`src/server/auth.ts`). No hay cuentas de comprador en el MVP (la identidad del comprador es su correo — ver `docs/adr/0004-...`); el login es solo para **Organizadores** (dueños de una Tienda) y el **Operador de plataforma** (el freelancer que opera todo).
- **Autenticación abierta, autorización por membresía** (F05, ADR-0005 — reemplaza a la allowlist mono-usuario pre-pivote). El callback `signIn` **NO rechaza**: cualquier cuenta Google obtiene sesión y el `PrismaAdapter` crea su `User`. La autorización REAL es **fail-closed en la capa de datos**: un usuario solo opera la Tienda de su `TenantMembership` (unique `[userId, tenantId]`), resuelta SERVER-SIDE — sin membresía y sin rol Operador, ningún procedure del panel lee ni muta nada (`FORBIDDEN`) y la UI muestra el empty state "sin tienda". Un `User` huérfano (logueado sin membresía) es inocuo: la seguridad vive donde están los datos, no en la puerta de la sesión (prepara el self-service de F08).
- **Operador de plataforma = env var `PLATFORM_OPERATOR_EMAILS`** (CSV de emails; opcional y fail-closed: ausente/vacía ⇒ nadie es Operador). El Operador ve/opera TODAS las Tiendas. La **política pura** vive en `src/server/authPolicy.ts` y se reutiliza tal cual: `parsearAllowlist` (normaliza a lowercase+trim, descarta vacíos) + `emailEnLista` alimentan `esOperador(email, lista)`; y `resolverTenantAutorizado({ esOperador, tenantIdsDeMembresia, tenantIdSolicitado })` es la decisión pura (testeable sin DB ni NextAuth) que resuelve el `tenantId` de cada request del panel: un Organizador SIEMPRE cae a su membresía (un `tenantIdSolicitado` ajeno ⇒ `FORBIDDEN`; sin membresía ⇒ `FORBIDDEN`); el Operador puede seleccionar Tienda vía input **ya autorizado por su flag** (el input SELECCIONA entre lo autorizado, jamás AUTORIZA — no viola la lección H1 de datawalt-app). La `ADMIN_ALLOWLIST` mono-usuario **murió como gate del `signIn`**; sus helpers puros (`parsearAllowlist`/`emailEnLista`) renacieron sirviendo al rol Operador.
- La sesión se obtiene server-side con `getServerAuthSession` (wrapper sobre `getServerSession` que ya evita importar `authOptions` en cada archivo). Nunca reimplementar `getServerSession` en otro lado.

### Guard de páginas server-side (pages router)

Para proteger una página del panel se usa su propio `getServerSideProps`. El helper `requireSession(ctx)` **ya existe** en `src/server/auth.ts`: llama a `getServerAuthSession` (sin reimplementar `getServerSession` ni duplicar la política de auth) y aplica la decisión pura `resolverGuard(session)` — que vive en `src/server/authPolicy.ts` — devolviendo un resultado discriminado `{ redirect } | { session }`. Cada página lo consume con early-return del `redirect` (`if ("redirect" in guard) return { redirect: guard.redirect }`), lo que estrecha `session` a no-null en la rama de props. Patrón **imperativo, no HOC**: cada página escribe su `getServerSideProps` y llama al helper adentro, conservando control para lógica extra. Lo usan las 5 páginas del panel (`src/pages/admin/{index,productos,ventas,sorteo,configuracion}.tsx`); las páginas públicas (catálogo, checkout, `/login`) simplemente no exportan guard. `requireSession` solo garantiza **sesión** (que haya un usuario logueado); la **autorización por Tienda** (membresía / Operador) la resuelven los procedures del panel server-side — una página protegida sin membresía renderiza el empty state "sin tienda", no un 403.

## Layering: routers → domain → services

El backend se organiza en tres capas con dependencias en una sola dirección. Es la arquitectura objetivo; el código se migra a este patrón **incrementalmente, a medida que se toca** — no se reescribe todo de golpe, y el scaffold inicial (router `post` de ejemplo) no la sigue todavía.

- **Routers** (`src/server/api/routers/`) — adapters finos del transporte. Cada procedure son 3-5 líneas: valida el input con Zod y delega a un use case vía un seam `runDomain()`. **Cero lógica de negocio**, **cero `ctx.db` directo** acá.
- **Domain** (`src/server/domain/<modulo>/`) — los use cases SON la lógica de negocio. Firma uniforme `{ db, session, input }`; importan Prisma directo (cero hexagonal). Errores de negocio = `DomainError` con un set acotado de códigos (p. ej. `NOT_FOUND` | `FORBIDDEN` | `INVALID` | `CONFLICT` | `INACTIVE`) en `src/server/domain/errors.ts`. Un `Error()` genérico cae a `INTERNAL_SERVER_ERROR`.
- **Services** (`src/server/services/`) — adapters a sistemas externos. En este proyecto: la **pasarela de pago Flow**, el **storage privado de PDFs**, el **proveedor LLM de Hermes** y el **correo transaccional**. No conocen sesión ni reglas de negocio; exponen una interfaz estable para poder cambiar el proveedor concreto con fricción mínima (storage y modelo LLM son decisiones abiertas — ver `docs/decisiones-abiertas.md`).

`runDomain()` (`src/server/api/runDomain.ts`) es el seam: ejecuta el use case y mapea `DomainError` → `TRPCError` por código; deja pasar cualquier otro `Error`. Patrón típico de un procedure:

```ts
.input(zod).mutation(({ ctx, input }) =>
  runDomain(() => crearOrden({ db: ctx.db, session: ctx.session, input })))
```

- El dominio es **agnóstico al transporte**: un use case no importa nada de tRPC.
- **Sin barrels** (`index.ts` re-exportadores): se importa el módulo concreto por su ruta.
- Un módulo de dominio nuevo nace como `domain/<modulo>/` (use cases + `schemas.ts` Zod + `_internal.ts` si aplica) con su router espejo `routers/<modulo>.ts`.

## Procedures tRPC

Definidos en `src/server/api/trpc.ts`. Hoy hay **4 procedures**:

| Procedure | Qué valida / inyecta |
|---|---|
| `publicProcedure` | Sin auth ni tenant. Solo para lo que de verdad no depende de una Tienda ni de una sesión (raro en este dominio — ante la duda, no es este). |
| `tenantProcedure` | Garantiza `ctx.tenant` no-null: la Tienda **publicada** resuelta SERVER-SIDE del subdominio (`src/server/tenancy/`, ADR-0005/0007). Default para el borde del Comprador (catálogo, checkout — sin sesión, ADR-0004). Sin tenant ⇒ `NOT_FOUND` (respuesta neutral: no delata si la Tienda no existe o está suspendida). El `tenantId` con el que se scopea TODA query sale de acá, **jamás del input** (lección H1 de datawalt-app). |
| `protectedProcedure` | Solo garantiza `session.user` no-null (NextAuth + Google OAuth). Es el gate de sesión base; **no** carga membresía ni tenant. Para el panel de Organizadores se usa `panelProcedure` (que sí resuelve la Tienda) — `protectedProcedure` queda para un borde autenticado que no dependa de una Tienda. |
| `panelProcedure` | **El borde del panel de Organizadores/Operador** (F05, ADR-0005). Exige sesión y carga SERVER-SIDE `ctx.acceso: AccesoPanel` = `{ userId, email, esOperador, tenantIds }` — `esOperador` de `PLATFORM_OPERATOR_EMAILS`, `tenantIds` de los `TenantMembership` del usuario. **No gatea por membresía**: un usuario sin membresía y sin rol Operador pasa el procedure, pero cualquier use case resuelve su Tienda con `resolverTenantAutorizado(ctx.acceso, …)` y tira `FORBIDDEN` (fail-closed en la capa de datos) — así `getAccesoActual` decide qué renderizar sin tirar el request. El `tenantId` con el que se scopea TODA query del panel sale de la membresía o del flag Operador (ambos server-side), **jamás del input** (I1; H1 de datawalt-app). |

El contexto tRPC resuelve el tenant re-parseando `req.headers.host` con el parser puro de `src/server/tenancy/` — NO lee el header `x-tenant-slug` que escribe el middleware (defensa en profundidad: no depende del `matcher`). Si una feature futura necesita un guard distinto, se agrega como middleware nuevo en `trpc.ts` y se compone explícitamente — no autoencadenar middlewares dentro de handlers.

## Routers

- Viven en `src/server/api/routers/`, se componen en `src/server/api/root.ts`.
- **Naming de procedures**: el dominio de libros-iselk está escrito en **español** y el router **espeja el nombre del use case** que llama (trazabilidad router→dominio). El principio rector es **espejar el use case en español**; los prefijos son consecuencia de eso:
  - Queries que devuelven **una entidad o un agregado**: prefijo `get*` (p. ej. `getLibro`, `getOrden`).
  - Queries que **listan una colección**: prefijo `listar*`, espejando el use case (p. ej. `listarLibros`, `listarOrdenes`).
  - Mutations: español espejando el use case (p. ej. `crearLibro`, `actualizarLibro`, `iniciarCheckout`, `confirmarPago`).
- **Inputs siempre validados con Zod**. Nunca `z.any()`.
- Todo procedure del panel filtra/autoriza contra `ctx.session` — nunca confiar en un identificador (userId, email del comprador) que venga del input sin validarlo contra el estado del servidor.

## Endpoints `pages/api` (borde no-tRPC)

Algunos disparadores no son la UI con sesión NextAuth: una pasarela de pago que notifica por webhook, un servicio externo. Esos entran por un endpoint Next clásico en `src/pages/api/`. El layering sigue rigiendo — el endpoint es **borde** (transporte): toca `env`, resuelve el contexto y compone los adapters; la lógica de negocio vive en `domain/`, inyectada.

El caso clave de este proyecto es el **webhook de Flow** (ver `docs/adr/0001-...` y `0006-...`): un **endpoint único a nivel plataforma** (`/api/webhooks/flow`) al que Flow notifica el resultado del pago de CUALQUIER tenant. El núcleo **rutea por tenant** antes de confirmar: `token` → `Payment` → tenant dueño de la orden → `getStatus` **con las credenciales de ESE tenant** (BYO-Flow — nunca credenciales globales ni las de otro tenant; ver `src/server/pago/enrutarPagoFlow.ts`). Confirma server-side (nunca confía en el redirect del navegador), es **idempotente** (el webhook puede llegar más de una vez) y el `orderId` que confirma es el que NUESTRA DB liga al token — no el `commerceOrder` del body. Al confirmar el pago se generan los `Entitlement`(s), se crea la `RaffleEntry` y se dispara el correo con el enlace firmado — dentro de la transacción (contrato F02).

### Forma del archivo: núcleo testeable + wrapper Next

- **Núcleo puro y exportado** (p. ej. `manejarWebhookFlow`): recibe un `req` acotado (`Pick<NextApiRequest, "method" | "headers" | "body">`) y un objeto de **dependencias inyectables** (el verificador del pago contra Flow, los repositorios/use cases del dominio). Devuelve `{ status, body }` — **no escribe la respuesta ni toca `env`**. Así se testea toda la política (gate, idempotencia, confirmación) sin credenciales reales ni DB real cuando se mockean las deps.
- **Wrapper `default export handler`**: lee `env`, cablea las dependencias REALES (cliente Flow real, use cases contra `db`) y escribe `res.status(...).json(...)`. Es la única parte que toca `env` y `res`, y no se testea unitariamente (es el borde de cableado).

### Composición de adapters en el borde (factory)

- El endpoint **compone los adapters concretos** (cliente Flow, storage, correo) vía una factory de `services/`. La factory recibe la config como **argumento explícito** (no importa `~/env` adentro) para quedar testeable; el caller le pasa los valores leídos de `env`. Nunca se instancia un adapter externo dentro del `domain/`.
- **Adapters por tenant (BYO-Flow, ADR-0006): NO hay cliente Flow global.** Cuando el adapter opera con credenciales DE un tenant, la instanciación pasa por el seam de `src/server/pago/flowDeTenant.ts`: `construirFlowDeCredencial` (núcleo puro: credencial CIFRADA + clave AES-256 ⇒ descifra y arma el `FlowService` con la baseUrl sandbox/prod de ESA cuenta) y su borde `crearFlowServiceDeTenant` (carga la `FlowCredential` por `tenantId` y delega en el núcleo). Lo usan el checkout (por `ctx.tenant.id`) y el enrutador del webhook (por token). El descifrado + armado vive en UN solo lugar; los secretos descifrados solo existen en memoria dentro del closure del service y jamás se loguean (I5). Un `ctx.flow`/cliente global sería una violación silenciosa de BYO-Flow — se retiró a propósito en F01.
- **Fail-fast de credenciales**: las env vars de un feature pueden ser opcionales en `src/env.js` (la app arranca sin ellas), pero la factory **lanza un error claro en runtime** si faltan al ejecutar — mejor un 500 explícito que un efecto silenciosamente roto.

### Gate antes de cualquier efecto

La autenticación/validación del borde se hace **antes** de decodificar el body, mutar estado o llamar a nada con efectos — si el gate falla, se responde el rechazo SIN ningún efecto. Para el webhook de Flow:

- Verificar la **autenticidad** de la notificación contra Flow (la confirmación es server-side contra su API; el payload del request por sí solo no es prueba de pago).
- Solo el método esperado dispara el efecto (un `GET` accidental → 405).
- **Idempotencia**: si el pago ya fue confirmado y procesado, responder OK sin re-ejecutar los efectos (no duplicar `Entitlement`/`RaffleEntry`/correo). La confirmación avanza el estado del `Payment`/`Order` `pendiente → pagado | fallido` una sola vez.
- **Semántica de reintento**: si Flow reintenta ante 4xx, distinguir lo irreintentable (notificación malformada o ajena) de un fallo transitorio. Para lo irreintentable conviene **ack + ignorar** en vez de un 4xx que provoque reintentos infinitos; el rechazo de auth/método sí usa el código correspondiente.

## Prisma en el server

- Cliente único en `src/server/db.ts`. NUNCA instanciar `new PrismaClient()` en otro lado (excepción: scripts CLI con tsx — ver abajo).
- Preferir `select` explícito sobre `include` cuando solo se necesitan algunos campos.

### Paginación por cursor (lecturas de listas largas)

Patrón canónico para selectores que listan colecciones paginables (p. ej. el listado de órdenes o participaciones del sorteo en el panel):

- **Orden total estable**: `orderBy` compuesto donde el último campo es único (ej. `[{ createdAt: "desc" }, { id: "desc" }]`). Ordenar solo por un campo no-único (fecha) rompe el cursor en los empates (saltea/repite filas en el borde); el `id` (cuid) desempata.
- **Cursor opaco = `id` de la última fila** de la página. El selector recibe `cursor: string | null` (Zod `z.string().cuid().nullish()`; `null` = primera página) y devuelve `{ items, nextCursor: string | null }`.
- **Detectar "hay más" sin un segundo `count`**: pedir `take: PAGE_SIZE + 1` y, cuando viene la fila extra, recortarla y usar su antecesora como `nextCursor`; si volvieron `≤ PAGE_SIZE`, `nextCursor = null`. En las páginas siguientes, `cursor: { id: <cursor> }` + `skip: 1` (excluye la fila-cursor ya vista).
- **Forward-only**: el cursor opaco no soporta saltar a página N — la UI lo consume con "Cargar más" (ver `frontend-conventions.md` § Data fetching). Estable bajo append.

## Dominio con dinero (precios, IVA, comisiones) — reglas de oro

- **Montos y balances: `Decimal` de Prisma, NUNCA `Float`** ni aritmética con `number` para dinero. En TypeScript, operar con `Prisma.Decimal`. Aplica a precios de los libros, total de la orden, IVA (19%), comisión de Flow (~3,44%) y el neto al vendedor.
- Las operaciones que mueven plata o cambian estado de pago/entrega (confirmar un `Payment`, crear `Entitlement` + `RaffleEntry`) van dentro de `prisma.$transaction`.
- Formato de montos en UI con `Intl.NumberFormat` (CLP) — ver `frontend-conventions.md`.

## Aritmética de fechas

- Sin librería de fechas (`date-fns`/`dayjs`/`luxon` NO son dependencias). La aritmética se hace con `Date.UTC` nativo sobre fechas UTC a medianoche. Agregar una lib de fechas es decisión bloqueante (parar y preguntar).
- Para sumar meses, clampar SIEMPRE al último día del mes destino (sumar un mes al 31 cae al 28/30 en meses cortos). Encapsular en un helper `sumarMesesUTC` cuando haga falta — p. ej. ventanas/fechas del sorteo o la expiración de las URLs firmadas de descarga.

## Scripts CLI (tsx, fuera del runtime Next)

- Los scripts de `scripts/` corren con `tsx` fuera de Next: **excepción aceptada al singleton de `src/server/db.ts`** — instancian su propio `PrismaClient` y lo desconectan al salir; cargan `.env` a mano y leen `process.env` directo (mismo razonamiento que los tests con `SKIP_ENV_VALIDATION`).
- Las env vars que consume un CLI igualmente se documentan en `.env.example` (la regla de "declarar en `src/env.js`" aplica solo a vars que el runtime de la app valida).
- Un CLI jamás loguea secretos (claves del storage, tokens de Flow, API keys del LLM) — solo configuración inocua y resúmenes.
- **Script con lógica testeable → núcleo + wrapper**: un script one-off cuya lógica amerita tests Vitest se parte en (1) un **núcleo exportado** que recibe `db: PrismaClient` inyectado y devuelve un resultado estructurado (sin tocar `env`, sin instanciar Prisma, sin `process.exit`) — es lo que testean los specs DB-backed; y (2) un **wrapper `main()`** que carga `.env`, instancia su propio `PrismaClient`, lo desconecta en `finally`, formatea la salida CLI y se ejecuta solo cuando el archivo es el script invocado (`if (process.argv[1]?.includes("<nombre-del-script>"))`, para que importar el núcleo desde un test NO dispare el script). Es el patrón "núcleo testeable + wrapper" de la sección *Endpoints pages/api*, llevado a los scripts. Los scripts monolíticos sin lógica testeable (siembra, backfill puro) no necesitan partirse.

## Tipos

- Cero `any`. Derivar tipos del router con `inferRouterOutputs<AppRouter>`.
- `import type` para imports que solo son tipos.
- Types inline preferido. Solo separados si se comparten en 3+ archivos.

## Env vars

- Toda env var nueva se declara en `src/env.js` (schema Zod) Y en `.env.example`. Nunca `process.env.X` directo (excepción: scripts CLI con tsx).
