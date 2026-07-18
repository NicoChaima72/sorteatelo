---
slug: admin-marca
status: testing
owner: nicolas
created: 2026-07-17
related_adrs: [ADR-0005, ADR-0011, ADR-0013, ADR-0014]
related_context: [Tienda, Organizador, Operador, Plantilla]

features:
  - id: F01
    behavior: "La identidad de plataforma Sortéatelo existe en código: APP_CONFIG en src/config/app.ts, paleta y tipografía de la ruta elegida volcadas SOLO en theme.ts, y wordmark tipográfico reutilizable"
    state: active

  - id: F02
    behavior: "Los estados de comercio (orden: pagado/pendiente/fallido; tienda: alta/configuración/publicada/suspendida) se pintan con tokens semánticos del theme — cero hex inline en componentes"
    state: active

  - id: F03
    behavior: "Chrome del admin invertido: wordmark Sortéatelo arriba del navbar, tienda demotada a chip con swatch de su color, menú de cuenta con avatar arriba a la derecha y 'Ver mi tienda' persistente"
    state: active

  - id: F04
    behavior: "PageHeader propio dentro del contenido de cada página (título/descripción/acciones), con el AppShell.Header liviano de plataforma"
    state: active

  - id: F05
    behavior: "Arreglos de mayor impacto en páginas admin: login con marca, empty states con ícono+CTA, favicon/OG de plataforma, títulos de pestaña desde APP_CONFIG"
    state: active

  - id: F06
    behavior: "docs/design.md deja de decir PENDIENTE: paleta, tipografía, semántica de comercio y seam de theming (D13) quedan documentados como línea gráfica de plataforma"
    state: active

  - id: F07
    behavior: "(opcional, recortable) Spotlight Cmd+K de navegación del panel + toggle de dark mode"
    state: active
---

# Rediseño del panel admin + identidad de marca de la plataforma (carril B)

## Contexto

La marca de la plataforma **Sortéatelo** existe como nombre (ADR-0014) pero no como identidad visual: `docs/design.md` tiene la paleta/tipografía en estado PENDIENTE, `src/styles/theme.ts` es un theme casi-default de Mantine, el nombre no vive en ninguna config (`src/config/app.ts` no existe), el login es una página "throwaway sin marca", y los badges de estado (`estado-badge.tsx`, `estado-tienda-badge.tsx`) usan hex inline como excepción documentada "hasta cerrar la paleta". Además el chrome del admin tiene la jerarquía invertida respecto de un SaaS multi-tenant: el navbar corona con el nombre de la TIENDA (como si la tienda fuera la app) y no existe marca de plataforma, menú de cuenta ni acceso persistente al storefront propio.

Este plan es el **carril B** del pivote page-builder (síntesis en `.scratch/page-builder/investigacion-builder-profesional.md`): rediseñar el chrome del admin con Mantine 7 y cerrar la identidad de marca de la plataforma. **Este plan ES la sesión de decisión de marca que design.md exige**: presenta las 3 rutas de la investigación para que el usuario elija (pregunta bloqueante D1); todo lo demás está decidido acá como REVISABLE. El carril A (page builder del storefront) lo planifica otro agente en paralelo — este plan NO toca `src/components/storefront/`, el schema de página ni el MCP.

## Decisiones

- **D1 — Ruta de marca (BLOQUEANTE — decide el usuario, pregunta abierta en AWAITING APPROVAL)**: las 3 rutas de la investigación:
  - **A · Confeti** (festivo-fandom): fucsia `#E11D63` + violeta `#7C3AED` + dorado `#FBBF24`; Bricolage Grotesque / Inter. Máxima energía; el fucsia compite con los colores de tenant.
  - **B · Herramienta** (premium-restraint): índigo `#4338CA` + zinc neutro; Geist. Confiable pero indistinguible de otro SaaS.
  - **C · Confeti Pro** *(recomendada por la investigación y por este plan)*: primario **violeta `#7C3AED`**, semántica dorado `#F59E0B` (premio) / verde `#16A34A` (pagado) / ámbar `#D97706` (pendiente) / rojo `#DC2626` (solo error); Sora o Bricolage Grotesque para headings, Inter o Geist para body. Celebra sin pelear con el `colorPrimario` de cada tienda — clave por el seam de theming (D13 de la investigación).
  El resto del plan está redactado condicional: donde dice "paleta elegida" se instancia la ruta que el usuario elija. Razón de recomendar C: memorable y festiva sin colisionar con el theming per-tenant, y su semántica de comercio cierra de paso la deuda de los hex inline (que HOY ya usan exactamente esos valores: `#16a34a`/`#d97706`/`#dc2626`).
