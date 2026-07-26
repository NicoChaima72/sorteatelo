# MOCKS — catálogo de pantallas ya mockeadas

Si la pantalla que necesita tu cápsula **está acá, se copia el builder**: no se re-deriva leyendo
el componente React (era el mayor desperdicio de tiempo del proceso). Sólo si es una pantalla
**nueva** se lee el componente real, se mockea y se **agrega una entrada acá**.

Regla del motor que gobierna todo mock (gotcha 9): `app.js` sólo asigna **clases** + geometría de
frame. Lo tipográfico/visual vive en `tour-kit.css` o en el `<style>` del `index.html`.

---

## Chrome del panel de Organizador — `_lib/tour-kit.js`

**Estado: LISTO.** Es genérico, lo usa cualquier cápsula del panel. Componente real:
`src/components/admin/admin-layout.tsx` (+ `panel-card.tsx`, `page-header.tsx`).
Gramática: «Oscuro + calmo», `docs/design.md` §4.

```js
browserFrame(url, activeNavIdx, { tienda, color, iniciales, colapsado, operador })
```

| Pieza | Builder | Notas de fidelidad |
|---|---|---|
| Ventana del navegador | `browserFrame` | `FRAME = {left:210, top:60, width:1500, height:920}`; radius 18, sombra difusa, sin borde |
| Barra de URL | dentro de `browserFrame` | mono; el panel vive en el **apex** (`sorteatelo.cl/admin/…`), el subdominio es del storefront |
| Rail tinta | `rail(activeIdx, opt)` | 232px (68 colapsado); isotipo + wordmark Bricolage 800 blanco; ítem **esbelto** (tinte cobalto 22% + barra de acento 3px al borde), NO pill sólido |
| Navegación | `NAV_PRINCIPAL` / `NAV_PIE` | 0 Resumen · 1 Productos · 2 Ventas · 3 Sorteo · 4 Configuración (pie). `opt.operador` agrega el ítem del rol |
| Topbar | `topbar(opt)` | 64px **sin borde inferior**: hamburguesa · chip de tienda con swatch del `colorPrimario` (único color-desde-dato) · Buscar ⌘K · Ver mi tienda · avatar. `opt.sinTienda` → sin chip ni «Ver mi tienda» (Organizador que todavía no creó su tienda) |
| Canvas | `.app-content` | `gray-0`, full-width (sin cap `max-w-6xl`) |

Coordenadas derivadas (`CONTENT`): `left 442 · top 180 · right 1710 · bottom 980`. El contenido de
la página se dibuja con coords **absolutas de canvas** encima del frame (no anidado), para que
cursor/spotlight/tooltip compartan el mismo sistema.

### Primitivas del panel (en el kit)

| Builder | Equivalente real |
|---|---|
| `pageHeader(x, y, titulo, bajada)` | `PageHeader` (h1 Fraunces + bajada) |
| `panelCard(x, y, w, h, inner)` | `PanelCard` (sin borde, radius lg, `SOMBRA_PANEL`) |
| `panelHead(x, y, icono, titulo, desc)` | cabecera de `SettingCard` |
| `campo(x, y, w, label, {valor, placeholder, desc, foco, alto})` | `TextInput` de Mantine |
| `area(x, y, w, h, label, {…})` | `Textarea` |
| `boton(x, y, texto, variante, {icono, sm})` | `Button` (`primario`/`premio`/`suave`/`default`) |
| `switchEl(x, y, on)` | `Switch` |
| `lb(texto, hue, {icono})` | `Badge` (`cobalto`/`amarillo`/`exito`/`pendiente`/`ladrillo`/`gris`/`borde`) |

---

## Panel · Configuración — `configura-la-tienda/app.js`

**Estado: LISTO** (cápsula piloto). Componente real:
`src/pages/admin/configuracion.tsx` — `SimpleGrid` de 2 columnas con `CredencialFlowCard`
(izquierda) y `ConfiguracionTiendaCard` (derecha).

Lo que el mock reproduce, en el orden real de la página:

- **Card «Pagos (Flow)»** — ícono tarjeta, bloque inset con el estado (`No conectada` → badge
  outline; `Configurada` → badge `exito` + ambiente), campos API Key / Secret Key enmascarados,
  select de ambiente, botón «Guardar credenciales».
- **Card «Tu tienda»** — ícono paleta, sección «Logo e imagen de portada» con dos filas de asset
  (miniatura dashed + input «Elegir imagen»), divisor, campos Descripción y Color de marca (hex),
  divisor, sección «Textos del storefront» (Título del hero, Subtítulo del hero), botón «Guardar
  cambios».
- **Toast de guardado** — notificación de Mantine arriba a la derecha del contenido: franja
  `--st-exito` a la izquierda + check + «Cambios guardados.». `z-index: 55` para quedar sobre el
  velo del spotlight.

