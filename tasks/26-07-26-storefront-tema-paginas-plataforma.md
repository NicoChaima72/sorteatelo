---
slug: storefront-tema-paginas-plataforma
status: done
owner: nicolas
created: 2026-07-26
related_adrs: [ADR-0011, ADR-0016]
related_context: [Tienda, Comprador, TemaPagina, StorefrontPage]

features:
  - id: F01
    behavior: "resolverTemaPagina({tenantSlug}) defensiva lee el TemaPagina del published de la home, normaliza los campos NO heredados y devuelve null si es el default (no-op byte-idéntico)"
    state: passing

  - id: F02
    behavior: "Las páginas de VENTA/ENTREGA del comprador (/checkout, /producto/[id], /checkout/retorno) heredan fondo, tipografía, radio y modo de la Tienda"
    state: passing

  - id: F03
    behavior: "/bases y /entrega/[token] heredan el mismo tema mínimo (bases por host; entrega por el tenant del grant, host-agnóstica)"
    state: passing
---

# Las páginas de plataforma del storefront heredan el tema mínimo de la Tienda

## Contexto

La home de una tienda tematizada (ej. `iselk.sorteatelo.cl`: fondo lila `marca_suave`, tipografía
`dulce` Poppins/Nunito, radio `l`) convive con páginas de plataforma que salen con el "body blanco
de plataforma": `/checkout` renderiza fondo blanco, "Finalizar compra" en Fraunces y radio default —
solo sobreviven los colores de marca (que viajan por `tenantBranding`). La ruptura visual ocurre en
el momento más delicado del funnel (pagar).

La infraestructura ya es página-agnóstica: `_app.tsx` aplica radio/tipografía/modo de cualquier
`pageProps.temaPagina`, y `StorefrontLayout` ya acepta `estiloShell`/`colorPagina` (así tematiza la
home y `/[slug]`). Lo único que falta es que los helpers SSR de las páginas de plataforma resuelvan
el `TemaPagina` y que cada página derive y pase el fondo. **NO es una re-tematización completa**: se
hereda lo mínimo (fondo de página, par tipográfico, radio, modo claro/oscuro) y nada más.

Se lee el **published** de la home ⇒ iselk (y ninguna tienda) necesita re-publicar.

## Decisiones

Tomadas con el usuario ANTES de este plan (relevadas por el orquestador, visto bueno dado al
alcance); D6–D9 son derivaciones técnicas verificadas en código por el planner.

- D1: **Se hereda solo `fondoPagina`, `tipografia`, `radio`, `modo`.** NO se heredan `ambiente`
  (los glows de stage-lights no aplican a un form de pago), `anchoContenido` (la columna estrecha
  editorial no aplica a checkout) ni `escalaTitulos`. Razón: quitar el "body blanco", no re-tematizar.
- D2: **Fuente del tema = `root.props` del `publishedJson` de la página `home`**, leído con
  `leerDocumentoParaRender` (lectura tolerante, I9 del builder). Razón: es la verdad ya publicada;
  ninguna tienda re-publica.
- D3: **Seam = `resolverTemaPagina({ tenantSlug })` en `getStorefrontProps.ts`**, DEFENSIVA con el
  mismo patrón que `resolverChrome` (try/catch → `null`; el storefront JAMÁS 500ea por el tema).
- D4: **Páginas que ENTRAN**: `/checkout` (`getPropsCheckout`), `/producto/[id]`
  (`getPropsPaginaComprador`), `/checkout/retorno` (`getPropsPaginaEntrega`), `/bases`
  (`getPropsBases` en `getBasesProps.ts`), `/entrega/[token]` (SSR propio en la página).
  **EXCLUIDA**: `/en-pausa` (deliberadamente neutral, no usa `StorefrontLayout`). Fuera: `/login`,
  `/mcp-consent`, `/admin/*`, y `/` + `/[slug]` (ya tematizadas).
- D5: **E2E de cierre**: iselk `/checkout` con fondo lila + Poppins; demo-noche `/checkout` oscuro y
  legible (form Mantine dark-aware, verificado visualmente); sin regresión en autora/prueba/bcac.
- D6 (planner, delegada por el orquestador): **El resolver NORMALIZA los campos no heredados** —
  devuelve el `Tema` con `ambiente:"ninguno"`, `anchoContenido:"contenido"`, `escalaTitulos:"normal"`
  (los defaults del schema). Razón verificada: `_app.tsx:84-87` inyecta la regla CSS de
  `escalaTitulos:"poster"` si viaja en `temaPagina` — el contrato de herencia (D1) debe ser
  ESTRUCTURAL en el resolver, no disciplina de cada página. Con el tema normalizado, las páginas
  derivan el fondo con los helpers existentes (`fondoShellConAmbiente(t.fondoPagina, t.ambiente)` es
  igual a `colorSolidoDeEsquema` porque `ambiente` viene forzado a `"ninguno"`).
- D7 (planner, delegada — el punto "no-op byte-idéntico"): **El resolver devuelve `null` cuando el
  tema normalizado es exactamente el default** (comparado campo a campo contra `TemaSchema.parse({})`
  para que se auto-sincronice con el schema). Análisis verificado: un tema default sería *visualmente*
  no-op igual (`radio:"m"` → `defaultRadius:"md"` = el base de `theme.ts`; `fondoPagina:"superficie"`
  → `var(--mantine-color-body)` = el body actual; `modo:"claro"` no fuerza scheme; `tipografia:
  "plataforma"` no swapea fuentes en `_app`), pero devolver `null` hace el no-op **byte-idéntico**
  (ni `mergeThemeOverrides`, ni `<style>` extra, ni `style=` inline en el shell) — la convención de
  los precedentes (`26-07-26-builder-dreamy-secciones.md`, `26-07-26-builder-countdown-presencia.md`:
  defaults no-op sin v-bump, byte-idénticos).
