# Frontend conventions

Convenciones del frontend de libros-iselk: Next.js 14 (pages router) + React 18 + **Mantine 7** (ADR-0011) + Tailwind 3 acotado a layout.

**Estado**: seed. Este doc arranca con las reglas del stack (T3 + Mantine) y **crece con cada pantalla aprobada** — los sub-patrones atados a una feature concreta se consolidan acá cuando esa feature se construye y el usuario la valida. No anticipar patrones de features que todavía no existen.

## Mantine — la regla central

Paquetes instalados: `@mantine/core`, `@mantine/hooks`, `@mantine/form`, `@mantine/modals`, `@mantine/notifications` (major 7, pineada — misma que datawalt-app, la referencia del Operador). Otros paquetes Mantine (`dates`, `charts`, `carousel`) se agregan **cuando una feature los necesite**.

- **Componentes de UI** → siempre de `@mantine/core`. NO escribir a mano un componente que Mantine ya provee; NO reintroducir shadcn/Radix/CVA (retirados en ADR-0011).
- **Providers y estilos, una sola vez en `_app.tsx`**, en este orden de imports (el orden importa — los estilos Mantine se importan DESPUÉS de `globals.css` para ganar al preflight de Tailwind, patrón probado en datawalt-app):
  ```tsx
  import "~/styles/globals.css";        // Tailwind
  import "@mantine/core/styles.css";
  import "@mantine/notifications/styles.css";
  ```
  Árbol: `MantineProvider theme={theme} defaultColorScheme="light"` → `ModalsProvider` → `<Notifications />` + la app. `ColorSchemeScript` va en `src/pages/_document.tsx`.
- **PostCSS queda solo-tailwind** (sin `postcss-preset-mantine`): no escribimos CSS propio con mixins de Mantine. Si algún día hace falta, se agrega en ese momento.
- Estilos por componente: props del sistema de Mantine (`p`, `mt`, `gap`, `c`, `fw`, `size`, `visibleFrom`/`hiddenFrom`…) o clases Tailwind de layout. **No** crear CSS Modules salvo decisión registrada acá. **Decisión registrada (identidad «El Talonario»)**: los componentes de la gramática de marca en `src/components/landing/` (plumón, perforación, sello, talonario vivo, teléfono-tienda, chip de ticket, boleto CTA, bandas) SÍ pueden usar un **CSS module acotado**, pero **solo con CSS vars del theme** (`--mantine-color-*`, `--font-*`) — cero hex propio. Es la única familia de componentes con CSS module; el resto sigue con props Mantine.

## Theming

- El theme base vive en **`src/styles/theme.ts`** (`createTheme`): paleta **«El Talonario»** (`primaryColor: "sorteatelo"` = cobalto `#2b3fbf` en el índice 6, `primaryShade: 6`, `autoContrast: true`), acento `amarillo` (`#ffc530`), neutrales fríos (`gray` frío con tinta-suave `#565b68`, escala `hundido` celeste `#eef2fb` para el fondo del chrome, `black: #191b22` = tinta), tuplas semánticas (`exito` teal `#1d7a70` / `pendiente` ámbar `#a06b08` / `premio` = amarillo de marca, override de `red` a ladrillo `#c03e2e`), fuentes por **CSS var** (`var(--font-instrument)` texto, `var(--font-display)` headings = Bricolage 800, `var(--font-mono)` = IBM Plex Mono; el theme NO importa `next/font` — el loader vive en `fonts.ts`/`_document.tsx`), `defaultRadius: "md"`, `respectReducedMotion: true`. **`primaryShade: 6` está alineado con `tenantTheme.generarEscalaColor`** (base del tenant en el índice 6) — el `filled` per-tenant sale EXACTO en su `colorPrimario`. **`docs/design.md` §2/§3 es la fuente de verdad visual.**
- Color SIEMPRE vía tokens del theme (props `color`/`c`/`bg`, CSS vars `--mantine-color-*`), **nunca hex inline** ni clases de color Tailwind. `color="red"` reservado para errores/destructivo; "pendiente" nunca en rojo (usa `pendiente`).
- **Semántica de comercio**: los estados de orden/tienda se pintan con los mapas `ESTADO_ORDEN_COLOR` / `ESTADO_TIENDA_COLOR` exportados desde `theme.ts` (los consumen `estado-badge.tsx` / `estado-tienda-badge.tsx`) — no hardcodear el color de un estado en el componente.
- **Theming per-tenant (seam D13)**: el storefront arma su theme por request con `mergeThemeOverrides(themeBase, overrideDesdeTenant)` — los colores/logo del tenant son **dato del modelo `Tenant`**, jamás código. El panel/apex usan el theme de la Plataforma, SIN override. El único color-desde-dato en el admin es el swatch del chip de tienda (`ColorSwatch color={colorPrimario}`).
- **Fondo por color scheme**: para un fondo que difiera entre claro/oscuro (ej. el celeste hundido del chrome del panel/login), usar la función CSS `light-dark(claro, oscuro)` de Mantine 7 con tokens en `styles`/`style` — `light-dark(var(--mantine-color-hundido-1), var(--mantine-color-dark-8))` — no selectores propios por scheme.
- **Tailwind acotado a layout**: `flex`, `grid`, `gap-*`, `p-*`/`m-*`, `max-w-*`, responsive (`lg:`), `truncate`, `tabular-nums`, **alineación de texto** (`text-right`/`text-center` — `text-align` es layout; en celdas de tabla conviven con el `ta` de Mantine, cualquiera de los dos vale) y `whitespace-pre-wrap` para texto preformateado versionado (ToS, bases). Los **`screens` de Tailwind están sincronizados con los breakpoints em de Mantine** (`xs 36em / sm 48em / md 62em / lg 75em / xl 88em`, patrón datawalt-app) — así los `lg:` de layout coinciden con `visibleFrom`/`hiddenFrom` y `AppShell`. **Prohibidas** sus clases de color/tipografía/sombra y las clases interpoladas (`bg-${x}` no sobrevive el purge). Composición condicional con `cn()` de `~/lib/utils`.
- **Motion (dependencia `motion`, ex framer-motion)**: SOLO para las entradas de sección de la **landing pública** (fade + translate leve, una definición reutilizada). **Acotado a la landing** — no importar `motion` en el panel ni en el storefront. Siempre respetar `prefers-reduced-motion`: con reduced-motion las secciones aparecen completas, sin animar (nunca ocultas).