Clases propias en el `<style>` de su `index.html` (12): `cfg-asset`, `cfg-thumb`, `cfg-estado`,
`cfg-estado-label`, `cfg-estado-badge`, `cfg-sec`, `cfg-sec-txt`, `cfg-div`, `cfg-toast`,
`cfg-toast-barra`, `cfg-toast-ic`, `cfg-toast-txt`.

Recorrido del cursor del piloto: `Configuración` en el rail → campo **Título del hero**
(`stackEl("hero", …)`: placeholder → «Todo lo que publiqué este año», con `foco`) → botón
**Guardar cambios** (entra el toast y se sostiene hasta el fin del beat).

> Para una cápsula que necesite **Redes y contacto** o **Bases del sorteo** (más abajo en la misma
> card), extendé el builder de `configura-la-tienda/app.js` en vez de re-derivar la página.

Notas de fidelidad que costaron una pasada de reviewer (respetalas al copiar el builder):

- El `SimpleGrid` real lleva `style={{ alignItems: "start" }}` ⇒ las dos cards tienen **alturas
  independientes**. No las estires a la misma altura "para que se vea prolijo": sería infiel.
- «Estado» del inset de Flow es `<Text size="sm" c="dimmed">` — atenuado y peso 400. El énfasis de
  esa fila lo lleva el badge, no el label.
- Los encabezados de subsección son `fw={500}`, no 600.
- El `#1d7a70` del campo «Color de marca (hex)» es **dato tipeado por la tienda**, no styling — y
  es exactamente `--st-exito-6`, el token del swatch del chip. Es el único hex permitido (I7).

**Candidatos a promover al kit compartido** cuando llegue la 2ª cápsula (hoy viven como `cfg-*`
locales; no se promovieron todavía para no tocar `_lib/` con un solo caso de uso):

- `cfg-sec` + `cfg-sec-txt` → `.pnl-subhead`. La subsección ícono+texto aparece 4 veces en esta
  sola página del producto y reaparece en Productos y Sorteo.
- `cfg-toast*` → `.pnl-toast`, con el color de la franja como parámetro (`exito` / `ladrillo`).
  Todo tour de onboarding termina en un guardado exitoso.

---

## Panel · Alta self-service — `crea-tu-tienda/app.js` (`cardAlta`)

**Estado: LISTO.** Componente real: `src/components/admin/crear-tienda.tsx`, que `admin-layout.tsx`
renderiza **en lugar del contenido** cuando el Organizador todavía NO tiene tienda.

- Chrome: `browserFrame("sorteatelo.cl/admin", -1, { sinTienda: true, iniciales })` — rail **sin
  ítem activo** y topbar **sin chip ni «Ver mi tienda»** (la tienda aún no existe; quedan
  hamburguesa, Buscar ⌘K y avatar de la sesión).
- Card **centrada** en `CONTENT` (440×~590). Ojo: en el real es `Card withBorder radius="md"`,
  **NO** una `PanelCard` ⇒ clase `.ct-card` con borde y radio 8, no la superficie sin borde.
- Contenido: ThemeIcon circular 48 (`variant="light"` cobalto, ícono `store`) · título «Crea tu
  tienda» como `Text fw={600} size="lg"` (**no** un heading Fraunces) · bajada dimmed centrada ·
  campo «Identificador de la tienda» (desc + preview del subdominio) · campo «Nombre de la tienda» ·
  Alert gris del identificador irreversible · botón fullWidth «Crear mi tienda».
- El preview del subdominio se muestra **sólo con el campo lleno**: por eso el bloque entero
  (label + input + desc + preview) va en un `stackEl("slug", …)` con caja de 132 px reservada.
- **Divergencia deliberada del producto**: el componente real imprime el literal `.tudominio`
  (string sin cablear). El mock muestra `.sorteatelo.cl` — el video enseña el dominio real.
  Está flaggeado al usuario; si se arregla el componente, el mock ya coincide.

Clases propias: `ct-card`, `ct-icon`, `ct-title`, `ct-desc`, `ct-preview`, `ct-preview-slug`,
`ct-alert`, `ct-alert-txt`.

---

## Panel · Sorteo (crear + gestión) — `crea-tu-tienda/app.js` (`formSorteo` / `gestion`)

**Estado: LISTO.** Componente real: `src/pages/admin/sorteo.tsx`, estado **sin sorteo activo** y
organizador nuevo (⇒ sin sección Participantes / importar).

- `pageHeader(474, 208, "Sorteo", "Crea y gestiona el sorteo de la tienda.")` + `panelCard` de 688
  (campos de 640 + padding 24) con `Text fw={600}` «Crea tu sorteo».
- Campos en columna: «Nombre del sorteo» · «Premio» · «Fecha de cierre» (valor en `.mono`) ·
  «Enlace a las bases (opcional)». Botón cobalto «Crear sorteo» al pie.