- D8 (planner, delegada — costo SSR): **una query extra `StorefrontPage.findFirst` por request es
  aceptable y NO se combina con queries existentes.** Es la misma forma de query que la home ya hace
  en cada request (`cargarDocumentoParaRender`), sobre una fila chica seleccionando solo
  `publishedJson`. `resolverChrome` lee OTRA tabla (`Tenant.chromeJson`) — combinarlas acoplaría
  seams que hoy son independientes y defensivas cada una por su lado. En `/bases` el resolver se suma
  al `Promise.all` ya existente (costo en latencia ≈ 0). Nota: el resolver debe seleccionar SOLO
  `publishedJson` (no `draftJson`) — jamás servir borrador en páginas públicas.
- D9 (planner, derivada del diseño existente): **`/entrega/[token]` resuelve el tema por el tenant
  del GRANT** (`entrega.branding.slug`), no por host — la página es host-agnóstica a propósito
  (sirve en el apex; el correo no conoce subdominios) y su branding ya sale del grant. Mismo criterio
  para el tema.

## Plan

1. **F01 — `resolverTemaPagina` (TDD primero)**: nueva función exportada en
   `src/server/storefront/getStorefrontProps.ts` (ADITIVA — el archivo tiene trabajo ajeno sin
   commitear, ver I5). Query `db.storefrontPage.findFirst({ where: { slug: "home", tenant: { slug } },
   select: { publishedJson: true } })` → `leerDocumentoParaRender` → `root.props` → normalizar (D6) →
   `null` si default (D7). `try/catch` → `null` (D3). Orden rojo→verde sugerido: (1) tema custom se
   devuelve normalizado, (2) tema default ⇒ `null`, (3) sin fila / sin published ⇒ `null`,
   (4) JSON podrido ⇒ tolerante, (5) query que lanza ⇒ `null`. (F01)
2. **F01 — derivación de estilo compartida**: un helper client-safe chico (sugerido: en
   `src/styles/estiloSeccion.ts`, aditivo — también tiene trabajo ajeno in-flight) que dado un
   `Tema | null` devuelve `{ estiloShell, colorPagina } | undefined`s reusando
   `fondoShellConAmbiente` + `colorSolidoDeEsquema` — para que las 5 páginas no dupliquen la
   derivación ni diverjan. Cero hex (I1). (F01)
3. **F02 — helpers SSR del comprador**: `zonaComprador` (o cada helper público) suma
   `temaPagina: Tema | null` a las props de `getPropsPaginaComprador`, `getPropsCheckout` y
   `getPropsPaginaEntrega`. La semántica de zona/gate NO cambia (I3). (F02)
4. **F02 — páginas**: `/checkout`, `/producto/[id]` y `/checkout/retorno` derivan
   `estiloShell`/`colorPagina` del `temaPagina` (paso 2) y se los pasan a `StorefrontLayout`.
   `_app` hace radio/tipografía/modo solo (ya es página-agnóstico — NO se toca `_app.tsx`). (F02)
5. **F03 — `/bases`**: `getPropsBases` suma `resolverTemaPagina` al `Promise.all` existente y la
   página lo deriva igual. (F03)
6. **F03 — `/entrega/[token]`**: el `getServerSideProps` propio de la página resuelve el tema con
   el slug del tenant del grant (D9) y la página lo deriva igual. (F03)
7. **Verificación de no-op y E2E**: Vitest filtrado del área + verificación en `:3001` (dev server
   YA corre en :3001 — NO levantar otro, corrompe `.next`). El E2E de navegador es del
   `feature-tester` (carriles MCP posiblemente ocupados — protocolo `browser-verify` §0); puede
   appendear IDs nuevos a `tasks/e2e-storefront.md` (patrón `storefront.tema.NNN`) o listarlos acá.

## Validaciones

### F01 — resolverTemaPagina defensiva + normalización + null-si-default

**Vitest** (integration):
- [x] Con una home publicada con tema custom (ej. `fondoPagina:"marca_suave"`, `tipografia:"dulce"`, `radio:"l"`), devuelve el Tema con esos campos y con `ambiente`/`anchoContenido`/`escalaTitulos` normalizados a sus defaults aunque el published traiga otros valores — `src/__tests__/server/storefront/temaPagina.test.ts::storefront.tema.resolver.001` + `::storefront.tema.resolver.002`
- [x] Con una home publicada cuyo tema (tras normalizar) es exactamente el default del schema, devuelve `null` — `src/__tests__/server/storefront/temaPagina.test.ts::storefront.tema.resolver.003` + `::storefront.tema.resolver.004`
- [x] Sin fila `StorefrontPage` para `home`, o con `publishedJson` null, devuelve `null` — `src/__tests__/server/storefront/temaPagina.test.ts::storefront.tema.resolver.005` + `::storefront.tema.resolver.006`
- [x] Con `publishedJson` podrido/incompleto, no lanza (lectura tolerante) y degrada sin 500 — `src/__tests__/server/storefront/temaPagina.test.ts::storefront.tema.resolver.007`
- [x] Si la query lanza (repo roto), devuelve `null` (defensiva, patrón `resolverChrome`) — `src/__tests__/server/storefront/temaPagina.test.ts::storefront.tema.resolver.008`
- [x] El helper de derivación de estilo: con tema custom devuelve el fondo SÓLIDO del esquema (sin capas de ambiente); con `null` devuelve estilos ausentes (layout byte-idéntico al actual) — `src/__tests__/styles/estiloSeccion.test.ts::tema.heredado.001` + `::tema.heredado.002`
- [x] AGREGADO por el implementer (I7/I1, no estaba en el plan): el resolver lee SOLO `publishedJson` de la `home` de ESE tenant — jamás `draftJson` — con el `where`/`select` exactos capturados del mock — `src/__tests__/server/storefront/temaPagina.test.ts::storefront.tema.resolver.009`

