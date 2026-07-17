---
slug: ui-migracion-mantine
status: testing               # planning | implementing | testing | done
owner: nicolas
created: 2026-07-17
related_adrs: [ADR-0011]
related_context: [Plantilla, Organizador, Operador de plataforma, Tienda]

features:
  - id: F01
    behavior: "Infraestructura Mantine 7 instalada y cableada: deps core/hooks/form/modals/notifications, providers en _app (orden de estilos correcto), ColorSchemeScript en _document, theme base en src/styles/theme.ts, tailwind.config depurado a layout-only"
    state: active

  - id: F02
    behavior: "Shell y componentes compartidos del panel migrados a Mantine: AdminLayout (AppShell + Burger/useDisclosure), EstadoBadge (Badge outline + punto de color), StatCard (Card withBorder) — mismo comportamiento visible que hoy"
    state: active

  - id: F03
    behavior: "Login + las 5 páginas del panel (index, productos, ventas, sorteo, configuracion) migradas a componentes Mantine conservando funcionalidad exacta: loading/error/empty, forms (@mantine/form), confirmaciones destructivas (openConfirmModal), notificaciones de mutations, cursor 'Cargar más', input de monto string"
    state: active

  - id: F04
    behavior: "shadcn retirado por completo: src/components/ui/ y components.json eliminados, deps huérfanas desinstaladas (radix, cva, tailwindcss-animate, lucide-react), y npm run check verde (tsc + lint + vitest 145)"
    state: active
---

# Migración de UI: shadcn/ui → Mantine 7

## Contexto

Decisión cerrada del usuario (2026-07-17, vinculante — **ADR-0011**): la UI migra de shadcn/ui a
**Mantine 7**, el ecosistema que el Operador de plataforma domina (datawalt-app corre
`@mantine/core` 7.17 + hooks/form/modals/notifications en producción). El momento es el más barato:
el panel de F05 recién nació (6 páginas, 11 componentes shadcn, 3 componentes de panel) y F06
(storefront tematizado per-tenant) todavía no existe — y su theming per-tenant encaja natural con el
`theme` runtime de `MantineProvider`. `docs/design.md` y `docs/agents/frontend-conventions.md` ya
fueron reescritos Mantine-céntricos en la sesión de planning; esta task ejecuta la migración del
código.

Alcance: `src/pages/login.tsx`, las 5 páginas de `src/pages/admin/`, los 3 componentes de
`src/components/admin/`, `_app.tsx`, `_document.tsx` (nuevo), configs. **NO** se migran las páginas
dev throwaway (`/dev/checkout`, `/dev/checkout/retorno` — mueren en F06; no importan `ui/`, no se
rompen) ni las maquetas de landing (`index.tsx` + `src/components/landing/` — Tailwind puro, pre-F06,
solo deben seguir compilando).

## Decisiones

- D1: **Mantine 7 (major pineada), no 8** — misma major que datawalt-app: la fluidez del Operador es
  LA razón de la migración (ADR-0011); no estrenar una major que su referencia no usa.
- D2: **Tailwind convive, acotado a layout** (ADR-0011, supuesto S-TW): se conservan
  `tailwindcss`/`clsx`/`tailwind-merge`/`prettier-plugin-tailwindcss`; se depura
  `tailwind.config.ts` (fuera colores shadcn, borderRadius por CSS var y `tailwindcss-animate`) y
  `globals.css` (fuera las variables HSL de shadcn; quedan las directivas `@tailwind`).
- D3: **Orden de estilos = patrón datawalt**: `globals.css` (Tailwind) importado ANTES de
  `@mantine/core/styles.css` en `_app.tsx`. Sin `postcss-preset-mantine`. Si el preflight de
  Tailwind pisara estilos Mantine, el fix es `corePlugins: { preflight: false }` — no retirar
  Tailwind (revisable).
- D4: **Migración 1:1 de comportamiento, cero rediseño**: la marca sigue PENDIENTE (`design.md`);
  el theme base es casi-default (Geist + `defaultRadius: "md"` + `respectReducedMotion`). Nada de
  paleta nueva, nada de layout nuevo — misma información, mismos flujos, mismos textos.
