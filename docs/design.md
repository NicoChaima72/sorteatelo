# Design — sorteatelo

**Línea gráfica de la marca.** Fuente de verdad para TODO artefacto visual: la app y cualquier asset. Los agentes leen este archivo antes de generar algo visual.

> ✅ **Identidad de marca de la PLATAFORMA: RESUELTA — dirección «El Talonario» (cobalto + amarillo + tinta).** Elegida por el usuario tras 4 rondas de prototipos en código (`.scratch/rediseno-ui/direccion-talonario.md`), volcada a `src/styles/theme.ts` por `tasks/26-07-17-marca-identidad-talonario.md`. **SUPERSEDE la ruta «En Vivo» (violeta)** que instanciaba el carril `admin-marca` (esa ruta ya no es la identidad; el resto de ese carril —chrome invertido del panel, PageHeader— sigue vigente). Nombre **«Sortéatelo»** (`sorteatelo.cl`, ADR-0014; vive en `APP_CONFIG.name`, `src/config/app.ts`). Paleta **blanco + azul cobalto `#2B3FBF` + amarillo lotería `#FFC530` + tinta `#191B22`**, tipografía **Bricolage Grotesque** (display/headings) + **Instrument Sans** (texto) + **IBM Plex Mono** (números/montos), semántica de comercio **teal (pagado) / ámbar (pendiente) / amarillo (premio) / ladrillo (error)** — todo en `src/styles/theme.ts` y detallado en §2/§3/§5. Tras el pivote SaaS (ADR-0005) hay DOS niveles de identidad: (1) la marca de la **PLATAFORMA** = esta línea gráfica; (2) el **theming per-tenant** = cada Tienda configura logo/colores/textos sobre la plantilla base — es **dato del modelo `Tenant`**, no código, y por diseño NO compite con el cobalto de plataforma (seam de theming, §2 y §9). Un **logo/isotipo dibujado** real sigue pendiente (hoy: wordmark tipográfico `Wordmark` en Bricolage + isotipo Tabler `IconTicket` provisional).

> **Librería de UI: Mantine 7** (ADR-0011, decisión cerrada 2026-07-17 — reemplaza a shadcn/ui). Tailwind convive acotado a utilities de layout (con `screens` sincronizados a los breakpoints em de Mantine, §4). Reglas duras en `docs/agents/frontend-conventions.md`.

## 1. Esencia de la marca

Producto: **plataforma SaaS de tiendas con sorteo** (compradores mayoritariamente mobile → storefront **mobile-first**). Doble audiencia: Organizadores (confianza, claridad para operar y cobrar) y Compradores (la marca que ven es la de la TIENDA, con disclaimer de la plataforma — ADR-0008). Nombre de la plataforma: **Sortéatelo** (dominio `sorteatelo.cl`, ADR-0014; repo: `sorteatelo`, carpeta local histórica: `libros-iselk`). Vive en `src/config/app.ts` (`APP_CONFIG` — `name`/`tagline`/`dominio`); la UI lo consume de ahí, **nunca hardcodeado** (frontend-conventions § Idioma). El theming per-tenant (logo/colores/textos de cada Tienda) es **dato, no código**: sale del modelo `Tenant` y se aplica como theme override de Mantine (`mergeThemeOverrides` sobre el theme base, ADR-0011), jamás hardcodeado en componentes.

**Posicionamiento (dirección «El Talonario»):** el hueco del rubro es **cálido + verificablemente honesto** a la vez. El rubro de sorteos es un mar de azul-SaaS frío o de oro-de-rifa obvio; Sortéatelo se separa con la estética de **impreso popular** — el **talonario de rifa elevado**: blanco de papel, **azul cobalto** que ninguna tienda chica elige (deja claro qué es plataforma y qué es tienda) y **amarillo lotería** como acento del momento de triunfo, con una voz **cercana y humana**. Cero corporativa, cero gradientes «de IA». La confianza no la carga el color sino el **mecanismo visible** (Flow del propio Organizador, número de ticket confirmado al instante, "tu plata llega directa a ti") y los **motivos del talonario** como firma verificable: plumón orgánico sobre los verbos, perforaciones dashed entre secciones, sellos de goma para los estados, chip de ticket con muescas, y el **talonario vivo** (grilla de números vendidos/libres, el «TÚ» en amarillo). El registro visual de referencia (aprobado, 4 rondas): landing en bandas cobalto/blanco/amarillo/gris/tinta, login split cobalto, panel con cards sobre celeste hundido y acento cobalto/amarillo solo en navegación activa y CTAs. Los prototipos históricos vivían en `src/pages/prototipo/` (sandbox; se retiran al montar lo oficial — F06 del plan).