**E2E** (browser):
- [x] (no aplica — se verifica a través de F02/F03) ✅ 2026-07-26 cubierto por tema.001–006

### F02 — /checkout, /producto/[id] y /checkout/retorno heredan el tema

**Vitest**:
- [x] `getPropsCheckout`/`getPropsPaginaComprador`/`getPropsPaginaEntrega` incluyen `temaPagina` poblado para una tienda con tema custom, y `null` para una tienda con tema default — `src/__tests__/server/storefront/temaEnPaginasDePlataforma.test.ts::storefront.tema.props.001` + `::storefront.tema.props.002` + `::storefront.tema.props.003`
- [x] El gate de venta y la zona NO cambian con el campo nuevo: tienda en pausa sigue redirigiendo a `/en-pausa` en las páginas de VENTA, `/checkout/retorno` sigue SIN gate, apex sigue dando `notFound` (el guard estructural `gateVentaEnElBorde.test.ts` sigue verde sin re-semantizar) — `src/__tests__/server/storefront/temaEnPaginasDePlataforma.test.ts::storefront.tema.props.005` (comportamiento) + `src/__tests__/server/storefront/gateVentaEnElBorde.test.ts` (4/4, NO tocado)
- [x] AGREGADO por el implementer (I1, cierra la nota del `backend-reviewer` en F01): con un `ctx` HOSTIL que trae `query.tenantSlug` de otra tienda, el tema se consulta igual con el slug del subdominio resuelto server-side — `src/__tests__/server/storefront/temaEnPaginasDePlataforma.test.ts::storefront.tema.props.004`

**E2E**:
- [x] ✅ 2026-07-26 iselk: `/checkout` sale con fondo lila (`marca_suave`), headings Poppins (par `dulce`) y radio `l` — el botón de marca violeta intacto — `tasks/e2e-storefront.md#storefront.tema.001`
- [x] ✅ 2026-07-26 iselk: `/producto/[id]` y `/checkout/retorno` muestran el mismo shell heredado (fondo + tipografía) — `tasks/e2e-storefront.md#storefront.tema.002`
- [x] ✅ 2026-07-26 (con 1 design finding no bloqueante) demo-noche: `/checkout` sale OSCURO y el form es LEGIBLE (inputs Mantine con contraste correcto en dark — verificación visual) — `tasks/e2e-storefront.md#storefront.tema.003`
- [x] ✅ 2026-07-26 (premisa corregida: hoy la ÚNICA default es `autora`; prueba/bcac son oscuras desde tanda-2) Sin regresión: autora, prueba y bcac renderizan `/checkout` como corresponde a su tema (y una tienda con tema default queda visualmente idéntica a hoy) — `tasks/e2e-storefront.md#storefront.tema.004`

### F03 — /bases y /entrega/[token] heredan el tema

**Vitest**:
- [x] `getPropsBases` incluye `temaPagina` (resuelto dentro del `Promise.all`) sin alterar bases/nav/chrome — `src/__tests__/server/storefront/temaEnPaginasDePlataforma.test.ts::storefront.tema.props.006` (+ `::storefront.tema.props.007`: fuera del storefront sigue dando `notFound` sin consultar el tema)
- [x] La resolución del tema de `/entrega/[token]` usa el tenant del GRANT (host-agnóstica): un token válido resuelve el tema de SU tienda aunque la request llegue por el apex — `src/__tests__/server/storefront/temaEntregaPorGrant.test.ts::storefront.tema.entrega.001` (+ `::storefront.tema.entrega.002` no-op default, + `::storefront.tema.entrega.003` token inválido ⇒ 404 neutral SIN consultar el tema)

**E2E**:
- [x] ✅ 2026-07-26 iselk: `/bases` hereda fondo + tipografía (y conserva nav/chrome como hoy) — `tasks/e2e-storefront.md#storefront.tema.005`
- [ ] ⏭️ PARCIAL 2026-07-26 (host-agnosticidad byte-idéntica + 404 neutral + no-op ✅; el shell TEMATIZADO no se pudo ejercer: no existe grant de tienda tematizada) `/entrega/<token>` (apex, con un grant válido de la DB dev) muestra el shell tematizado del tenant del grant; token inválido sigue dando 404 neutral — `tasks/e2e-storefront.md#storefront.tema.006`

## Invariantes

- I1: **Cero hex inline** — solo tokens/CSS vars vía los helpers existentes (`colorSolidoDeEsquema`,
  `fondoShellConAmbiente`). Tokens per-tenant, `docs/agents/frontend-conventions.md`.
- I2: **El storefront JAMÁS 500ea por el tema**: `resolverTemaPagina` es defensiva (try/catch →
  `null`) y toda página degrada limpia con `temaPagina: null`.
- I3: **La semántica de zona/gate NO cambia**: `getPropsPaginaComprador` sigue gateando por
  facturación, `getPropsPaginaEntrega` sigue SIN gate (protege al Comprador que ya pagó),
  `/entrega/[token]` sigue host-agnóstica y sin gate. `gateVentaEnElBorde.test.ts` no se debilita.
- I4: **`/en-pausa` queda neutral** — no hereda nada.
- I5: **Cambios estrictamente ADITIVOS en archivos con trabajo ajeno sin commitear**
  (`getStorefrontProps.ts` de tanda 3, `estiloSeccion.ts` de tanda 2, y el árbol en general trae
  tandas ajenas: dreamy, countdown, seed de iselk, facturación). No reordenar, no "limpiar", no
  commitear nada — ni lo propio ni lo ajeno.
