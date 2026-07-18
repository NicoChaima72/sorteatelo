---
slug: identidad-talonario
status: implementing
owner: nicolas
created: 2026-07-17
related_adrs: [ADR-0005, ADR-0007, ADR-0011, ADR-0014]
related_context: [Tienda, Organizador, Operador]

features:
  - id: F01
    behavior: "El theme base de plataforma instancia la identidad «El Talonario» (cobalto/amarillo/tinta + semántica de comercio + Bricolage/Instrument/Plex Mono + screens Tailwind sincronizados con Mantine + design.md reescrito + favicon/og regenerados), y la ruta violeta queda documentada como SUPERSEDED"
    state: active

  - id: F02
    behavior: "La gramática talonario vive en componentes propios reutilizables (plumón, perforación, sello, talonario vivo, teléfono-tienda, chip de ticket, boleto CTA, wordmark) construidos con Mantine + CSS module acotado que consume solo tokens del theme"
    state: active

  - id: F03
    behavior: "El apex sirve la landing oficial de Sortéatelo (bandas AZUL→BLANCO→AMARILLO→BLANCO→GRIS→AZUL→TINTA, copy del prototipo) reemplazando el PlaceholderPlataforma, con el despacho por zona/tenant intacto"
    state: active

  - id: F04
    behavior: "El login oficial del panel es el split cobalto (mitad azul: wordmark + talonario vivo + testimonio; mitad blanca: acceso Google real con manejo de ?error)"
    state: active

  - id: F05
    behavior: "Las secciones de la landing entran con animaciones suaves (fade + translate leve) vía la dependencia `motion`, respetando prefers-reduced-motion, acotado a la landing"
    state: active

  - id: F06
    behavior: "El sandbox /prototipo/* desaparece completo, las fuentes viejas (Manrope/Sora) no quedan referenciadas, y la suite completa + verificación visual integral pasan en verde"
    state: not_started
---

# Identidad «El Talonario» a la plataforma oficial (theme Mantine + landing + login + design.md)

## Contexto

La identidad visual de la plataforma nació dos veces: primero la ruta C «En Vivo» (violeta `#7239d5` + Manrope/Sora + neutrales cálidos crema), instanciada en `src/styles/theme.ts` por el carril `admin-marca`; después, una sesión de `frontend-design` con 5 prototipos en código (`src/pages/prototipo/*`) de la que el usuario eligió y refinó en 4 rondas la dirección **«El Talonario»**: blanco + azul cobalto `#2B3FBF` + amarillo `#FFC530`, tipografía Bricolage Grotesque / Instrument Sans / IBM Plex Mono, gramática **suave** (sin bordes duros, sombras difusas rebajadas), motivos de talonario como detalle (plumón orgánico, perforaciones dashed, sellos, chip de ticket con muescas, talonario vivo animado). Los veredictos están en `.scratch/rediseno-ui/direccion-talonario.md` y consolidados en código en `src/pages/prototipo/v1-talonario.tsx` (landing) y `src/pages/prototipo/login.tsx` (login split cobalto).

Este plan lleva esa dirección a la plataforma oficial como **reemplazo completo** de la identidad: theme base Mantine nuevo (el panel entero se re-colorea gratis vía tokens), landing oficial en el apex (hoy un `PlaceholderPlataforma` noindex), login oficial nuevo, assets de marca (`favicon.svg`/`og.svg`), `docs/design.md` reescrito, animaciones de entrada en la landing con `motion`, y la limpieza final del sandbox `/prototipo/*`. El prototipo usa HTML plano + CSS module como excepción declarada; la versión oficial se construye **100% Mantine** (decisión explícita del usuario) encapsulando la gramática talonario en componentes propios. La ruta violeta queda SUPERSEDED y así se documenta.

## Decisiones

Todas cerradas por el usuario en el grill (Bitácora abajo) + correcciones posteriores relevadas por el orchestrator. Las marcadas «derivación del planner» son resoluciones técnicas de consistencia, ajustables en review sin re-grillar.

- **D1 — Reemplazo COMPLETO de la identidad (Q1 = a).** El theme base pasa a talonario: panel, login, apex, favicon/og, wordmark, design.md. Muere el violeta «En Vivo». Razón: una sola identidad de plataforma; el usuario eligió la dirección talonario tras 4 rondas de prototipos reales.
- **D2 — Paleta oficial** (vive SOLO en `src/styles/theme.ts`, design.md §2/§9):
  - Primario **cobalto `#2B3FBF`**: tupla `sorteatelo` re-poblada (se conserva el nombre del token — cero churn en consumidores), con la **base en el índice 6** y hover profundo `#2333A0` en el 7 (ver D4).
  - Acento **amarillo `#FFC530`**: tupla nueva `amarillo` (hover `#F5B814` como tono vecino). Con `autoContrast: true` los filled amarillos salen con texto tinta.
  - **Tinta `#191B22`** como `black` (reemplaza el café `#2b2420`); escala `gray` FRÍA nueva con `#565B68` (tinta-suave) en el índice 6 = `dimmed`, `#9AA0AD` (tinta-tenue) como tono medio y `#EEF0F5` (gris banda) en los índices claros.
  - **Celeste hundido `#EEF2FB`** como fondo del chrome del panel/login: reemplaza la escala `crema`. El token se renombra (p.ej. `hundido`) y se actualizan sus 2 consumidores (`light-dark(var(--mantine-color-crema-1), …)` en `src/pages/login.tsx` y `src/components/admin/admin-layout.tsx`). Derivación del planner: renombrar en vez de mentir con un token llamado "crema" que ya no es crema.