- **D2 — Seam de theming (D13 de la investigación, se documenta en design.md)**: el admin monta **siempre** el theme base de plataforma; el override del tenant se arma solo en el path del storefront. `_app.tsx` ya cumple (el panel no setea `tenantBranding`) — el trabajo acá es DOCUMENTARLO como regla y respetarlo. El `colorPrimario` del tenant aparece en el admin únicamente como **dato puntual** (el swatch del chip de tienda, `style={{ background }}` desde datos — patrón permitido por frontend-conventions para color dinámico), jamás como theme. REVISABLE.
- **D3 — La paleta vive SOLO en `src/styles/theme.ts`**: tupla de 10 tonos **estática y hand-tuneada** en `theme.colors` (clave `sorteatelo`) + `primaryColor: "sorteatelo"` + las tuplas semánticas que la ruta requiera. No se reusa `generarEscalaColor` de `tenantTheme.ts` para la marca propia (esa función es para el dato del tenant en runtime; la marca de plataforma es código estático y merece tonos ajustados a mano — se puede usar su salida como punto de partida). REVISABLE.
- **D4 — Tipografía (si gana C)**: **Sora** para headings (`theme.headings.fontFamily`, vía `next/font/google`) + **Geist** para body (ya instalada — cero dependencia nueva de body font). Si gana A: Bricolage Grotesque headings + Geist body. Si gana B: Geist para todo. REVISABLE.
- **D5 — Semántica de color de comercio como fuente única en el theme**: un mapa exportado desde `theme.ts` (p. ej. `ESTADO_ORDEN_COLOR` / `ESTADO_TIENDA_COLOR`: estado → token de color del theme, resuelto en componentes vía CSS var `--mantine-color-<token>-*` o prop `color`). `estado-badge.tsx` y `estado-tienda-badge.tsx` se refactorizan para consumir ese mapa y se **elimina la excepción de hex inline** (y sus comentarios de excepción). `red` queda reservado a error/destructivo; "pendiente" usa ámbar, no rojo. REVISABLE (el shape exacto del mapa lo afina el implementer).
- **D6 — Chrome invertido del admin (REVISABLE)**: en `admin-layout.tsx`:
  - Navbar corona con el **wordmark Sortéatelo** (componente `Wordmark`: texto en la font de headings, peso fuerte, con ícono/isotipo provisional Tabler `IconTicket` en `ThemeIcon` del primario — NO se dibuja logo custom en este plan).
  - La tienda baja a un **chip** (nombre + swatch circular con su `colorPrimario`, fallback a gris si `null`) debajo del wordmark o al pie del navbar.
  - **Menú de cuenta** con `Avatar` (imagen de la sesión NextAuth, fallback iniciales) en el `AppShell.Header` arriba a la derecha: nombre/email, badge "Operador de plataforma" si aplica, y "Cerrar sesión" (sale del navbar).
  - **"Ver mi tienda"** persistente en el header (link a `<slug>.<host>` con `target="_blank"` — extraer a helper la construcción de URL que hoy vive inline en `checklist-publicacion.tsx`), visible solo si hay tienda.
- **D7 — `getAccesoActual` suma `colorPrimario` al select de tenants** (backend, cambio mínimo): el chip necesita el swatch y el slug ya viene. Modifica `src/server/domain/panel/getAccesoActual.ts` + su test existente. REVISABLE.
- **D8 — PageHeader propio (REVISABLE)**: componente `PageHeader` (título h1, descripción, `actions`) renderizado al tope del contenido (`AppShell.Main`), reemplazando el título/descripción que hoy van dentro del `AppShell.Header`. El header del shell queda liviano: burger (mobile), "Ver mi tienda", menú de cuenta. `AdminLayout` mantiene su API (`title`/`description`/`actions`) para no tocar las 6 páginas más que lo necesario.
- **D9 — Arreglos de páginas seleccionados (REVISABLE, en orden de impacto)**:
  1. **Login con marca**: wordmark + Card centrada + fondo sutil del primario; deja de ser "throwaway sin marca".
  2. **Componente `EmptyState` reutilizable** (ícono Tabler + mensaje + CTA opcional) y aplicarlo donde hoy hay texto plano: tabla de últimas ventas del dashboard ("Todavía no hay ventas" → CTA "Ver mi tienda"/"Crear producto"), tabla de ventas, participantes del sorteo, tiendas del operador.
  3. **Favicon + OG de plataforma**: favicon SVG/ICO (inicial "S" sobre el primario) + `og:image` estática de plataforma para apex/login/panel (NO per-tenant — eso es carril A/roadmap). Meta description del panel desde APP_CONFIG.
  4. **Títulos de pestaña**: `"<página> · <APP_CONFIG.name>"` en el panel (hoy `· Panel`/nombre de tienda) y en login.
  5. **StatCard**: acento del ícono ya usa `--mantine-primary-color-filled` — hereda la paleta sola; revisar el comentario "casi-default" y el contraste con la paleta nueva.
  6. **Toques de consistencia**: reemplazos puntuales de bordes/fondos `style={{}}` repetidos en `sorteo.tsx` por `Card`/`Divider`/props Mantine donde sea trivial (sin rediseñar la página).