## 2. Paleta

La paleta vive **SOLO** en el theme de Mantine (`src/styles/theme.ts`, `createTheme`): tuplas de 10 tonos en `theme.colors` + `primaryColor`. Cambiar la paleta = editar ese archivo, **nunca** hex inline en componentes ni clases de color Tailwind. Los componentes consumen color por props de Mantine (`color`, `c`, `bg`, `variant`) o CSS vars `--mantine-color-*` — un color = un token del theme.

**Primario — cobalto «El Talonario»** (`primaryColor: "sorteatelo"`, `primaryShade: 6`, `autoContrast: true`):

| Rol | Token | Hex (índice) | Uso |
|---|---|---|---|
| Primario | `sorteatelo` | `#2b3fbf` (6) | botones, links, nav activa, isotipo, banda hero/CTA. Contraste ≈ 8:1 con blanco (AAA). |
| Primario profundo | `sorteatelo` | `#2333a0` (7) | hover profundo, headers/dark. |
| Acento | `amarillo` | `#ffc530` (6) | el momento de triunfo (el número «TÚ», plumón, talón del boleto, CTA sobre banda azul). Filled → texto tinta (autoContrast). Hover `#f5b814` (7). |

**Semántica de comercio** (color **funcional**, no decorativo — el estado se comunica con color + ícono/texto, el resto de la UI vive en neutros). Fuente única: los mapas `ESTADO_ORDEN_COLOR` / `ESTADO_TIENDA_COLOR` exportados desde `theme.ts` (los consumen `estado-badge.tsx` / `estado-tienda-badge.tsx`):

| Estado | Token | Hex ref | Uso |
|---|---|---|---|
| Pagado / éxito / confirmado | `exito` | `#1d7a70` teal (6) | orden pagada, tienda publicada, "cumplido". Teal (no verde-esmeralda) para evitar el "verde-banco". |
| Pendiente / en proceso | `pendiente` | `#a06b08` ámbar oscuro (6) | pago sin confirmar, tienda en configuración. |
| Premio / ganaste | `premio` | `#ffc530` amarillo (6) | el momento de triunfo (ícono del ganador del sorteo). Re-anclado al **amarillo de marca**: el triunfo del talonario ES el amarillo. |
| Fallido / destructivo | `red` (override) | `#c03e2e` ladrillo (6) | pago rechazado, tienda suspendida, acciones destructivas. `red` **reservado** a error/destructivo. |
| Neutro / borrador | `gray` (frío) | `#565b68` (6) | texto secundario (`dimmed`), tienda en alta, bordes. |

**Neutrales fríos** (escala azul-grisácea del talonario, reemplaza el gris cálido de la ruta violeta): `black: #191b22` (tinta, texto casi-negro azulado, no negro puro), escala `gray` fría (tinta-suave `#565b68` en el 6 = `dimmed`, tinta-tenue `#9aa0ad` en el 4, **gris banda `#eef0f5` en el 1** para las secciones claras de la landing), y una escala `hundido` (celeste `#eef2fb` en el índice 1) para el fondo del chrome del panel/login vía `light-dark()`, con **cards en blanco puro** sobre el hundido.

**Seam de theming (regla dura, ADR-0011 · D13):** el **panel/admin monta SIEMPRE el theme base de plataforma** (cobalto), sin override. El **storefront** arma su theme por request con `mergeThemeOverrides(themeBase, overrideDesdeTenant)` donde el override es SOLO el `colorPrimario` del `Tenant` (dato). `_app.tsx` cumple el seam: solo el storefront puebla `pageProps.tenantBranding`; el panel/apex no, así el cobalto de plataforma queda intacto. **`primaryShade: 6` está alineado con `tenantTheme.generarEscalaColor`** (que ancla el hex del tenant en el índice 6): así el `filled` per-tenant sale EXACTO en el `colorPrimario` elegido, y el filled de plataforma sale exacto en el cobalto. El `colorPrimario` del tenant aparece en el admin únicamente como **dato puntual** (el swatch del chip de tienda, `ColorSwatch color={colorPrimario}`), jamás como theme.

