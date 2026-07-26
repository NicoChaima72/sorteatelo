# E2E — Panel admin scoped por subdominio (admin-multi-tienda)

Checks de navegador para el panel scopeado por subdominio (`tasks/26-07-25-admin-multi-tienda.md`,
ADR-0022). Los ejecuta el `feature-tester` con la skill `browser-verify`. Cada check tiene un ID que
el plan referencia desde sus Validaciones. Marcado `[x]` solo por el feature-tester.

> **Entorno obligatorio (D9, per ADR-0019)**: estos flujos cruzan subdominios, así que NO sirven
> `localhost`/`*.localhost` (no comparten cookie de sesión). Antes de correr:
>
> 1. `NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me` en `.env` (sin esta var el dominio raíz es `localhost` y
>    `lvh.me` no parsea como plataforma ⇒ todo host da 404 neutral).
> 2. `devTienda.enabled = false` en `src/config.ts` (con el override prendido el apex pelado
>    IMPERSONA la tienda `autora`, así que el apex deja de ser apex y no se puede probar su puerta).
> 3. Reiniciar el dev server (`NEXT_PUBLIC_*` se inlinea en build) — **uno solo**, en `:3001`.
> 4. Hosts a usar: apex `http://lvh.me:3001`, tiendas `http://autora.lvh.me:3001`,
>    `http://prueba.lvh.me:3001` (lvh.me resuelve todo a 127.0.0.1 sin tocar DNS).
>
> **Sesión**: login real de Google (el `CredentialsProvider` de dev fue retirado). El OAuth dance
> ocurre SIEMPRE en el apex; la cookie viaja al wildcard `.lvh.me`.
>
> **Datos**: para el switcher (F05) hace falta una cuenta con **2 membresías**
> (`npm run otorgar:membresia -- <email> <slug>` por cada tienda). El Operador de plataforma sale de
> `PLATFORM_OPERATOR_EMAILS`.

## F04 — Páginas gateadas + puerta del apex

- [x] **admin.multitienda.001** ✅ 2026-07-25 — Login desde el apex aterriza en la primera tienda. Sin sesión, ir a
  `http://lvh.me:3001/admin` ⇒ `/login` ⇒ entrar con Google ⇒ el navegador termina en
  `http://<primera>.lvh.me:3001/admin` (subdominio en la barra de direcciones) con el panel de ESA
  tienda: el chip del header muestra su nombre y los datos (productos/ventas) son suyos. "Primera" =
  la membresía más antigua (`createdAt asc, id asc`, D5).
  > **Verificado server-side (feature-tester 2026-07-25)** sobre `*.localhost:3001` (ver nota de método
  > al pie). Apex sin sesión ⇒ `307 /login?callbackUrl=%2Fadmin`. Apex con sesión ⇒
  > `307 http://autora.localhost:3001/admin` — `autora` es la membresía más antigua (17/07) de las 5, o
  > sea el orden canónico D5. Subruta preservada (D8): `/admin/productos` y `/admin/sorteo` redirigen a
  > la misma subruta del subdominio. El "panel de ESA tienda" queda probado por `getAccesoActual`
  > (`tiendaActiva` = la del host) y por `listarProductos` (datos distintos por host). **No ejercido**:
  > el dance OAuth de Google en sí — es infra de ADR-0019 que esta feature CONSUME (I6), no cambia.

