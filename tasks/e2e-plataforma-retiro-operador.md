# E2E — Retiro del rol Operador de plataforma

Checks de navegador del retiro completo del rol Operador (`tasks/26-07-25-plataforma-retiro-operador.md`).
Los ejecuta el `feature-tester` con la skill `browser-verify`. Cada check tiene un ID que el plan
referencia desde sus Validaciones. Marcado `[x]` solo por el feature-tester.

Es un refactor de REMOCIÓN: casi todos los checks verifican que algo **ya no existe** (404, item
ausente del menú) o que un guard **sigue en pie** con copy nuevo. Cero features nuevas.

> **Dev server**: `next dev` en **:3001** (NO :3000 — ahí corre otro proyecto del usuario). Una sola
> instancia.
>
> **Hosts reales de este entorno** (corregido en la corrida del 2026-07-26 — el aviso anterior mandaba
> a `lvh.me:3001` y ahí TODO da 404): `.env` no define `NEXT_PUBLIC_PLATFORM_DOMAIN`, así que
> `configPlataforma` cae al default de dev `localhost` ⇒ **`lvh.me` no es ni apex ni sufijo de tenant y
> el parser lo rechaza fail-closed**. Además `src/config.ts` tiene `devTienda.enabled = true` con slug
> `autora`, o sea el **apex pelado `localhost:3001` impersona la tienda `autora`**. Direcciones útiles:
>
> | Quiero… | Host |
> |---|---|
> | storefront de una tienda | `http://<slug>.localhost:3001` |
> | panel de una tienda | `http://<slug>.localhost:3001/admin` |
> | **apex / plataforma de verdad** | `http://www.localhost:3001` (el prefijo `www` es la rama `zona: "plataforma"` de `parsearHost`, y **esquiva el override `devTienda`** sin tocar `src/config.ts`) |
> | apex pelado | `http://localhost:3001` ⇒ **es la tienda `autora`**, no la plataforma |
>
> Sesión: la cookie `next-auth.session-token` en dev es **host-only** (`domain: undefined` sobre
> `localhost`), así que en un driver hay que setearla **por host** con el `sessionToken` de una `Session`
> vigente de la DB. No hace falta re-loguear con Google.

> ### ✅ Corrida 2026-07-26 (feature-tester) — 6/6 medidos y verdes
>
> El bloqueo de la corrida anterior (middleware en 500 global por contexto edge envenenado al reescribir
> `.env` con el server arriba) quedó resuelto con el **restart del dev server** + `npm install`. Los 6
> checks se midieron esta vez de verdad. Los carriles MCP de navegador (chrome-devtools y Playwright)
> estaban **los dos tomados por otros agentes** ⇒ sin robarle el navegador a nadie, la parte de browser
> se corrió con un **Chromium aislado propio** (binario de Playwright, perfil en `tmp/`, puerto CDP
> propio), y las ausencias/estados HTTP con `curl`. Detalle en la Bitácora del plan.

## Sin sesión

- [x] **retiro.mcp.001** — El endpoint del Editor MCP ya no existe. `POST http://lvh.me:3001/api/mcp`
  (y `/api/mcp/http`, cualquier transporte) ⇒ **404**, no 401. Antes respondía 401 fail-closed con el
  Bearer `MCP_OPERADOR_TOKEN`; ahora la ruta App Router entera se borró (F01/D2). Un 401 significaría
  que quedó ruta viva.
  > ✅ 2026-07-26 — **404 en las 5 variantes**, con y sin Bearer: `POST /api/mcp`, `/api/mcp/http`,
  > `/api/mcp/sse` en `localhost:3001` y `/api/mcp`, `/api/mcp/http` en `autora.localhost:3001`; `GET`
  > idem. **Cero 401** ⇒ no quedó handler vivo. El cuerpo del 404 es la página HTML de Next
  > (`<!DOCTYPE html>… data-next-hide-fouc`), no un JSON-RPC de error: no hay route handler que
  > conteste, es el catch-all del router. Con Bearer arbitrario da el mismo 404 (no discrimina token).

## Con sesión (login Google real)

Prerequisito: cuenta Google logueada. Para los checks de membresía hacen falta DOS situaciones —
una cuenta CON `TenantMembership` en la tienda del host y otra SIN ella (la segunda no necesita
tienda propia).