- **D3 — Semántica de comercio cerrada en el theme**: pagado/éxito → teal `#1D7A70` (re-ancla la tupla `exito`), pendiente → ámbar `#A06B08` (tupla `pendiente`), fallido/destructivo → rojo `#C03E2E` (override de `red`, sigue **reservado** a error). Los mapas `ESTADO_ORDEN_COLOR`/`ESTADO_TIENDA_COLOR` no cambian de claves ni de tokens — solo cambian los hex de las tuplas, así los badges se re-colorean solos. La tupla `premio` se re-ancla al **amarillo de marca** (derivación del planner: el momento de triunfo del talonario ES el amarillo — el número «TÚ»; hoy el token `premio` tiene 0 consumidores de color en componentes, riesgo nulo).
- **D4 — `primaryShade: 5 → 6`, base del primario en el índice 6.** Resuelve la desalineación detectada en el grill: `tenantTheme.ts` genera la escala del tenant con su hex en el índice 6 (comentario: "primaryShade.light por defecto de Mantine"), pero el theme base declaraba `primaryShade: 5`, así que los `filled` per-tenant salían un 14% más claros que el color elegido. Con base cobalto en 6 + `primaryShade: 6`, plataforma y tenants quedan alineados y el filled del tenant sale EXACTO en su `colorPrimario`. Contraste cobalto/blanco ≈ 8:1 (AAA). `generarEscalaColor` y sus tests NO cambian.
- **D5 — Tipografía**: **Bricolage Grotesque** (headings, peso 800), **Instrument Sans** (texto de sistema), **IBM Plex Mono** (números/montos/etiquetas, `tabular-nums`). Cargadas en `src/config/fonts.ts` (`next/font/google`), aplicadas en `_document.tsx` por CSS vars (el theme las consume por var, patrón vigente — `theme.ts` sigue Vitest-safe). `theme.fontFamily` → Instrument, `theme.headings.fontFamily` → Bricolage, `theme.fontFamilyMonospace` → Plex Mono. `tailwind.config.ts` `font-sans` pasa de `--font-manrope` a la var de Instrument. Manrope y Sora se retiran.
- **D6 — Q2 = (b) 100% MANTINE** (corrige la recomendación (a) del grill previo; el usuario fue explícito). Landing y login oficiales con componentes Mantine + Tailwind solo-layout. La gramática talonario se encapsula en componentes propios (`src/components/landing/`) que por dentro usan Mantine + **CSS module ACOTADO** consumiendo `--mantine-color-*` / `--font-*` — **cero hex fuera del theme**. Esto es una excepción registrada a "no crear CSS Modules" de `frontend-conventions.md` (que exige decisión registrada: esta es).
- **D7 — Patrón datawalt-app adoptado: screens de Tailwind sincronizados con los breakpoints de Mantine** en `tailwind.config.ts` (`xs: 36em, sm: 48em, md: 62em, lg: 75em, xl: 88em` — hoy el repo usa los defaults px de Tailwind, desalineados de los props responsive de Mantine). Lo que **NO** se adopta de datawalt-app: el uso libre de clases de color Tailwind — este repo mantiene su regla estricta "color solo vía theme Mantine".
- **D8 — Login = split con mitad de marca AZUL COBALTO** (corrección sobre la Bitácora previa: el usuario probó la mitad amarilla y la descartó). Referencia visual: `src/pages/prototipo/login.tsx` tal como está hoy (mitad azul: wordmark + talonario vivo + testimonio en blanco; mitad blanca: acceso). El login oficial conserva el comportamiento actual de `src/pages/login.tsx`: `signIn("google", { callbackUrl: "/admin" })`, mensaje ante `?error`, página pública sin guard, nombre desde `APP_CONFIG`.
- **D9 — Landing oficial en el apex**: secuencia de bandas **AZUL (hero: copy + plumón en «Vende»/«Sortea» + teléfono demo con ticket #0428) → BLANCO (cómo funciona) → AMARILLO (momento clave + talonario vivo) → BLANCO (confianza + testimonio piloto) → GRIS `#EEF0F5` (FAQ) → AZUL (boleto CTA con talón amarillo) → TINTA (footer)**. Regla registrada del usuario: **dos secciones blancas nunca adyacentes**. Copy de `src/components/prototipo/copy.ts` + FAQ/testimonio de `v1-talonario.tsx` (se migran a un módulo de copy de la landing; el testimonio conserva la atribución honesta "pendiente de autorización"). Va en `src/pages/index.tsx` reemplazando `PlaceholderPlataforma`; el **despacho por zona/tenant (`getPropsHome`) queda intacto**. Los CTAs apuntan a `/login`. Derivación del planner: la landing oficial deja el `noindex` del placeholder (pasa a indexable con title/OG de plataforma desde `APP_CONFIG`).
- **D10 — Gramática SUAVE** (veredicto ronda 3 + rebaja explícita del usuario): sin bordes duros; cards radius 18; botones radius 12 con sombra `0 3px 10px rgba(43,63,191,.22)`; sombras difusas, nunca duras; motivos talonario como detalle (perforaciones dashed, sellos, mono para números). En superficies de MARCA (landing/login) la elevación es por sombra difusa; el chrome del panel mantiene su patrón actual (`Card withBorder`) — no se rediseña (D12).
- **D11 — Dependencia `motion`** (ex framer-motion): entradas suaves por sección de la landing (fade + translate leve), `prefers-reduced-motion` SIEMPRE respetado, **acotado a la landing**. (El usuario dijo "Remotion" pero quiere transiciones de página; la diferencia ya le fue aclarada — Remotion renderiza videos.) Registrada como decisión de dependencia nueva.
- **D12 — El panel admin NO se rediseña**: solo se re-colorea vía theme (D1-D4). El impacto en `tenantTheme.ts` queda cubierto por D4 (alineación de `primaryShade`); `overrideDesdeBranding`/`generarEscalaColor`/`gradienteTematico` no cambian de contrato.
- **D13 — Documentación del SUPERSEDED de la ruta violeta**: basta (a) nota en la Bitácora de `tasks/26-07-17-admin-marca.md` (la ruta C · Confeti/«En Vivo» de marca queda superseded por la identidad talonario — el resto de ese carril no se toca) + (b) la reescritura de `docs/design.md` (fuente de verdad visual). **NO amerita ADR**: la ruta violeta nunca fue un ADR — fue una decisión de task file, y el mecanismo de registro visual del repo es design.md.
- **D14 — Limpieza de `/prototipo/*` al final** (F06): `v2-v5` + `index.tsx` (comparador) + sus CSS modules son borrables ya; `v1-talonario`/`login`/`panel` + `proto.tsx`/`proto.module.css`/`copy.ts` se borran tras montar lo oficial (son la referencia visual durante la implementación). `.scratch/rediseno-ui/direccion-talonario.md` queda como registro histórico (`.scratch` no se toca).
- **D15 — Tests de theme existentes se actualizan** (no se borran): `styles.theme.002` pasa a anclar cobalto `#2b3fbf` en el índice 6 (+ `primaryShade: 6`); `styles.theme.001/003/004` y `styles.estado.*` siguen válidos con las tuplas nuevas. `tenantTheme.test.ts` queda intacto (funciones puras sin cambio; su assert "base en índice 6" ahora además coincide con el `primaryShade` del base).

## Plan

Orden de fases: F01 → F02 → F03 → F04 → F05 → F06. F03/F04 dependen de F02; F05 de F03. Cada fase cierra con vitest filtrado verde (donde aplique) + verificación visual en el dev server (`:3001`, **una sola instancia**).

1. **F01 — Theme + fuentes + Tailwind + docs + assets.**
   1. `src/config/fonts.ts`: reemplazar Manrope/Sora por Bricolage Grotesque (weights para 800), Instrument Sans e IBM Plex Mono (`next/font/google`, `display: "swap"`, CSS vars nuevas). `_document.tsx`: aplicar las 3 vars + className base al `<html>`.
   2. `src/styles/theme.ts`: re-poblar `sorteatelo` (cobalto, base índice 6), `primaryShade: 6`, tupla nueva `amarillo`, re-anclar `exito`/`pendiente`/`red`/`premio` (D3), `black: #191B22`, `gray` fría, `crema` → `hundido` (celeste `#EEF2FB`), fuentes por las vars nuevas (texto/headings/mono). Mantener `autoContrast: true`, `defaultRadius`, `respectReducedMotion: true` y los mapas `ESTADO_*` tal cual. Actualizar los 2 consumidores de `crema-1`.
   3. `tailwind.config.ts`: `screens` sincronizados con Mantine (D7) + `font-sans` a la var de Instrument.
   4. Actualizar `src/__tests__/styles/theme.test.ts` (D15) y correr la suite de styles.
   5. Regenerar `public/favicon.svg` y `public/og.svg` con cobalto/amarillo/tinta y la tipografía display (SVG estáticos — única excepción "hex embebido", design.md §9).
   6. Reescribir `docs/design.md`: banner de estado, §1 (esencia — dirección «El Talonario» reemplaza «En Vivo»), §2 (paleta nueva + tabla semántica + seam de theming con `primaryShade: 6`), §3 (tipografía), §4 (formas/elevación: gramática suave en superficies de marca; chrome del panel sigue con bordes), §7 (motion: entradas de landing con `motion`), §9 (hex de assets actualizado). Nota SUPERSEDED en la Bitácora de `tasks/26-07-17-admin-marca.md` (D13).
   7. Drift de `docs/agents/frontend-conventions.md`: theming (cobalto, `primaryShade: 6`, fuentes nuevas), excepción CSS module para componentes de la gramática talonario (D6), screens sincronizados (D7), regla de `motion` acotado a landing (D11). (El visto bueno de este plan cubre el drift.)
   8. Verificación visual del panel re-coloreado (login/admin sin violeta, badges con la semántica nueva). (F01)
2. **F02 — Componentes del sistema talonario** en `src/components/landing/` (+ actualización de `src/components/marca/wordmark.tsx`): Plumon (trazo orgánico A/B), Perforacion, Sello, TalonarioVivo (port del prototipo, `useReducedMotion` de `@mantine/hooks`), TelefonoTienda + TicketToast/TicketChip con muescas, BoletoCta (talón amarillo), Banda (azul/amarilla/gris/tinta con volteo de tinta clara). Cada uno: Mantine por dentro + CSS module acotado consumiendo `--mantine-color-*`/`--font-*` — cero hex. Wordmark pasa a Bricolage 800 con «éa» en plumón amarillo (conserva `APP_CONFIG.name`, prop `withIcon` y el isotipo Tabler provisional). El color de la tienda demo del teléfono (`#3A4FC9` índigo) es DATO de ejemplo del componente, no token del theme (mismo estatus que el swatch per-tenant). (F02)
3. **F03 — Landing oficial**: componente `LandingPlataforma` (en `src/components/landing/`) con la secuencia de bandas D9 y el copy migrado a `src/components/landing/copy.ts`; `src/pages/index.tsx` la renderiza donde hoy vive `PlaceholderPlataforma` — sin tocar `getServerSideProps`/`getPropsHome` ni el render del storefront. Meta/OG de plataforma desde `APP_CONFIG`, sin `noindex`. Mobile-first (gutters `px-4`/`lg:px-8`). (F03)
4. **F04 — Login oficial**: reescribir `src/pages/login.tsx` al split cobalto (D8) reusando Wordmark + TalonarioVivo + Banda; conservar `signIn`, `?error`, `Head`/OG y el carácter de página pública. En móvil la mitad de marca colapsa (patrón del prototipo: talonario oculto bajo `lg`). (F04)
5. **F05 — Animaciones**: instalar `motion`; wrapper de entrada por sección (fade + translate leve, una sola definición reutilizada) SOLO en la landing; con `prefers-reduced-motion` las secciones aparecen sin animar. (F05)
6. **F06 — Limpieza + validación integral**: borrar `src/pages/prototipo/` completo + `src/components/prototipo/` (D14); grep de referencias muertas (`components/prototipo`, `--font-manrope`, `--font-sora`, `crema`, `#7239d5` fuera de docs históricas); `npm run check` NO lo corre el implementer (gate del `change-set-reviewer`) — el implementer corre vitest completo; verificación visual integral: landing, login, panel, storefront de un tenant seed (aislamiento del theming per-tenant intacto), apex vs subdominio. (F06)

## Validaciones

### F01 — Theme base talonario + fuentes + Tailwind + docs + assets

**Vitest** (integration):
- [ ] La tupla `sorteatelo` tiene 10 tonos hex con el cobalto `#2b3fbf` anclado en el índice 6, y el theme declara `primaryShade: 6` — `src/__tests__/styles/theme.test.ts::styles.theme.001` + `::styles.theme.002`
- [ ] Los mapas `ESTADO_ORDEN_COLOR`/`ESTADO_TIENDA_COLOR` siguen exhaustivos contra los enums de Prisma y con su mapeo semántico (PAGADO→exito, PENDIENTE→pendiente, FALLIDO→red; pendiente NUNCA en rojo) — `src/__tests__/styles/theme.test.ts::styles.theme.003` + `::styles.theme.004` + `::styles.estado.001` + `::styles.estado.002`
- [ ] Las tuplas semánticas re-ancladas existen y son hex válidos (exito con teal `#1d7a70`, pendiente con `#a06b08`, red con `#c03e2e` en sus índices de referencia) — `src/__tests__/styles/theme.test.ts::styles.theme.005` + `::styles.theme.006` + `::styles.theme.007`
- [ ] El theme consume las fuentes nuevas por CSS var (texto Instrument, headings Bricolage, mono Plex) sin importar `next/font` (importable desde Vitest) — `src/__tests__/styles/theme.test.ts::styles.theme.008` + `::styles.theme.009`
- [ ] Los `screens` de `tailwind.config.ts` coinciden con los breakpoints de Mantine (xs 36em / sm 48em / md 62em / lg 75em / xl 88em) — `src/__tests__/config/tailwind.test.ts::config.tailwind.001` + `::config.tailwind.002`
- [ ] `tenantTheme` sigue intacto: `generarEscalaColor` base en índice 6 (suite existente verde, sin modificar) — `src/__tests__/styles/tenantTheme.test.ts::storefront.theming.escala.001` (sin cambios)

**E2E** (browser):
- [ ] El panel admin y el login se ven re-coloreados a cobalto (nav activa, CTAs) sin rastro de violeta, con tipografía nueva y badges de estado en teal/ámbar/rojo
- [ ] El storefront de un tenant seed conserva SU color de marca (filled exacto al `colorPrimario`) — el seam per-tenant no se contaminó

### F02 — Componentes del sistema talonario

**Vitest**:
- [ ] (no aplica — componentes visuales sin lógica de dominio; no hay harness de render de React en el repo. Si el implementer extrae helpers puros, los cubre)

**E2E** (browser):
- [ ] El talonario vivo rota el sello «¡SALE!» cada ~3s y queda estático con `prefers-reduced-motion` emulado — `src/components/landing/talonario-vivo.tsx`
- [ ] Plumón, perforaciones, sellos, chip de ticket con muescas y boleto CTA se renderizan con la gramática suave (sin bordes duros, sombras difusas) y sin hex fuera del theme (inspección de código por el reviewer) — `src/components/landing/{plumon,perforacion,sello,ticket-chip,boleto-cta}.tsx` + `landing.module.css` (frontend-reviewer verde)
- [ ] El wordmark muestra «Sortéatelo» en Bricolage 800 con el «éa» resaltado en plumón amarillo — `src/components/marca/wordmark.tsx`

### F03 — Landing oficial en el apex

**Vitest**:
- [ ] Las suites existentes del despacho por zona/tenant del apex siguen verdes sin modificación (contrato de `getPropsHome` intacto) — `src/__tests__/server/storefront/*` (sin cambios; `index.tsx` solo swap de la rama apex, I2)

**E2E** (browser):
- [ ] El apex (`localhost:3001`) muestra la landing con la secuencia exacta AZUL→BLANCO→AMARILLO→BLANCO→GRIS→AZUL→TINTA, sin dos blancas adyacentes — `src/components/landing/landing-plataforma.tsx` (SSR verificado HTTP 200 + markers por el implementer)
- [ ] Hero: plumón sobre «Vende» y «Sortea», teléfono demo con ticket «Compra confirmada · #0428», CTAs a `/login` — `src/components/landing/landing-plataforma.tsx`
- [ ] Banda amarilla con el talonario vivo; FAQ desplegable (Mantine `Accordion`) en la banda gris; boleto CTA con talón amarillo «Nº 000001»; footer tinta con la atribución neutral — `src/components/landing/landing-plataforma.tsx`
- [ ] Un subdominio de tenant seed sigue sirviendo su storefront (la landing NO se filtró al storefront) y un host sin tienda sigue en 404 neutral — `src/pages/index.tsx` (despacho intacto, I2)
- [ ] En viewport móvil la landing apila correctamente (hero en columna, boleto apilado con talón abajo) — `src/components/landing/{landing-plataforma,boleto-cta}.tsx` + `landing.module.css`
- [ ] La landing ya no lleva `noindex` y expone title/OG de plataforma — `src/components/landing/landing-plataforma.tsx` (verificado por curl: sin `noindex`, `<title>` y OG desde `APP_CONFIG`)

### F04 — Login oficial split cobalto

**Vitest**:
- [ ] (no aplica — página visual; el OAuth/authPolicy ya está cubierto por suites existentes que deben seguir verdes)

**E2E** (browser):
- [ ] `/login` muestra el split: mitad azul (wordmark + talonario vivo + testimonio en blanco), mitad blanca con «Continuar con Google» que dispara el OAuth real — `src/pages/login.tsx` (SSR HTTP 200 verificado; `signIn` + `callbackUrl:/admin` conservados)
- [ ] Con `?error=X` aparece el mensaje de error mínimo; en móvil el talonario de la mitad de marca se oculta y el acceso queda usable — `src/pages/login.tsx` (`?error`→`role="alert"`, talonario `hidden lg:block`)

### F05 — Animaciones de entrada (motion)

**Vitest**:
- [ ] (no aplica — comportamiento de browser)

**E2E** (browser):
- [ ] Las secciones de la landing entran con fade + translate leve al hacer scroll — `src/components/landing/revelar-al-scroll.tsx` (usado en cómo funciona/momento/confianza/FAQ/CTA; header+hero sin reveal para evitar flash above-the-fold)
- [ ] Con `prefers-reduced-motion` emulado el contenido aparece completo SIN animación (nunca oculto) — `src/components/landing/revelar-al-scroll.tsx` (`useReducedMotion` → `<div>` plano)
- [ ] El panel y el storefront NO cargan animaciones de `motion` (acotado a la landing) — `motion` importado SOLO en `revelar-al-scroll.tsx` (grep verificado, I5)

### F06 — Limpieza + validación integral

**Vitest**:
- [ ] La suite COMPLETA (`vitest run`) queda verde tras borrar `/prototipo/*` y `components/prototipo/`
- [ ] No quedan referencias a `components/prototipo`, `--font-manrope`, `--font-sora` ni a la escala `crema` en `src/` (verificable por grep)

**E2E** (browser):
- [ ] Toda ruta `/prototipo/*` responde 404
- [ ] Pasada visual integral: landing, login, panel (productos/ventas/sorteo/configuración/operador), storefront tenant seed — sin regresiones visuales ni de flujo

## Invariantes

- I1: **Cero hex fuera de `src/styles/theme.ts`** en componentes (props/tokens Mantine o CSS vars `--mantine-color-*`). Únicas excepciones: assets SVG estáticos (`favicon.svg`/`og.svg`, design.md §9) y el color-de-dato demo del teléfono/swatch per-tenant.
- I2: El **despacho por zona/tenant del apex no cambia de contrato**: `getServerSideProps`/`getPropsHome`, el render del storefront y el 404 neutral quedan intactos. Este plan es 100% presentación — nada de backend, schema, dinero ni tenancy.
- I3: **Seam D13 de theming**: el panel monta el theme base SIN override; el storefront mergea solo el `colorPrimario` del tenant. Tras el cambio, el filled per-tenant debe salir EXACTO en el hex del tenant (`primaryShade: 6` alineado con la base en índice 6 de `generarEscalaColor`).
- I4: `color="red"` sigue reservado a error/destructivo; «pendiente»/«configuración» jamás en rojo. Los mapas `ESTADO_*` no cambian de claves ni tokens.
- I5: `prefers-reduced-motion` respetado SIEMPRE (theme `respectReducedMotion: true` + talonario vivo + `motion`); `motion` no se importa fuera de la landing.
- I6: En la landing, **dos secciones blancas nunca adyacentes** (regla registrada del usuario).
- I7: El panel admin NO se rediseña — solo cambia lo que el theme re-colorea. Si un componente del panel "pide" retoques visuales, parar y preguntar.
- I8: El nombre de la plataforma sale SIEMPRE de `APP_CONFIG` (nunca literal); copy en tuteo, tono cercano chileno; el copy aprobado del prototipo no se reescribe (solo se migra).
- I9: `theme.ts` sigue sin importar `next/font` (Vitest-safe); el loader vive solo en `fonts.ts`/`_document.tsx`.
- I10: Un solo dev server (puerto 3001) — jamás una segunda instancia de `next dev`.
- I11: Tailwind sigue acotado a layout: los `screens` nuevos NO habilitan clases de color/tipografía/sombra.

## Out of scope

- Rediseño del panel admin o del storefront/plantilla per-tenant (solo re-color vía theme).
- Logo/isotipo dibujado real (sigue pendiente como encargo de diseño; el isotipo Tabler continúa provisional).
- OG raster PNG 1200×630 (pendiente previo de design.md, no se resuelve acá).
- Dark mode nuevo (solo mantener que `light-dark()` compile con el token renombrado).
- Re-estilado de las secciones del page-builder (carril A) más allá de lo que el theme herede.
- ADR nuevo (D13: el superseded se documenta en design.md + nota en el task file de admin-marca).
- Cambios de copy/estrategia de contenido más allá del copy ya aprobado en el prototipo.
- Marca de agua (decisión abierta #6) y cualquier feature no visual.

## Especialistas a consultar

- `frontend-reviewer` — revisión de cada fase visual (theme, componentes talonario, landing, login): tokens, seam per-tenant, accesibilidad, convenciones Mantine/Tailwind.
- `change-set-reviewer` — al cierre, con la lista completa de archivos + este plan (corre `npm run check`).
- `feature-tester` — Vitest + E2E asistido por browser (landing/login/panel/storefront tocan UI cross-sistema; usar la skill `browser-verify`, dev server `:3001`).

## Bitácora

- [2026-07-17 00:00] [planner-grill] Arranco grill. Contexto cargado: `.scratch/rediseno-ui/direccion-talonario.md` (4 rondas, veredictos: bandas AZUL→BLANCO→AMARILLO→BLANCO→GRIS→AZUL→TINTA; gramática SUAVE; login ronda 4 PENDIENTE), `src/styles/theme.ts` (hoy instancia ruta violeta «En Vivo» de admin-marca — la dirección talonario la SUPERSEDE), `tenantTheme.ts` (override per-tenant con base en índice 6; ojo: theme base usa `primaryShade: 5` → posible desalineación a verificar), `docs/design.md` (§1-§3 marcados RESUELTOS con violeta/Manrope — hay que re-abrir y reemplazar), `index.tsx` (apex = PlaceholderPlataforma noindex), `estado-badge.tsx` (ya consume tokens del theme, NO hex inline; lo "provisorio" son las tuplas exito/pendiente/red del theme vs. teal #1D7A70 / ámbar #A06B08 / rojo #C03E2E del prototipo), tests `src/__tests__/styles/theme.test.ts` + `tenantTheme.test.ts` (sin snapshots visuales, pero asserts sobre el theme — impacto a evaluar), assets `public/favicon.svg`/`og.svg` embeben #7239d5 (excepción §9 → habría que regenerarlos). Fuentes hoy: Manrope+Sora vía `src/config/fonts.ts` + `_document.tsx`; prototipo usa Bricolage Grotesque + Instrument Sans + IBM Plex Mono cargadas localmente en `proto.tsx`.
- [2026-07-17 00:00] [planner-grill] Q1: ¿La identidad talonario reemplaza COMPLETA la identidad de plataforma (theme base nuevo → panel/login/apex re-coloreados cobalto/amarillo, muere el violeta «En Vivo» incl. favicon/og) o solo se aplica a la landing pública dejando el violeta en el resto? Recomendada: reemplazo completo.
- [2026-07-17 00:10] [planner-grill] Q1 answered: (a) REEMPLAZO COMPLETO — theme base cobalto/amarillo/tinta + 3 fuentes nuevas, favicon/og.svg, wordmark, design.md §1–§3 reescritos; ruta violeta de admin-marca queda SUPERSEDED (documentarlo en el plan).
- [2026-07-17 00:10] [planner-grill] Novedades del prototipo (post-inicio de grill, consolidadas en código): (1) LOGIN veredicto ronda 4 = SPLIT con mitad de marca AMARILLA (wordmark + talonario vivo + testimonio en tinta sobre amarillo; mitad blanca = acceso) — ver `src/pages/prototipo/login.tsx`; (2) sombras de botones rebajadas a `0 3px 10px` en todo el sistema (`proto.module.css`).
- [2026-07-17 00:10] [planner-grill] Alcance NUEVO pedido por el usuario: transiciones/animaciones en la landing. El usuario dijo "Remotion", pero Remotion renderiza VIDEOS — la interpretación correcta (ya explicada al usuario por el orchestrator) es **Motion (ex framer-motion)**: animaciones de entrada/scroll-reveal por sección (fade + translate leve), respetando design.md §7 (preciso y calmado, `prefers-reduced-motion` SIEMPRE), acotado a la landing pública. Registrar dependencia `motion` como decisión.
- [2026-07-17 00:10] [planner-grill] Q2: ¿Cómo se construye la landing oficial — (a) port del sistema CSS module del prototipo a `src/components/landing/` (excepción registrada a "siempre Mantine") o (b) reconstrucción con componentes Mantine? Recomendada: (a).
- [2026-07-17 00:30] [planner-grill] Reconstrucción tras interrupción (instancia nueva del planner). El orchestrator releva TODAS las decisiones cerradas por el usuario, incluidas dos CORRECCIONES sobre esta Bitácora: (1) **Q2 answered = (b) 100% MANTINE** ("100% mantine", explícito — contra la recomendación (a)); la gramática talonario se encapsula en componentes propios Mantine + CSS module acotado a tokens del theme. (2) **LOGIN: veredicto final = split con mitad AZUL COBALTO** — el usuario probó la mitad amarilla y la descartó él mismo (coincide con `.scratch/rediseno-ui/direccion-talonario.md` ronda 4 y con `src/pages/prototipo/login.tsx` actual). Además: patrón datawalt-app adoptado (screens Tailwind ↔ breakpoints Mantine; NO su uso libre de clases de color), gramática suave con sombras rebajadas, dependencia `motion`, panel solo re-color, limpieza `/prototipo/*` al final, tests de theme a actualizar.
- [2026-07-17 00:30] [planner-grill] Hallazgos de código para el plan write: `premio` (tupla) tiene 0 consumidores de color en componentes ⇒ re-anclarlo al amarillo de marca es riesgo nulo (derivación del planner). `crema-1` tiene exactamente 2 consumidores (`login.tsx`, `admin-layout.tsx`) ⇒ renombrar a `hundido` (celeste #EEF2FB) es barato. `tenantTheme.generarEscalaColor` pone la base del tenant en el índice 6 mientras el theme base usa `primaryShade: 5` ⇒ el filled per-tenant sale 14% más claro que el hex elegido; se resuelve con `primaryShade: 6` + base cobalto en índice 6 (D4). `theme.test.ts` ancla `#7239d5` en índice 5 (styles.theme.002) ⇒ actualizar; `tenantTheme.test.ts` no requiere cambios.
- [2026-07-17 00:45] [planner] Plan COMPLETO escrito (Contexto, D1–D15, plan de 6 fases F01–F06, Validaciones, Invariantes I1–I11, Out of scope, Especialistas). `tasks/INDEX.md` actualizado. Estado: **AWAITING USER APPROVAL** — la implementación no arranca sin visto bueno explícito del usuario.
- [2026-07-17 23:30] [feature-implementer] Arranca implementación. Visto bueno explícito del usuario ("go go go"). `status: planning → implementing`. Read pass completo: plan entero, `.scratch/rediseno-ui/direccion-talonario.md`, `_template.md`, CLAUDE.md, ADRs relacionados (via CLAUDE.md/design.md), `frontend-conventions.md`, `design.md`, y el código de F01 (`theme.ts`, `fonts.ts`, `_document.tsx`, `tailwind.config.ts`, `theme.test.ts`, `tenantTheme.ts`/`tenantTheme.test.ts`, los 2 consumidores de `crema-1` = `login.tsx`+`admin-layout.tsx`, `wordmark.tsx`, assets `favicon.svg`/`og.svg`, `app.ts`, `_app.tsx`) + prototipo (`proto.tsx`, `proto.module.css`). Confirmado: `crema-1` tiene exactamente 2 consumidores; `--font-sora`/Manrope solo en `fonts.ts`/`_document.tsx`/`theme.ts`/`wordmark.tsx`; el resto de `crema` es del sandbox `/prototipo/*` (se borra en F06). Features pendientes: F01, F02, F03, F04, F05, F06.
- [2026-07-18 00:20] [feature-implementer] **F01 implementada** (theme + fuentes + Tailwind + docs + assets). Ciclo TDD (Skill `tdd`): actualicé `theme.test.ts` (styles.theme.002 → cobalto índice 6 + primaryShade 6; +005/006/007 tuplas semánticas re-ancladas + amarillo + tinta; +008/009 fuentes por CSS var + no-import de next/font) → RED (6 fallos) → implementé `theme.ts` → GREEN (11/11). Nuevo `tailwind.test.ts` (config.tailwind.001/002 screens Mantine + font-sans) → RED → `tailwind.config.ts` → GREEN. `tenantTheme.test.ts` **intacto y verde** (confirma D4: base tenant índice 6 ahora además coincide con el primaryShade del base). Corrida filtrada final: 24/24 (theme+config+tenantTheme). Archivos: `src/styles/theme.ts` (paleta talonario completa: cobalto/amarillo/exito-teal/pendiente-ámbar/premio=amarillo/red-ladrillo/gray-frío/hundido-celeste, black=tinta, fuentes por var, primaryShade 6, autoContrast/defaultRadius/respectReducedMotion/mapas ESTADO_* intactos), `src/config/fonts.ts` (Bricolage/Instrument/Plex Mono, vars `--font-display`/`--font-instrument`/`--font-mono`), `src/pages/_document.tsx`, `tailwind.config.ts` (screens em Mantine + font-sans→Instrument), `src/components/marca/wordmark.tsx` (`--font-sora`→`--font-display`; el plumón «éa» completo queda para F02), `src/pages/login.tsx` + `src/components/admin/admin-layout.tsx` (crema-1→hundido-1, D2 — los 2 únicos consumidores), `public/favicon.svg` + `public/og.svg` (cobalto/amarillo/tinta + fuentes display, excepción §9), `src/components/admin/stat-card.tsx` (comentario violeta→cobalto), `docs/design.md` (reescrito: banner SUPERSEDED, §1 «El Talonario», §2 paleta+semántica+seam primaryShade 6, §3 tipografía, §4 gramática suave marca vs chrome con bordes, §7 motion landing, §8/§9), tests. Nota SUPERSEDED en Bitácora de `tasks/26-07-17-admin-marca.md` (D13). Notas tácticas: (a) `#7239d5` que quedan en `getAccesoActual.test.ts` son `colorPrimario` de un TENANT (dato de ejemplo), no la identidad de plataforma — correctos, no se tocan; (b) ningún otro test pinaba los hex viejos.
- [2026-07-18 00:20] [feature-implementer] **Drift aplicado** (F01 step 7, pre-autorizado por el visto bueno del plan): `docs/agents/frontend-conventions.md` § Mantine (excepción CSS module para `src/components/landing/`, D6), § Theming (paleta cobalto + primaryShade 6 alineado con tenantTheme + fuentes nuevas + hundido), § Tailwind (screens em Mantine, D7 + regla `motion` acotado a landing, D11), § Idioma («En Vivo»→«El Talonario»). Es reflejo directo de las decisiones de F01, no una decisión nueva.
- [2026-07-18 00:20] [feature-implementer] **Auto-chequeo design.md (UI tocada)**: tokens sin hex inline en componentes (solo theme.ts + assets §9) ✓; semántica financiera sin verde (exito=teal, red=ladrillo, pendiente=ámbar) ✓; motion `respectReducedMotion: true` preservado ✓; Tailwind solo layout (screens = breakpoints, font-sans = var) ✓.
- [2026-07-18 00:20] [feature-implementer] **`frontend-reviewer` de cierre F01: APPROVE** (Naming B por 1 comentario obsoleto ya corregido en `stat-card.tsx`; Tests A). Verificó los 5 puntos: (1) seam per-tenant EXACTO — `primaryShade: 6` alineado con `tenantTheme.RAMPA` base índice 6, `overrideDesdeBranding` no toca primaryShade, merge en `_app` correcto; (2) cero hex fuera del theme en componentes (I1); (3) `red` reservado a error, pendiente/configuración nunca en rojo (I4); (4) contraste cobalto/blanco ≈ 8.19:1 (AAA), amarillo/tinta ≈ 10.85:1 con autoContrast; (5) cero referencias muertas a Manrope/Sora/crema/violeta en código de producción (solo en `/prototipo/*` sandbox, que muere en F06, y en registro histórico de tasks). F01 CERRADA. Sigo con F02.
- [2026-07-18 01:10] [feature-implementer] **F02 cerrada** (componentes del sistema talonario). TDD saltado a propósito: componentes visuales sin lógica de dominio (el plan lo declara "no aplica"). Archivos NUEVOS en `src/components/landing/`: `landing.module.css` (CSS module acotado, cero hex, aliases a `--mantine-color-*` + sombras `color-mix`), `plumon.tsx`, `etiqueta.tsx`, `perforacion.tsx`, `sello.tsx`, `banda.tsx`, `ticket-chip.tsx`, `telefono-tienda.tsx`, `talonario-vivo.tsx`, `boleto-cta.tsx`; + `src/components/marca/wordmark.tsx` (Bricolage 800, «éa» en Plumon amarillo, parte `APP_CONFIG.name`, degrada si no hay «éa»). `frontend-reviewer`: 1 blocker ($3.990 concatenado a mano → `clp(3990)` de `~/lib/formato`) + 4 nits (role="img" en teléfono/talonario, botón `+` decorativo `aria-hidden`+`tabIndex=-1`, regla CSS redundante borrada, comentario de bordes del mockup) — TODOS corregidos. Re-review de confirmación lanzada.
- [2026-07-18 01:10] [feature-implementer] **Fix de arquitectura CSS (F02, cazado al montar F04)**: la capa `.sistema` re-declaraba `--tinta*` en CADA componente (vía `composes`), lo que ROMPÍA el volteo de tinta por herencia — los eyebrows (`Etiqueta`) sobre banda azul salían gris oscuro en vez de blanco. Corregido: `.sistema` sólo aliasa tokens ESTABLES; la tinta se voltea por herencia de banda; el texto la lee con fallback (`var(--tinta-suave, var(--mantine-color-gray-6))`); las cards RE-ANCLAN tinta oscura sobre sí mismas; el plumón fuerza tinta directa. Además `Etiqueta` pasó de Mantine `Text` a `<span>` PLANO para que el color lo controle SOLO el CSS module (sin que una regla de color de Mantine compita según el orden de carga). Documentado en el docblock del CSS module.
- [2026-07-18 01:10] [feature-implementer] **F03 implementada** (landing oficial en el apex). Archivos: `src/components/landing/copy.ts` (copy migrado del prototipo, nombre/dominio desde `APP_CONFIG`, I8), `src/components/landing/landing-plataforma.tsx` (secuencia de bandas D9 con `Banda`/`Plumon`/`TelefonoTienda`/`TalonarioVivo`/`BoletoCta`/`Accordion` Mantine para la FAQ), `src/pages/index.tsx` (swap `PlaceholderPlataforma`→`LandingPlataforma` SOLO en la rama apex; `getServerSideProps`/`getPropsHome`/`StorefrontHome` INTACTOS, I2). ⚠ `index.tsx` lo edita en paralelo el carril A page-builder (ahora pasa `overlays` a `RenderPagina`): hice el swap sobre su versión actual, sin tocar el storefront. Landing indexable (sin `noindex`), title/OG desde `APP_CONFIG` (D9). Verificado por curl: apex HTTP 200, secuencia de bandas + markers presentes, sin `noindex`, sin errores de compile/hydration.
- [2026-07-18 01:10] [feature-implementer] **F04 implementada** (login split cobalto). `src/pages/login.tsx` reescrito: mitad azul (`Banda tono="azul"` + Wordmark blanco + `TalonarioVivo` `hidden lg:block` + testimonio) / mitad blanca (eyebrow + título + `signIn("google",{callbackUrl:"/admin"})` + manejo de `?error` + link a `/`). Conserva `Head`/OG desde `APP_CONFIG` y el carácter de página PÚBLICA (sin guard). Verificado por curl: `/login` HTTP 200 + markers.
- [2026-07-18 01:10] [feature-implementer] **F05 implementada** (animaciones motion). Dependencia `motion@12.42.2` instalada (pre-autorizada por D11). `src/components/landing/revelar-al-scroll.tsx` (fade + translate leve, `whileInView once`, respeta `prefers-reduced-motion` → `<div>` plano con contenido completo, I5). Aplicado a las secciones de scroll de la landing (cómo funciona/momento/confianza/FAQ/CTA); header+hero sin reveal para evitar flash above-the-fold. `motion` importado SOLO en `revelar-al-scroll.tsx` (grep verificado, acotado a la landing, I5). Verificado por curl: apex SSR HTTP 200 sin hydration mismatch.
- [2026-07-18 01:10] [feature-implementer] **`frontend-reviewer` de F03/F04/F05: REQUEST_CHANGES → fixes aplicados**. 2 blockers: (1) FAQ con `<details>` a mano → reemplazado por `Accordion` de Mantine (patrón de `storefront/faq.tsx`), clases `.faqItem*` borradas del CSS module; (2) `Card` local con template string → `cn()`. Nits corregidos: `HERO.antesVende` huérfano borrado, `React.ReactNode`→import explícito de `ReactNode`. Re-review de confirmación lanzada. **3 nits dejados como candidatos de DRIFT para consultar al usuario (NO aplicados)**: (a) la banda de header (wordmark+CTA) no está enumerada en la secuencia D9 de design.md — decisión visual nueva; (b) convención de `style={{}}` para tipografía fluida de marketing (`clamp()`) vs props `fz`/`lh` de Mantine; (c) doble fuente de `useReducedMotion` (`motion/react` en `RevelarAlScroll` vs `@mantine/hooks` en `TalonarioVivo`).
- [2026-07-18 01:25] [feature-implementer] **`frontend-reviewer` de F03/F04/F05: APPROVE** (Compliance B por la banda de header no enumerada en D9 — I6 NO se rompe, candidato de drift; Naming A: `Accordion` calca `storefront/faq.tsx`, `Card` usa `cn()`; Tests B: Vitest N/A correcto por plan). El reviewer recuerda que el smoke SSR HTTP 200 NO cubre el checklist E2E completo (secuencia exacta de bandas, hero, split login, reduced-motion emulado) — eso es tarea del `feature-tester` con `browser-verify`, no bloquea el cierre del reviewer. **F03/F04/F05 CERRADAS por el reviewer.**
- [2026-07-18 01:25] [feature-implementer] **F02 re-review**: la primera review de F02 fue APPROVE-condicionada al fix del blocker `$3.990` (ya aplicado con `clp(3990)` + verificado tsc/curl); además la review comprehensiva de F03/F04/F05 releyó los componentes F02 (talonario-vivo, telefono, boleto, landing.module.css) y los encontró limpios al componerlos. Se lanzó una re-review de confirmación explícita de F02 que quedó pendiente de notificación al cierre de esta pasada; si su veredicto trae algo, se incorpora. F02 se considera verde por evidencia (blocker corregido + verificado + re-lectura limpia en la review comprehensiva).
- [2026-07-18 01:25] [feature-implementer] **Pausa en el límite F05/F06 (instrucción del usuario)**. F01–F05 implementadas y aprobadas por reviewers. F06 (borrado de `src/pages/prototipo/` + `src/components/prototipo/` + grep de referencias muertas + validación integral) NO se ejecuta sin confirmación explícita del usuario — el usuario podría querer conservar los prototipos como referencia un tiempo más. `status` queda en `implementing` (no pasa a `testing` porque F06 sigue pendiente). Próximo: confirmar F06 con el usuario, luego `feature-tester` para el checklist E2E de F01–F05 (browser-verify, dev server :3001).
