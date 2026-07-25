---
slug: builder-tanda-2-fidelidad
status: testing                 # planning | implementing | testing | done
owner: nicolas
created: 2026-07-25
related_adrs: [ADR-0016, ADR-0017, ADR-0018, ADR-0013, ADR-0005]
related_context: [Tienda, Documento de página, Sección, Widget, Overlay, Editor MCP]

features:
  - id: F01
    behavior: "Widget `vitrina_proximamente` (sección): grid 1–8 de lanzamientos futuros BLOQUEADOS {titulo ≤60, subtitulo? ≤80, imagenUrl?} con candado Tabler + tratamiento visual grayscale/opacidad + chip Próximamente + nota al pie opcional. Registro/render/nav aditivos, migración no-op."
    state: active

  - id: F02
    behavior: "Hero split con `visual` discriminado opcional — {tipo:'imagen', url, holo?} | {tipo:'tarjeta', titulo ≤60, subtitulo? ≤80, icono? (ICONOS_BENEFICIO), holo?} (holocard SIN imagen con título/ícono dentro), reusando MarcoHolo. Sin `visual` ⇒ comportamiento actual (imagenUrl/gradiente)."
    state: active

  - id: F03
    behavior: "Ancho intermedio `card` (~420px) en `imagen_destacada`: el enum `ancho` gana `card` (queda `card|contenido|completo`, default `contenido` = no-op). La holocard compacta que no ocupa 900px."
    state: active

  - id: F04
    behavior: "Eyebrow del hero con color propio: `eyebrowEstilo?: 'marca'|'acento'|'texto'` (default `marca` = comportamiento actual). Desacopla el eyebrow del token de primario (el eyebrow dorado del mockup con marca violeta)."
    state: active

  - id: F05
    behavior: "Stage-lights: `ambiente?: 'ninguno'|'focos_marca'|'focos_acento'|'aurora'` en TemaPagina que pinta 2-3 radial-gradients FIJOS de tokens (primario/acento a baja opacidad) sobre el fondo del shell. SSR-safe, CSS puro estático, default `ninguno` = no-op."
    state: active

  - id: F06
    behavior: "Espaciado fino por sección: `padTop`/`padBottom` (enum ESPACIADO_V) opcionales en EstiloSeccion que overridean `padY` cuando presentes. Sin overrides ⇒ `py` idéntico al actual (no-op)."
    state: active

  - id: F07
    behavior: "Patrones de fondo nuevos: PATRONES gana `cuadricula_papel` (papel cuadriculado v4) y `arcos` (motivo scallop v5) como CSS puro de tokens en patronACss. Lo no viable en CSS puro queda ANOTADO."
    state: active

  - id: F08
    behavior: "Pack de tickets (1 producto → K tickets por cantidad): NO se construye. Decisión de producto/checkout ANOTADA como pendiente del usuario."
    state: active

  - id: F09
    behavior: "Re-réplica de la tienda `bcac` a su techo: vitrina_proximamente real + holocard en hero split compacta (visual tarjeta/imagen holo) + stage-lights violeta (ambiente) + composición fina (padTop/padBottom). Vía `scripts/seed-bcac.ts` (apply_page+publicar)."
    state: active

  - id: F10
    behavior: "Re-réplica de la tienda `prueba` (landing_idol) a su techo con los ajustes de composición fina que el tester listó (hero compacto sin el void del full-viewport, spacing exacto del mockup). Vía `tmp/replicar-landing-idol-tanda2.ts`."
    state: active

  - id: F12
    behavior: "CORRECCIÓN de fidelidad de la réplica `demo-dreamy` vs el prototipo original `dev-ref/variant-dreamy` (8 diffs con screenshots). (1) BUG de contraste de `sorteo_vitrina` sobre esquema oscuro/bicolor (texto gris ilegible) — sus textos/badges/alert consumen el color EMPAREJADO del esquema (derivado de currentColor) en vez de dimmed/gray fijos, solo sobre fondo oscuro (no-op sobre claro, I-H). (2) Widget `packs_precio` NUEVO (tarjetas de precio con destacado + badge de acento). (3) Widget `momento_ticket` NUEVO (tarjeta aspiracional '¡Estás dentro!' con código de sorteo). (4) Covers de catálogo con hue variado determinista (hue-rotate por hash del título, cero hex). (5) Hero visual tarjeta gana `estilo:'suave'` (glassy: blur-blobs de tokens). (6) `estadisticas` gana `estiloVisual:'tarjetas_suaves'` (cards blancas sombra suave). (7) Re-seed de `demo-dreamy` (fondo claro sin aurora saturada, sin ticker, stats en tarjetas, packs_precio, momento_ticket, banner premio compacto). Todo aditivo/no-op; NO toca `dev-ref/`; autora/prueba/bcac intactas."
    state: active
---

# Builder Tanda 2 — fidelidad al techo (los 6 gaps de la Tanda 1)

## Contexto

La Tanda 1 (`26-07-24-builder-tanda-1.md`, F01–F14, testing) llevó las réplicas de los dos mockups del cliente a ~88% (`landing_idol`→`prueba`) y ~75% (`tienda-libro`→`bcac`). El feature-tester anotó **6 gaps de fidelidad** en la Bitácora de F14 (línea 311) + los accionables del veredicto visual (312–318). La directiva del usuario para esta tanda: los gaps "se deberían poder" — las réplicas deben llegar al **techo de los guardrails (~95%+)**, sin romper ningún invariante (cero hex libre, enums curados, SSR-safe, migración no-op, autora byte-idéntica).

Los 6 gaps (F14 Bitácora) y su mapeo a features:
1. `vitrina_proximamente` (widget dedicado de "próximos bloqueados") → **F01**.
2. Pack de tickets (dominio/checkout) → **F08 (solo anotación, NO se construye)**.
3. `imagen_destacada` sin ancho intermedio (holocard 864×1150 sobredimensionada) → **F03**.
4. Hero split con visual holo (la holocard no vive dentro del hero) → **F02**.
5. Eyebrow independiente del primario (el eyebrow dorado con marca violeta) → **F04**.
6. Fondo de página con stage-lights (radiales sobre near-black) → **F05**.

Más dos ejes de "composición fina" que el tester marcó como accionables (el void del hero full-viewport en `prueba`; el spacing del mockup): **F06** (padTop/padBottom) + **F07** (patrones que faltan para los 8 prototipos del repo). El cierre (**F09/F10**) re-replica AMBAS tiendas a su techo con las capacidades nuevas. Insumos del grill: `.scratch/page-builder/mapa-potencial-editores.md` (§2 tabla de gaps, §5 Tanda 2) + Bitácora F14 de la Tanda 1.