- Estado **de gestión** tras crear: `SimpleGrid` de 3 StatCards (390 × 132, gap 17, a lo ancho del
  contenido): Participaciones · Estado · Cierre. Se entra con el crossfade `stackEl("gestion", …)`,
  que reserva la caja del formulario — el swap form → grilla es un solo toggle del timeline.
- Los tres campos que se tipean son `stackEl` independientes (`srNombre`/`srPremio`/`srFecha`), así
  el timeline los llena escalonados.

Clases propias: `ct-stat-label`, `ct-stat-row`, `ct-stat-valor`, `ct-stat-num`, `ct-stat-hint`.
`ct-stat-num` (mono tabular) se declara en el `<style>` del video **a propósito**: `.mono` de
`tour-kit.css` carga antes y perdería contra cualquier regla local que fije `font-family`.

> Toast de confirmación: `ct-toast*`, copia del `cfg-toast*` del piloto. Es la **segunda** cápsula
> que lo necesita ⇒ ya está maduro para promoverlo al kit como `.pnl-toast` en la próxima.

---

## CADENA de tours: una cápsula, N MP4 concatenados — `conecta-flow-a` + `conecta-flow-b`

**Estado: LISTO** (patrón nuevo, 2026-07-25). Precedente del repo origen: `novedades` de terranova
era una cadena de 3 tours.

Cuando el journey no cabe en **6 beats** (acá: crear la cuenta en Flow *y* conectar las claves), no
se estiran los beats ni se comprime el guion: se producen **dos tours normales** y se **concatenan**.

- Un folder por parte, con el sufijo de orden: `<slug>-a`, `<slug>-b`. Cada uno pasa su propio
  `check-classes` + `lint` + `render` (pipeline sin cambios) y sale a `out/<fecha>-<slug>-<parte>.mp4`.
- `data-composition-id` y la key de `window.__timelines` = **el slug de la parte** (si renombrás el
  folder, hay que cambiar los dos o el render sale estático).
- Unión sin re-encode (mismo códec/fps/tamaño, todos mudos):
  `ffmpeg -f concat -safe 0 -i <lista> -c copy out/<fecha>-<slug>.mp4`.
- **Bisagra**: el outro de la parte N no lleva lockup (isotipo + wordmark + dominio) — es un
  cierre parcial («Cuenta lista.» / «Ahora, las claves de integración.»). El lockup va **una sola
  vez**, en el outro de la última parte. El poster de cada parte lleva el eyebrow con el número
  (`PARTE 1 · CREA TU CUENTA`), mismo titular para toda la cadena.
- `videos.json`: entrada `format: "cadena"` con `parts: [...]` y la duración TOTAL, más una entrada
  por parte con `partOf`. La única salida que se publica es la del padre.

---

## Sitios de TERCEROS: screenshot real, no mock — `conecta-flow-b/app.js` (`flowFrame`)

**Estado: LISTO** (patrón nuevo, 2026-07-25). Primer caso: el **dashboard de Flow**
(`dashboard.flow.cl`) en los pasos 1 y 2 de `conecta-flow-b`.

**Regla**: «mock, no screencast» aplica a **NUESTRO** producto — se re-dibuja para que el video no
envejezca con cada cambio de UI y para no filtrar datos. Una **UI ajena que no controlamos** no se
mockea: mockearla sería inventar la interfaz de otro, y envejecería igual. Precedente del repo
origen: `sso-azure-onboarding` usaba shots de la consola de Azure.

- **Dónde viven los PNG**: `<slug>/shots/*.png` — carpeta **COMMITEADA**. Ojo: `<slug>/assets/` es
  EFÍMERO (`.gitignore` tiene `*/assets/`, lo regenera `materializar.mjs`), así que un asset PROPIO
  del video moriría ahí. `shots/` es del video y va a git; el motor resuelve `src="shots/x.png"`
  root-relative sin tocar el lint (no es `../`).
- **Recorte obligatorio**: fuera todo chrome del entorno de pruebas. Acá,
  `ffmpeg -i <orig>.png -vf "crop=1904:749:0:92"` saca la franja rosa «Sitio de pruebas de Flow»
  (~90 px) y la barra de scroll derecha. **Verificá el corte mirando el PNG**, no de memoria.
- **URL de la barra**: la de **producción** (`dashboard.flow.cl`), aunque el shot venga del sandbox
  — es la que el Organizador va a ver. Divergencia deliberada.
- **Chrome**: `flowFrame()` local, NO `TourKit.browserFrame()` (ése trae el rail y el topbar de
  nuestro panel). Reusa las mismas clases del kit (`app-browser`, `app-chrome`, `app-dot`,
  `app-url`, `app-chrome-spacer`) ⇒ ventana idéntica a la de los pasos del panel. Clases propias:
  `cf-viewport` (recorta) + `cf-shot` (la `<img>`).