**Tipografía numérica / montos:** ver §3 y §8. Los montos van en IBM Plex Mono con `tabular-nums`.

## 3. Tipografía

Tres familias, cargadas con `next/font/google` en `src/config/fonts.ts` y aplicadas al `<html>` en `_document.tsx` (className base + CSS vars). Reemplazan a Manrope/Sora de la ruta violeta.

- **Bricolage Grotesque** (`--font-display`, variable, peso **800**): display, headings y el wordmark de marca. El carácter «impreso popular» del talonario.
- **Instrument Sans** (`--font-instrument`, variable): la familia del **texto de sistema** (UI, párrafos). Es la fuente base del `<html>`.
- **IBM Plex Mono** (`--font-mono`): **números, montos y etiquetas** (series, cabeceras mono, el «Nº 000001» del boleto). `tabular-nums`.

Reglas:
- El theme (`theme.ts`) consume las fuentes por **CSS var** (`var(--font-instrument)` en `fontFamily`, `var(--font-display)` en `headings.fontFamily`, `var(--font-mono)` en `fontFamilyMonospace`), **no importa `next/font`** — así `theme.ts` es importable desde Vitest y el cliente sin arrastrar el loader. El loader vive SOLO en `fonts.ts`/`_document.tsx`.
- Jerarquía por **familia + peso + tamaño**: headings en Bricolage 800, texto en Instrument, números en Plex Mono.
- **Montos** siempre con `tabular-nums` (cifras de ancho fijo — las columnas de precios no "bailan").
- `tailwind.config.ts`: `font-sans` resuelve a `var(--font-instrument)` (D5).

## 4. Espaciado, formas y elevación

- Layout con utilities Tailwind estándar (`gap-4`/`gap-6`, `p-4`/`p-6`); dentro de componentes Mantine, su escala de spacing (`xs…xl`). Los **`screens` de Tailwind están sincronizados con los breakpoints em de Mantine** (`xs 36em / sm 48em / md 62em / lg 75em / xl 88em`, patrón datawalt-app) — así los `lg:` de layout coinciden con los props responsive de Mantine (`visibleFrom`/`hiddenFrom`, `AppShell`). Tailwind sigue acotado a layout: los screens NO habilitan clases de color/tipografía.
- **Mobile-first**: el chrome se aprieta en móvil (gutter `px-4` bajo `lg`, `lg:px-8` en desktop). El público es mayoritariamente mobile.
- **Gramática SUAVE en superficies de MARCA (landing/login)** — veredicto de la ronda de estilo (el neobrutalismo fue descartado): **sin bordes duros**, cards `radius 18`, botones `radius 12` con **sombra difusa de color** (`0 3px 10px rgba(43,63,191,.22)`), teléfono demo `radius 34`, chip de ticket con muescas y **sin borde**. La elevación es por **sombra difusa, nunca dura ni gradiente**. Se conservan del talonario como detalle: **perforaciones dashed** entre secciones, **sellos** de goma para estados, **plumón** amarillo en los verbos, **mono** para números.
- **El chrome del panel NO se rediseña**: mantiene su patrón actual (`Card withBorder`, `theme.defaultRadius = "md"` ~0.5rem, elevación por borde) — solo se re-colorea vía theme. La gramática suave vive en los componentes de marca (`src/components/landing/`), no en el default global.

## 5. Layout y componentes

