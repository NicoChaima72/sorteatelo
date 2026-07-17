# Frontend conventions

Convenciones del frontend de libros-iselk: Next.js 14 (pages router) + React 18 + **shadcn/ui** + TailwindCSS 3.

**Estado**: seed. Este doc arranca con las reglas genéricas del stack (T3 + shadcn) y **crece con cada pantalla aprobada** — los sub-patrones atados a una feature concreta (cards de catálogo, carrito, modales de admin, etc.) se consolidan acá cuando esa feature se construye y el usuario la valida. No anticipar patrones de features que todavía no existen.

## shadcn/ui — la regla central

Configurado en `components.json`: estilo **new-york**, CSS variables ON, `baseColor: zinc` (seed del init — las variables reales se sobreescriben al cerrar la marca). La línea gráfica vive en `docs/design.md`.

- **Componentes de UI** → shadcn/ui desde `~/components/ui/`. Ya instalados: `Button`, `Card`, `Input`, `Label`, `Dialog`, `Select`, `Badge`, `Table`, `DropdownMenu`, `Separator`, `Skeleton`.
- **Layout** → Tailwind directo: `flex`, `flex-col`, `gap-4`, `grid`, `grid-cols-3`, `p-4`, `overflow-y-auto`.
- **Agregar un componente shadcn nuevo**: usar el CLI con la **versión pineada** (no `@latest`): este proyecto usa **Tailwind v3** y el CLI más nuevo asume Tailwind v4. NO escribir a mano un componente que shadcn ya provee.
- **Gotcha del CLI (HSL vs oklch)**: si un comando shadcn escribe variables `oklch(...)` en `globals.css`, hay que convertirlas a **canales HSL crudos** (ej. `231 53% 17%`) — el `tailwind.config.ts` (v3) las envuelve en `hsl(var(--…))` y con `oklch` el tema sale roto silenciosamente.
- **NO editar** los archivos de `~/components/ui/` salvo **decisión de theming explícita registrada acá** (con el qué y el porqué). Por defecto se consumen tal cual los entrega shadcn.
- Composición de clases con `cn()` de `~/lib/utils` (clsx + tailwind-merge). Nunca template strings con clases condicionales a mano.

## Iconografía — dos sets, sin mezclar

El proyecto usa **dos** librerías de íconos (ambas ya instaladas) con una división dura por rol:

- **`@tabler/icons-react` = la librería de íconos de la APP.** Todo ícono que pongamos nosotros en la UI: navegación, acciones (editar, borrar, crear), estados (loading, vacío, error) y dominio (libro, carrito, sorteo, descarga, etc.). Siempre **named imports**, tree-shakeado:
  ```tsx
  import { IconBook, IconShoppingCart } from "@tabler/icons-react";
  ```
  **Nunca** importar el barrel completo.
- **`lucide-react` = SOLO lo que shadcn usa internamente** (la `X` del `Dialog`, el `Check` del `Select`, los `Chevron`… dentro de los componentes de `~/components/ui/`). No usar lucide para íconos nuevos de la app — para eso es Tabler.

Regla práctica: si estás eligiendo un ícono para una pantalla o un botón, es Tabler. Si el ícono lo trae un componente de `ui/`, es lucide y no lo tocás.

## Theming

- Tokens de color vía **CSS variables** en `src/styles/globals.css` (convención shadcn). Cualquier cambio de paleta se hace ahí, **nunca** hex inline en componentes.
- **`docs/design.md` es la fuente de verdad visual** (paleta, tipografía, espaciado, motion, voz). Leerlo antes de diseñar pantallas. **La identidad de marca está PENDIENTE** — no inventar dirección visual propia; resolver en la sesión dedicada y volcar lo aprobado a `design.md`.
- Usar **tokens semánticos** (`bg-primary`, `text-muted-foreground`, `border-border`, `bg-destructive`…), no colores Tailwind crudos (`bg-blue-900`). `destructive` queda reservado para errores y acciones destructivas.
- **Prohibido** interpolar clases Tailwind dinámicas (`bg-${color}-500` no sobrevive el purge). Color dinámico (ej. el color de un dato elegido por el usuario) vía `style={{ ... }}` o variantes **CVA**.

## Estructura de componentes y páginas

- Páginas en `src/pages/` (pages router). Componentes reutilizables en `src/components/`; los de shadcn en `src/components/ui/`.
- **Componentes de feature en `src/components/<feature>/`**: los componentes propios de una pantalla/módulo viven en un subdirectorio por feature (ej. `src/components/catalogo/`, `src/components/carrito/`). `src/components/` raíz queda para lo transversal.
- **Orden interno de una página**: imports → hooks → estados (`useState`) → queries (`api.x.useQuery`) → mutations (`api.x.useMutation`) → effects → funciones → constantes → return.
- Constantes estáticas fuera del componente.
- Imports siempre con alias `~/*`.

