# Design — libros-iselk

**Línea gráfica de la marca.** Fuente de verdad para TODO artefacto visual: la app y cualquier asset. Los agentes leen este archivo antes de generar algo visual.

> ⚠️ **SEED — la identidad de marca está PENDIENTE, y tras el pivote SaaS (ADR-0005) hay DOS niveles de identidad.** (1) La **marca de la PLATAFORMA** (nombre, paleta, tipografía — pendientes; ya no es una marca del fandom ARMY: es la marca del SaaS, ligada a la decisión de dominio #4). (2) El **theming per-tenant**: cada Tienda configura logo/colores/textos sobre la plantilla base (F06 del roadmap) — la identidad ARMY vive, si acaso, en la tienda del tenant piloto, no en la plataforma. **No inventar dirección visual de marca.** Resolver en una sesión dedicada (`frontend-design` / `domain-planner`) y volcar acá lo aprobado. Lo que sigue son las reglas **estructurales** que ya fija el stack; las secciones `PENDIENTE` se completan al definir la marca de la plataforma y el sistema de theming.

> **Librería de UI: Mantine 7** (ADR-0011, decisión cerrada 2026-07-17 — reemplaza a shadcn/ui). Tailwind convive acotado a utilities de layout. Reglas duras en `docs/agents/frontend-conventions.md`.

## 1. Esencia de la marca — PENDIENTE

Producto: **plataforma SaaS de tiendas con sorteo** (compradores mayoritariamente mobile → storefront **mobile-first**). Doble audiencia: Organizadores (confianza, claridad para operar y cobrar) y Compradores (la marca que ven es la de la TIENDA, con disclaimer de la plataforma — ADR-0008). Nombre de la plataforma: pendiente (codename del repo: `libros-iselk`). Cuando se decida, vive en `src/config/app.ts` (`APP_CONFIG.name`) — la UI lo consume de ahí, nunca hardcodeado. El theming per-tenant (logo/colores/textos de cada Tienda) es **dato, no código**: sale del modelo `Tenant` y se aplica como theme override de Mantine (`mergeThemeOverrides` sobre el theme base, ADR-0011), jamás hardcodeado en componentes.

## 2. Paleta — PENDIENTE

A definir con el cliente. **Hoy rige el theme casi-default de Mantine** como placeholder (`src/styles/theme.ts`, `createTheme`); al cerrar la paleta de marca se vuelca ahí — nada más. Reglas duras que regirán **cualquiera** sea la paleta:

- La paleta vive en el **theme de Mantine** (`src/styles/theme.ts`): tuplas de 10 tonos en `theme.colors` + `primaryColor`. Cambiar la paleta = editar el theme, **nunca** hex inline en componentes ni clases de color Tailwind.
- Los componentes consumen color vía props semánticas de Mantine (`color`, `c`, `bg`, `variant`) o CSS vars `--mantine-color-*` — un color = un token del theme.
- **`red` reservado** para errores / acciones destructivas.
- Definir una semántica clara para los estados de **comercio** (ej. "pagado / vendido" positivo, "pendiente", "fallido") al cerrar la paleta — distinta de la semántica financiera de un banco. Mientras tanto rige el patrón provisorio del `estado-badge`: badge neutro outline + punto de color inline.

## 3. Tipografía — PENDIENTE

Hoy el scaffold trae **Geist** (`next/font`), cableada al theme de Mantine (`theme.fontFamily`). La familia definitiva se decide con la marca. Reglas que regirán:

- Jerarquía por **peso y tamaño**, no por familia.
- **Montos** siempre con `tabular-nums` (cifras de ancho fijo — las columnas de precios no "bailan").

## 4. Espaciado, formas y elevación

- Layout con utilities Tailwind estándar (`gap-4`/`gap-6`, `p-4`/`p-6`); dentro de componentes Mantine, su escala de spacing (`xs…xl`).
- **Mobile-first**: el chrome se aprieta en móvil (gutter `px-4` bajo `lg`, `lg:px-8` en desktop). El público es mayoritariamente mobile.
- Radios: `theme.defaultRadius = "md"` (~0.5rem). No fijar radios por componente salvo decisión registrada.
- Elevación: preferir **bordes sobre sombras** (`Card withBorder`); sombras solo sutiles (`shadow="sm"`) en superficies flotantes (Popover/Menu las traen por defecto).

## 5. Layout y componentes

- Componentes siempre de **Mantine 7** (`@mantine/core` + `form`/`modals`/`notifications`/`hooks`). Ver `docs/agents/frontend-conventions.md` para las reglas duras (theming, formularios, notificaciones, montos).
- **Íconos**: `@tabler/icons-react` es la **única** librería de íconos (navegación, acciones, estados, dominio — y es la que la doc de Mantine usa). Named imports, tree-shakeado.
- Superficies clave: storefront del Comprador (catálogo/carrito/checkout mobile-first, tematizado per-tenant — F06), panel de Organizador (`AppShell`: productos, ventas, sorteo, configuración), panel del Operador (F08).

## 6. Data-viz

- El panel tendrá métricas simples (ventas, ingresos). Cuando lleguen charts, el default es **`@mantine/charts`** (construido sobre Recharts, ya instalado): hereda los colores del theme. Mantener la restricción: **nunca más de 5 series**; grid lines sutiles; tooltips discretos. Paleta de charts a derivar de la paleta de marca (§2).

## 7. Motion

Identidad de movimiento por defecto: **preciso y calmado** — nada rebota, nada gira (ajustable al cerrar la marca; el fandom podría pedir más energía). Las transiciones default de Mantine (fades/pops de Modal, Menu, Tooltip) ya cumplen esta identidad — no customizarlas sin decisión registrada.

| Token | Valor | Uso |
|---|---|---|
| `duration-fast` | 150ms | Hover, focus, toggles |
| `duration-base` | 250ms | Transiciones de UI, fades, dropdowns |
| `duration-slow` | 400ms | Entradas de cards/secciones |

- Respetar `prefers-reduced-motion` globalmente (Mantine lo respeta con `theme.respectReducedMotion: true` — dejarlo activado).
- Anti-patrón (default): springs exagerados, parallax, zooms dramáticos. Revisar al definir la marca.

## 8. Voz y tono

- **Español neutro**: "tienes", "puedes", "elige" (no voseo). UI con strings hardcodeados (sin i18n).
- Tono cercano al fandom sin sacrificar la confianza necesaria para pagar. Afinar al cerrar la marca.
- **Montos**: siempre `Intl.NumberFormat` (CLP) vía `~/lib/formato` — nunca concatenar `$` a mano.

## 9. Reglas duras y anti-patrones

- Cambios de paleta **solo** en el theme de Mantine (`src/styles/theme.ts`) — nunca hex inline en componentes.
- Tailwind **solo para layout** (flex/grid/gap/spacing/responsive); **prohibidas** las clases de color, tipografía y sombra de Tailwind (`bg-blue-900`, `text-zinc-500`…) — eso es territorio del theme de Mantine.
- Color dinámico (el color elegido por un tenant) vía theme override / `style={{}}` desde datos — no interpolar clases (`bg-${x}` no sobrevive el purge de Tailwind).
- `color="red"` reservado para errores / acciones destructivas.
- Dark mode: vía `colorScheme` de Mantine (decidir si hay toggle al definir la marca; hoy `defaultColorScheme="light"`).
- No introducir colores fuera del theme sin actualizar primero este archivo con aprobación del usuario.

## Decisiones pendientes

- [ ] **Identidad de marca**: nombre, paleta, tipografía (sesión `frontend-design` — ligado a `docs/decisiones-abiertas.md`).
- [ ] Semántica de color para estados de comercio (pagado / pendiente / fallido).
- [ ] Toggle de dark mode en la UI.
- [ ] Diseño de la plantilla base del storefront + qué campos del `Tenant` alimentan el theme override (F06).