- I6: **No-op byte-idéntico para tema default**: tienda cuyo tema publicado es el default ⇒
  `temaPagina: null` ⇒ HTML idéntico al de hoy en las 5 páginas. Sin v-bump de schema (no hay
  cambio de schema: esto solo LEE).
- I7: **Solo `publishedJson`** — el resolver nunca lee `draftJson` (jamás borrador en páginas
  públicas).
- I8: **Nunca heredar `ambiente`/`anchoContenido`/`escalaTitulos`** — la normalización vive en el
  resolver (D6), estructural, no por disciplina de página.
- I9: **Dev server único en :3001** — no levantar otro `next dev` (corrompe `.next`).

## Out of scope

- Re-tematización completa de componentes (las Cards/inputs del checkout siguen siendo Mantine
  estándar — heredan solo vía theme/CSS vars).
- `/en-pausa`, `/login`, `/mcp-consent`, `/admin/*`; `/` y `/[slug]` (ya tematizadas).
- Heredar `ambiente`, `anchoContenido` o `escalaTitulos`.
- Cambios de schema Prisma o del schema Zod del builder (cero escrituras; solo lectura del published).
- Re-publicar tiendas (iselk NO necesita re-publicar) y cualquier cambio de seeds.
- Tocar `_app.tsx` (ya es página-agnóstico) o `StorefrontLayout` (ya acepta `estiloShell`/`colorPagina`).
- Commit/push (el árbol tiene tandas ajenas in-flight; el cierre lo decide el usuario).

## Especialistas a consultar

- `backend-reviewer` — el resolver SSR nuevo y los cambios en los helpers de `getServerSideProps`
  (defensividad, no debilitar zona/gate).
- `frontend-reviewer` — la derivación de estilo en las 5 páginas (cero hex, tokens, no-op default).
- `feature-tester` — E2E con `browser-verify` (§0: carriles MCP posiblemente ocupados por otras
  sesiones): iselk/demo-noche/regresión + legibilidad dark del form.

## Bitácora

- [2026-07-26 00:00] [planner-grill] Arranque directo en fase de PLAN: el grill ocurrió vía
  orquestador↔usuario antes de esta invocación (síntoma en producción iselk /checkout blanco;
  alcance, seam, páginas, herencia mínima y E2E de cierre ya decididos con visto bueno del usuario
  — D1–D5). No se re-preguntó lo decidido.
- [2026-07-26 00:00] [planner-grill] Verificación en código del planner: (a) no-op default —
  `radio:"m"`→`defaultRadius:"md"` = base de `theme.ts:165`; `superficie`→`var(--mantine-color-body)`;
  `claro` no fuerza scheme; `plataforma` no swapea fuentes ⇒ default es visualmente no-op, y con
  D7 (null-si-default) queda byte-idéntico. (b) `_app.tsx:84-87` inyecta CSS de `escalaTitulos:
  "poster"` si viaja en `temaPagina` ⇒ nace D6 (normalización estructural en el resolver).
  (c) `/entrega/[token]` es host-agnóstica (apex, branding del grant) ⇒ D9. (d) `getStorefrontProps.ts`
  y `estiloSeccion.ts` tienen trabajo ajeno sin commitear (tanda 3 / tanda 2) ⇒ I5 aditivo estricto.
  (e) Único test existente que roza el área: `gateVentaEnElBorde.test.ts` (guard de imports) — no
  debe debilitarse; no hay tests que haya que borrar.
- [2026-07-26 00:00] [planner-grill] Plan escrito. D6–D9 son decisiones técnicas delegadas por el
  orquestador ("decidir y documentar"), no preguntas nuevas al usuario. AWAITING USER APPROVAL.
- [2026-07-26 17:25] [feature-implementer] Arranca implementación. Visto bueno explícito del usuario
  al plan completo (relevado por el orquestador). Features pendientes: F01, F02, F03. Read pass
  completo hecho: `_template.md`, `CLAUDE.md`, `docs/agents/frontend-conventions.md` (§Theming,
  §Mantine), `docs/agents/backend-conventions.md` (§Props del SSR JSON puro), y el código del área
  (`getStorefrontProps.ts`, `getBasesProps.ts`, `estiloSeccion.ts`, `_app.tsx`, `storefront-layout.tsx`,
  `schema.ts` TemaSchema, `migrate.ts` leerDocumentoParaRender, las 5 páginas + `index.tsx` como
  referencia de derivación, `gateVentaEnElBorde.test.ts`, `getEditorProps.test.ts` como patrón de
  mock de `~/server/db`). ADR-0011 y ADR-0016 no existen con esos nombres de archivo (los reales son
  `0011-migracion-ui-a-mantine-7.md` y `0016-pagina-de-tienda-documento-json-registro-zod.md`); se
  leyó el área de código que instancia ambos en vez de los ADR (theming per-tenant en `_app` +
  Documento de Página en `getStorefrontProps`).