- [x] **admin.multitienda.002** ✅ 2026-07-25 — **DESBLOQUEADO por D11 y VERIFICADO.** Antes estaba bloqueado por datos:
  el único `User` de la DB (`nikochaima72@gmail.com`) es el Operador, así que entraba por la rama de
  excepción y nunca por la de no-miembro. **Esa rama ya no existe** — el Operador rebota igual que
  cualquiera —, así que la cuenta existente SÍ ejerce este check (es el mismo escenario que 007).
  Cubierto en Vitest por `panel.guard.003`.
  El admin de una tienda ajena no se ve ni un frame. Logueado con una
  cuenta que NO es miembro de `prueba`, ir a `http://prueba.lvh.me:3001/admin` ⇒
  el navegador termina en el STOREFRONT `http://prueba.lvh.me:3001/` (I4). Verificar en el HTML/DOM
  que no se renderizó chrome de admin (ni rail, ni chip de tienda) — el rebote es server-side.
  > **Verificado (feature-tester 2026-07-25, re-validación post-D11)**: `prueba.localhost:3001/admin`
  > con la cookie del Operador (NO miembro de `prueba`) ⇒ **`307 Location: /`**. El destino
  > (`prueba.localhost/`) responde `200` con `<title>BCAC</title>` y **cero** marcadores de chrome de
  > admin en sus 64.056 bytes: `Cambiar de tienda` 0, `/admin/productos` 0, `/admin/ventas` 0,
  > `/admin/configuracion` 0, `Ver mi tienda` 0, `Editor de la tienda` 0, `getAccesoActual` 0 — y sí
  > los del storefront (sorteo 21, catálogo 4, carrito 2). I4 confirmado: el rebote es server-side y
  > no se filtra ni un frame. Las **6** rutas del panel rebotan, no solo `/admin`
  > (`/admin/{productos,ventas,configuracion,sorteo,operador}` ⇒ `307 /`).

- [x] **admin.multitienda.003** ✅ 2026-07-25 — Sin sesión, el login vuelve al MISMO subdominio. Con la cookie de
  sesión borrada, ir a `http://autora.lvh.me:3001/admin/productos` ⇒ redirect al login DEL APEX
  (`http://lvh.me:3001/login?callbackUrl=…autora.lvh.me…`) ⇒ tras entrar, el navegador vuelve a
  `http://autora.lvh.me:3001/admin/productos` (subdominio Y subruta preservados).
  > **Verificado (feature-tester 2026-07-25)**: `autora.localhost:3001/admin/productos` sin cookie ⇒
  > `307 Location: http://localhost:3001/login?callbackUrl=http%3A%2F%2Fautora.localhost%3A3001%2Fadmin%2Fproductos`
  > — login DEL APEX, con subdominio **y** subruta preservados en el `callbackUrl`. **No ejercido**: el
  > tramo de vuelta tras autenticarse (depende del dance de Google + `validarCallbackUrl`, infra
  > ADR-0019 con tests propios).

- [x] **admin.multitienda.004** ✅ 2026-07-25 — Slug inexistente ⇒ 404 neutral. Ir a
  `http://noexiste.lvh.me:3001/admin` ⇒ 404 de Next, con y sin sesión (no delata si la tienda existe).
  > **Verificado**: `noexiste.localhost:3001/admin` ⇒ `404` **idéntico con y sin cookie de sesión** —
  > la decisión de "no existe" se toma antes de mirar la sesión, así que no delata nada.

## F05 — Switcher y URLs cross-tienda

