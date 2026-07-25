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

## Pendientes de mockear (backlog de cápsulas)

| Pantalla | Componente real | Para la cápsula |
|---|---|---|
| Panel · Productos (tabla + modal de alta) | `src/pages/admin/productos.tsx` | Sube productos |
| Panel · Sorteo con participantes (tabla + tickets + sortear) | `src/pages/admin/sorteo.tsx` | Monta el sorteo |
| Panel · Resumen (KPIs + gráfico) | `src/pages/admin/index.tsx` | (futura) |
| Storefront del Comprador | `src/components/storefront/` | fuera de scope de esta tanda (D2) |