- D5: **Forms del panel → `@mantine/form`** (crear/editar producto, configuración): deja la
  convención ejemplificada. El input de monto mantiene el patrón **string** (`TextInput` +
  `leftSection="$"` + `inputMode="numeric"`); prohibido `NumberInput` para dinero (ver
  frontend-conventions § Formato de dinero).
- D6: **Confirmaciones destructivas → `openConfirmModal`** de `@mantine/modals`; feedback de
  mutations → `@mantine/notifications`. Reemplazan los `Dialog` ad-hoc y cualquier feedback textual
  improvisado.
- D7: **Se eliminan** `src/components/ui/` y `components.json`; **se desinstalan**
  `@radix-ui/react-dialog|dropdown-menu|label|select|separator|slot`, `class-variance-authority`,
  `tailwindcss-animate`, `lucide-react`. **Se conservan** `@tabler/icons-react` (única librería de
  íconos), `recharts` y `embla-carousel-*` (landing maqueta; F06 decide).
- D8: **Dev pages throwaway NO se migran** (`/dev/checkout*`): mueren en F06. Anotado también en
  ADR-0011.
- D9: Docs de dominio/diseño ya actualizados en planning (ADR-0011 creado; `docs/design.md` y
  `frontend-conventions.md` Mantine-céntricos) — el implementer NO los reescribe, solo los sigue.
  Quedan de esa sesión dos deudas menores diferidas a esta task por el change-set-reviewer de F05:
  naming de procedures y voseo del CLI — solo si tocan archivos ya en el diff; no abrir frentes.

## Plan

1. **Deps**: `npm install @mantine/core@^7 @mantine/hooks@^7 @mantine/form@^7 @mantine/modals@^7
   @mantine/notifications@^7`. No tocar nada más del package.json todavía. (F01)
2. **Theme base**: crear `src/styles/theme.ts` (`createTheme`: `fontFamily` Geist,
   `defaultRadius: "md"`, `respectReducedMotion: true`; sin colores de marca — PENDIENTE). (F01)
3. **`_app.tsx`**: imports de estilos en orden (globals.css → core → notifications), árbol
   `SessionProvider` → `MantineProvider theme defaultColorScheme="light"` → `ModalsProvider` →
   `<Notifications />` + `Component`. Mantener Geist como hasta ahora. (F01)
4. **`_document.tsx`** (nuevo): documento pages-router estándar + `ColorSchemeScript`. (F01)
5. **Depurar Tailwind**: `tailwind.config.ts` (quitar `colors` shadcn, `borderRadius` por var,
   plugin animate; conservar `content`, `fontFamily`, `darkMode`) y `src/styles/globals.css`
   (quitar los bloques `:root`/`.dark` de variables shadcn; quedan las `@tailwind`). Verificar que
   la landing maqueta siga compilando (usa Tailwind crudo, no tokens shadcn). (F01)
6. **Componentes compartidos**: `admin-layout.tsx` → `AppShell` (`AppShell.Navbar` colapsable
   mobile con `Burger` + `useDisclosure`, header con título/acciones, `Skeleton`/error/empty states
   idénticos), `estado-badge.tsx` → `Badge variant="outline"` + punto inline (patrón provisorio
   intacto), `stat-card.tsx` → `Card withBorder`. (F02)
7. **`login.tsx`**: `Button` de Mantine (mismo flujo signIn Google + estados de error). (F03)
8. **Páginas admin una por una** — `index` (KPIs + tabla resumen, rama `isError` con Reintentar
   intacta), `ventas` (tabla + cursor "Cargar más"), `productos` (tabla + Modal crear/editar con
   `useForm`, input de monto string, `openConfirmModal` para desactivar/eliminar, notificaciones),
   `sorteo` (tabla participaciones + confirmación de ejecución — **cuidado: acción irreversible**,
   `openConfirmModal` con texto explícito), `configuracion` (form hidratado desde query:
   early-return en error ANTES del form editable — regresión de pérdida de datos). Reemplazos
   mecánicos: `Table` shadcn→Mantine (`Table.ScrollContainer` en mobile), `Skeleton`, `Select`,
   `Input`+`Label`→`TextInput`. (F03)
9. **Retiro shadcn**: borrar `src/components/ui/` y `components.json`; `npm uninstall` de las deps
   D7; grep de imports muertos (`~/components/ui/`, `lucide-react`, `class-variance-authority`).
   (F04)