- [x] **admin.multitienda.005** ✅ 2026-07-25 — **CERRADO EN BROWSER REAL** por la **sesión principal** vía
  carril **claude-in-chrome** (Chrome del usuario con la extensión — el único libre; los dos carriles MCP
  siguieron ocupados por agentes paralelos en las 3 corridas del `feature-tester`).
  > **Evidencia DOM (sesión principal, 2026-07-25)**: en `autora.localhost:3001/admin`, el menú
  > «Cambiar de tienda» renderiza la activa como `<button>` («Tienda de la Autora (piloto) · Actual») y las
  > otras **4** como `<a>` REALES: `href="http://bcac.localhost:3001/admin"`,
  > `http://demo-dreamy.localhost:3001/admin`, `http://demo-noche.localhost:3001/admin`,
  > `http://demo-editorial.localhost:3001/admin` — **siempre al dashboard `/admin`** (D4: no preserva
  > subruta) y **jamás** una URL anidada `<otra>.<tienda>.host`. **Click** en «BCAC · Ediciones» ⇒
  > navegación en la **MISMA pestaña** a `http://bcac.localhost:3001/admin`, y el panel de BCAC renderiza
  > con el chip «BCAC · Ediciones» activo ⇒ guard + `panelProcedure` sirviendo la tienda del host DESTINO.
  > Con esto muere formalmente el `Menu.Item` sin `onClick` (UI decorativa) que motivó la feature.
  Verificado server-side con la cuenta real (5 membresías, no 2): `getAccesoActual` devuelve `tenants`
  SIEMPRE en orden canónico (`autora, bcac, demo-dreamy, demo-noche, demo-editorial` = `createdAt asc`)
  y `tiendaActiva` = **la tienda del HOST** (en `bcac.localhost` ⇒ `bcac`, no `tenants[0]`=autora) — que
  es justo el bug de orden que la feature mata. Y `listarProductos` devuelve datos DISTINTOS por host.
  Falta confirmar en DOM: que el `Menu.Item component="a"` navegue en la misma pestaña al dashboard de B.
  > **3er intento fallido (feature-tester 2026-07-25 21:35)**: los dos carriles MCP tomados por sesiones
  > ajenas (verificado por PID, ver Bitácora) **y además** el dev server sirviendo `500` en toda ruta SSR
  > (un `next build` pisó los chunks de `.next` del `next dev -p 3001`) ⇒ no había ni navegador ni app.
  Texto original: El switcher cambia de tienda de verdad. Con una cuenta de 2
  membresías, en `http://<A>.lvh.me:3001/admin`: abrir el chip del header ⇒ lista las 2 tiendas en
  orden canónico (la más antigua primero) con la activa marcada ⇒ elegir la otra ⇒ navega en la MISMA
  pestaña a `http://<B>.lvh.me:3001/admin` (el dashboard, D4: no preserva la ruta) ⇒ el chip y los
  datos (productos, ventas, sorteo) son los de B.

- [x] **admin.multitienda.006** ✅ 2026-07-25 — **CERRADO EN BROWSER REAL** por la **sesión principal** vía
  carril **claude-in-chrome**. El helper puro ya estaba cubierto por Vitest (`urlApex.test.ts`,
  `page.subdominio.001..003`, 7/7); lo que faltaba —la URL que el componente arma en runtime— quedó visto.
  > **Evidencia (sesión principal, 2026-07-25)**: desde el panel de `bcac.localhost:3001/admin`, con
  > `window.open` stubeado para capturar el destino: «Ver mi tienda» ⇒ `http://bcac.localhost:3001` y
  > «Editor de la tienda» ⇒ `http://bcac.localhost:3001/editor`. **Cero** `<slug>.<tienda>.host` — el bug
  > de `url-tienda.ts` que la feature arregla está muerto también en runtime, no solo en el helper puro.
  > **Intentado por HTTP y NO alcanzable (feature-tester 2026-07-25 19:30)**: el chrome del panel es
  > CSR — `api` de tRPC corre con `ssr: false`, así que `getAccesoActual` nunca resuelve en SSR y el
  > header no se renderiza. El SSR de `autora.localhost:3001/admin` (35.435 bytes, `200`) trae **cero**
  > ocurrencias de `Cambiar de tienda`, `Ver mi tienda`, `Editor de la tienda` y `href="http`. El `href`
  > solo existe tras hidratar ⇒ **este check requiere un navegador de verdad, no hay sustituto por HTTP**.
  > **3er intento fallido (feature-tester 2026-07-25 21:35)**: ídem 005 — carriles ocupados + dev server
  > en `500`. Sí se re-verificó por código, post-merge (HEAD `1920fec`), que `url-tienda.ts` sigue
  > derivando el apex con `hrefSubdominio({ slug, slugActual, path })` y no cuelga el slug del host actual.
  Texto original:
  "Ver mi tienda" y "Editor de la tienda" apuntan bien DESDE el
  subdominio. En `http://autora.lvh.me:3001/admin`, el botón "Ver mi tienda" abre
  `http://autora.lvh.me:3001` (NO `autora.autora.lvh.me`) y el ítem "Editor de la tienda" abre
  `http://autora.lvh.me:3001/editor`. Era el bug de `url-tienda.ts` que esta feature arregla.

