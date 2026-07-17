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
- Estilos por componente: props del sistema de Mantine (`p`, `mt`, `gap`, `c`, `fw`, `size`, `visibleFrom`/`hiddenFrom`…) o clases Tailwind de layout. **No** crear CSS Modules salvo decisión registrada acá.

## Theming

- El theme base vive en **`src/styles/theme.ts`** (`createTheme`): fuente Geist, `defaultRadius: "md"`, `respectReducedMotion: true`. **`docs/design.md` es la fuente de verdad visual** — la identidad de marca está PENDIENTE; no inventar dirección visual propia.
- Color SIEMPRE vía tokens del theme (props `color`/`c`/`bg`, CSS vars `--mantine-color-*`), **nunca hex inline** ni clases de color Tailwind. `color="red"` reservado para errores/destructivo.
- **Theming per-tenant (F06)**: el storefront arma su theme por request con `mergeThemeOverrides(themeBase, overrideDesdeTenant)` — los colores/logo del tenant son **dato del modelo `Tenant`**, jamás código. El panel usa el theme de la Plataforma, sin override.
- **Tailwind acotado a layout**: `flex`, `grid`, `gap-*`, `p-*`/`m-*`, `max-w-*`, responsive (`lg:`), `truncate`, `tabular-nums`, y **alineación de texto** (`text-right`/`text-center` — `text-align` es layout; en celdas de tabla conviven con el `ta` de Mantine, cualquiera de los dos vale). **Prohibidas** sus clases de color/tipografía/sombra y las clases interpoladas (`bg-${x}` no sobrevive el purge). Composición condicional con `cn()` de `~/lib/utils`.

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

- UI en **español** (strings hardcodeados — no hay i18n).
- **Español neutro**: "tienes", "puedes", "elige" (no voseo).
- **Excepción al hardcodeo**: el nombre de la app se consume SIEMPRE desde la config (`APP_CONFIG.name` en `~/config/app`, cuando se cree) — nunca literal en JSX/títulos. Hoy el nombre de marca está pendiente (ver `docs/design.md`).

## Formato de dinero

- **Los helpers viven en `~/lib/formato`** (única fuente): `clp(monto)` formatea CLP con `Intl.NumberFormat("es-CL")` y acepta el **string `Decimal`** del server o un `number` ya cruzado; `num(n)` formatea enteros con separador de miles (conteos, NO montos); `fechaHora(d)` da fecha+hora corta es-CL. **Nunca** re-crear un `Intl.NumberFormat` inline en una página ni concatenar `$` a un monto ya formateado.
- Montos con **`tabular-nums`** (clase Tailwind) en tablas y listas — las columnas de precios no "bailan".
- **Input de monto** (crear/editar precio): `TextInput` de Mantine con `leftSection={"$"}` (afijo visual, no parte del valor), `inputMode="numeric"` (teclado numérico en móvil) y clase `tabular-nums`. El valor se maneja como **string** en el form y viaja como string al server (CLP entero ⇒ `Decimal`), jamás como `number`. **NO usar `NumberInput`** para dinero — su value `number` invita a aritmética prohibida en el cliente. Ej.: `src/pages/admin/productos.tsx`.
- El dinero del dominio es `Decimal` (precio, total, IVA, comisión de Flow, neto). El cruce a `number` ocurre SOLO en el borde de presentación para formatear, y es seguro porque CLP no tiene decimales — jamás hacer aritmética con ese `number` ni mandarlo de vuelta al server (ver `CLAUDE.md` § Regla de oro y `CONTEXT.md` § Dinero).