10. **Gates + cierre**: `npm run check` completo (tsc, lint, vitest 145 — la migración no toca
    server, la suite DEBE quedar intacta); smoke visual en el dev server **existente en :3001** (NO
    levantar otro); `frontend-reviewer` sobre el diff de UI; `change-set-reviewer` al final con la
    lista de archivos + este plan. (F04)

## Validaciones

### F01 — Infraestructura Mantine

**Vitest** (integration):
- [ ] (no aplica — infraestructura de UI sin lógica testeable por Vitest; el gate es `npm run check` completo verde)

**E2E** (browser, dev server :3001):
- [ ] La app levanta sin errores de consola de estilos; tipografía Geist y estilos Mantine presentes (no botones "pelados" por conflicto de preflight). — smoke curl (feature-implementer): `/login` HTTP 200 con markup Mantine (`mantine-Button/Stack/Text/Title` + CSS vars `--mantine-color-*`) y copy esperada; `/admin` HTTP 307→`/login` (guard OK). E2E visual con sesión pendiente (sesión principal).

### F02 — Shell del panel

**Vitest**:
- [ ] (no aplica — componentes presentacionales; cubre E2E)

**E2E**:
- [ ] `/admin` con sesión: sidebar con navegación activa, título/acciones en header, colapso mobile (Burger) funciona; estados sin-tienda / error / loading del layout se conservan.

### F03 — Login + 5 páginas migradas

**Vitest**:
- [ ] (no aplica — la lógica vive en el server, ya cubierta por la suite existente)

**E2E** (con datos reales; cubre de paso los ítems E2E-con-sesión diferidos de F05):
- [ ] Login con Google desde `/login` llega a `/admin`.
- [ ] `/admin` muestra KPIs y resumen con datos reales; el fallo de la query muestra error + Reintentar.
- [ ] `/admin/productos`: crear y editar un producto vía Modal + `useForm` (precio como string con `$` visual); desactivar pide confirmación (`openConfirmModal`); la tabla refresca vía invalidación.
- [ ] `/admin/ventas`: tabla con montos `clp()` + `tabular-nums`; "Cargar más" pagina por cursor.
- [ ] `/admin/sorteo`: participaciones visibles; el botón de ejecutar abre confirmación explícita (NO ejecutar — reservado al usuario).
- [ ] `/admin/configuracion`: el form se hidrata desde la query y guarda; con la query en error NO se muestra el form editable.

### F04 — Retiro shadcn + gates

**Vitest**:
- [ ] `vitest run` completo verde (145 tests, 0 fallos — sin regresión server). — `npx vitest run` (feature-implementer 2026-07-17): 28 files / 145 tests passed, exit 0.

**E2E**:
- [ ] `npm run check` (tsc + lint + vitest) exit 0 con `src/components/ui/` eliminado y deps D7 desinstaladas; cero imports residuales de `~/components/ui/` / `lucide-react` / `class-variance-authority` (grep). — gate corrido pieza por pieza (feature-implementer): `npx tsc --noEmit` exit 0, `npx next lint` 0 warnings/errors, `npx vitest run` 145/145 exit 0; grep de `~/components/ui/|lucide-react|class-variance-authority|tailwindcss-animate|@radix-ui` en `src/` = 0 matches; `src/components/ui/` y `components.json` eliminados.

## Invariantes

- I1: **Cero cambios de comportamiento del server**: no tocar `src/server/**`, routers, schema, env.
  La suite Vitest existente (145) debe pasar sin editar ningún test.
- I2: **Dinero**: montos siempre vía `~/lib/formato` (`clp`/`num`); el precio viaja como **string**
  (jamás `NumberInput` ni aritmética `number` en el cliente).
- I3: **Sin dirección visual nueva**: marca PENDIENTE — theme casi-default, sin paleta, sin hex
  inline, sin clases de color Tailwind (design.md §9).
- I4: **Toda pantalla conserva sus tres estados** (loading Skeleton / error+Reintentar / empty) y el
  early-return del form hidratado de configuración (regresión de pérdida de datos).
- I5: **No migrar ni "mejorar"** `/dev/checkout*` ni la landing maqueta; solo deben compilar.
- I6: **Un solo dev server**: usar el que corre en :3001; NO levantar otro `next dev` (corrompe
  `.next`).