- [x] **admin.multitienda.007** ✅ 2026-07-25 — **REESCRITO 2026-07-25 (D11)**:
  > ⚠ **NO RE-EJECUTAR — escenario RETIRADO 2026-07-25 (ADR-0023).** Este check requiere una cuenta en
  > `PLATFORM_OPERATOR_EMAILS`, env var que ya no existe: el rol Operador de plataforma se retiró entero
  > (no hay flag, ni badge en el menú de cuenta, ni `/admin/operador`). Su garantía de fondo —un logueado
  > sin membresía rebota al storefront— la cubre `admin.multitienda.002`. Se conserva como registro de lo
  > que se verificó el 2026-07-25, no como instrucción ejecutable. el Operador de plataforma NO entra al
  panel de una tienda ajena. Con la cuenta de `PLATFORM_OPERATOR_EMAILS` (sin membresía en `prueba`), ir
  a `http://prueba.lvh.me:3001/admin` ⇒ el navegador termina en el STOREFRONT
  `http://prueba.lvh.me:3001/` — exactamente el mismo destino que un logueado cualquiera (check 002), sin
  chrome de admin en el DOM. Verificar además que en su PROPIO panel (`http://autora.lvh.me:3001/admin`)
  **no aparece ningún badge de "Operador" junto al chip de tienda** (el badge de contexto murió con D11;
  el badge "Operador de plataforma" del menú de cuenta SÍ sigue vivo, es identidad de rol, no acceso).
  > La corrida anterior verificó el comportamiento VIEJO (200 + `modoOperador: true`), que ya no es el
  > esperado: hay que re-ejercerlo. El resultado nuevo está cubierto por Vitest en
  > `panel.guard.003/004` (guard puro), `panel.host.003` (capa de datos) y `panel.acceso.007`
  > (`tiendaActiva` null para un host fuera de la membresía).
  >
  > **RE-EJERCIDO Y VERDE (feature-tester 2026-07-25 19:30)** — la inversión quedó demostrada sobre el
  > MISMO host y la MISMA cuenta que a las 18:34 daban `200 + panel + modoOperador:true`:
  > - **Guard**: `prueba.localhost:3001/admin` con cookie del Operador ⇒ **`307 Location: /`** (idéntico
  >   destino que un logueado cualquiera, check 002). Control: `autora`/`bcac` ⇒ `200`.
  > - **Capa de datos**: `panel.listarProductos` en `prueba.localhost` ⇒ **`FORBIDDEN` "No tienes acceso
  >   a esa Tienda."** — antes el Operador leía esos productos. En `autora`/`bcac` sigue devolviendo los
  >   suyos (datos distintos por host).
  > - **`getAccesoActual`**: en `prueba.localhost` ⇒ `tiendaActiva: **null**` (antes `prueba`) y el campo
  >   **`modoOperador` desapareció del payload**. `esOperador: true` SOBREVIVE (identidad de rol).
  > - **Badge del chrome**: verificado por **ausencia de código**, no por DOM — `BadgeOperadorInvitado` y
  >   `modoOperador` tienen **0 ocurrencias en todo `src/`**, y el payload ya no trae el dato que lo
  >   encendía ⇒ no hay forma de que se renderice. Es la evidencia más fuerte disponible sin navegador
  >   (ambos carriles MCP ocupados), pero no es un ojo sobre el DOM.

---

## Nota de método — corrida del feature-tester 2026-07-25

Los checks se ejercieron **sin mutar el entorno**: no se tocó `.env`, ni `src/config.ts`, ni se
reinició el dev server. Razones: el server es del usuario y hay **otros dos agentes escribiendo el repo
en paralelo** (`checkout-campos-configurables`, `builder-tanda-3`), para quienes poner
`NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me` + `devTienda.enabled=false` rompería `localhost:3001`.