## Iconografía

- **`@tabler/icons-react` es la única librería de íconos** (lucide se retiró con shadcn). Siempre **named imports**, tree-shakeado:
  ```tsx
  import { IconShoppingCart } from "@tabler/icons-react";
  ```
  **Nunca** importar el barrel completo. En botones/inputs de Mantine van en `leftSection`/`rightSection`.

## Estructura de componentes y páginas

- Páginas en `src/pages/` (pages router). Componentes reutilizables en `src/components/`.
- **Componentes de feature en `src/components/<feature>/`** (ej. `src/components/admin/`); `src/components/` raíz para lo transversal.
- **Orden interno de una página**: imports → hooks → estados (`useState`/`useForm`) → queries (`api.x.useQuery`) → mutations (`api.x.useMutation`) → effects → funciones → constantes → return.
- Constantes estáticas fuera del componente. Imports siempre con alias `~/*`.
- El shell del panel es `AdminLayout` (`AppShell` de Mantine: navbar colapsable en mobile con `Burger` + `useDisclosure`).

## Data fetching (tRPC)

- Hooks de `~/utils/api` (`api.<router>.<procedure>.useQuery` / `useMutation`).
- En `onSuccess` de mutations: **invalidar/refetchear** las queries afectadas vía `utils` (`api.useUtils()`). Invalidar TODAS las queries que la mutation pueda afectar, incluso indirectamente.
- **Toda pantalla con datos resuelve los tres estados**, no solo el happy path:
  - **loading** → `Skeleton` de Mantine que replica la estructura real (evita layout shift);
  - **error** → mensaje en `c="red"` + botón "Reintentar" (`refetch`);
  - **data vacía** → estado vacío con ícono (Tabler) y mensaje en voz al usuario, no un hueco en blanco.
  - **no autorizado** (pantallas gateadas por rol/membresía, p. ej. Operador o el panel de tienda) → si el procedure responde `FORBIDDEN`/`UNAUTHORIZED`, mostrar un estado explícito "no tienes acceso" (no dejarlo caer al skeleton perpetuo ni a un error crudo) — es la 4ª rama de estas pantallas.
- **Diálogos con submit**: el botón con `loading={isPending}` (OR compuesto si hay varias mutations) — Mantine deshabilita y muestra spinner en un solo prop.
- **Listas paginadas por cursor** (ver `backend-conventions.md` § Paginación por cursor): `useInfiniteQuery` — `getNextPageParam: (ultima) => ultima.nextCursor ?? undefined`; filas con `data?.pages.flatMap((p) => p.items) ?? []`; UI **forward-only con botón "Cargar más"** (`hasNextPage` + `fetchNextPage()`, `loading={isFetchingNextPage}`), no un paginador de saltar-a-página-N. Ej.: `src/pages/admin/ventas.tsx`.
- **Mutation por-fila en una tabla** (una sola instancia de `useMutation` compartida por N filas): aislar el `loading` a la fila que la disparó con `mutation.isPending && mutation.variables?.<id> === fila.id` — nunca un hook por fila ni un `useState` de id-en-vuelo. El `loading` de Mantine ya deshabilita el botón (evita doble submit). Ej.: botón "Reenviar" de `src/pages/admin/ventas.tsx`.
- **Formularios hidratados desde una query** (editar config existente): la `useQuery` se declara antes del form y los datos se vuelcan con `form.setValues` / `initialize` en un `useEffect` cuando llegan. **Early-return en `isError` / sin-data ANTES de renderizar el form editable**: pintar el form en blanco con Guardar activo pisaría los datos reales con vacíos (regresión de pérdida de datos). Ej.: `src/pages/admin/configuracion.tsx`.