- Componentes siempre de **Mantine 7** (`@mantine/core` + `form`/`modals`/`notifications`/`hooks`). Ver `docs/agents/frontend-conventions.md` para las reglas duras (theming, formularios, notificaciones, montos). La gramática talonario de las superficies de marca se encapsula en **componentes propios** (`src/components/landing/`) construidos con Mantine por dentro + un **CSS module acotado** que consume solo `--mantine-color-*` / `--font-*` (cero hex fuera del theme) — excepción registrada a "no crear CSS Modules" en frontend-conventions.
- **Íconos**: `@tabler/icons-react` es la **única** librería de íconos (navegación, acciones, estados, dominio — y es la que la doc de Mantine usa). Named imports, tree-shakeado.
- Superficies clave: **landing pública de plataforma** en el apex (bandas del talonario), **login split cobalto**, storefront del Comprador (catálogo/carrito/checkout mobile-first, tematizado per-tenant — plantilla rica), panel de Organizador (`AppShell`: productos, ventas, sorteo, configuración), panel del Operador.

### 5.1 Plantilla oficial del storefront (estructura rica tematizable)

**Fuente de verdad de la estructura del storefront del Comprador.** Es la **única** plantilla que ofrece la Plataforma (CONTEXT § Plantilla). NO es estética fija: es **estructura rica** — un skin neutro-profesional que **cada Tienda tematiza** con su `colorPrimario` (expandido a la escala de 10 tonos de Mantine, `src/styles/tenantTheme.ts`, ADR-0011) y sus [[Asset de marca]] (logo, hero, portadas, premio — bucket público, ADR-0013). Debe verse bien tanto para una tienda de fandom (color saturado + imágenes) como para una sobria (color neutro, pocas imágenes). **Mobile-first REAL** (el público es mayoritariamente mobile): móvil = columna tipo celular; desktop = hero a 2 columnas + grillas anchas. NO builder drag-and-drop (decisión cerrada).

Secciones, en orden — **todas tematizables, todas con degradación elegante** (ver 5.2):

1. **Header sticky.** Logo (imagen del tenant) + nombre de la Tienda; **chip de countdown** al cierre del sorteo (`Raffle.fechaFin`, solo si hay sorteo ACTIVO y la fecha es futura); ícono de carrito con badge de cantidad. En desktop, nav de anclas opcional (Catálogo · Sorteo · Cómo funciona). Es sticky con `backdrop-blur` sutil.
2. **Hero a 2 columnas** (desktop) / apilado (móvil). Izquierda: **eyebrow** ("Sorteo abierto" si hay sorteo), **titular grande** (`heroTitulo`, fallback a `nombre`), **subtítulo** (`heroSubtitulo`, fallback a `descripcion`), **CTA primaria** (baja al catálogo), y una **fila de 3 badges de confianza** (compra segura · entrega al instante · tu ticket al toque — copy FIJO de plataforma, íconos Tabler). Derecha: **imagen de hero** del tenant; si no hay, un **gradiente temático** derivado del `colorPrimario` (nunca un hueco). Este es el slot de "personalidad".
3. **Catálogo rico.** Grid de tarjetas de producto con **portada** (imagen), título, precio (`tabular-nums`, CLP vía `~/lib/formato`), **badge "Sorteo"** si `participaEnSorteo`, y control agregar / stepper de cantidad (reusa `StepperCantidad`). Card sin portada ⇒ **placeholder temático** (gradiente + ícono/inicial). Es un salto grande respecto de las cards texto-only actuales.
4. **Vitrina del sorteo / premio** (solo si hay sorteo ACTIVO). Sección destacada con **imagen del premio**, nombre, premio, fechas, **conteo de participaciones** (tickets, sin correos — privacidad ADR-0004), un "cómo funciona: comprar = participar", y el **disclaimer ADR-0008 visible** (texto fijo de plataforma, obligatorio, NO configurable). Sin imagen de premio ⇒ bloque de gradiente temático.
5. **Cómo funciona (3 pasos).** Copy FIJO de plataforma (comprar → recibir PDF + número → entrar al sorteo). Buena para conversión; no depende de datos del tenant ⇒ siempre presente.
6. **Footer.** Logo/nombre, **redes sociales** (Instagram / TikTok / WhatsApp — URLs configurables, cada ícono **se oculta si su URL está vacía**), enlace a las **Bases del sorteo**, **contacto** (si está), y la **atribución neutral de plataforma + disclaimer de responsabilidad**. La atribución del footer del storefront sigue **neutral, SIN nombre** ("tienda operada de forma independiente… con la tecnología de la plataforma") — decisión abierta de carril A.