- [2026-07-26 17:40] [feature-implementer] **F01 implementada** (TDD, `Skill("tdd")` — 4 ciclos
  rojo→verde reales + 5 guards de degradación escritos después contra el mismo contrato).
  Archivos: `src/server/storefront/temaPagina.ts` (NUEVO), `src/styles/estiloSeccion.ts` (ADITIVO al
  final: `EstiloHeredadoDeTema` + `estiloHeredadoDeTema` + 1 import de tipo),
  `src/__tests__/server/storefront/temaPagina.test.ts` (NUEVO, 9 tests),
  `src/__tests__/styles/estiloSeccion.test.ts` (ADITIVO, 1 describe / 2 tests).
  Vitest filtrado: **56/56 verde** (9 del resolver + 47 del archivo de estilos, sin regresión en los 45
  preexistentes). `backend-reviewer` **APPROVE**, 0 blockers, 0 nits de código.
  **DOS desviaciones de la LETRA del plan, ambas auditadas y aprobadas por el reviewer**:
  (a) **Ubicación del módulo**: D3 decía "el resolver vive en `getStorefrontProps.ts`". Está en su
  propio archivo `src/server/storefront/temaPagina.ts` porque cumplir D3 al pie habría exigido
  re-semantizar el guard `gateVentaEnElBorde.test.ts::facturacion.gate.borde.005`, que exige
  literalmente que `pages/entrega/[token].tsx` NO importe NADA de `getStorefrontProps` (todos los
  helpers de ese módulo resuelven por HOST y la entrega es host-agnóstica: el enlace del correo apunta
  al apex). I3 + la validación de F02 ("sigue verde sin re-semantizar") prohíben tocarlo, así que
  ganaron los invariantes sobre la decisión de ubicación. Bonus: el módulo nuevo no sabe qué es un
  host ⇒ la host-agnosticidad de `/entrega` pasa a ser propiedad del MÓDULO, no disciplina del call
  site; y le suma menos líneas a `getStorefrontProps.ts` (I5). Precedente idéntico en el repo:
  `getBasesProps.ts` vive aparte por el mismo tipo de cordón.
  (b) **Normalización como ALLOWLIST y no como lista de exclusiones**: D6 enumera 3 campos a normalizar
  (`ambiente`/`anchoContenido`/`escalaTitulos`); `soloLoHeredable` parte de `TemaSchema.parse({})` e
  injerta SOLO los 4 heredados de D1. Razón: D1 dice "se hereda SOLO esos 4" y una allowlist hace que
  cualquier campo FUTURO de `TemaSchema` nazca no-heredado (fail-closed) en vez de colarse a las 5
  páginas hasta que alguien se acuerde de actualizar una lista negra. Efecto lateral: `vibe` también se
  normaliza; es inocuo y verificado (`tenantTheme.ts:181` lo documenta como campo reservado SIN efecto
  de render, y no aparece en `_app` ni en el layout). El reviewer lo revisó explícitamente y pidió NO
  revertir. Queda REVISABLE por el usuario: revertir es cambiar 4 líneas.
  Hallazgo de la pasada roja, que vale como nota de dominio: `TemaSchema` es `.strict()` y
  `leerDocumentoParaRender` hace `safeParse` del `root.props` COMPLETO ⇒ **un solo valor de enum
  inválido tira el tema entero a defaults** (mi fixture tenía `radio:"xl"` y `vibe:"vivo"`, que no
  existen: los válidos son `nulo|s|m|l|completo` y `nitido|suave|editorial`). Es la degradación
  tolerante correcta (I9) y ahora está cubierta por `storefront.tema.resolver.007`.
  Nota del reviewer arrastrada a F02/F03: la firma `resolverTemaPagina({ tenantSlug })` no impide
  estructuralmente que alguien le pase un slug de `ctx.query`; el contrato de que el slug sale del
  host o del grant (I1) queda en disciplina del call site y hay que verificarlo al cablear las 5
  páginas. Entra al checklist del review de F02/F03.
  Entorno: `npx` se cayó a mitad de la corrida (`node_modules/.bin` quedó VACÍO — otra sesión tocando
  node_modules) ⇒ los tests se corren con `node node_modules/vitest/vitest.mjs run <archivo>`, que
  sigue siendo filtrado. No se levantó ningún dev server (I9); no se corrió la suite completa ni
  `npm run check` (es del tester / change-set-reviewer).
  Drift de doc: **diferido al cierre de F03** a propósito — el patrón documentable ("las páginas de
  plataforma heredan el tema mínimo vía `resolverTemaPagina` + `estiloHeredadoDeTema`") solo queda
  formado cuando las 5 páginas lo consumen; proponer un diff ahora y otro después sería ruido.
- [2026-07-26 17:52] [feature-implementer] **F02 implementada**. Archivos: `getStorefrontProps.ts`
  (ADITIVO: 1 import + `PropsStorefront.temaPagina` + la llamada en `zonaComprador` + el `null`
  explícito de `getPropsEnPausa`), `src/pages/checkout/index.tsx`, `src/pages/producto/[id].tsx`,
  `src/pages/checkout/retorno.tsx` (cada una deriva con `estiloHeredadoDeTema` y pasa
  `estiloShell`/`colorPagina` a `StorefrontLayout`), `src/__tests__/server/storefront/temaEnPaginasDePlataforma.test.ts`
  (NUEVO, 5 tests). NO se tocó `_app.tsx` ni `StorefrontLayout` (out of scope: ya eran
  página-agnósticos). Vitest filtrado del área: **83/83 verde** (`server/checkout/` +
  `server/storefront/`), con `gateVentaEnElBorde.test.ts` 4/4 SIN tocarlo (I3 cumplido).
  `tsc --noEmit`: **0 errores míos** (queda 1 AJENO, `enviarCorreoDescargaDeOrden.ts` ↔
  `plantillaDescarga.ts`, de la tanda de correos in-flight — no lo toqué, I5).
  `frontend-reviewer` **APPROVE** y `backend-reviewer` **APPROVE**, 0 blockers.
  Decisiones tácticas: (a) la llamada al resolver vive en el helper PRIVADO `zonaComprador` (un solo
  call site para las 3 páginas, en vez de 3) — cuesta una query de tema en el camino del redirect por
  pausa, y ambos reviewers coincidieron en que es el trade-off correcto porque 3 call sites reabren la
  deriva entre páginas que ESTA feature vino a cerrar; (b) las páginas pasan las props por separado
  (`estiloShell={estiloShell}`) y no por spread — el frontend-reviewer confirmó que con `undefined`
  React omite el atributo `style` por completo ⇒ el no-op de D7/I6 es byte-idéntico igual.
  **Riesgo REAL encontrado y deliberadamente NO arreglado** (ambos reviewers de acuerdo, queda para el
  E2E y para el usuario): `fondoShellConAmbiente` devuelve SOLO `background`, sin el color de texto
  emparejado que sí trae `esquemaACss`. En la home no importa (cada sección se pinta sola), pero acá el
  contenido cuelga directo del shell ⇒ una tienda con `fondoPagina` OSCURO (`marca`, `tinta`,
  `tinta_profunda`…) Y `modo:"claro"` daría fondo oscuro con texto tinta = ILEGIBLE. No se emparejó el
  color porque heredarlo rompería las `Card` del checkout (Card con fondo claro + texto blanco heredado
  = blanco sobre blanco), y porque D1 acota la herencia al fondo y D5 manda la legibilidad al E2E.
  **Censo de los tenants de hoy: ninguno cae en la combinación riesgosa** — iselk/demo-dreamy
  `marca_suave`+claro, demo-editorial `marfil`+claro, demo-noche `tinta_profunda`+OSCURO (verificado en
  `scripts/seed-demos-kpop.ts:96-101,355-360,544-549`). El `frontend-reviewer` sugirió, como carril
  aparte y no bloqueante, un guard barato que detecte esa combinación en vez de depender del censo.
  **3 NITS diferidos, ninguno bloqueante** (anotados para el usuario): (1) `resolverTemaPagina` podría
  tomar `{ branding: TenantBranding }` en vez de `{ tenantSlug }` para hacer I1 estructuralmente
  irrompible (como `cargarDocumentoParaRender`); se mantuvo `tenantSlug` porque es la firma que declara
  D3 y la que ya usan sus hermanos `resolverNavPaginas`/`resolverChrome` en el mismo archivo.
  (2) `Promise.all` entre el tema y los campos del checkout: seguro (el tema nunca lanza) pero
  prematuro. (3) La query de tema desperdiciada en el redirect por pausa.
  E2E: los 6 checks nuevos quedaron escritos en `tasks/e2e-storefront.md` (sección «Herencia del tema
  de la Tienda en las páginas de PLATAFORMA», IDs `storefront.tema.001`–`006`, incluye ya los 2 de
  F03) y referenciados desde las Validaciones. Ninguno ejecutado — son del `feature-tester`.
- [2026-07-26 18:02] [feature-implementer] **F03 implementada — implementación COMPLETA (F01+F02+F03)**.
  Archivos: `src/server/storefront/getBasesProps.ts` (el resolver entra al `Promise.all` que YA existía
  ⇒ costo en latencia ≈ 0, D8; + `PropsBases.temaPagina`), `src/pages/bases.tsx`,
  `src/pages/entrega/[token].tsx` (su `getServerSideProps` propio resuelve por
  `entrega.branding.slug` = el tenant del GRANT, D9), + 2 tests en
  `temaEnPaginasDePlataforma.test.ts` y `src/__tests__/server/storefront/temaEntregaPorGrant.test.ts`
  (NUEVO, 3 tests). Vitest filtrado: **119/119 verde** (`server/storefront/` + `styles/`).
  `tsc --noEmit`: **0 errores míos** (aparecieron 3 AJENOS nuevos en
  `src/__tests__/server/correo/enviarConfirmacionDeCompra.test.ts` mientras corría esto — la tanda de
  correos está editando en paralelo; no los toqué, I5).
  `backend-reviewer` **APPROVE** + `frontend-reviewer` **APPROVE**, 0 blockers. Los 2 nits del
  frontend-reviewer SÍ se aplicaron (eran baratos y servían al objetivo de "el mismo gesto en las 5
  páginas"): se niveló el comentario del no-op en `/entrega/[token]` y se consolidó el import duplicado
  de `~/styles/tenantTheme`.
  Verificaciones que valen la pena registrar: (a) el guard `facturacion.gate.borde.005` sigue verde y
  el backend-reviewer lo confirmó por LECTURA ESTÁTICA, no solo por el reporte de Vitest — el import
  nuevo de la página de entrega es de `~/server/storefront/temaPagina`, otro módulo, así que el
  `toEqual([])` del guard no se toca; (b) en `/entrega/[token]` el tema se resuelve DESPUÉS del
  `if (!entrega) return { notFound: true }` ⇒ un token inválido no dispara ninguna query de tema
  (cubierto por `storefront.tema.entrega.003`); (c) `Tema` son enums/strings puros ⇒ nada de
  `Date`/`Decimal` cruzando a props (el bug histórico de `/bases`), y no arrastra `keyServerOnly`.
  Nota del backend-reviewer sobre el patrón de test: `temaEntregaPorGrant.test.ts` es el ÚNICO test del
  repo que importa un módulo de `~/pages/*` para ejercitar su `getServerSideProps` real. Lo aprobó como
  correcto ACÁ porque `/entrega/[token]` es la única de las 5 páginas cuyo SSR es propio y no delega en
  un helper de `server/storefront/*` (D4 lo dice explícitamente), y un guard estructural solo podría
  vigilar qué importa el archivo, no que el cableado slug-del-grant → query → prop funcione de verdad.
  Si algún día esa lógica se extrae a un helper, el test debería seguirla. REVISABLE.
- [2026-07-26 18:04] [feature-implementer] **Drift de documentación DETECTADO y PROPUESTO — NO aplicado**
  (los dos reviewers lo marcaron como pendiente real de este cierre). Con las 5 páginas consumiendo el
  mismo par, el patrón ya está formado y `docs/agents/frontend-conventions.md` no lo menciona (grep sin
  resultados para `resolverTemaPagina`/`estiloHeredadoDeTema`). Diff propuesto: sección nueva
  «## Herencia del tema de la Tienda en páginas de PLATAFORMA (storefront)» junto a las otras secciones
  de storefront, con (a) el par resolver-defensivo + helper puro, (b) el contrato `null → {}` y por qué
  el no-op tiene que ser byte-idéntico, (c) la distinción contra el patrón INLINE de `home`/`[slug]`
  (que trabajan sobre un `Tema` siempre presente y sí heredan `ambiente`/`anchoContenido`), y (d) el
  caveat de legibilidad (el fondo se hereda SIN su color de texto emparejado, a propósito, porque
  emparejarlo rompería las `Card`). El texto completo va en el reporte al orquestador con las 4
  opciones. NO se tocó `CONTEXT.md`, `CLAUDE.md` ni `docs/adr/` (fuera del rol del implementer).
  **AWAITING ANSWER del usuario** solo para esto; la implementación NO depende de la respuesta.
- [2026-07-26 18:05] [feature-implementer] **Implementación completa. F01..F03 escritas, 4 reviews
  APPROVE (2 backend + 2 frontend), 0 blockers.** Vitest filtrado del área **119/119**; `tsc` sin
  errores propios; suite completa y `npm run check` NO corridos (son del `feature-tester` /
  `change-set-reviewer`). Sin commit, sin dev server nuevo, sin tocar nada ajeno (I5).
  `status: implementing → testing`. Listo para `feature-tester` (6 checks E2E en
  `tasks/e2e-storefront.md`, IDs `storefront.tema.001`–`006`; el 003 —legibilidad del form en dark de
  demo-noche— y el 004 —no-op de las tiendas con tema default— son los dos que más importan).
- [2026-07-26 21:55] [planner-grill de `productos-tipos-digitales` — aviso CROSS-CARRIL] La **ENMIENDA E1–E12** de `26-07-26-productos-tipos-digitales.md` (AWAITING USER APPROVAL) decide que **`/producto/[id]` MUERE** con redirect al home de la tienda (E2/E12: todo se agrega desde la tarjeta; los packs son tarjetas propias en un widget nuevo `packs`). Impacto en ESTE plan: F02/D4 la incluyen entre las páginas que heredan el tema — si la enmienda se aprueba, esa página deja de existir y este plan pierde ese alcance (y su check E2E `storefront.tema.002` pierde la mitad de `/producto/[id]`). Coordinar el orden de aterrizaje: si este carril ya la tematizó, el redirect de la enmienda la reemplaza sin conflicto (el trabajo tematizado muere con ella); si no, sacarla del alcance directamente. Nada más de este plan se toca (checkout, retorno, /bases, /entrega siguen vivos y la enmienda hasta REFUERZA `/entrega` como superficie).
- [2026-07-26 22:30] [planner-grill de `productos-tipos-digitales` — actualización del aviso CROSS-CARRIL] La enmienda E1–E12 fue **RECHAZADA por el usuario y reescrita como ENMIENDA v2** (un pack ES un producto; sin widget `packs`). **Lo load-bearing para este plan NO cambia: `/producto/[id]` MUERE igual** con redirect al home (decisión E2, vigente en v2). Solo la mención al «widget nuevo packs» del aviso anterior quedó obsoleta. La coordinación de aterrizaje descrita arriba sigue tal cual.
- [2026-07-26 18:46] [feature-tester] **Corrida de validación COMPLETA — Vitest 119/119 + E2E 5 PASS /
  1 PARCIAL / 0 FALLOS.** (Tercera vuelta: las dos anteriores murieron por errores de API sin alcanzar a
  escribir Bitácora; esta es la PRIMERA entrada del tester, no hay nada duplicado.)
  **Vitest** re-corrido de cero (`server/storefront/` + `styles/`, 10 archivos): **119/119 verde**,
  confirmando el número del run 1. Los 25 IDs citados en Validaciones existen de verdad en la suite
  (verificado por grep antes de marcar un solo checkbox). `gateVentaEnElBorde` 4/4 sin tocar (I3).
  **Carriles**: chrome-devtools tenía un profile-lock de un browser NO atachado a mi MCP ⇒ **no se
  expropió** (§0 de `browser-verify`: podía ser de otro agente); todo el E2E fue por **Playwright**.
  Cero navegadores cerrados, cero dev servers levantados (I9: se usó el :3001 del usuario), **cero
  escrituras en DB** (las consultas de censo fueron read-only y sus scripts `tmp/*.ts` se borraron por
  el precedente de que ensucian `tsc`).
  **001 iselk /checkout** ✅ — el síntoma que originó el plan está muerto: shell `rgb(242,235,253)`
  IDÉNTICO al de la home, "Finalizar compra" en Poppins (ya no Fraunces), radius 1rem / input 16px,
  botón `#7c3aed` intacto, `backgroundImage:none` y 0 reglas poster.
  **002** ✅ `/producto/[id]` y `/checkout/retorno` con el mismo shell. **005** ✅ `/bases` hereda y
  conserva nav + visor de PDF + disclaimer ADR-0008.
  **003 demo-noche /checkout (el crítico)** ✅ — oscuro con `scheme=dark` forzado y el form REALMENTE
  legible: input `#c9c9c9` sobre `#2e2e2e`, Card/Alert/labels dark-aware, H1 Anton sólido. **Ningún
  control quedó tinta sobre near-black**, que era el riesgo declarado en D5 y el que el implementer
  flaggeó (fondo heredado SIN color de texto emparejado). El censo del implementer se confirma: ningún
  tenant de hoy cae en la combinación riesgosa. **DESIGN FINDING no bloqueante (§3.5)**: 13 de 20 nodos
  de texto quedan bajo WCAG AA 4.5:1, el peor en **3.53:1** (secundarios de 12px: "$3.000 c/u",
  "Quitar", la caption del resumen). Antes de reportarlo como regresión corrí el **control sobre la HOME
  del mismo tenant**: 81/158 nodos bajo el umbral, con casos peores ⇒ la dimness es el carácter del tema
  oscuro de esa tienda (el `dimmed` estándar de Mantine), no algo que introduzca esta feature. Si el
  usuario quiere subirlo, es una decisión de tema del tenant, no de este plan.
  **004 no-op (el otro crítico)** ✅ **pero con la PREMISA DEL CHECK CORREGIDA**: `prueba` y `bcac`
  **ya no son tema default** — la tanda-2 (F11–F14) las republicó como réplicas OSCURAS
  (`prueba`: tinta_profunda_acento/cartel/s/oscuro · `bcac`: tinta/energia/l/oscuro). Hoy la **única**
  tienda de tema default es `autora` (`root.props = {}`). Sobre ella el no-op es limpio:
  `"temaPagina":null`, shell **sin `style=` inline**, **0** `<style>` de override de tipografía y **1
  sola** ocurrencia de `setAttribute(data-mantine-color-scheme)` — la misma que sirve el apex de
  plataforma (el grep de `"dark"` da 1 en todos los tenants, pero es el selector CSS de Mantine, no un
  forzado: falso positivo descartado comparando contra `/login` del apex). Render: blanco + Fraunces +
  rosa de marca = exactamente lo de antes. `prueba` y `bcac` renderizan según SU tema, sin nada roto.
  **MATIZ HONESTO SOBRE I6**, que vale decir en voz alta: el render es byte-idéntico, pero el payload de
  `__NEXT_DATA__` **sí gana la clave `"temaPagina":null`** (~18 bytes, cero efecto visual/DOM). Los tres
  artefactos que D7 enumera (`mergeThemeOverrides`, `<style>` extra, `style=` inline) están los tres
  ausentes, así que el espíritu de D7/I6 se cumple; la letra "el HTML no cambia en NADA" tiene esa única
  excepción inevitable si la prop existe.
  **006 /entrega por el APEX** ⏭️ **PARCIAL — la única mitad no ejercida de toda la corrida.** Verificado
  ✅: grant real de `autora` por el apex da 200 con la identidad de la tienda del GRANT; **host-agnosticidad
  probada FUERTE** — el mismo token por apex y por `autora.localhost` devuelve cuerpo **BYTE-IDÉNTICO**
  (36.508 bytes los dos), que es la evidencia más dura posible de D9/I3; token basura ⇒ **404 neutral**;
  y el grant de `e2e-numeros` ejerce la OTRA rama null (tenant sin fila `home`). ⏭️ NO ejercido: ver el
  shell **tematizado** de una tienda con tema. Razón concreta: **no existe ni un solo `DownloadGrant` de
  una tienda tematizada** — censo completo: 6 grants, 4 de `e2e-numeros` y 2 de `autora`, ninguna con
  tema. Fabricar uno exige una orden PAGADA ⇒ escritura en DB (no autorizada) + túnel de Flow (caído).
  El cableado slug-del-grant→tema sí está cubierto por Vitest (`storefront.tema.entrega.001`, verde).
  **I8 verificado con controles REALES** (no estaba pedido, pero era el invariante caro y había tenants
  perfectos para probarlo): `escalaTitulos:poster` de `prueba` ⇒ la regla `.st-titulo-poster` aparece en
  su HOME (1) y **desaparece** en su `/checkout` (0); `ambiente:neon` de `demo-noche` ⇒ la home lleva
  capas `radial-gradient` de glow y el checkout el color **SÓLIDO** `color-mix`; ídem `focos_marca` de
  `bcac` (home con gradientes, checkout con `gray-9` sólido). La normalización estructural del resolver
  (D6, la desviación ALLOWLIST que el implementer eligió) hace exactamente el trabajo que prometía.
  **Auto-retries**: 2, ambos en el mismo punto — el catálogo de `demo-noche` es un carrusel en animación
  infinita, así que Playwright nunca lo considera "stable"; resuelto con un click DOM real sobre el botón
  Agregar. No hubo un solo fallo funcional que reintentar.
  **Nada de `state`/`status` tocado** — eso lo decide el usuario. Sin commit (I5: el árbol sigue con
  tandas ajenas in-flight). Log narrativo completo en `tasks/.e2e-run.log`; screenshots en `tmp/ft3-*.png`.

- **2026-07-26 · orquestador — verificación extra del usuario + CIERRE (visto bueno explícito)**
  A pedido del usuario, prueba manual del funnel COMPLETO sobre `prueba` (BCAC, tema oscuro, Flow
  sandbox — censo DB: sandbox=true en `test-seed-a`/`test-seed-b`/`prueba`; `autora` es producción):
  checkout → pasarela Flow sandbox → Webpay (tarjeta de prueba Transbank) → auth banco → pago aceptado →
  `/checkout/retorno` tematizado (oscuro, Bebas Neue, legible). La orden quedó PENDIENTE en DB: el
  webhook necesita el túnel cloudflared (no levantado) — limitación conocida del entorno local, no de la
  feature. **Navbar verificado**: hereda el TEMA (tokens ⇒ header oscuro e integrado), pero el CHROME
  global no se pasa en las páginas de plataforma (header `vidrio` default + nav hardcodeado vs
  `fondo:"pagina"` + nav derivado de la home) — comportamiento PRE-existente, no regresión. Follow-up
  candidato: pasar `resolverChrome` + `navPaginas` a las mismas 5 páginas. El drift de
  `frontend-conventions.md` se aplicó tal cual (opción 1 del usuario). Usuario decidió opción 2 del
  tester: F01–F03 `passing` + `status: done` + INDEX a Cerradas recientes. Screenshots:
  `tmp/tmp-checkout-prueba-dark.png`, `tmp/tmp-retorno-prueba-dark.png`.