Sustitutos usados, equivalentes para lo que esta feature posee (el guard y el scoping por host):

- **Subdominios**: `curl` con `-H "Host: <slug>.localhost:3001"` contra `127.0.0.1:3001`. El guard lee
  `req.headers.host`, así que es el mismo camino de código que un browser en `lvh.me`.
- **Apex**: `Host: www.localhost:3001`. `parsearHost` mapea el label `www` a `zona: "plataforma"`
  (línea 77) **sin pasar por el override `devTienda`** (que solo aplica cuando el host es exactamente
  el apex pelado) ⇒ es un apex genuino con `devTienda.enabled` todavía en `true`.
- **Sesión**: cookie `next-auth.session-token` de una `Session` VIGENTE de la DB (sesión real del
  usuario, no forjada). Evita el dance de Google, que además hoy es imposible en `lvh.me` sin registrar
  un redirect URI nuevo en Google Cloud (y Google rechaza `http://` fuera de `localhost`).

Lo que este método **no** cubre y sigue necesitando el entorno `lvh.me` del encabezado: que la cookie
de sesión se **comparta** entre subdominios (en `*.localhost` es host-only) — pero eso es infra de
ADR-0019 que esta feature consume sin modificar (I6).

## Nota de método — RE-VALIDACIÓN post-D11 del feature-tester 2026-07-25 19:30

Mismo método que la corrida anterior, sin variantes: dev server del usuario intacto en `:3001` (una
sola instancia), `.env` y `src/config.ts` sin tocar, subdominios por header `Host:`, apex genuino por
`www.localhost:3001`, sesión con el `sessionToken` de una `Session` vigente de la DB.

Novedad de datos que D11 habilitó: la cuenta Operador (`nikochaima72@gmail.com`, 5 membresías
—`autora`, `bcac`, `demo-dreamy`, `demo-noche`, `demo-editorial`— y **ninguna** en `prueba`) pasó a ser
un sujeto válido para la rama de no-miembro, porque la rama de excepción del Operador dejó de existir.
Eso desbloqueó **002** sin crear ningún `User` en la DB del usuario.

**Ambos carriles de navegador seguían ocupados** (`chrome-devtools-mcp\chrome-profile` con 11 procesos
y `ms-playwright-mcp\mcp-chrome-12f6c4f` con 12, los dos devolviendo profile-lock). Per `browser-verify`
§0/§5 no se mató ninguno. **005** y **006** quedan como el único hueco real de la feature.

## Nota de método — cierre de 005/006 en browser real (sesión principal, 2026-07-25 ~21:40)

Los dos últimos checks los ejerció la **sesión principal**, no el `feature-tester`, y por el **tercer
carril** de `browser-verify` §0: **claude-in-chrome** (el Chrome del usuario con la extensión), que era el
único libre — los carriles Playwright y chrome-devtools estuvieron tomados por agentes paralelos vivos en
las **tres** corridas del tester (evidencia por PID y por escrituras de perfil en la Bitácora del plan).

- **Sesión**: misma técnica que las corridas por HTTP — la cookie `next-auth.session-token` de una
  `Session` VIGENTE de la DB, no forjada.
- **Detalle del perfil**: en ese Chrome las escrituras de `document.cookie` sobre `localhost` (el apex)
  están bloqueadas, pero sobre `<slug>.localhost` funcionan ⇒ la cookie se plantó **por subdominio**
  (`autora` y `bcac`, host-only). No cambia lo que estos checks prueban (el `href` renderizado y el click
  cross-host), pero **no** ejerce el compartir-cookie entre subdominios: el wildcard `.localhost` no es
  válido en Chrome y el flujo dev real usa `lvh.me` (ADR-0019, infra que esta feature consume sin tocar).
- **Bonus re-confirmado en browser real**: sin sesión, `autora.localhost:3001/admin` ⇒ login DEL APEX con
  `callbackUrl=http%3A%2F%2Fautora.localhost%3A3001%2Fadmin` (refuerza **003**, antes visto solo por curl).