## Formularios

- Forms con más de un campo o con validación → **`@mantine/form`** (`useForm` con `initialValues` + `validate`), inputs cableados con `{...form.getInputProps("campo")}` y `<form onSubmit={form.onSubmit(handler)}>`. Un input suelto (ej. un buscador) puede seguir en `useState`.
- Errores de validación en el propio input (Mantine los pinta desde `getInputProps`); errores del server → notificación (ver abajo) o `Alert`.

## Notificaciones

- Feedback de mutations con **`@mantine/notifications`**: `notifications.show({ message, color: "green" })` en éxito cuando el resultado no es evidente en la UI; `color: "red"` + mensaje accionable en error. No usar `alert()` ni estados de texto ad-hoc para errores de mutation.

## Diálogos y destructivos

- Modales con contenido/form → `Modal` de `@mantine/core`.
- **Confirmaciones destructivas** → `openConfirmModal` de `@mantine/modals` con `confirmProps: { color: "red" }`, título claro y `children` que diga QUÉ se va a borrar. No armar diálogos de confirmación ad-hoc.

## Idioma

- UI en **español** con tuteo (strings hardcodeados — no hay i18n).
- **Español con tuteo**: "tienes", "puedes", "elige" (no voseo).
- **Tono cercano chileno** (dirección «El Talonario», `docs/design.md` §8): microcopy y empty states pueden usar un registro humano y de contención, no solo texto funcional (ej. "Todavía no vendes nada — y está bien"). Evitar jerga SaaS y lenguaje de urgencia/escasez de rifa en el chrome de plataforma.
- **Excepción al hardcodeo**: el nombre de la app se consume SIEMPRE desde `APP_CONFIG` (`~/config/app` — `name`/`tagline`/`dominio`) — nunca literal en JSX/títulos. La marca ya está resuelta (Sortéatelo, «El Talonario» — cobalto/amarillo/tinta; ver `docs/design.md`).

## Formato de dinero

- **Los helpers viven en `~/lib/formato`** (única fuente): `clp(monto)` formatea CLP con `Intl.NumberFormat("es-CL")` y acepta el **string `Decimal`** del server o un `number` ya cruzado; `num(n)` formatea enteros con separador de miles (conteos, NO montos); `fechaHora(d)` da fecha+hora corta es-CL; `fecha(d)` da fecha corta SIN hora es-CL (rangos de fechas, ej. el sorteo). **Nunca** re-crear un `Intl.NumberFormat`/`Intl.DateTimeFormat` inline en una página ni concatenar `$` a un monto ya formateado.
- Montos con **`tabular-nums`** (clase Tailwind) en tablas y listas — las columnas de precios no "bailan".
- **Input de monto** (crear/editar precio): `TextInput` de Mantine con `leftSection={"$"}` (afijo visual, no parte del valor), `inputMode="numeric"` (teclado numérico en móvil) y clase `tabular-nums`. El valor se maneja como **string** en el form y viaja como string al server (CLP entero ⇒ `Decimal`), jamás como `number`. **NO usar `NumberInput`** para dinero — su value `number` invita a aritmética prohibida en el cliente. Ej.: `src/pages/admin/productos.tsx`.
- El dinero del dominio es `Decimal` (precio, total, IVA, comisión de Flow, neto). El cruce a `number` ocurre SOLO en el borde de presentación para formatear, y es seguro porque CLP no tiene decimales — jamás hacer aritmética con ese `number` ni mandarlo de vuelta al server (ver `CLAUDE.md` § Regla de oro y `CONTEXT.md` § Dinero).

## Carrito y stepper de cantidad (storefront)

