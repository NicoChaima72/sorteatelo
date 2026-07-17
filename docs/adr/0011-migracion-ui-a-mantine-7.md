# Librería de UI: Mantine 7 (migración desde shadcn/ui)

Toda la UI de la plataforma (panel de Organizador/Operador, login, y desde F06 el storefront
tematizado) se construye con **Mantine 7** (`@mantine/core` + `hooks`/`form`/`modals`/`notifications`).
shadcn/ui + Radix + CVA se retiran del código de app. Decisión **cerrada por el usuario el
2026-07-17** (vinculante), tomada con el panel recién nacido — el momento más barato posible.

Razones:

- **Fluidez del Operador a largo plazo**: el Operador de plataforma mantiene `datawalt-app`
  (su producto principal) sobre `@mantine/core` 7.17 + hooks/dates/form/modals/notifications/charts
  en producción. Este proyecto lo opera una sola persona; que la UI hable el ecosistema que esa
  persona domina vale más que cualquier preferencia de librería ("simple y barato" incluye el costo
  cognitivo de mantenimiento).
- **Inversión shadcn aún chica**: 11 componentes en `src/components/ui/`, 6 páginas y 3 componentes
  de panel los consumen. La migración es un día de trabajo hoy; tras F06 (storefront) sería una
  reescritura.
- **Theming runtime per-tenant (F06)**: la Plantilla configurable exige tematizar el storefront con
  datos del modelo `Tenant` (logo/colores/textos) resueltos por request. `MantineProvider` acepta un
  `theme` **objeto JS en runtime** — el override per-tenant es merge de datos sobre el theme base
  (`mergeThemeOverrides`), sin regenerar CSS variables a mano ni tocar build. Con shadcn/Tailwind el
  theming es estático por diseño (CSS vars en build) y habría que reconstruir ese mecanismo a mano.

## Decisión

- **Componentes de UI** → Mantine 7 (`@mantine/core`). Paquetes adoptados: `core`, `hooks`, `form`,
  `modals`, `notifications` (mismas majors que datawalt-app). Otros (`dates`, `charts`, `carousel`)
  se agregan **cuando una feature los necesite**, no preventivamente.
- **Theming** → un theme base de la Plataforma (`createTheme` en `src/styles/theme.ts`) consumido
  por `MantineProvider` en `_app.tsx`. La identidad de marca sigue **PENDIENTE** (`docs/design.md`):
  el theme base arranca casi-default y la paleta de marca se vuelca ahí cuando se cierre.
- **Theming per-tenant (F06)** → el storefront arma su theme por request:
  `mergeThemeOverrides(themeBase, overrideDesdeTenant)` con los datos de la Tienda resueltos
  server-side (ADR-0007). El theming per-tenant es **dato, no código** — jamás un theme hardcodeado
  por tenant.
- **Tailwind CSS conviven** — acotado a **utilities de layout** (flex/grid/gap/spacing/responsive/
  truncate). Colores, tipografía, radios y sombras salen SIEMPRE del theme de Mantine, nunca de
  clases Tailwind. Se eliminan del `tailwind.config.ts` los tokens shadcn (colors semánticos,
  borderRadius por CSS var, plugin `tailwindcss-animate`). **Supuesto revisable (S-TW)**, criterio:
  (a) datawalt-app corre esta convivencia exacta en producción (PostCSS solo-tailwind, estilos
  Mantine importados después de `globals.css`); (b) las maquetas de landing (`src/components/landing/`,
  pre-F06, throwaway) están escritas 100% en Tailwind — retirarlo obligaría a reescribir código que
  muere en F06; (c) el costo de mantenerlo es ~0. Si la convivencia diera fricción real (ej. el
  preflight pisando estilos Mantine), el fallback es `corePlugins: { preflight: false }` antes que
  retirar Tailwind.
- **Íconos** → `@tabler/icons-react` queda como **única** librería de íconos (es además la que la
  doc de Mantine usa). `lucide-react` muere con shadcn.
- **Se retira**: `src/components/ui/` completo, `components.json`, y las deps huérfanas
  `@radix-ui/react-*` (dialog, dropdown-menu, label, select, separator, slot),
  `class-variance-authority`, `tailwindcss-animate`, `lucide-react`. Se **conservan** `clsx` +
  `tailwind-merge` (el helper `cn()` sigue siendo útil para clases de layout condicionales),
  `prettier-plugin-tailwindcss`, `@tabler/icons-react`, `recharts` y `embla-carousel-*` (los usan
  las maquetas de landing; F06 decide su destino).

## Consecuencias

- `docs/design.md` y `docs/agents/frontend-conventions.md` pasan a ser **Mantine-céntricos**
  (actualizados en la misma sesión que este ADR). La regla de oro visual cambia de "tokens shadcn en
  CSS vars" a "tokens del theme de Mantine"; sigue prohibido el hex inline en componentes.
- La migración del código existente es la task `tasks/26-07-17-ui-migracion-mantine.md`: login +
  5 páginas del panel + `admin-layout`/`estado-badge`/`stat-card`. Las páginas dev throwaway
  (`/dev/checkout*`) **no se migran** — mueren en F06.
- F06 hereda el mecanismo de theming resuelto: la sesión de diseño de la plantilla base define el
  theme, no el mecanismo.
- El CLI de shadcn ya no se usa; el gotcha HSL/oklch de Tailwind v3 documentado en las convenciones
  queda obsoleto y se elimina de los docs.
- No se agrega `postcss-preset-mantine`: solo hace falta para escribir CSS propio con mixins de
  Mantine, cosa que no hacemos (datawalt-app tampoco lo usa). Si algún día se escribe CSS custom con
  `rem()`/`light-dark()`, se agrega en ese momento.
- ADRs previos intactos: esta decisión es ortogonal a dominio, pagos y tenancy. La que toca es la
  implementación de la [[Plantilla]] (CONTEXT.md) — el concepto no cambia, solo su vehículo técnico.