- I7: La ejecución del sorteo es **irreversible y reservada al usuario**: el E2E verifica el modal
  de confirmación sin confirmar.

## Out of scope

- Identidad de marca, paleta, dark mode toggle (sesión `frontend-design` pre-F06).
- Theming per-tenant del storefront (F06 — esta task solo deja el mecanismo `MantineProvider`).
- Migrar/redsiseñar landing maqueta y páginas dev throwaway.
- `@mantine/dates`, `@mantine/charts`, `@mantine/carousel` (se agregan cuando una feature los pida).
- Cambios de backend, schema o tests de server.

## Especialistas a consultar

- `frontend-reviewer` — revisión del diff de UI (patrones Mantine, estados, convenciones nuevas).
- `troubleshooter` — si aparecen conflictos de estilos Tailwind/Mantine (preflight) o hydration
  mismatches del pages router.
- `feature-tester` — E2E asistido con browser (aprovecha para cerrar los ítems E2E-con-sesión
  diferidos de F05).
- `change-set-reviewer` — diff completo antes de commit (incluye verificar deps desinstaladas y
  ausencia de imports muertos).

## Bitácora

- [2026-07-17 06:00] [planner-grill] (domain-planner) Task creada SIN grill por instrucción vigente
  del usuario (decisión Mantine cerrada 2026-07-17, vinculante). En la misma sesión: **ADR-0011**
  escrito (`docs/adr/0011-migracion-ui-a-mantine-7.md`, nivel 2: cambia la librería base de toda la
  UI, fija el mecanismo de theming per-tenant de F06 y restringe cada pantalla futura);
  `docs/design.md` y `docs/agents/frontend-conventions.md` reescritos Mantine-céntricos (marca sigue
  PENDIENTE). Decisión por criterio (supuesto S-TW del ADR): **Tailwind convive acotado a layout**,
  espejo del patrón en producción de datawalt-app (Mantine 7 + Tailwind 3.4, PostCSS solo-tailwind,
  estilos Mantine importados después de globals.css); se retiran radix/cva/animate/lucide y los
  tokens shadcn de config; se conservan clsx/tailwind-merge/prettier-plugin-tailwindcss/tabler/
  recharts/embla. Dev pages `/dev/checkout*` NO se migran (mueren en F06). INDEX y Bitácora del
  roadmap actualizados. **AWAITING USER APPROVAL** — implementación solo tras visto bueno explícito.
- [2026-07-17 07:10] [feature-implementer] Arranca implementación. Visto bueno del usuario dado
  (decisión Mantine cerrada, ADR-0011). Read pass completo: ADR-0011, `docs/design.md`,
  `frontend-conventions.md` (Mantine-céntricos), las 6 páginas + 3 componentes de panel, configs
  (tailwind/globals/postcss/components.json), panel router (para verificar mutations disponibles) y
  suite Vitest (28 archivos, todos server/domain — ninguno importa UI). Features pendientes: F01,
  F02, F03, F04.
- [2026-07-17 07:25] [feature-implementer] F01 implementada. Deps: `@mantine/core|hooks|form|modals|
  notifications@^7.17.8` (misma major que datawalt-app, D1). Instaladas con `--ignore-scripts` para
  esquivar el lock EPERM del query engine de Prisma (dev server en :3001 lo tiene tomado); el client
  ya estaba generado, así que saltar el `postinstall prisma generate` es seguro. Archivos: creados
  `src/styles/theme.ts` (createTheme casi-default: Geist + defaultRadius "md" + respectReducedMotion,
  SIN paleta — marca PENDIENTE), `src/pages/_document.tsx` (ColorSchemeScript + Geist en `<html>` vía
  `.className` + `.variable`); reescritos `src/pages/_app.tsx` (orden de estilos globals→core→
  notifications + árbol SessionProvider→MantineProvider→ModalsProvider→Notifications), `tailwind.
  config.ts` (a layout-only: fuera colors/borderRadius/animate; quedan content/darkMode/fontFamily),
  `src/styles/globals.css` (solo las 3 directivas `@tailwind`; fuera los bloques HSL shadcn, el
  `@apply bg-background/border-border` y el acento `.admin`). Decisión táctica registrada: el acento
  violeta del panel (`.admin --primary`) era placeholder shadcn; se retira → el panel queda con el
  primary casi-default de Mantine (azul). Dentro de D4 (casi-default, sin paleta nueva). Reviewers
  (frontend-reviewer) + gates completos diferidos al cierre de la migración por instrucción del
  usuario (un solo pase al final). El gate `tsc` NO corre limpio hasta F04 porque las páginas aún
  importan `~/components/ui/*`.