- El carrito del Comprador es estado de CLIENTE per-slug (localStorage `carrito:<slug>`, sin modelo `Cart`, ADR-0004). Cada `ItemCarrito` lleva `cantidad` (≥1); el contexto expone `agregar` (inicia en 1), `setCantidad` (clampeada a `[1, MAX_CANTIDAD_POR_ITEM]`) y `quitar`.
- Ajustar cantidad → **`StepperCantidad`** (`src/components/storefront/stepper-cantidad.tsx`): par de `ActionIcon variant="default"` (−/+) con un `Text` `tabular-nums` en medio; deshabilita `−` en 1 y `+` en el tope; lee/escribe vía `useCarrito`, con `aria-label` en ambos botones. Reusado en carrito-drawer, catálogo, detalle y checkout.
- **I4**: el stepper solo cuenta UNIDADES, nunca opera dinero. `MAX_CANTIDAD_POR_ITEM` se duplica a propósito entre cliente (`carrito.tsx`) y server (`checkout/schemas.ts`) — el cliente no puede importar código server; ambos lo documentan como espejo del `max` de Zod.

## Subida de imágenes de marca (panel)

- El panel sube assets públicos (logo/hero/portada/premio) por **presigned PUT + confirmación** (mismo patrón que el PDF), vía el hook `useSubirImagenMarca` (`~/components/admin/use-subir-imagen`). La allowlist de Content-Type (`CONTENT_TYPES_IMAGEN`) es ESPEJO del server (el cliente no importa código server; el server re-valida). El `<FileInput>` usa `accept={ACCEPT_IMAGEN}`.
- Dos modos: **inmediato** (`AssetUploader` — el recurso ya existe: logo/hero/premio; sube al elegir archivo e invalida su query) y **diferido** (portada de producto — se sube DESPUÉS de crear/actualizar, porque la key es per-recurso y necesita el `productId`).

## Chrome del panel «Oscuro + calmo» (admin)

- Superficie base del panel = **`PanelCard`** (`src/components/admin/panel-card.tsx`): `Card` sin borde, `radius="lg"`, sombra del token único `SOMBRA_PANEL`. NO usar `Card withBorder` en el panel; NO overridear el `Card` global del theme (rompe storefront/landing).
- **2ª excepción a "cero hex inline"**: `SOMBRA_PANEL` (rgba de la tinta con alpha) es el token único de elevación del panel — un solo lugar para ajustar la sombra (junto a los assets SVG de §9 de design.md, es la única familia con valores fuera del theme).
- **Rail colapsable**: `AppShell` con `navbar.width` dinámico (76 icon-only ↔ 256 icon+label), estado persistido con `useLocalStorage`; icon-only solo desktop (`useMediaQuery` del breakpoint lg). La animación de ancho es CSS puro en `styles.navbar` (no la librería `motion`), gateada por `useMediaQuery("(prefers-reduced-motion: reduce)")` (no `motion-safe:`, porque vive en props inline del AppShell).
- **Data-viz**: `@mantine/charts` — `Sparkline` en KPIs con serie; `BarChart` 14d. Para colorear UNA barra distinto (ej. "hoy" amarillo) se usa el truco de serie apilada de 2 (una serie por color, la otra en 0), porque `getBarColor` colorea por valor, no por posición.
- **Countdown del panel** (`admin/index.tsx`): calmo, sin segundos (§8, evita urgencia). Candidato a extraer a componente compartido cuando F05 lo necesite.
- **Tablas del panel — dos variantes de `PanelCard`**: (a) tabla CON header in-card (título + descripción, a veces un botón "Ver todas") → `PanelCard` con padding default (`lg`) y la tabla SIN `pl-6`/`pr-6` (la padding de la card provee el borde); ej. "Últimas ventas" del Resumen, participantes de Sorteo, Operador. (b) tabla full-page SIN header in-card (el título vive en `AdminLayout`) → `PanelCard padding={0}` con `pl-6`/`pr-6` en la primera/última celda (edge-to-edge, evita whitespace muerto sobre el thead); ej. Ventas, Productos.
- **Inset borderless dentro de una `PanelCard`**: para un bloque destacado ANIDADO (caja del ganador en Sorteo, estado de la credencial en Configuración) usar `Paper` SIN borde + `bg="var(--mantine-color-default-hover)"` + `radius="md"` (un paso menor que el `lg` de la card) y SIN sombra. `SOMBRA_PANEL` es solo para superficies top-level: una sombra anidada leería como "card dentro de card", que la gramática evita.

## Degradación elegante de imágenes (storefront)

- Toda imagen del storefront es opcional; su ausencia cae a un **gradiente temático** (`gradienteTematico` de `~/styles/tenantTheme`, derivado de la escala del `colorPrimario` vía CSS vars `--mantine-color-marca-*` / `--mantine-primary-color-*`) — **nunca un `<img>` roto** (design.md §5.2). Cero hex inline.
- Texto/ícono de contraste SOBRE un gradiente: `c="white"` en componentes Mantine (token), pero `color="var(--mantine-color-white)"` en íconos Tabler (no pasan por el resolver de tokens de Mantine).