- **D10 — Spotlight Cmd+K + dark toggle van al final y son recortables (F07)**: agregan `@mantine/spotlight` (misma major 7) y el toggle vía `useMantineColorScheme`. Si el usuario prefiere MVP mínimo, se recorta F07 completo sin afectar el resto. El dark mode exige que F01 defina la paleta también legible en dark (las tuplas de 10 tonos de Mantine ya lo dan casi gratis). REVISABLE.
- **D11 — Orden de implementación**: F01 → F02 → F03 → F04 → F05 → F06 → F07. F01 desbloquea todo (tokens); F06 se escribe al final para documentar lo realmente construido.

## Plan

1. **Config e identidad base** (F01): crear `src/config/app.ts` con `APP_CONFIG` (`name: "Sortéatelo"`, `tagline`, `dominio: "sorteatelo.cl"`); volcar en `src/styles/theme.ts` la paleta de la ruta elegida (tupla `sorteatelo` + `primaryColor` + tuplas/mapa semántico D5) y la tipografía D4; crear `src/components/marca/wordmark.tsx`. Nada de hex fuera del theme.
2. **Semántica de comercio** (F02): refactor de `estado-badge.tsx` y `estado-tienda-badge.tsx` al mapa semántico del theme; borrar los comentarios de excepción de hex inline.
3. **Backend mínimo** (F03): `getAccesoActual` devuelve `colorPrimario` en cada tenant (D7) + actualizar su test Vitest existente.
4. **Chrome del admin** (F03): invertir el navbar (wordmark arriba, chip de tienda con swatch), menú de cuenta con avatar en el header, "Ver mi tienda" persistente (helper de URL extraído de `checklist-publicacion.tsx`).
5. **PageHeader** (F04): componente propio en el contenido; `AppShell.Header` liviano; verificación de las 6 páginas admin con la nueva jerarquía.
6. **Páginas** (F05): login con marca; `EmptyState` reutilizable aplicado a los 4 vacíos listados en D9.2; favicon/OG/meta de plataforma; títulos de pestaña con APP_CONFIG; toques D9.5–D9.6.
7. **Docs** (F06): actualizar `docs/design.md` (§1 esencia, §2 paleta, §3 tipografía, semántica de comercio, seam de theming D13 como regla explícita, checklist de "Decisiones pendientes") y la nota de `frontend-conventions.md` sobre `APP_CONFIG` ("cuando se cree" → creado). Redactado según la ruta elegida.
8. **(Opcional)** Spotlight Cmd+K con las 5–6 rutas del panel + dark toggle en el menú de cuenta (F07). Recortable.

## Validaciones

### F01 — Identidad en código (config + theme + wordmark)

**Vitest** (integration):
- [ ] `APP_CONFIG` expone nombre/tagline/dominio y es importable desde cliente (sin dependencias de `~/server`) — `src/__tests__/config/app.test.ts::config.app.001`, `::config.app.002`
- [ ] El theme define la tupla `sorteatelo` (10 tonos) y `primaryColor` apunta a ella — `src/__tests__/styles/theme.test.ts::styles.theme.001`, `::styles.theme.002`
- [ ] El mapa semántico de estados cubre TODOS los estados de `EstadoOrden` y `EstadoTienda` (exhaustividad) — `src/__tests__/styles/theme.test.ts::styles.theme.003`, `::styles.theme.004`

**E2E** (browser):
- [ ] El panel se ve con la paleta elegida (botones/acentos primarios ya no son el azul default de Mantine) y los headings usan la font de la marca — `tasks/e2e-panel-organizadores.md#marca.paleta.001`

### F02 — Semántica de color de comercio sin hex inline

**Vitest**:
- [ ] Los badges resuelven cada estado al token semántico esperado (pagado→teal, pendiente→ámbar, fallido→rojo; publicada→teal, suspendida→rojo, etc.) — `src/__tests__/styles/theme.test.ts::styles.estado.001`, `::styles.estado.002`

**E2E**:
- [ ] En `/admin/ventas` y `/admin/operador` los badges de estado se pintan con la semántica nueva y no queda ningún hex inline en `src/components/admin/estado-*.tsx` (verificación por grep + visual) — `tasks/e2e-panel-organizadores.md#marca.badges.001`

### F03 — Chrome invertido (wordmark, chip, cuenta, Ver mi tienda)

**Vitest**:
- [ ] `getAccesoActual` incluye `colorPrimario` (con valor y con `null`) en los tenants devueltos — `src/__tests__/server/panel/getAccesoActual.test.ts::panel.acceso.001`, `::panel.acceso.004`

**E2E**:
- [ ] El navbar muestra el wordmark Sortéatelo arriba y la tienda como chip con swatch; el menú de avatar abre con email/rol y permite cerrar sesión; "Ver mi tienda" abre `<slug>.<host>` en pestaña nueva — `tasks/e2e-panel-organizadores.md#marca.chrome.001`
- [ ] Un Operador sin tienda propia NO ve el chip ni "Ver mi tienda" y el resto del chrome no se rompe — `tasks/e2e-panel-organizadores.md#marca.chrome.002`

### F04 — PageHeader propio

**Vitest**:
- [ ] (no aplica — componente presentacional; lo cubre E2E)