Referencias de estructura (NO se copian literal): `tiotito.cl` y las 3 maquetas previas (`tmp/v-dreamy` / `v-concert` / `v-editorial`) — muestran las mismas secciones en tres estéticas; la plantilla oficial es UNA, neutra, que el color/assets del tenant vuelven cualquiera de esas.

### 5.2 Degradación elegante (regla dura de la plantilla)

Todo dato de marca es **opcional**. La plantilla nunca muestra un hueco, un `<img>` roto ni un campo vacío:

| Falta | La plantilla muestra |
|---|---|
| Imagen de hero | Gradiente temático derivado del `colorPrimario` (tonos de la escala) |
| Portada de producto | Placeholder temático (gradiente + ícono/inicial del título) |
| Imagen de premio | Bloque de gradiente temático |
| Logo | Nombre de la Tienda como texto (ya vigente) |
| Red social (IG/TikTok/WhatsApp) vacía | Se oculta ese ícono |
| Contacto vacío | Se oculta la línea |
| Sin sorteo ACTIVO | No aparece la vitrina del sorteo ni el countdown del header |
| `avisoTexto` vacío | No aparece el banner de aviso |
| `heroTitulo` / `heroSubtitulo` vacíos | Fallback a `nombre` / `descripcion` |

El gradiente temático se deriva de la escala de 10 tonos ya generada por `generarEscalaColor` (`tenantTheme.ts`) — mismo color de marca, cero hex inline (§9).

## 6. Data-viz

- El panel tendrá métricas simples (ventas, ingresos). Cuando lleguen charts, el default es **`@mantine/charts`** (construido sobre Recharts, ya instalado): hereda los colores del theme. Mantener la restricción: **nunca más de 5 series**; grid lines sutiles; tooltips discretos. Paleta de charts a derivar de la paleta de marca (§2 — cobalto/teal/amarillo/ámbar como series, en ese orden de prioridad).

## 7. Motion

Identidad de movimiento por defecto: **preciso y calmado** — nada rebota, nada gira con dramatismo. Las transiciones default de Mantine (fades/pops de Modal, Menu, Tooltip) ya cumplen esta identidad — no customizarlas sin decisión registrada.

| Token | Valor | Uso |
|---|---|---|
| `duration-fast` | 150ms | Hover, focus, toggles |
| `duration-base` | 250ms | Transiciones de UI, fades, dropdowns |
| `duration-slow` | 400ms | Entradas de cards/secciones |

- **Entradas de la landing** (dependencia `motion`, ex framer-motion): las secciones de la landing pública entran con **fade + translate leve** al hacer scroll (una sola definición reutilizada). `motion` está **acotado a la landing** — no se importa en el panel ni en el storefront.
- **Talonario vivo**: el sello «¡SALE!» rota entre los números vendidos cada ~3s; se detiene por completo con `prefers-reduced-motion`.
- Respetar `prefers-reduced-motion` **globalmente y siempre** (Mantine lo respeta con `theme.respectReducedMotion: true`; el talonario vivo y `motion` lo respetan explícitamente): con reduced-motion las secciones aparecen **completas, sin animar** (nunca ocultas).
- Anti-patrón: springs exagerados, parallax, zooms dramáticos.

## 8. Voz y tono

- **Español con tuteo** (no voseo): "tienes", "puedes", "elige". UI con strings hardcodeados (sin i18n).
- **Tono cercano chileno, humano y tranquilizador** — "una amiga que te explica cómo funciona" (dirección «El Talonario»). Microcopy y empty states pueden usar frases de contención y cercanía, no solo texto funcional. Ejemplos aprobados: *"Todavía no vendes nada — y está bien"*, *"Entra a tu tienda y mira cómo va tu sorteo"*, *"Cuando alguien compre en tu tienda, sus compras aparecerán acá"*. Evitar jerga de SaaS y lenguaje de urgencia/escasez de rifa (contadores agresivos, "¡últimos números!") en el chrome de plataforma — es la bandera de alerta que el público asocia a estafa.
- **Montos**: siempre `Intl.NumberFormat` (CLP) vía `~/lib/formato` — nunca concatenar `$` a mano.

## 9. Reglas duras y anti-patrones