- [2026-07-17 07:45] [feature-implementer] F02 implementada. Archivos migrados 1:1 a Mantine:
  `estado-badge.tsx` (shadcn Badge → `@mantine/core` Badge `variant="outline" color="gray"` + punto
  de color en `leftSection`, label en caso normal via `styles.label`; hex inline conservado = misma
  excepción documentada design.md §2/§9), `stat-card.tsx` (Card shadcn → `Card withBorder` + Group/
  Text; icono con tinte `var(--mantine-primary-color-filled)`; valor conserva `tabular-nums`),
  `admin-layout.tsx` (shell custom con sidebar fixed + overlay manual → `AppShell` con
  `header`/`navbar`/`main`; navbar colapsable en mobile con `Burger` + `useDisclosure` (reemplazan
  IconMenu2/IconX y el estado `useState(open)`); nav con `NavLink component={Link}` + `active`;
  separadores con `Divider`; los 3 estados loading `Skeleton` / error+Reintentar / sin-tienda
  intactos). Auto-chequeo design.md: (a) tokens — cero hex inline salvo la excepción del badge de
  comercio; cero clases de color/tipografía Tailwind (solo layout: flex/grid/min-w-0/max-w-*/
  tabular-nums); color siempre por prop Mantine (`c`, `color`) o CSS var `--mantine-*`. (b) semántica
  financiera — N/A en estos 3 (montos se formatean en las páginas F03 via `~/lib/formato`). (c)
  motion — defaults de Mantine + `respectReducedMotion` en theme (§7). OK.