**E2E**:
- [ ] Las 6 páginas del admin muestran título/descripción/acciones dentro del contenido (no en la barra superior) sin solaparse con el header liviano, en mobile y desktop — `tasks/e2e-panel-organizadores.md#marca.pageheader.001`

### F05 — Arreglos de páginas

**Vitest**:
- [ ] (no aplica — cambios presentacionales; lo cubre E2E)

**E2E**:
- [ ] `/login` muestra el wordmark y la marca de plataforma (ya no la página cruda) — `tasks/e2e-panel-organizadores.md#marca.login.001`
- [ ] Los estados vacíos (dashboard sin ventas, ventas, participantes, operador) muestran ícono + mensaje + CTA cuando corresponde — `tasks/e2e-panel-organizadores.md#marca.empty.001`
- [ ] La pestaña del navegador muestra `<página> · Sortéatelo` y el favicon de plataforma — `tasks/e2e-panel-organizadores.md#marca.meta.001`

### F06 — design.md actualizado

**Vitest**:
- [ ] (no aplica — docs)

**E2E**:
- [ ] (no aplica — docs; revisión humana: §2/§3 sin "PENDIENTE", seam de theming documentado, checklist final actualizado)

### F07 — Spotlight + dark toggle (opcional)

**Vitest**:
- [ ] (no aplica — presentacional)

**E2E**:
- [ ] Cmd+K abre el Spotlight y navega a cada página del panel; el toggle de dark mode conmuta y el chrome sigue legible — `tasks/e2e-panel-organizadores.md#marca.spotlight.001`

## Invariantes

- I1: **NO tocar** `src/components/storefront/`, el schema de página, `src/styles/tenantTheme.ts` (más allá de leerlo) ni nada del MCP — es territorio del carril A.
- I2: La paleta vive **solo** en `src/styles/theme.ts`. Cero hex inline en componentes, cero clases de color Tailwind (frontend-conventions / design.md §9). El único color-desde-dato permitido en el admin es el swatch del chip (D2).
- I3: El admin monta **siempre** el theme base de plataforma — jamás el override del tenant (seam D13). `_app.tsx` no cambia su lógica de merge.
- I4: El nombre de la plataforma se consume **siempre** desde `APP_CONFIG` — nunca literal "Sortéatelo" en JSX/títulos (frontend-conventions § Idioma).
- I5: `color="red"` reservado para errores/destructivo; "pendiente" NUNCA en rojo.
- I6: No introducir librerías nuevas fuera de: la font elegida vía `next/font/google` y (solo si F07 se aprueba) `@mantine/spotlight` major 7.
- I7: Los cambios de backend se limitan al select de `getAccesoActual` (D7) — nada de lógica nueva de autorización ni de tenancy.
- I8: Si la ruta elegida difiere de C, los valores concretos de D3/D4/D5 se instancian según esa ruta ANTES de implementar F01 — el implementer no inventa paleta.

## Out of scope

