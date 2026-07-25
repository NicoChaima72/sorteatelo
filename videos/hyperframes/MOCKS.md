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
| Topbar | `topbar(opt)` | 64px **sin borde inferior**: hamburguesa · chip de tienda con swatch del `colorPrimario` (único color-desde-dato) · Buscar ⌘K · Ver mi tienda · avatar |
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
- **Card «Tu tienda»** — ícono paleta, bloque de assets (logo / imagen de hero) separado por una
  línea, campos Descripción y Color de marca, sección «Textos del storefront» (Título del hero,
  Subtítulo del hero, Aviso), botón «Guardar cambios».

Recorrido del cursor del piloto: `Configuración` en el rail → campo **Título del hero** →
botón **Guardar cambios** (con el toggle del estado a «Cambios guardados»).

> Para una cápsula que necesite **Redes y contacto** o **Bases del sorteo** (más abajo en la misma
> card), extendé el builder de `configura-la-tienda/app.js` en vez de re-derivar la página.

---

## Pendientes de mockear (backlog de cápsulas)

| Pantalla | Componente real | Para la cápsula |
|---|---|---|
| Panel · Productos (tabla + modal de alta) | `src/pages/admin/productos.tsx` | Sube productos |
| Panel · Sorteo | `src/pages/admin/sorteo.tsx` | Monta el sorteo |
| Panel · Resumen (KPIs + gráfico) | `src/pages/admin/index.tsx` | (futura) |
| Storefront del Comprador | `src/components/storefront/` | fuera de scope de esta tanda (D2) |