- [2026-07-17 08:30] [feature-implementer] F03 implementada. Login + 5 páginas migradas 1:1 a
  Mantine. Archivos: `login.tsx` (Button/Title/Text/Stack; mismo flujo signIn Google + error `c="red"`),
  `admin/index.tsx` (SimpleGrid de StatCards + Card/Table.ScrollContainer para "Últimas ventas"; rama
  isError con Reintentar intacta), `admin/ventas.tsx` (Card p=0 + Table + "Cargar más" con
  `loading={isFetchingNextPage}` sobre `useInfiniteQuery` por cursor — sin cambios de fetching),
  `admin/productos.tsx` (Modal + `@mantine/form useForm` con validate mínimo titulo/precio; precio
  string con `leftSection="$"` + `inputMode="numeric"` + `tabular-nums` (I2, NO NumberInput);
  notificaciones verde/roja en crear/actualizar; Avatar para iniciales; ActionIcon editar),
  `admin/sorteo.tsx` (**openConfirmModal** de `@mantine/modals` reemplaza el Dialog ad-hoc para la
  ejecución IRREVERSIBLE — abre confirmación explícita `confirmProps.color="red"`, NO auto-ejecuta,
  I7; error/éxito por notificación), `admin/configuracion.tsx` (ambas cards a `useForm`;
  CredencialFlow write-only con estado por Paper+Badge; ConfiguracionTienda hidratada con
  `form.setValues` en useEffect y **early-return en isError/!data ANTES del form editable** — I4
  regresión de pérdida de datos preservada; notificaciones).
  Auto-chequeo design.md: (a) tokens — cero clases de color/tipografía Tailwind; color por props
  Mantine (`c`, `color`, variants) o CSS var `--mantine-*`; el único hex es el `colorPrimario`
  placeholder que es DATO del tenant, no color de componente. (b) semántica financiera — montos SOLO
  via `~/lib/formato` (`clp`/`num`) + `tabular-nums`; ningún `Intl.NumberFormat` inline; dinero como
  string end-to-end. (c) motion — defaults Mantine + reduced-motion. OK.
  **FLAG para el usuario** (decisión acotada por invariante, no bloqueé): el Plan step 8 y la
  Validación de F03 mencionan "openConfirmModal para **desactivar/eliminar**" en productos, pero la
  página actual NO tiene acción destructiva standalone (la desactivación es reversible, vía el Select
  Estado dentro del modal de edición) y el `panelRouter` no expone `eliminarProducto`. Por I3/D4
  (migración 1:1, mismos flujos, cero server changes) preservé ese flujo y NO inventé un botón
  "Desactivar" + confirm nuevo. openConfirmModal quedó aplicado donde SÍ hay acción destructiva e
  irreversible y ya existía un Dialog ad-hoc: la ejecución del sorteo (D6 "reemplazan los Dialog
  ad-hoc"). Si el usuario quiere una acción desactivar/eliminar con confirm en productos, es scope
  nuevo (posible sin tocar server usando `actualizarProducto(activo:false)`) — decide.
- [2026-07-17 08:55] [feature-implementer] F04 implementada. Retiro shadcn completo: eliminados
  `src/components/ui/` (11 componentes) y `components.json`. `npm uninstall` (con `--ignore-scripts`,
  mismo lock EPERM) de las 9 deps D7: `@radix-ui/react-{dialog,dropdown-menu,label,select,separator,
  slot}`, `class-variance-authority`, `tailwindcss-animate`, `lucide-react` (37 paquetes removidos).
  Conservadas y verificadas presentes: `clsx`, `tailwind-merge`, `@tabler/icons-react`, `recharts`,
  `embla-carousel-*`. Grep en `src/` de imports residuales (`~/components/ui/`, `lucide-react`,
  `class-variance-authority`, `tailwindcss-animate`, `@radix-ui`, `components.json`) = 0 matches.
  GATES (corridos por el implementer por instrucción del usuario, brief ítem 2): `npx tsc --noEmit`
  exit 0 · `npx next lint` "No ESLint warnings or errors" · `npx vitest run` 28 files / **145 tests
  passed** exit 0 (I1 intacto — la migración no tocó `src/server/**`). Smoke visual en el dev server
  EXISTENTE de :3001 (NO se levantó otro, I6): `/login` 200 con Mantine renderizado, `/admin` 307→
  login (guard). Falta: frontend-reviewer al cierre (siguiente) + E2E con sesión (sesión principal).
- [2026-07-17 09:05] [feature-implementer] frontend-reviewer sobre el diff completo de UI (17
  archivos). **Veredicto: APPROVE, 0 blockers.** Confirmó: orden de imports de estilos (D3), árbol de
  providers, theme casi-default sin paleta, `_document` con ColorSchemeScript, tailwind/globals
  depurados, estado-badge (hex = excepción documentada), AppShell + Burger/NavLink con los 3 estados,
  0 `NumberInput` (I2, precio string), openConfirmModal solo en la ejecución irreversible del sorteo
  con `confirmProps.color="red"` (I7), notifications en las mutations, @mantine/form en los 3 forms,
  early-return de configuracion ANTES del form editable (I4). Dos NITs: (1) `stat-card.tsx` usaba
  `style={{fontSize,lineHeight}}` en vez de props Mantine `fz`/`lh` — **corregido** (`fz="1.5rem"
  lh={1.2}`; el `letterSpacing` queda como `style` porque Mantine no tiene prop, avalado por el
  reviewer); tsc re-verde. (2) Alineación de celdas de tabla vía Tailwind `text-right`/`text-center`
  (24 usos) en vez de la prop `ta` de Mantine — el reviewer lo dejó como NIT/candidato a fijar en
  `frontend-conventions.md` (¿`ta` de Mantine vs Tailwind para alinear celdas?), no como blocker. NO
  lo convertí (24 sitios, decisión de convención borderline: text-align es arguablemente "layout") ni
  edité el doc de convenciones sin permiso — lo elevo al usuario en el resumen (ver más abajo).
- [2026-07-17 09:10] [feature-implementer] Implementación completa. F01..F04 escritas, gates verdes
  (tsc/lint/vitest 145/145), frontend-reviewer APPROVE. shadcn retirado por completo. status →
  `testing`. E2E visual con sesión + feature-tester quedan para la sesión principal (por instrucción
  del usuario: sin feature-tester, sin commit/push en esta sesión). Roadmap + INDEX actualizados con
  tag [MANTINE].