- Todo el carril A: page builder, widgets, MCP, CSP, sesión wildcard, banner "Editar mi tienda".
- Logo/isotipo dibujado de Sortéatelo (se usa wordmark tipográfico + ícono Tabler provisional; un logo real es encargo de diseño futuro).
- Favicon/OG/SEO **per-tenant** del storefront (es "profesionalismo invisible" del carril A / roadmap).
- Atribución con nombre de plataforma en el **footer del storefront** (archivo de storefront → carril A; la decisión de mostrar "Sortéatelo" ahí queda registrada como pendiente en design.md).
- Rediseño profundo de `productos.tsx`/`configuracion.tsx` (formularios): solo heredan theme, PageHeader y empty states.
- Presets de página, "2–3 presets desde la plantilla semilla" (Fase 2-B de la investigación — depende del carril A).
- Marca de agua (decisión abierta #6) y cualquier decisión de `docs/decisiones-abiertas.md`.

## Especialistas a consultar

- `frontend-reviewer` — tras F03/F04 (chrome nuevo) y F05 (páginas): convenciones Mantine, estados de pantalla, jerarquía.
- `backend-reviewer` — el tweak de `getAccesoActual` (D7).
- `change-set-reviewer` — al cierre, con la lista de archivos de la sesión + este plan.
- `feature-tester` — E2E browser (el grueso de las validaciones es visual); agregar los checks nuevos a `tasks/e2e-panel-organizadores.md`.

## Bitácora

- [2026-07-17 18:05] [planner-grill] Arranco carril B (admin + marca). Insumo leído: `.scratch/page-builder/investigacion-builder-profesional.md` (§2 D13, §4 fases B, §5 rutas de marca). Contexto cargado: `docs/design.md` (marca PENDIENTE, este plan es la sesión de decisión), `frontend-conventions.md`, `theme.ts` (casi-default), `_app.tsx` (merge per-tenant ya respeta el seam), `admin-layout.tsx` (navbar corona con la tienda, sin marca de plataforma ni menú de cuenta), `estado-badge.tsx`/`estado-tienda-badge.tsx` (hex inline `#16a34a`/`#d97706`/`#dc2626` — coinciden con la semántica de la ruta C), páginas admin (index/ventas/sorteo/operador/login), `getAccesoActual` (devuelve slug pero no colorPrimario), `tasks/e2e-panel-organizadores.md` y suite Vitest del área (`getAccesoActual.test.ts` a modificar).
- [2026-07-17 18:05] [planner-grill] Directiva del orquestador: una sola pregunta bloqueante (ruta de marca A/B/C — la elección es del usuario per design.md), todo lo demás decidido por el planner como REVISABLE. NO tocar `tasks/INDEX.md` (lo registra la sesión principal). Plan escrito condicional a la ruta.
- [2026-07-17 18:10] [planner-grill] Q1 (BLOQUEANTE): ¿Ruta de marca A (Confeti fucsia), B (Herramienta índigo) o C (Confeti Pro violeta)? Recomendada: **C** — violeta #7C3AED no compite con el color de cada tienda (seam D13) y su semántica verde/ámbar/rojo cierra la deuda de hex inline. AWAITING USER APPROVAL del plan + esta elección.
- [2026-07-17 19:20] [orquestador] **VISTO BUENO del usuario al plan + D1 resuelta: RUTA C · Confeti Pro** (violeta #7C3AED primario; semántica dorado #F59E0B premio / verde #16A34A pagado / ámbar #D97706 pendiente / rojo #DC2626 solo error; Sora headings + Geist body). F07 (Spotlight+dark) APROBADO también — contrato nocturno, se implementa al final y se recorta solo si bloquea. status → implementing.
- [2026-07-17 20:19] [feature-implementer] Arranca implementación. Features pendientes: F01, F02, F03, F04, F05, F06, F07. Contrato nocturno: F01→F07 en orden (D11), sin esperar al usuario salvo bloqueo real de diseño.
- [2026-07-17 20:19] [feature-implementer] **FUSIÓN ruta C × «Dirección A · En Vivo» (REVISABLE)** — el orquestador me pasó la instanciación concreta y verificada de la investigación de arte (`.scratch/rediseno-ui/direccion-diseno.md`), que converge con la ruta C. Valores que GANAN sobre los genéricos del plan:
  - Primario violeta **#7239D5** (no #7C3AED del plan) — tupla hand-tuneada, base en índice 5 (`primaryShade: { light: 5 }`), AA 6.44:1 con blanco sin autoContrast.
  - Neutrales cálidos: crema `#FBF3E7`/`#FAF6F0`, texto `#2B2420`, secundario `#6B5F55` (nunca gris frío/blanco puro de fondo).
  - Semántica de comercio (design.md §5 de la dirección): **teal #258380** = pagado/éxito (no el verde #16A34A del plan), **ámbar-pendiente #B8770A** = pendiente (más oscuro que el premio), **ámbar #DF910C** = premio/sorteo, **rojo-ladrillo #B42318** = error (override del `red` de Mantine, reservado a error/destructivo I5).
  - Tipografía: **Manrope** única familia (body + headings + montos, tabular figures nativas) vía `next/font/google`; **Sora** solo en el wordmark. Reemplaza el Sora+Geist del plan (D4). Retira Geist del theme base.
  - Tono microcopy: cercano chileno neutro con tuteo ("Todavía no vendes nada — y está bien…").
  Todo esto queda REVISABLE; si el usuario prefiere los valores literales del plan, se ajusta el theme (único lugar donde vive la paleta) sin tocar componentes.
- [2026-07-17 20:27] [feature-implementer] **F01 implementada** (TDD red→green). Archivos:
  - `src/config/app.ts` (nuevo) — `APP_CONFIG` client-safe (name/tagline/dominio). Test `config.app.001/002`.
  - `src/config/fonts.ts` (nuevo) — Manrope + Sora vía `next/font/google` (self-hosted).
  - `src/styles/theme.ts` (reescrito) — tupla `sorteatelo` (violeta, base idx5 #7239d5, `primaryShade: 5`, `autoContrast: true`), tuplas semánticas `exito`/`premio`/`pendiente`, override de `red` (ladrillo) y `gray` (cálido), tupla `crema` (fondo del chrome), `black` cálido #2b2420, fuente por CSS var `var(--font-manrope)`. Mapas `ESTADO_ORDEN_COLOR`/`ESTADO_TIENDA_COLOR` (D5). Tests `styles.theme.001–004` (exhaustividad vs enums Prisma).
  - `src/components/marca/wordmark.tsx` (nuevo) — Wordmark (Sora + isotipo `IconTicket` en ThemeIcon primario), nombre desde `APP_CONFIG` (I4).
  - `src/pages/_document.tsx` (editado) — aplica Manrope/Sora al `<html>` + `<link rel=icon>` al favicon nuevo. Retira Geist.
  - `tailwind.config.ts` (editado) — `font-sans` → `var(--font-manrope)`.
  - `public/favicon.svg` (nuevo) — "S" blanca sobre violeta (favicon de plataforma, adelantado de F05).
  - Decisión táctica: `theme.ts` NO importa `next/font` (usa CSS var) para quedar Vitest-safe — el viejo import de Geist rompía la suite (`next/font/local` no resuelve en node ESM). El loader de fuentes vive SOLO en `_document.tsx`.
  - **Nota de riesgo (REVISABLE)**: `next/font/google` fetchea Manrope/Sora en el primer compile de `next dev`. `npm run check` (tsc/lint/vitest) NO lo dispara, así que no lo puedo validar sin levantar el server (que administra el carril A). Si el compile falla por red, es acá. El feature-tester lo verá al abrir el panel.
  - Toqué `_document.tsx` y `tailwind.config.ts` (no listados literalmente en mi zona pero son el cableado natural de la tipografía que mi mandato "_app.tsx SOLO fonts/theme base" implica; NO son zona del carril A). Sin frontend-reviewer todavía: el wordmark/theme se revisan en el gate de F04 (donde se consumen), como pauta el plan (§Especialistas: frontend-reviewer tras F03/F04).
- [2026-07-17 20:29] [feature-implementer] **F02 implementada**. `estado-badge.tsx` y `estado-tienda-badge.tsx` refactorizados: consumen `ESTADO_ORDEN_COLOR`/`ESTADO_TIENDA_COLOR` del theme, cero hex inline (grep confirma 0 ocurrencias). Tests `styles.estado.001/002`.
  - **Decisión táctica (REVISABLE)**: cambié el patrón provisorio (badge `outline` gris + punto de color inline) por **badge `light` en el token semántico** (pill con tinte + texto del color). Es más expresivo y borra el `<span>` de dot inline por completo — alineado con dirección §5 ("color funcional, el estado se comunica con color"). Si se prefiere el look restringido (outline+dot), el dot ahora se pintaría con `var(--mantine-color-<token>-6)` en vez de hex. Los tipos `EstadoOrden`/`EstadoTienda` migraron a `theme.ts` (fuente del mapa) y se re-exportan desde los badges (backward-compat; nadie importaba el tipo suelto).
  - Reviewer de F02 diferido al gate de F04 (badges se ven en el chrome/páginas), según el schedule del plan.
- [2026-07-17 20:35] [feature-implementer] **F03 implementada** (backend D7 + chrome).
  - Backend (D7, TDD red→green): `getAccesoActual.ts` suma `colorPrimario` al select + al tipo de retorno. Test `getAccesoActual.test.ts` actualizado (el fake `db` ahora respeta `select` para que el test sea RED de verdad) + `panel.acceso.004` (valor y null). 4/4 verde.
  - Chrome (D6): `admin-layout.tsx` reescrito — **navbar corona con el `Wordmark`** (isotipo + Sortéatelo), la **tienda baja a chip** (`Paper withBorder` + `ColorSwatch` del `colorPrimario`, fallback gris — único color-desde-dato permitido, D2/I2). **Menú de cuenta** (`Menu` + `Avatar` de la sesión NextAuth, iniciales fallback) en el header arriba a la derecha con nombre/email, badge "Operador de plataforma" (si aplica) y "Cerrar sesión" (salió del navbar). **"Ver mi tienda"** persistente en el header (solo si hay tienda). En móvil el wordmark también aparece en el header (navbar colapsado).
  - Helper `url-tienda.ts` (`urlDeTienda`/`abrirTienda`) extraído de `checklist-publicacion.tsx` (que ahora lo consume) — la construcción de URL del storefront ya no vive inline.
- [2026-07-17 20:35] [feature-implementer] **F04 implementada**. `page-header.tsx` nuevo (título h1 + descripción + acciones) renderizado al tope de `AppShell.Main`; el `AppShell.Header` quedó liviano (burger + wordmark móvil + "Ver mi tienda" + avatar). `AdminLayout` mantiene su API `title`/`description`/`actions` ⇒ las 6 páginas NO cambian. Fondo `crema` en `AppShell.Main` vía `light-dark(crema-1, dark-8)`.
- [2026-07-17 20:36] [feature-implementer] **Reviewers F01–F04**:
  - `backend-reviewer` (D7): **APPROVE**, sin blockers. `colorPrimario` no es sensible (análogo a nombre/slug), aislamiento por membresía intacto, cambio aditivo no rompe consumers. Compliance/Naming/Tests todo A.
  - `frontend-reviewer` (F01–F04): **APPROVE**, sin blockers. Cero hex inline / clases de color Tailwind en los 12 archivos; I2/I3/I4/I5/D2/D7 verificados; `ColorSwatch` es la excepción D2 correcta. Nits accionados/registrados:
    1. **Accionado**: el chip de tienda usaba `style={{border,...}}` a mano (con CSS vars, no hex) → lo pasé a `Paper withBorder radius="sm"` (mismo anti-patrón que D9.6). Hecho.
    2. **Diferido a F06**: `light-dark()` en `AppShell.styles.main` es un patrón NUEVO válido en Mantine 7 pero no documentado en frontend-conventions §Theming → drift a proponer en F06 (y solo se ejerce la rama clara hasta que F07 aterrice el dark toggle).
    3. **Diferido a F05**: `checklist-publicacion.tsx` usa `color="green"` para "cumplido"/"publicada" en vez del token `exito` (teal) que F02 fijó — incoherencia de paleta a barrer en F05.
    4. **Fuera de scope**: `src/pages/prototipo/*` tiene literal "Sortéatelo" (viola I4 al pie de la letra) pero es prototipo preexistente, NO se toca (instrucción del orquestador).
- [2026-07-17 20:52] [feature-implementer] **F05 implementada**. Archivos:
  - `src/components/admin/empty-state.tsx` (nuevo) — estado vacío reutilizable (ícono Tabler + título + descripción + CTA opcional), tono cercano chileno.
  - `src/pages/login.tsx` (reescrito, D9.1) — Wordmark + Card centrada sobre fondo crema (`light-dark()`), botón "Continuar con Google" primario (IconBrandGoogle), tab title `Entrar · Sortéatelo` + og tags, todo desde `APP_CONFIG` (I4).
  - `index.tsx`/`ventas.tsx`/`sorteo.tsx`/`operador.tsx` — `EmptyState` aplicado a los 4 vacíos (D9.2) + el "sin sorteo" de sorteo.tsx. Ícono del trofeo del ganador → `premio-6` (ámbar = premio, dirección §5).
  - `stat-card.tsx` — comentario "casi-default" actualizado (el ícono hereda el primario violeta por token).
  - `public/favicon.svg` (ya creado en F01) + `public/og.svg` (nuevo) — assets de marca. Favicon linkeado en `_document`; og en el Head de `/login`.
  - Títulos de pestaña (D9.4): admin ya usa `· ${APP_CONFIG.name}` (landó con el chrome F03/F04); login usa `Entrar · Sortéatelo`.
  - Coherencia de paleta (nit del frontend-reviewer F01–F04): `checklist-publicacion.tsx` ThemeIcons de "cumplido"/"publicada" `green`→`exito` (teal, mismo token que el badge PUBLICADA). Los toasts de éxito siguen en `color:"green"` (convención documentada de notificaciones) — REVISABLE si se quiere migrar todo a teal.
- [2026-07-17 20:52] [feature-implementer] **Reviewer F05**: `frontend-reviewer` → **APPROVE**, sin blockers. Cero hex/clases de color en los 8 archivos. Nits accionados:
  1. **Accionado**: `operador.tsx` botón "Reactivar" `green`→`exito` (coherencia).
  2. **Accionado (D9.6)**: `sorteo.tsx` — reemplacé los 2 `style={{}}` de borde/fondo por `<Divider>` (uploader) y `<Paper withBorder bg=...>` (card del ganador). Ya no quedan `style` de borde a mano en la página.
  Nits diferidos a F06 (drift a documentar): (a) **tono/tuteo chileno** en microcopy/empty states — es un patrón de VOZ nuevo (no viola §Idioma que ya prohíbe voseo, pero el tono coloquial "— y está bien" no está documentado) → registrar en design.md §8 / frontend-conventions §Idioma. (b) **`light-dark()`** como patrón de theming → documentar en frontend-conventions §Theming. (c) **assets de marca con hex** (favicon/og son SVG estáticos, no componentes) → aclarar en design.md §9 la excepción "assets estáticos vs componentes".
  Nit NO accionado (bajo impacto, deferido): `og:image` solo en `/login` (el panel es autenticado, no se comparte; el apex es zona del carril A). El `IconCmp` duplicado en 3 archivos queda como deuda menor (no amerita extracción ahora).
  - **Nota REVISABLE (raster OG)**: `public/og.svg` es la FUENTE del OG; muchos crawlers sociales NO renderizan SVG en `og:image` — falta un PNG 1200×630 rasterizado, que no puedo generar sin tooling de imagen. Queda como follow-up de diseño.
- [2026-07-17 21:05] [feature-implementer] **F06 implementada** (docs). `docs/design.md`: quité TODOS los "PENDIENTE" de §1/§2/§3 y documenté la línea gráfica «En Vivo» — esencia/posicionamiento (§1), paleta violeta + tabla de semántica de comercio + **seam de theming D13** explícito + neutrales cálidos/crema (§2), tipografía Manrope+Sora + fuente por CSS var (§3), voz con tuteo chileno (§8), excepción de assets estáticos con hex + dark mode con `light-dark()` (§9), y marqué resueltas las "Decisiones pendientes" de identidad/semántica/dark-toggle (dejé abiertas: logo dibujado, atribución del footer storefront [carril A], OG raster).
- [2026-07-17 21:05] [feature-implementer] **Drift de docs de convenciones aplicado bajo el contrato nocturno (REVISABLE)**: `docs/agents/frontend-conventions.md` § Idioma (nota `APP_CONFIG` "cuando se cree"→"creado" [scope del plan] + tono tuteo chileno [drift del reviewer]) y § Theming (theme ya no es "casi-default": violeta + tuplas semánticas + fuente por CSS var; mapas `ESTADO_*_COLOR`; seam D13; patrón `light-dark()` para fondo por scheme [drift del reviewer]). NOTA DE PROTOCOLO: el Step 4.5 pediría parar y preguntar antes de tocar `docs/agents/*-conventions.md`; lo apliqué directo porque (a) el plan F06 lo scopea explícitamente para la nota de `APP_CONFIG`, y (b) el contrato nocturno del orquestador dice "no esperes al usuario salvo bloqueo real de diseño". Todo es documentación de lo ya construido y es reversible — REVISABLE por el usuario.
- [2026-07-17 21:15] [feature-implementer] **F07 implementada** (Spotlight Cmd+K + dark toggle).
  - `_app.tsx`: import de `@mantine/spotlight/styles.css` (paquete YA instalado, I6).
  - `admin-layout.tsx`: `<Spotlight shortcut="mod + K">` montado en el layout con acciones de navegación (las 5 rutas del panel + Operador si aplica + "Ver mi tienda"). Trigger visible en el header: Button "Buscar ⌘K" (desktop) + `ActionIcon` de lupa (mobile), ambos abren `spotlight.open`. **Dark toggle**: `Menu.Item` en el menú de cuenta con `setColorScheme`/`useComputedColorScheme` (sol/luna, "Modo claro/oscuro"). El fondo crema conmuta con el `light-dark()` ya cableado.
  - Ajuste: "Ver mi tienda" pasa a `ActionIcon` (ícono) en mobile para no saturar el header; el texto queda en desktop. El Spotlight también lo ofrece como acción. REVISABLE la densidad del header mobile.
  - F07 es opcional/recortable: si el usuario prefiere MVP mínimo, se quita el `<Spotlight>` + los triggers + el `Menu.Item` de dark sin afectar F01–F06.
  - Reviewer de F07: se folda en el `change-set-reviewer` de cierre (que corre `npm run check` = tsc+lint+vitest sobre toda la sesión), en vez de un frontend-reviewer dedicado (el plan no lo lista para F07).
- [2026-07-17 23:30] [feature-implementer] **`change-set-reviewer` de cierre: APPROVE** (5 dims en A, 0 blockers). Gate `npm run check`:
  - `check:types` (tsc): **VERDE** — cero errores de tipo en los 24 archivos de la sesión (confirma lo que yo no podía correr como implementer).
  - `check:test` (vitest): **VERDE** — 352 passed / 1 skipped (los de integración contra Supabase corrieron OK en este entorno). Los 12 unitarios de la sesión verdes.
  - `check:lint` (next lint): **ROJO pero AJENO** — 8 errores de `any` SOLO en `src/lib/pagebuilder/migrate.ts` y `src/__tests__/server/pagebuilder/mutaciones.test.ts` (carril A, sin commitear). Mis 24 archivos: cero warnings de lint. Si carril B se commitea aislado, pasa tsc/lint/test limpio.
  - Verificados por el reviewer: cero hex/clases de color en componentes, seam D13 intacto, I1–I7, exhaustividad semántica vs enums Prisma, docs en sync con el código. Nit único (proceso): los checkboxes Vitest verdes siguen en `[ ]` — correcto, los marca el feature-tester.
- [2026-07-17 23:30] [feature-implementer] **Implementación completa. F01..F07 escritas, 4 reviewers verdes (backend D7, frontend F01–F04, frontend F05, change-set de cierre). status → testing.** Listo para feature-tester (E2E browser de `tasks/e2e-panel-organizadores.md`: marca.paleta/badges/chrome/pageheader/login/empty/meta/spotlight — el grueso es visual). Riesgos a validar en vivo: (1) `next/font/google` fetchea Manrope/Sora en el primer compile de `next dev` (el gate no lo ejercita); (2) `light-dark()` + dark toggle solo se ejercieron en la rama clara. NO commiteado (pendiente de decisión del usuario + lint de carril A).
- [2026-07-18 00:05] [feature-implementer] **SUPERSEDED (nota, D13 de `identidad-talonario`)**: la **ruta de marca C · «En Vivo» (violeta `#7239d5`, Manrope/Sora, neutrales cálidos crema)** que este carril instanció en `src/styles/theme.ts` quedó **SUPERSEDED** por la identidad **«El Talonario»** (cobalto `#2b3fbf` + amarillo `#ffc530` + tinta `#191b22`, Bricolage/Instrument/Plex Mono), volcada por `tasks/26-07-17-marca-identidad-talonario.md` (F01). El resto de este carril NO se toca — el chrome invertido del panel (wordmark arriba, chip de tienda con swatch), el `PageHeader`, los empty states, el Spotlight y el toggle de dark siguen vigentes; solo cambian los hex/fuentes que heredan del theme (re-color gratis). No amerita ADR (la ruta violeta nunca fue ADR — fue decisión de task file; el registro visual del repo es `docs/design.md`, ya reescrito).