TODO es **aditivo, enums curados, migración no-op** (directiva). No se tocan procedures de mutación ni authz — es registro (`~/lib/pagebuilder`) + render (`~/components/storefront`) + vocabulario MCP (`describir()` en `tools.ts`) + los scripts de réplica.

## Decisiones

- **D1 — `vitrina_proximamente` es un widget de SECCIÓN nuevo, no una variante de un widget existente.** Props: `titulo?` ≤80 (encabezado de sección), `columnas` ∈ {2,3,4} default 3, `items` (1–8) de `{titulo ≤60, subtitulo? ≤80, imagenUrl?}`.strict(), `notaPie?` ≤120. Render: grid de tarjetas, cada una con imagen (`ImagenConFallback` si hay `imagenUrl`, o placeholder tematizado) bajo `filter: grayscale(1) + opacity` (tratamiento "bloqueado"), candado `IconLock` (Tabler) superpuesto, título + subtítulo dimmed + chip "Próximamente". Nav: `ANCLA_POR_TIPO.vitrina_proximamente="proximos"` + `ETIQUETA_POR_TIPO="Próximos"` (aditivo). Razón: gap #1 exige un widget dedicado; `beneficios_grid`+candado fue la aproximación pobre de F14.
- **D2 — El `icono` de la tarjeta-visual del hero (F02) es `ICONOS_BENEFICIO` (enum Tabler curado), NO un emoji libre.** El mockup usa un emoji dentro de la holocard-placeholder, pero I-A prohíbe strings libres (un emoji arbitrario es contenido no curado). Se mapea a Tabler (mismo criterio que TODO ícono del builder). REVISABLE si el usuario quiere específicamente un set de emojis curado como enum aparte.
- **D3 — El ancho `card` va en el enum `ancho` EXISTENTE de `imagen_destacada`, no en un campo `anchoVisual` nuevo.** El gap #3 es "al enum `ancho` (`contenido|completo`) le falta un valor intermedio". Agregar `card` al enum existente (`["card","contenido","completo"]`, default `contenido`) es la corrección mínima y aditiva que produce exactamente el enum `card|contenido|completo` de la directiva, y evita DOS campos de ancho compitiendo en el mismo widget (peor para el MCP/LLM). `card` ⇒ `max-width ~420px`. REVISABLE si el usuario prefiere un campo separado.
- **D4 — `eyebrowEstilo` desacopla el color del eyebrow del token de primario.** `heroProps` gana `eyebrowEstilo: enum ["marca","acento","texto"].default("marca")`. `marca` = `--mantine-primary-color-filled` (comportamiento ACTUAL, no-op). `acento` = `--mantine-color-acento-filled` con fallback a marca (I-T2, degrada sin acento). `texto` = color de texto heredado (`inherit`/dimmed). Cierra gap #5 (eyebrow dorado con marca violeta). Cero hex (I-A).
- **D5 — `ambiente` es un campo NUEVO del TemaPagina, ortogonal a `fondoPagina`.** `fondoPagina` (enum sólido) sigue pintando el color base del shell; `ambiente` (enum `ninguno|focos_marca|focos_acento|aurora`, default `ninguno`) AÑADE una capa de 2-3 `radial-gradient` FIJOS (posiciones y opacidades curadas) de tokens del tenant sobre ese color base. Es CSS 100% estático (sin JS, sin rAF, sin `window`) ⇒ SSR-safe y reduced-motion-irrelevante (no anima). `ninguno` ⇒ el shell no cambia (no-op, I-H). El helper `fondoShellConAmbiente(fondoPagina, ambiente)` vive en `estiloSeccion.ts` (puro). Cierra gap #6 (stage-lights). Cero hex (I-A).
- **D6 — `padTop`/`padBottom` son overrides OPCIONALES de `padY`, no lo reemplazan.** `EstiloSeccion` gana `padTop?: ESPACIADO_V`, `padBottom?: ESPACIADO_V`. Cuando AMBOS ausentes ⇒ el wrapper usa `py={r.py}` byte-idéntico al actual (no-op, I-H). Cuando alguno presente ⇒ el wrapper pasa a `pt`/`pb` (el lado sin override cae al `padY` base). Cierra la "composición fina" (#3 del usuario): el hero pegado al nav sin el void del full-viewport.
- **D7 — PATRONES gana `cuadricula_papel` y `arcos`; lo no viable en CSS puro queda anotado.** `cuadricula_papel` = grilla de papel-cuaderno (`linear-gradient` doble, celda ~28px, trazo del token — es la textura del prototipo v4). `arcos` = motivo scallop/arcos repetido vía `radial-gradient` (aproximación en CSS puro del v5). Ambos sobre `esquema` base con trazo de token (mismo patrón que `puntos`/`grilla`, cero hex). Los adornos-como-forma-de-contenedor del v5 (`border-radius 999px 999px 18px 18px`) NO son un patrón de fondo — ya están cubiertos por `FORMAS_IMAGEN.arco` (F07 Tanda 1). Otros motivos del prototipo (trazos a mano/Caveat, sombras hard-offset) quedan ANOTADOS como no-viables-como-token (requieren fuente/asset, fuera de I-A).
- **D8 — Pack de tickets NO se construye (F08).** Es dominio (`OrderItem.cantidad` ya existe; el tier "$10.000 = 4 números" hoy es texto/`estadisticas`). Un producto→K tickets por cantidad ya existe (sorteo-por-producto, ADR-0012); lo que falta es un WIDGET de "pack/tiers de compra" con checkout multi-cantidad inline — decisión de producto + toca checkout (fuera de "registro/render"). Queda ANOTADO en Out of scope como pendiente del usuario.
- **D9 — MCP gana vocabulario, no tools (D16 de Tanda 1).** Los enums nuevos de estilo/tema (PATRONES += 2, `ambiente`, `padTop`/`padBottom`) se agregan a `describir()` en `list_style_options` (el `Record<T,string>` obliga en compile-time a describir PATRONES nuevos). El widget `vitrina_proximamente` aparece solo en `list_widget_types` (deriva del registro). Los campos de hero/imagen aparecen solos vía el form-generator por introspección (`hero.visual` cae a override documentado en `formGenerator.test.ts`, como `hero.destacado`). Sin tools nuevas, sin authz nueva.
- **D10 — Orden de construcción**: F01–F07 (registro/render, sin dependencias entre sí) → F08 (anotación) → F09 (bcac: consume F01/F02/F03/F05/F06) → F10 (prueba: consume F06). Los reviewers al cierre: `frontend-reviewer` (render), `backend-reviewer` (solo por `tools.ts`, vocabulario MCP).

## Plan

**Fase 1 — registro/render (cada paso aditivo, migración no-op):**

1. `widgets.ts`: `vitrinaProximamenteProps` + registry entry + `WIDGET_META` + `nodoSeccion("vitrina_proximamente", …)` en la union de `schema.ts`; `nav.ts` ANCLA/ETIQUETA; componente `vitrina-proximamente.tsx`; dispatch en `render-pagina.tsx`. (F01)
2. `widgets.ts`: `visual` discriminated union en `heroProps` (`imagen`/`tarjeta`); `storefront-hero.tsx` `HeroSplit` renderiza el visual (tarjeta reusa `MarcoHolo`); `hero.visual` a `OVERRIDES_CONOCIDOS` en `formGenerator.test.ts`. (F02)
3. `widgets.ts`: `ancho` de `imagen_destacada` += `card`; `imagen-destacada.tsx` `maw` card=420. (F03)
4. `widgets.ts`: `EYEBROW_ESTILOS` + `heroProps.eyebrowEstilo`; `storefront-hero.tsx` `EyebrowTexto` por token. (F04)
5. `widgets.ts`: `AMBIENTE_FONDO`; `schema.ts` `TemaSchema.ambiente`; `estiloSeccion.ts` `fondoShellConAmbiente()`; `index.tsx` lo usa en `estiloShell`; `estiloTema.test.ts` `tema.001` actualizado; `tools.ts` `ambiente` describir. (F05)
6. `widgets.ts`: `EstiloSeccion.padTop/padBottom`; `estiloSeccion.ts` resuelve pt/pb; `seccion-wrapper.tsx` usa pt/pb con override; `tools.ts` describir. (F06)
7. `widgets.ts`: PATRONES += `cuadricula_papel`,`arcos`; `estiloSeccion.ts` `patronACss` casos; `tools.ts` `describir(PATRONES)` descripciones. (F07)

**Fase 2 — cierre:**

8. F08 = anotación (Out of scope + Bitácora), sin código.
9. `scripts/seed-bcac.ts`: re-réplica de `bcac` con vitrina_proximamente real, holocard como visual del hero split compacto, `ambiente:"focos_marca"`, composición fina. Correr idempotente. (F09)
10. `tmp/replicar-landing-idol-tanda1.ts`: re-réplica de `prueba` con el hero compacto (padTop/padBottom o altoMin→auto) y el spacing del mockup. Correr. (F10)
11. Verificación: curl de marcadores + Playwright si el carril está libre (screenshots lado a lado). Reviewers frontend+backend.

## Validaciones

### F01 — vitrina_proximamente

**Vitest**:
- [ ] `vitrinaProximamenteProps` valida items 1–8, titulo ≤60/subtitulo ≤80, columnas 2|3|4, notaPie ≤120, `.strict()` rechaza HTML/campo extra — `src/__tests__/server/pagebuilder/widgetsTanda2.test.ts::page.tanda2.vitrina.001`
- [ ] 0 items / >8 items / titulo >60 / red HTML ⇒ rechazo; el nodo parsea contra `SeccionNodeSchema`; defaultProps parsea; en el registro + WIDGET_META — `widgetsTanda2.test.ts::page.tanda2.vitrina.001` + `::page.tanda2.vitrina.002`
- [ ] `ANCLA_POR_TIPO`/`ETIQUETA_POR_TIPO` mapean `vitrina_proximamente`; el render dispatch lo cubre (exhaustividad compila) — cubierto por `schema.test.ts` (exhaustividad union/registro) + `nav.test.ts` verdes tras el alta

**E2E**:
- [ ] En `bcac`, la vitrina "Un libro a la vez" muestra el grid con candados + tratamiento bloqueado (grayscale) + chip Próximamente

### F02 — hero split visual configurable

**Vitest**:
- [ ] `heroProps.visual` (opcional) parsea `{tipo:"imagen",url,holo?}` y `{tipo:"tarjeta",titulo,subtitulo?,icono?,holo?}`; sin `visual` un hero previo parsea igual (no-op) — `widgetsTanda2.test.ts::page.tanda2.herovisual.001`
- [ ] rama inválida (tipo desconocido / icono fuera de ICONOS_BENEFICIO / titulo tarjeta >60 / url no-url) ⇒ rechazo `.strict()` — `widgetsTanda2.test.ts::page.tanda2.herovisual.001`

**E2E**:
- [ ] En `bcac`, la holocard vive DENTRO del hero split (columna derecha, compacta), no apilada full-width bajo el hero

### F03 — ancho card en imagen_destacada

**Vitest**:
- [ ] `imagenDestacadaProps.ancho` acepta `card`; default sigue `contenido`; `card|contenido|completo` los tres válidos; valor fuera del enum ⇒ rechazo; docs v1 sin `ancho` no cambian (no-op) — `widgetsTanda2.test.ts::page.tanda2.ancho.001`

**E2E**:
- [ ] (cubierto por F09 si la réplica usa el ancho card; si no, no aplica — el ancho card se ejerce vía hero split visual)

### F04 — eyebrowEstilo

**Vitest**:
- [ ] `heroProps.eyebrowEstilo` default `marca`; acepta `acento`/`texto`; valor fuera del enum ⇒ rechazo; hero sin el campo parsea igual (no-op) — `widgetsTanda2.test.ts::page.tanda2.eyebrow.001`

**E2E**:
- [ ] En `bcac`, con `eyebrowEstilo:"acento"` el eyebrow renderiza DORADO (token acento) con la marca violeta

### F05 — ambiente (stage-lights)

**Vitest**:
- [ ] `TemaSchema.ambiente` default `ninguno`; acepta `focos_marca`/`focos_acento`/`aurora`; valor inválido ⇒ rechazo; `root.props:{}` sigue parseando (no-op, tema.001 actualizado) — `estiloTema.test.ts::tema.ambiente.001` + `::tema.001` (deep-equal actualizado)
- [ ] `fondoShellConAmbiente(fondoPagina, "ninguno")` == el color base sólido actual (no-op); con `focos_marca`/`aurora` emite radial-gradients de tokens del tenant (cero hex), sobre el color base — `estiloSeccion.test.ts::amb.001` + `::amb.002` + `::amb.003`

**E2E**:
- [ ] En `bcac`, el shell muestra focos radiales violeta/acento sobre el near-black (stage-lights), estático

### F06 — padTop/padBottom

**Vitest**:
- [ ] `EstiloSeccion` acepta `padTop`/`padBottom` de ESPACIADO_V; sin ellos `estiloSeccionACss` da el `py` actual y NO emite pt/pb (no-op) — `estiloSeccion.test.ts::pad.001` + `::pad.003`
- [ ] con `padTop` presente el resolver emite el pt del enum y el pb cae al `padY` base; con ambos, cada lado su valor — `estiloSeccion.test.ts::pad.002`

**E2E**:
- [ ] (cubierto por F10 — el hero de `prueba` queda compacto pegado al nav, sin el void del full-viewport)

### F07 — PATRONES cuadricula_papel / arcos

**Vitest**:
- [ ] `PATRONES` contiene `cuadricula_papel` y `arcos`; `patronACss("cuadricula_papel", esquema)` emite el doble linear-gradient de token (grid papel); `patronACss("arcos", …)` emite el radial-gradient scallop; ambos sobre el esquema base (cero hex) — `estiloSeccion.test.ts::pat.001` + `::pat.002`
- [ ] un patrón fuera del enum ⇒ degrada al esquema base (sin romper); `FondoSeccionSchema` rama patron acepta los dos nuevos — `estiloSeccion.test.ts::pat.003` (+ el `default` de `patronACss` ya cubierto por el diseño del switch)

**E2E**:
- [ ] (no aplica — validación por Vitest de CSS puro; visual opcional en la réplica)

### F08 — pack de tickets

- [ ] (no aplica — solo anotación de decisión de producto pendiente, sin código; ver Out of scope + D8 + Bitácora)

### F09 — re-réplica bcac

**E2E**:
- [ ] `bcac.localhost:3001` HTTP 200 con vitrina_proximamente + holocard en hero split + stage-lights violeta + composición fina; `autora`/`prueba` intactas — `scripts/seed-bcac.ts` (PUBLICADO rev 4); curl de marcadores VERDE (radial-gradient + mantine-primary-color-5 = stage-lights; "Un libro a la vez"+"Próximamente" = vitrina; animar-holo + "PDF descargable" = holocard en hero; mantine-color-acento-filled + "A la venta ahora" = eyebrow dorado; "Enriquecer" acento). Screenshot lado a lado ⇒ feature-tester.

### F10 — re-réplica prueba (landing_idol)

**E2E**:
- [ ] `prueba.localhost:3001` HTTP 200 con el hero compacto (sin void), spacing del mockup; regresión `autora` no-op — `tmp/replicar-landing-idol-tanda2.ts` (PUBLICADO rev 5); curl VERDE (SIN `100svh` = void del full-viewport eliminado; eyebrow "Bernardita…"; "enriquecer" acento; ticker "IDOL ECONOMY"+animar-marquee). Regresión `autora`: SIN radial-gradient/vitrina_proximamente/ticker/eyebrow gold, nav hardcodeado Catálogo/Cómo funciona (no-op I-H). Screenshot lado a lado ⇒ feature-tester.

### F12 — corrección de fidelidad demo-dreamy (8 diffs)

**Vitest**:
- [ ] Bug de contraste: `esFondoOscuro(fondo)` clasifica esquemas/bicolor/patrón/gradiente/imagen por su texto emparejado; el texto tenue sobre oscuro deriva de `currentColor` (nunca gris fijo), cero hex — `src/__tests__/styles/estiloSeccion.test.ts::contraste.001` + `::contraste.002`
- [ ] Widget `packs_precio`: items 1–4, `precio` entero, destacado/badge/cta opcionales, límites y `.strict()`; el nodo parsea contra la union + registro + WIDGET_META + defaultProps — `src/__tests__/server/pagebuilder/widgetsTanda2.test.ts::page.tanda2.packs.001` + `::page.tanda2.packs.002`
- [ ] Widget `momento_ticket`: titulo/codigoEjemplo requeridos, etiqueta/cta/nota opcionales, límites y `.strict()`; nodo/union/registro/meta — `widgetsTanda2.test.ts::page.tanda2.momento.001` + `::page.tanda2.momento.002`
- [ ] `estadisticas.estiloVisual` acepta `tarjetas_suaves`; default sigue `cards` (no-op) — `widgetsTanda2.test.ts::page.tanda2.stats.001`
- [ ] Hero visual tarjeta gana `estilo` (`plano`/`suave`), default `plano` (no-op); `estilo` no existe en la rama imagen — `widgetsTanda2.test.ts::page.tanda2.herovisual.002`
- [ ] Covers variados: `hueCoverDeterminista(semilla)` determinista + reparte rotaciones + entero 0–359 — `src/__tests__/styles/tenantTheme.test.ts::covers.hue.001` + `::covers.hue.002`

**E2E**:
- [ ] `demo-dreamy.localhost:3001` HTTP 200 con fondo claro SIN aurora saturada, SIN ticker, stats en tarjetas, `packs_precio` (1 libro / Pack 4 libros destacado "Más elegido"), `momento_ticket` (ARMY-04821), hero glassy (blur-blobs), banner premio compacto legible; covers de catálogo con hue variado (client-render). `demo-noche`/`demo-editorial`/`autora`/`prueba`/`bcac` intactas — `scripts/seed-demos-kpop.ts` (docDreamy, PUBLICADO rev 3); curl de marcadores VERDE (packs/momento/blur/2 entradas OK; ticker AUSENTE; otras tiendas HTTP 200). Screenshot lado a lado ⇒ feature-tester.

## Invariantes

- **I-A (cero hex libre)**: todo color/estilo nuevo resuelve a un token de la escala del tenant vía CSS var o a un preset curado. Ni el ambiente, ni los patrones, ni la tarjeta-visual del hero, ni el eyebrow emiten un hex inline.
- **I-H (migración no-op)**: TODOS los campos nuevos son opcionales o con `.default()` que reproduce el comportamiento actual. Un documento publicado de la Tanda 1 (o pre-tanda) parsea y renderiza IDÉNTICO. `autora` debe quedar byte-idéntica (regresión verificada).
- **I-SSR**: el ambiente/patrones/tarjeta-visual son CSS estático o DOM puro sin `window` en módulo/render; SSR pinta lo visible. El tilt de la holocard (MarcoHolo) ya es client-only por eventos (reusado, no reimplementado).
- **I-C (CLS=0)**: nada nuevo anima layout; el `min-height`/ratios reservan tamaño; el ambiente no anima.
- **I-MCP**: paridad UI↔MCP por construcción (widgets.ts fuente única); solo se agrega vocabulario a `describir()`, sin tools ni authz nuevas.
- **Zonas prohibidas**: `src/pages/admin/*`, `src/components/admin/*`, `src/styles/theme.ts` (WIP de marca del usuario) — NO se tocan. Los tenants `autora`/`prueba` published solo se tocan en F10 (prueba, autorizado); `autora` NUNCA.

## Out of scope

- **Pack de tickets / tiers de compra multi-cantidad (F08)** — dominio + checkout. Anotado como pendiente de decisión de producto del usuario.
- **Controles de editor UI dedicados** para el `visual` discriminado del hero (cae a "editar por el asistente"/MCP como `hero.destacado`) y para el resto de campos nuevos que la introspección genérica no cubre. Los campos son editables por MCP/scripts; el panel del editor los auto-genera donde la introspección alcanza (enums/strings/arrays). Un editor visual dedicado del `visual` es Tanda 2+ del mapa (edición inline/toolbar).
- **Focal point, adornos/stickers, video de fondo, texto rico con runs, multi-página, chrome editable** — otras filas del mapa §2/§5, no de esta tanda.
- **Commit/push/INDEX** — los hace el usuario/orquestador. **Correr la suite completa** — la corre el feature-tester.

## Reviewers (gate de cierre) — PENDIENTE del orquestador

Los `*-reviewer` se invocan por subagente (Task), capacidad que NO está en el toolset del feature-implementer (solo Read/Write/Edit/Bash/Glob/Grep/Skill — misma restricción de harness que la Tanda 1). **NO apliqué la rúbrica a mano (sería teatro del gate).** El orquestador debe invocar antes del commit:

- **`frontend-reviewer`** sobre: `src/components/storefront/vitrina-proximamente.tsx` (nuevo), `storefront-hero.tsx` (HeroVisualConfigurable/TarjetaVisual/EyebrowTexto), `imagen-destacada.tsx` (ancho card), `imagen-tenant.tsx` (`src?` opcional), `seccion-wrapper.tsx` (pt/pb), `render-pagina.tsx` (dispatch), `src/styles/estiloSeccion.ts` (ambiente/patrones/resolver), `src/pages/index.tsx` (estiloShell).
- **`backend-reviewer`** sobre: `src/server/mcp/tools.ts` (vocabulario `describir` — PATRONES +2, ambiente, padArriba/padAbajo; sin lógica/authz nueva).

**F12 (corrección demo-dreamy) — archivos para el `frontend-reviewer`**: `src/components/storefront/packs-precio.tsx` (nuevo), `momento-ticket.tsx` (nuevo), `sorteo.tsx` (contraste sobre oscuro: `TextoTenue`/`BadgeTenue`/`CierreBadge`/Alert derivados de currentColor), `estadisticas.tsx` (`tarjetas_suaves`), `storefront-hero.tsx` (`TarjetaVisual` estilo `suave` con blur-blobs), `catalogo.tsx` (`Portada` hue-rotate), `render-pagina.tsx` (dispatch +2), `src/styles/estiloSeccion.ts` (`esFondoOscuro` + constantes de tenue), `src/styles/tenantTheme.ts` (`hueCoverDeterminista`). Sin `backend-reviewer` en F12 (los dos widgets nuevos NO tocan `tools.ts` — aparecen solos en `list_widget_types` desde el registro; sin authz/lógica nueva). NOTA para el reviewer: el fix de contraste toca la `sorteo_vitrina` COMPARTIDA ⇒ mejora también el banner oscuro de `bcac` (bicolor `marca_profundo→tinta`) — es MEJORA de legibilidad, no regresión; verificar por screenshot.

**Auto-chequeo del implementer contra `docs/design.md` (NO sustituye al reviewer)**: (1) cero-hex inline — todo color nuevo es `var(--mantine-*)`/`color-mix`/`gradienteTematico`; los tests `estiloSeccion.test.ts` con `tieneHex()` lo afirman en ambiente/patrones/bicolor. (2) Semántica financiera §5 — no agrego render de montos; el "$3.000" sigue en el `Destacado` del hero (tabular-nums, Tanda 1, intacto); el pricing de bcac usa `estadisticas` existente. (3) Motion §7 — la holocard reusa `MarcoHolo` (reduced-motion/SSR-safe ya); el `ambiente` es CSS estático (no anima); la vitrina no tiene motion. (4) Tokens semánticos — íconos por enum Tabler (candado/tarjeta), nunca emoji libre (D2). Resultado del auto-chequeo: sin hallazgos; queda la revisión AUTORITATIVA del reviewer.

## Especialistas a consultar

- `frontend-reviewer` — al cierre de la fase de render (F01–F07 tocan `~/components/storefront` + `~/styles/estiloSeccion`).
- `backend-reviewer` — al cierre, SOLO por `~/server/mcp/tools.ts` (vocabulario MCP; sin lógica nueva).
- `schema-guardian` — NO aplica (cero cambios de `schema.prisma`; todo vive en el jsonb del documento).

## Bitácora

- [2026-07-25 00:05] [feature-implementer] Arranca implementación. Task file creado con el template (directiva del usuario; NO registro en INDEX — lo hace el orquestador). Read pass completo: template, Bitácora F14 de Tanda 1 (6 gaps), `.scratch/page-builder/mapa-potencial-editores.md`, INDEX, `widgets.ts`/`schema.ts`/`estiloSeccion.ts`/`nav.ts`/`factory.ts`, render (`seccion-wrapper`/`storefront-hero`/`imagen-destacada`/`marco-holo`/`render-pagina`/`storefront-layout`/`index.tsx`), tests (`widgetsV2b`/`schema`/`estiloTema`/`formGenerator`), `introspeccion.ts`, `tools.ts` (`describir` con `Record<T,string>` compile-time → PATRONES nuevos OBLIGAN describir). Features pendientes: F01..F10.
- [2026-07-25 00:35] [feature-implementer] F01 implementada (TDD red→green). Widget `vitrina_proximamente`: `widgets.ts` (`vitrinaProximamenteProps` + registry + WIDGET_META), `schema.ts` (rama en `SeccionNodeSchema`), `nav.ts` (ANCLA `proximos`/ETIQUETA `Próximos`), componente nuevo `vitrina-proximamente.tsx` (grid AspectRatio 3:4 + grayscale/opacidad + candado `IconLock` superpuesto + chip "Próximamente" + notaPie), dispatch en `render-pagina.tsx`. Decisión táctica: `ImagenConFallback` ahora acepta `src?` opcional ⇒ un ítem sin cover degrada al placeholder tematizado directo (I-G, sin `<img>` vacío en SSR) — cambio backward-compatible del componente compartido. Tests: `widgetsTanda2.test.ts::page.tanda2.vitrina.001/002` verdes; `schema.test.ts`/`formGenerator.test.ts`/`nav.test.ts` 22/22 verdes (exhaustividad registro/union/introspección OK). Sin regresión.
- [2026-07-25 01:05] [feature-implementer] F02+F03+F04 implementadas (schemas primero, red→green por feature). **F02** hero split visual: `HeroVisualSchema` discriminado (`imagen{url,holo}` | `tarjeta{titulo,subtitulo?,icono?,holo}`) + `heroProps.visual?`; render `HeroVisualConfigurable`+`TarjetaVisual` en `storefront-hero.tsx` (tarjeta = holocard-placeholder ratio 3:4, ícono Tabler por `iconoBeneficio` NO emoji libre D2, fondo `gradienteTematico`; `holo` reusa `MarcoHolo`); `HeroSplit` usa `visual` cuando está, si no cae al `<HeroVisual>` de siempre (no-op I-H); `hero.visual` agregado a `OVERRIDES_CONOCIDOS` (union → introspección no alcanza, como `hero.destacado`). **F03** ancho `card`: enum `ancho` de `imagen_destacada` → `["card","contenido","completo"]`; `maw` card=420 en `imagen-destacada.tsx`. **F04** `eyebrowEstilo`: enum `EYEBROW_ESTILOS` + `heroProps.eyebrowEstilo` default `marca`; `EyebrowTexto` mapea marca/acento(fallback a marca)/texto a token (cero hex). Tests `herovisual.001`/`ancho.001`/`eyebrow.001` verdes; formGenerator 3/3; tsc LIMPIO (sin errores fuera de `tmp/` scratch). Migración no-op verificada por defaults.
- [2026-07-25 01:40] [feature-implementer] F05+F06+F07 implementadas (tests primero en `estiloSeccion.test.ts`, red→green por feature). **F05** ambiente/stage-lights: `AMBIENTE_FONDO` enum + `TemaSchema.ambiente` default `ninguno`; helper puro `fondoShellConAmbiente(fondoPagina, ambiente)` en `estiloSeccion.ts` (capas `radial-gradient` FIJAS de tokens con `color-mix(... transparent)` sobre el color base — cero hex, SSR-safe, no anima; acento con fallback a marca I-T2); `index.tsx` lo usa en `estiloShell`; `estiloTema.test.ts::tema.001` deep-equal actualizado + `tema.ambiente.001`. **F06** padTop/padBottom: `EstiloSeccion.padTop/padBottom?` (ESPACIADO_V); resolver emite `pyTop/pyBottom` solo con override (lado sin override cae al padY base); `seccion-wrapper.tsx` usa `pt`/`pb` con override, `py` sin él (no-op I-H). **F07** patrones: `PATRONES` += `cuadricula_papel` (doble linear-gradient 28px) + `arcos` (radial scallop 44px) en `patronACss` (sobre esquema base, trazo de token, cero hex); patrón fuera del enum degrada al esquema base. MCP vocabulario (D9): `tools.ts` `describir(PATRONES)` +2 (OBLIGA compile-time), `ambiente`/`padArriba`/`padAbajo` describir. Tests `amb.001-003`/`pad.001-003`/`pat.001-003`/`tema.ambiente.001` verdes. **Regresión pagebuilder+styles+editor+mcp: 227/227 verde**, tsc LIMPIO. F01–F07 (registro/render) COMPLETAS.
- [2026-07-25 01:45] [feature-implementer] **F07 — patrones NO VIABLES en CSS puro de tokens (anotación D7)**: de las texturas de los 8 prototipos del repo (`tmp/v-*.tsx`, `git show 0c76842^:src/pages/prototipo/v*`), quedan FUERA por requerir fuente/asset (violan I-A cero-hex/cero-asset-libre): (a) trazos "a mano"/subrayados a lápiz (v4 usa la fuente Caveat + paths dibujados) — necesitarían un SVG-asset o fuente, no un token; (b) sombras hard-offset de color (`box-shadow: 6px 8px 0 rgba(...)`, v4/v5) — son de la GRAMÁTICA de sección (border/sombra global por VIBE), no un patrón de fondo; (c) el arco-como-forma-de-CONTENEDOR del v5 (`border-radius: 999px 999px 18px 18px`) ya está cubierto por `FORMAS_IMAGEN.arco` (Tanda 1 F07), no es patrón. Lo viable (grid papel + scallop) se construyó. El resto se declina por escrito (mapa §6: cero CSS/asset libre del tenant).
- [2026-07-25 01:50] [feature-implementer] **F08 — pack de tickets: DECISIÓN DE PRODUCTO PENDIENTE (anotada, NO construida, D8)**. El "$10.000 = 4 números" del mockup bcac hoy es texto/`estadisticas` (cards). El motor 1-compra→K-tickets-por-cantidad YA existe (sorteo-por-producto, ADR-0012: `OrderItem.cantidad` + K RaffleEntry). Lo que falta es un WIDGET de "pack/tiers de compra" con checkout multi-cantidad inline en el storefront — eso es DOMINIO + CHECKOUT (mueve el flujo de pago), fuera de "registro/render" de esta tanda. **Sugerencia para el usuario/domain-planner**: un widget `pack_tickets` que liste tiers {precio, cantidad, etiqueta} y arme el carrito con la cantidad correcta; requiere decidir si es un producto por tier o un selector de cantidad sobre un producto. NO lo decido yo (dominio con dinero, ADR-0006/regla de oro).
- [2026-07-25 02:20] [feature-implementer] **F09+F10 — re-réplica de AMBAS tiendas a su techo + verificación por curl**. **F09 bcac** (`scripts/seed-bcac.ts`, idempotente, PUBLICADO rev 4): hero SPLIT con holocard como `visual` tarjeta+holo (ya no `imagen_destacada` full-width 864×1150), `vitrina_proximamente` real "Un libro a la vez" (4 candados), `ambiente:"focos_marca"` (stage-lights violeta), `eyebrowEstilo:"acento"` (eyebrow DORADO), composición fina `padTop`/`padBottom` (sin void). **F10 prueba** (`tmp/replicar-landing-idol-tanda2.ts`, PUBLICADO rev 5): hero compacto — reemplazado `altoMin:"pantalla"`+`alinearVertical:"centro"` por `padTop:"l"`/`padBottom:"xl"` ⇒ elimina el void de ~450px que dejó F14; resto igual (gold-sobre-púrpura, ticker sobre nav). Ambos docs validan (SOLO_VALIDAR ✓, 7 secciones + 1 overlay). **RECUPERACIÓN de entorno**: el dev :3001 devolvía HTTP 500 `Cannot find module './859.js'` = corrupción de `.next` (issue conocido en MEMORY, single-instance). NO es bug de mi código (tsc limpio, docs válidos). Fix documentado (patrón del tester tanda-1): `taskkill //T` del árbol next dev (PID 35288) → `rm -rf .next` → `npm run dev` (background, ID bs59r8sqn) → READY HTTP 200 en ~10s. UNA sola instancia (kill-then-start, respeta MEMORY). **Verificación curl (server sano)**: bcac ✓ (radial-gradient+primary-5 stage-lights, "Un libro a la vez"+"Próximamente" vitrina, animar-holo+"PDF descargable" holocard-en-hero, acento-filled+"A la venta ahora" eyebrow dorado, "Enriquecer" acento); prueba ✓ (SIN `100svh` void, eyebrow autoría, "enriquecer" acento, "IDOL ECONOMY"+animar-marquee ticker); **autora NO-OP ✓** (sin radial-gradient/vitrina_proximamente/ticker/eyebrow-gold; el hit "vitrina" era el `sorteo_vitrina` pre-existente del doc; nav hardcodeado Catálogo/Cómo funciona — I-H intacto). Screenshots lado a lado y fidelidad %-exacta ⇒ feature-tester (carril browser-verify).
- [2026-07-25 02:35] [feature-implementer] **Drift de docs (Step 4.5): SIN drift load-bearing detectado.** Todo lo nuevo sigue patrones YA documentados: los widgets/campos entran por el registro Zod (`WIDGET_REGISTRY`/`WIDGET_META`, patrón de `frontend-conventions`), el estilo por `estiloSeccion.ts` (token-CSS puro, cero hex), el vocabulario MCP por `describir()` compile-time. `fondoShellConAmbiente`/`HeroVisualConfigurable`/`vitrina-proximamente` son INSTANCIAS de esos patrones, no convenciones nuevas. `prisma-conventions`: sin cambios de schema. NO propongo diff (no hay doc desincronizado). Vocabulario nuevo del dominio (p.ej. "stage-lights"/"holocard") ⇒ lo SUGIERO para `CONTEXT.md` si el usuario lo quiere, pero NO lo aplico (fuera del scope del implementer).
- [2026-07-25 02:40] [feature-implementer] **Implementación completa. F01–F10 escritas y auto-verificadas; status → testing.** Registro/render (F01–F07) con Vitest verde por feature + regresión pagebuilder/styles/editor/mcp 227/227 + tsc limpio; réplicas (F09/F10) publicadas y verificadas por curl; F08 anotada. **GATE PENDIENTE (no bypass silencioso)**: `frontend-reviewer` (render) + `backend-reviewer` (`tools.ts`) NO son invocables desde el toolset del implementer → los invoca el ORQUESTADOR antes del commit (ver sección "Reviewers"). Auto-chequeo design.md sin hallazgos (no sustituye al reviewer). Sin commit/push/INDEX (instrucción). Dev :3001 sano corriendo en background. Listo para reviewers → feature-tester (screenshots lado a lado + fidelidad %).
- [2026-07-24 ] [feature-implementer] **F11 — Arranca tarea de OPERADOR: 3 tiendas demo K-pop que replican los prototipos originales.** Directiva del usuario: recrear los 3 prototipos base del proyecto (`tmp/v-dreamy.tsx` "Dreamy/Borahae", `tmp/v-concert.tsx` "Concert Night", `tmp/v-editorial.tsx` "Editorial Boutique") como 3 tiendas publicadas — mismo motor page-builder (arsenal tanda 1+2), 3 mundos visualmente distintos. Read pass: los 3 prototipos COMPLETOS + `tmp/v-mock.ts` (BRAND/LIBRO/PREMIO/PACKS/STATS/PASOS/FAQS/CATALOGO) + `scripts/seed-bcac.ts` (patrón operador find-or-create sin FlowCredential) + `scripts/seed-tenants.ts` + `widgets.ts`/`schema.ts`/`estiloSeccion.ts` (arsenal: TemaPagina modo/tipografia/radio/fondoPagina/ambiente, esquemas, patrones, hero visual/eyebrow, vitrina_proximamente) + `storefront-hero.tsx` (render hero) + `config.ts`/`configPlataforma.ts` (subdominio dev `<slug>.localhost:3001` resuelve a tenant PUBLICADA; devTienda solo toca el apex pelado). Plan: un solo script idempotente `scripts/seed-demos-kpop.ts` con 3 specs (demo-dreamy/demo-noche/demo-editorial). CERO código nuevo de `src/` (solo el script). Gates: idempotente 2 corridas; tsc; autora/prueba/bcac INTACTAS; NO commit/push/INDEX; zonas admin/theme prohibidas.
- [2026-07-25 12:00] [feature-implementer] **F12 — Arranca CORRECCIÓN de fidelidad de `demo-dreamy` vs el prototipo `dev-ref/variant-dreamy`** (directiva del usuario, 8 diffs con screenshots `tmp/cmp-dreamy-original.png` vs `tmp/cmp-dreamy-replica.png`). status → implementing. Read pass: `src/pages/dev-ref/variant-dreamy.tsx` COMPLETO (spec visual exacta) + `dev-ref/mock.ts` + `scripts/seed-demos-kpop.ts` (docDreamy) + render (`sorteo.tsx`/`estadisticas.tsx`/`storefront-hero.tsx`/`catalogo.tsx`/`imagen-tenant.tsx`/`vitrina-proximamente.tsx`/`render-pagina.tsx`) + `estiloSeccion.ts`/`widgets.ts`/`schema.ts`/`nav.ts`/`tenantTheme.ts` + tests (`widgetsTanda2`/`estiloSeccion`/`formGenerator`/`introspeccion`/`schema`). Diagnóstico de los 8 diffs: (1) contraste — `sorteo.tsx` usa `c="dimmed"`/`color="gray"`/`Alert gray` que sobre el bicolor `marca_profundo` (texto blanco emparejado) quedan ILEGIBLES; el fix deriva el tenue de currentColor SOLO sobre esquema oscuro (no-op sobre claro I-H). (2)/(3) dos widgets nuevos (array-de-objetos y campos flat ⇒ ambos SOPORTADOS por la introspección, sin override en formGenerator). (4) `gradienteTematico` es fijo ⇒ hue-rotate determinista por hash del título (cero hex, achromático blanco no se ve afectado). (5) `TarjetaVisual` gana `estilo:'suave'` (blobs). (6) `estiloVisual:'cards'` NO envuelve en tarjeta (solo ThemeIcon) ⇒ nuevo `tarjetas_suaves`. (7) la aurora sobre fondo claro = el lila saturado del bug + el ticker no existe en el original. Plan TDD por parte. NO toco `dev-ref/` (referencia).
- [2026-07-24 ] [feature-implementer] **F11 COMPLETA — 3 tiendas demo K-pop sembradas, publicadas y verificadas por curl.** Script `scripts/seed-demos-kpop.ts` (patrón seed-bcac, find-or-create sin FlowCredential, dueño nikochaima72@gmail.com, PUBLICADA). **CERO código de `src/` tocado** — solo el script; no hizo falta ningún aditivo REVISABLE (el arsenal tanda 1+2 alcanzó para las 3 estéticas). Cada tienda: 5 productos ($3.000 c/u, opt-in sorteo — el LIBRO + catálogo del mock), sorteo ACTIVO (premio "2 entradas para BTS", fechaFin 2026-10-15 futuro ⇒ countdown tictaquea), documento aplicado+publicado por apply_page+publicarPagina. **Fidelidad por color leída de los Tailwind exactos de cada prototipo**: dreamy primario `#7c3aed`+acento `#ec4899`; noche primario `#a855f7`+acento `#d946ef`; editorial primario `#6d28d9`+acento `#1a1625`. Tema por mundo: dreamy (claro/`dulce`/radio l/`marca_suave`/ambiente `aurora`), noche (oscuro/`impacto`/radio m/`tinta`/`aurora`), editorial (claro/`clasica`/radio **nulo**=cuadrado/`superficie`/ambiente ninguno + patrón `cuadricula_papel`). Copy REAL del mock (LIBRO/PASOS/FAQS/CATALOGO/PREMIO), cero lorem. **Gates VERDES**: SOLO_VALIDAR ✓ (10/11/10 secciones); `tsc --noEmit` LIMPIO; **idempotente 2 corridas** (2ª: tenant existía, productos:0 nuevos, borrador v2→v3, publicado rev1→rev2, cero duplicados). **Verificación curl (dev :3001 única instancia, ya arriba — NO arranqué 2ª)**: dreamy ✓ (Poppins + aurora sobre primary-0 + eyebrow acento rosa + SIN marco-holo + marquee acento_suave), noche ✓ (Anton + aurora sobre gray-9 + marco-holo holocard + ticker "SORTEO EN VIVO" cinta_texto + título gradiente animado), editorial ✓ (Playfair + `radius-default:0rem` cuadrado + patrón papel 28px + "El objeto del deseo"/"El catálogo" + SIN aurora). **autora/prueba/bcac INTACTAS** (HTTP 200, sin marcadores demo, bcac conserva "Un libro a la vez"). **Screenshots pixel + fidelidad %-exacta ⇒ feature-tester** (mi toolset no incluye MCP de navegador; Playwright no instalado y no lo agrego — no-new-deps). Fidelidad honesta estimada: dreamy ~85%, noche ~85%, editorial ~78% (gaps: marfil cálido no es token ⇒ superficie limpia; carrusel de libros → grilla; packs como `estadisticas` no selector interactivo; heroviz literales —haces de luz concert, trazo-fino SVG editorial— no reproducibles con el arsenal actual). NO commit/push/INDEX (instrucción).
- [2026-07-25 12:35] [feature-implementer] **F12 COMPLETA — 8 diffs corregidos (TDD red→green por unidad testeable), status → testing.** **(1) Contraste `sorteo_vitrina`**: `estiloSeccion.ts` gana `esFondoOscuro(fondo)` + constantes `TEXTO/BORDE/FONDO_TENUE_SOBRE_OSCURO` (derivan de `currentColor` vía `color-mix`, cero hex); `sorteo.tsx` usa `TextoTenue`/`BadgeTenue`/`CierreBadge`/Alert que sobre esquema OSCURO derivan del emparejado y sobre CLARO conservan `dimmed`/`gray` byte-idéntico (no-op I-H). **(2) `packs_precio`** (widget nuevo): schema+registry+meta+union+`packs-precio.tsx`+dispatch (card destacada = filled primario + badge de acento; precio = COPY de marketing formateado con `clp()`, NO cobra — ADR-0006). **(3) `momento_ticket`** (widget nuevo): schema+registry+meta+union+`momento-ticket.tsx`+dispatch (borde punteado acento, `IconConfetti` fijo, código mono ARMY-04821). **(4) Covers variados**: `tenantTheme.ts` `hueCoverDeterminista(titulo)` (FNV-1a → set curado de grados) + `catalogo.tsx` `Portada` aplica `filter:hue-rotate` al placeholder (determinista SSR-safe, blanco achromático intacto, cero hex). **(5) Hero glassy**: `HeroVisualSchema` tarjeta gana `estilo:plano|suave`; `TarjetaVisual` pinta 2-3 blur-blobs de tokens en `suave` (CSS estático, no anima). **(6) Stats card**: `ESTILOS_ESTADISTICA += tarjetas_suaves`; `estadisticas.tsx` envuelve cada cifra en tarjeta blanca sombra suave (el `cards` histórico NO envolvía). **(7) Re-seed `demo-dreamy`** (`scripts/seed-demos-kpop.ts`, PUBLICADO rev 3): `ambiente:aurora→ninguno` (mata el lila saturado), overlays `[]` (sin ticker), hero visual `estilo:suave`, stats `tarjetas_suaves`, packs→`packs_precio`, +`momento_ticket` (ARMY-04821), sorteo `anchoFondo:contenido` (compacto). Copy del mock intacto. **Tests**: `contraste.001/002`, `covers.hue.001/002`, `page.tanda2.packs.001/002`, `page.tanda2.momento.001/002`, `page.tanda2.stats.001`, `page.tanda2.herovisual.002` — todos verdes; **regresión pagebuilder+editor+styles 225/225 verde**. Los 2 widgets nuevos NO necesitaron override en `formGenerator` (array-de-objetos→repeater + campos flat SOPORTADOS) ni tocar `tools.ts` (aparecen en `list_widget_types` desde el registro). **tsc**: `src/` y `scripts/` LIMPIOS salvo 2 errores PRE-EXISTENTES y AJENOS a F12 en `src/__tests__/server/{correo,pago}` (`FlowRuteado.montoEsperado` — refactor de pago in-flight de otra sesión, `src/server/pago/*` ya modificado en el working tree; NO lo toco: dominio de dinero, fuera de scope). **Verificación curl (dev :3001, ya arriba — única instancia)**: demo-dreamy marcadores VERDE (packs "Más libros/Más elegido/Pack 4 libros/1 participación"; momento "Estás dentro/ARMY-04821/Tu número de sorteo/Compartir"; hero `blur(22px)`; "2 entradas para BTS"); **ticker AUSENTE** ✓; `autora`/`prueba`/`bcac`/`demo-noche`/`demo-editorial` HTTP 200 ✓. Covers hue-rotate y sorteo (compacto+contraste) son CLIENT-render (tRPC/useSorteoActivo) ⇒ NO en curl SSR; los valida la comparación screenshot del tester. **NOTA I-H honesta**: el fix de contraste toca la `sorteo_vitrina` COMPARTIDA ⇒ el banner oscuro de `bcac` (bicolor `marca_profundo→tinta`) también pasa a texto legible = MEJORA, no regresión (verificar por screenshot). **Drift (Step 4.5)**: sin drift load-bearing — todo instancia patrones documentados (token-CSS cero-hex, registro Zod, introspección). SUGERENCIA (no aplico): el idioma "texto tenue = `color-mix(currentColor, transparent)` sobre esquema oscuro" podría promoverse a `docs/agents/frontend-conventions.md` si otros widgets sobre fondo oscuro lo adoptan — queda como draft para el usuario. **GATE PENDIENTE**: `frontend-reviewer` (render, lista de archivos en la sección Reviewers) lo invoca el ORQUESTADOR; auto-chequeo design.md sin hallazgos (cero hex inline, montos con `clp()`+tabular-nums, motion nulo en blobs/ambiente, íconos por enum/Tabler). NO commit/push/INDEX. Comparación screenshot final `demo-dreamy` vs `dev-ref/variant-dreamy` ⇒ ORQUESTADOR/tester.