- Cambios de paleta **solo** en el theme de Mantine (`src/styles/theme.ts`) — nunca hex inline en componentes.
- **Excepción — assets gráficos estáticos de marca** (`public/favicon.svg`, `public/og.svg`): SÍ embeben los hex de marca (cobalto `#2b3fbf`, amarillo `#ffc530`, tinta `#191b22`) y los nombres de las familias display/mono, porque son archivos SVG, no componentes React (no consumen el theme en runtime). Es la ÚNICA excepción a "cero hex" en artefactos gráficos; los componentes siguen usando tokens. Si cambian los colores de marca, actualizar también estos assets a mano.
- **Excepción — CSS module de la gramática de marca**: los componentes de `src/components/landing/` pueden usar un CSS module acotado, pero **solo con CSS vars del theme** (`--mantine-color-*`, `--font-*`) — cero hex propio. (El color-de-dato del teléfono/tienda demo y el swatch per-tenant son la otra excepción: son DATO de ejemplo, no token de marca.)
- Tailwind **solo para layout** (flex/grid/gap/spacing/responsive con los screens em de Mantine); **prohibidas** las clases de color, tipografía y sombra de Tailwind (`bg-blue-900`, `text-zinc-500`…) — eso es territorio del theme de Mantine.
- Color dinámico (el color elegido por un tenant) vía theme override / `style={{}}` / `ColorSwatch` desde datos — no interpolar clases (`bg-${x}` no sobrevive el purge de Tailwind). En el admin, el ÚNICO color-desde-dato permitido es el swatch del chip de tienda (seam §2).
- `color="red"` reservado para errores / acciones destructivas; "pendiente"/"en configuración" NUNCA en rojo (usan `pendiente`, ámbar).
- **Dark mode**: vía `colorScheme` de Mantine, con **toggle** en el menú de cuenta del panel. El fondo del chrome conmuta con `light-dark(var(--mantine-color-hundido-1), dark)`; la tupla de 10 tonos da la variante oscura casi gratis. `defaultColorScheme="light"`.
- En la landing, **dos secciones blancas nunca adyacentes** (regla registrada del usuario): la secuencia de bandas alterna color (AZUL → BLANCO → AMARILLO → BLANCO → GRIS → AZUL → TINTA).
- No introducir colores fuera del theme sin actualizar primero este archivo con aprobación del usuario.

## Decisiones pendientes

- [x] **Identidad de marca**: nombre (**Sortéatelo**, ADR-0014), paleta (**«El Talonario»** — cobalto + amarillo + tinta, §2) y tipografía (**Bricolage / Instrument / IBM Plex Mono**, §3) — resuelto en `tasks/26-07-17-marca-identidad-talonario.md` (SUPERSEDE la ruta violeta «En Vivo» del carril admin-marca). Todo en `src/styles/theme.ts`. Falta solo un **logo/isotipo dibujado** real (hoy: wordmark tipográfico Bricolage + isotipo Tabler).
- [x] **Semántica de color para estados de comercio** (§2): pagado→teal `exito`, pendiente→ámbar `pendiente`, fallido→ladrillo `red`, premio→amarillo `premio`. Mapas únicos en `theme.ts`.
- [x] **Toggle de dark mode** en la UI (`useMantineColorScheme` en el menú de cuenta; el chrome conmuta con `light-dark()`).
- [x] Diseño de la plantilla base del storefront + qué campos del `Tenant` alimentan el theme override — resuelto en §5.1/§5.2 (estructura oficial de 7 secciones, tematizable per-tenant, con degradación elegante) y ADR-0013 (assets públicos de marca). Ver `tasks/26-07-17-plantilla-rica.md`.
- [ ] **Logo/isotipo dibujado** de Sortéatelo (encargo de diseño; hoy wordmark tipográfico + isotipo Tabler provisional).
- [ ] **Atribución de plataforma en el footer del storefront** (mostrar "Sortéatelo" vs. atribución neutral) — sigue pendiente; es territorio del storefront (carril A). Hoy la atribución sigue neutral, sin nombre (§5.1).
- [ ] **OG raster**: `public/og.svg` es la fuente; falta un PNG 1200×630 rasterizado (muchos crawlers sociales no renderizan SVG en `og:image`).