## Data fetching (tRPC)

- Hooks de `~/utils/api` (`api.<router>.<procedure>.useQuery` / `useMutation`).
- En `onSuccess` de mutations: **invalidar/refetchear** las queries afectadas vía `utils` (`api.useUtils()`). Invalidar TODAS las queries que la mutation pueda afectar, incluso indirectamente (ej. un borrado en cascada invalida también las listas que muestran la FK).
- **Toda pantalla con datos resuelve los tres estados**, no solo el happy path:
  - **loading** → `Skeleton` que replica la estructura de la lista/card real (evita layout shift);
  - **error** → mensaje en `text-destructive` + botón "Reintentar" (`refetch`);
  - **data vacía** → estado vacío con ícono (Tabler) y mensaje en voz al usuario, no un hueco en blanco.
- **Diálogos con submit**: deshabilitar el submit mientras cualquier mutation del form esté `isPending` (OR compuesto si hay varias).
- **Listas paginadas por cursor** (ver `backend-conventions.md` § Paginación por cursor): se consumen con `useInfiniteQuery` — `getNextPageParam: (ultima) => ultima.nextCursor ?? undefined`; las filas se arman con `data?.pages.flatMap((p) => p.items) ?? []`; la UI es **forward-only con botón "Cargar más"** (`hasNextPage` + `fetchNextPage()`, con texto `"Cargando…"` mientras `isFetchingNextPage`), no un paginador de saltar-a-página-N. Ej.: `src/pages/admin/ventas.tsx`.
- **Formularios hidratados desde una query** (editar una config que ya existe): la `useQuery` se declara antes de los `useState` del form y un `useEffect` **sincroniza** el estado local cuando llegan los datos. **Early-return en `isError` / sin-data ANTES de renderizar el form editable**: pintar el form en blanco con Guardar activo pisaría los datos reales con vacíos (regresión de pérdida de datos). Ej.: la card de config de Tienda en `src/pages/admin/configuracion.tsx`.

## Diálogos destructivos

- Acciones destructivas con `variant="destructive"` y `DialogDescription` SIEMPRE presente (requisito de accesibilidad de Radix + claridad de qué se va a borrar).
- Cuando una segunda feature necesite confirmar un borrado, extraer un componente de confirmación reutilizable a un directorio compartido en vez de repetir el diálogo ad-hoc.

## Idioma

- UI en **español** (strings hardcodeados — no hay i18n).
- **Español neutro**: "tienes", "puedes", "elige" (no voseo).
- **Excepción al hardcodeo**: el nombre de la app se consume SIEMPRE desde la config (`APP_CONFIG.name` en `~/config/app`, cuando se cree) — nunca escribirlo literal en JSX/títulos. Hoy el nombre de marca está pendiente (ver `docs/design.md`).

## Formato de dinero

- **Los helpers viven en `~/lib/formato`** (única fuente): `clp(monto)` formatea CLP con `Intl.NumberFormat("es-CL")` y acepta el **string `Decimal`** del server o un `number` ya cruzado; `num(n)` formatea enteros con separador de miles (conteos, NO montos); `fechaHora(d)` da fecha+hora corta es-CL. **Nunca** re-crear un `Intl.NumberFormat` inline en una página ni concatenar `$` a un monto ya formateado.
- Montos con **`tabular-nums`** en tablas y listas (cifras de ancho fijo — las columnas de precios no "bailan").
- **Input de monto** (crear/editar precio): el `$` es un afijo **visual** (no parte del valor) — un `<span>` posicionado absoluto y no-interactivo (`pointer-events-none`, `text-muted-foreground`) sobre un `Input` con `pl-7 tabular-nums` e `inputMode="numeric"` (teclado numérico en móvil). El valor se maneja como **string** en el estado del form y viaja como string al server (CLP entero ⇒ `Decimal`), jamás como `number`. Ej.: `src/pages/admin/productos.tsx`.
- El dinero del dominio es `Decimal` (precio, total, IVA, comisión de Flow, neto). El cruce a `number` ocurre SOLO en el borde de presentación para formatear, y es seguro porque CLP no tiene decimales — jamás hacer aritmética con ese `number` ni mandarlo de vuelta al server (ver `CLAUDE.md` § Regla de oro y `CONTEXT.md` § Dinero).