- [x] **retiro.editor.001** — El editor visual autoriza SOLO por membresía (F03). La dueña de la
  tienda abre `http://<slug>.lvh.me:3001/editor` y ve el editor. Una cuenta logueada SIN membresía en
  ese tenant recibe **404 neutral** — indistinguible de un host sin tienda. Ya no existe ningún bypass
  por email/allowlist: la cuenta que antes estaba en `PLATFORM_OPERATOR_EMAILS` recibe el mismo 404 si
  no tiene membresía.
  > ⚠ **Correr contra una tienda PUBLICADA.** `getPropsEditor` arranca por `resolverBrandingSSR`, que
  > solo resuelve tiendas en estado PUBLICADA — o sea `/editor` ya exigía tienda publicada ANTES de
  > este refactor (el god-mode vivía un paso después de ese corte). Con una tienda en CONFIGURACION el
  > 404 es correcto y preexistente, no una regresión de F03.
  >
  > ✅ 2026-07-26 — Las 3 ramas, todas contra tiendas **PUBLICADAS**:
  > | escenario | host | resultado |
  > |---|---|---|
  > | dueña **con** membresía | `autora.localhost:3001/editor` | **200**, renderiza el editor |
  > | logueada **sin** membresía | `prueba.localhost:3001/editor` | **404** |
  > | anónima | `autora.localhost:3001/editor` | **404** |
  > | host sin tienda (control) | `noexiste.localhost:3001/editor` | **404** |
  >
  > `prueba` es el caso limpio de "cuenta logueada sin membresía" **sin tocar la DB**: existe, está
  > PUBLICADA, y el único `User` del entorno tiene membresía en las otras 5 tiendas pero **no en ella**.
  > **Neutralidad probada byte a byte**: los 3 cuerpos de 404 son **idénticos** (21.932 bytes,
  > `sha1 a5c054cc…` los tres) ⇒ sin sesión, sin membresía y sin tienda son *indistinguibles*. El 404
  > tampoco filtra nada: cero ocurrencias de `previewToken|membres|operador|forbidden|no autoriz`.

- [x] **retiro.panel.001** — La página del Operador ya no existe (**F02** — se adelantó desde F05 por
  ser el único consumidor de `api.operador.*`; verificable desde que F02 aterrizó). `/admin/operador`
  ⇒ **404** tanto en el subdominio (`<slug>.lvh.me:3001/admin/operador`) como en el apex
  (`lvh.me:3001/admin/operador`).
  > ✅ 2026-07-26 — **404 en los 4 hosts**, y **con sesión válida** (clave: sin cookie la ruta
  > redirige 307 al login y el 404 no sería observable): apex real `www.localhost:3001/admin/operador`,
  > apex pelado `localhost:3001/admin/operador`, y los subdominios `autora.` y `demo-editorial.`.
  > Control de que la sesión estaba viva en la misma corrida: `autora.localhost:3001/admin` ⇒ **200**.

- [x] **retiro.panel.002** — El chrome del panel no nombra al rol (F05). Dentro del panel de una
  tienda: el rail lateral NO muestra el item "Operador"; el Spotlight (Cmd+K) no ofrece esa entrada al
  buscar "oper"; y el menú de cuenta (avatar) no muestra el badge "Operador de plataforma".
  > ✅ 2026-07-26 — Verificado **en navegador** sobre `autora.localhost:3001/admin`:
  > - **Rail**: exactamente 5 anchors — `Resumen → /admin`, `Productos → /admin/productos`,
  >   `Ventas → /admin/ventas`, `Sorteo → /admin/sorteo`, `Configuración → /admin/configuracion`.
  > - **Spotlight** (abierto con Ctrl+K real): `oper`, `operador`, `Operador` y `plataforma` ⇒ los 4
  >   caen en **`nothingFound` ("No encontramos esa sección")** con **0 acciones**. Controles positivos
  >   en la misma sesión: `prod` ⇒ encuentra Productos; query vacía ⇒ lista las 5 secciones y ninguna
  >   más. O sea el buscador funcionaba: si la entrada existiera, habría salido.
  > - **MenuCuenta**: abierto por click en el avatar ⇒ nombre + email + "Cerrar sesión", y
  >   `[class*=Badge]` dentro del dropdown = **lista vacía** (no hay badge que mostrar).
  > - `document.body.innerText` del panel: **cero** `/operador/i`.
  >
  > Refuerzo estático de la misma corrida: en los 8 chunks JS que sirve `/admin` los literales
  > `Operador de plataforma`, `SinTiendaOperador`, `esOperador` y `/admin/operador` dan **0 hits**; las
  > únicas 2 ocurrencias de "operador" son **comentarios** del docstring de `env.js` sobre la cuenta R2
  > (persona operativa, D10), cero código.