- **Geometría por construcción**: la ventana se dimensiona **desde el shot** (ancho 1500 = el de
  `FRAME`, alto = chrome 56 + shot escalado; centrada en el canvas). Los helpers `sx/sy/sRect`
  mapean coords del PNG → canvas, así spotlight y cursor caen sobre el botón real del shot sin
  medir «a ojo» sobre el video.
- **Gotcha 15 NO aplica**: es un PNG plano, no un SVG con texto (no hay `@font-face` que heredar).

### Extensión: sitio público + alta de cuenta — `conecta-flow-a/app.js`

Mismo `flowFrame`, generalizado. Lo que agrega (copialo si tenés que mostrar otro sitio ajeno):

- **`vista(natH)`** — la ventana se deriva del shot, y hay **más de una altura natural**: los shots
  de producción (`flow.cl`, `dashboard.flow.cl/register`) se recortan `crop=1904:841:0:0` (sólo la
  barra de scroll: el banner de arriba trae el link «Crea tu cuenta»), y los del sandbox
  `crop=1904:749:0:92` (fuera la franja rosa). `vista()` devuelve `{FF, sx, sy, sRect}` por altura
  ⇒ dos ventanas distintas, ambas centradas y del mismo ancho (1500 = `FRAME.width`).
- **URL por paso**: `flow.cl` · `dashboard.flow.cl/register` · `dashboard.flow.cl` (siempre las de
  producción, aunque el shot venga del sandbox).
- **Crossfade de SHOTS** (paso 3): `flowFrame(V, url, ["a", "b"])` emite las dos `<img>` en la misma
  caja (`#shot-<nombre>`, la 2ª con `.tour-hidden`) y el timeline las cruza a mitad de beat — mismo
  patrón que `stackEl`, aplicado a páginas enteras (Datos del negocio → Datos bancarios). El
  spotlight cae sobre la **banda de encabezado** (breadcrumb + título), que existe igual en los dos
  shots: así el swap se lee sin que se mueva nada más.
- Shots comiteados en `conecta-flow-a/shots/`: `flow-home`, `flow-registro`, `flow-datos-negocio`,
  `flow-datos-bancarios`.
- **Dato sensible**: los shots del sandbox muestran el correo y el teléfono de la cuenta de pruebas
  del Operador en el topbar de Flow. Si el video se publica, hay que enmascararlos o rehacer los
  shots con una cuenta de demo.

---

## Panel · Configuración → card «Pagos (Flow)» conectada — `conecta-flow-b/app.js`

**Estado: LISTO.** Extensión de la card izquierda del piloto (`configura-la-tienda/app.js`), misma
pantalla real `src/pages/admin/configuracion.tsx`. Lo que agrega:

- `campoClave(id, y, label)` — campo de credencial con crossfade: vacío (`••••••••••••` en gris) →
  pegado (mismo enmascarado más largo, con `foco` cobalto). **Nunca** una clave real: el mock sólo
  muestra puntos.
- Inset de estado como `stackEl("estado", 240, 26, …)`: `No conectada` (badge `borde`) →
  `Configurada` (badge `exito` + check) + `Producción` (badge `gris`). Las dos variantes van dentro
  de `.cf-badges` (flex `justify-content:flex-end`) para compartir el borde derecho del inset —
  sin eso la variante corta flota a la izquierda de la caja reservada.
- Ambiente `Producción` (el piloto mostraba `Sandbox (pruebas)`), toast «Credenciales guardadas.».
- Clases propias (copia `cfg-*` → `cf-*`): `cf-asset`, `cf-thumb`, `cf-estado`, `cf-estado-label`,
  `cf-estado-badge`, `cf-badges`, `cf-sec`, `cf-sec-txt`, `cf-div`, `cf-toast*`.

> Tercera cápsula que copia el toast (`cfg-toast*` → `ct-toast*` → `cf-toast*`) y segunda que copia
> `cfg-sec`/`cfg-asset`. **Ya está sobre-madura la promoción al kit** (`.pnl-toast`, `.pnl-subhead`)
> — pendiente en `_lib/tour-kit.css`, con el color de la franja como parámetro.

---

## Pendientes de mockear (backlog de cápsulas)

| Pantalla | Componente real | Para la cápsula |
|---|---|---|
| Panel · Productos (tabla + modal de alta) | `src/pages/admin/productos.tsx` | Sube productos |
| Panel · Sorteo con participantes (tabla + tickets + sortear) | `src/pages/admin/sorteo.tsx` | Monta el sorteo |
| Panel · Resumen (KPIs + gráfico) | `src/pages/admin/index.tsx` | (futura) |
| Storefront del Comprador | `src/components/storefront/` | fuera de scope de esta tanda (D2) |