- [x] **retiro.panel.003** — Un usuario logueado SIN ninguna tienda ve el **alta de Tienda** (la card
  "Crea tu tienda" con su formulario, componente `CrearTienda`) en el apex (F05). Ya no existe la
  variante `SinTiendaOperador` con el atajo al panel de plataforma.
  > ⚠ **No busques un `EmptyState`** con ícono: la rama sin-tienda del `AdminLayout` es el ALTA, no un
  > empty state. Es la única pantalla de contenido que vive en el apex (ADR-0022/D1), y hoy la ve
  > cualquier logueado sin membresía — antes el rol desviaba a una variante propia.
  > ⚠ **El apex de verdad es `www.localhost:3001`** en este entorno (ver tabla de hosts arriba): en el
  > apex pelado el override `devTienda` lo convierte en la tienda `autora` y el guard rebota al
  > storefront (307 → `/`), que NO es esta pantalla.
  >
  > ✅ 2026-07-26 — Verificado **en navegador** sobre `www.localhost:3001/admin` con un `User`
  > **efímero de 0 membresías** creado por DB directa para el check y **borrado al terminar** (cleanup
  > confirmado: 0 filas `@e2e.invalid` restantes). Se ve el alta completa: título **"Crea tu tienda"**,
  > la bajada "Elige un identificador y un nombre para empezar…", el `<form>` con los 2 inputs
  > (`Identificador de la tienda` / `Nombre de la tienda`, placeholders `mi-tienda` / `Mi Tienda`), el
  > aviso "El identificador no se puede cambiar después de crear la tienda" y el submit
  > **"Crear mi tienda"**. Texto visible sin `/operador/i`. En la misma corrida, el query que decide la
  > rama —`panel.getAccesoActual`, que el chrome resuelve en CLIENTE— devolvió
  > `{"tenants":[],"tiendaActiva":null}` ⇒ `sinTienda === true`, **y su shape ya no trae el campo
  > `esOperador`** (control con el usuario real: 5 tenants, mismo shape de 2 campos).

- [x] **retiro.suspension.001** — Los guards de `SUSPENDIDA` siguen en pie con copy neutro (F05/D4/I2).
  Con una tienda puesta en `estado = SUSPENDIDA` por **DB directa** (asistido por el usuario — ya no
  hay superficie de suspender): (a) el storefront de esa tienda sigue apagado (404 neutral); (b) el
  panel de la tienda sigue accesible para sus miembros; (c) el checklist de publicación muestra el
  aviso de tienda suspendida con el copy nuevo, que NO nombra al "Operador"; (d) intentar publicar
  desde el panel sigue fallando con el mensaje de conflicto.
  > ✅ 2026-07-26 — Ejercido sobre **`demo-editorial`**. Estado previo anotado (**PUBLICADA**, con
  > storefront en 200 como línea base), puesto en `SUSPENDIDA` por DB directa y **revertido a
  > PUBLICADA al cerrar** (revert dentro de un `finally`, verificado post-hoc: las 6 tiendas del
  > entorno quedan `PUBLICADA` y el storefront vuelve a 200).
  > - **(a) storefront apagado, 404 NEUTRAL**: `demo-editorial.localhost:3001/` ⇒ **404**, y el cuerpo
  >   es **byte-idéntico** al de un host que no existe (`noexiste-jamas.localhost:3001`, mismo
  >   `sha1 a21a8b02…`) ⇒ suspendida e inexistente son indistinguibles. Cero `suspend|operador|soporte`
  >   en el cuerpo: no filtra el motivo.
  > - **(b) panel del miembro accesible**: `demo-editorial.localhost:3001/admin` ⇒ **200**.
  > - **(c) aviso con copy neutro**: el `Alert` renderiza *"**Tu tienda está suspendida** — Mientras
  >   esté suspendida no aparece publicada y no puede vender. **Escríbele al soporte de la plataforma**
  >   para reactivarla."*, con el enlace real `href="mailto:nikochaima72@gmail.com"`
  >   (= `APP_CONFIG.soporteEmail`). El panel entero: **cero** `/operador/i`. Sin botón "Publicar"
  >   (la rama SUSPENDIDA no ofrece acciones de publicación) y con el badge de estado "Suspendida".
  >   Color del Alert `rgb(192,62,46)` = token de estado `SUSPENDIDA`, correcto por `docs/design.md`.
  >   Captura: `tmp/e2e/suspension-alert.png`.
  > - **(d) publicar sigue bloqueado**: `POST /api/trpc/panel.publicarTienda` ⇒ **HTTP 409**,
  >   `code: CONFLICT`, mensaje *"Tu tienda está suspendida. Escríbele al soporte de la plataforma para
  >   reactivarla."* — cero mención al rol. El estado **no cambió** con el intento (sigue SUSPENDIDA),
  >   o sea el guard corta dentro de la transacción y no deja efecto parcial.
