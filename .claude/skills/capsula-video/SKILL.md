---
name: capsula-video
description: Produce una cápsula de onboarding de Sortéatelo en video (HTML+CSS+GSAP → MP4, motor HyperFrames) para enseñarle a un Organizador a hacer algo en el panel — configurar la tienda, conectar Flow, subir productos, montar el sorteo. Úsala cuando el usuario pida "un video/tutorial/cápsula de X", "explicar X en video" o quiera producir alguna de las cápsulas del backlog. NO es para la UI de la app (eso es Mantine) ni para documentos HTML.
---

# Producir una cápsula de onboarding

Fábrica: **`videos/hyperframes/`** (README con los 15 gotchas y el pipeline). Motor **HyperFrames**
pinneado `0.7.56`. Salida: MP4 mudo 1920×1080 @30fps, **6 beats fijos** — poster · concepto ·
paso 1 · paso 2 · paso 3 · outro.

**Vos NO escribís el video: escribís el SPEC y delegás.** La implementación va al subagente
**`hyperframes-video-builder`** (opus, effort high). Lo caro del proceso viejo era que el agente
re-exploraba todo desde cero y reescribía el 70% de boilerplate. Meta: **< 10 min por cápsula**.

---

## Paso 1 — Armar el SPEC CERRADO

Es lo único que hacés vos. Un spec con huecos = el subagente adivina o se frena.

**1. Guion**: los 6 beats con sus duraciones (`--beats`). Punto de partida sano:
`5,5.5,7.5,7.5,8,5` (38.5 s). El poster va **holgado** (es el thumbnail) y cada paso necesita
~7 s para que el cursor viaje, haga clic y el tooltip se lea entero.

**2. Copy FINAL** — ya en el registro sobrio (ver abajo). No dejes que el subagente lo invente:
- titular + subtítulo del poster,
- título + bajada del concepto,
- los 3 tooltips (título + cuerpo, imperativo),
- eyebrow + titular del outro.

**3. Pantallas**: cuáles usa y si ya están en [`videos/hyperframes/MOCKS.md`](../../../videos/hyperframes/MOCKS.md).
- Está → el subagente **copia ese builder**.
- Es nueva → **el spec debe traer la geometría y los datos del mock**. Si hace falta, leé vos el
  componente real de `src/pages/admin/` ANTES y volcalo al spec (qué cards, en qué orden, qué
  campos, qué badges, qué botones).

**4. Recorrido del cursor**: qué se clickea en cada paso (`P.p0 → P.p1 → P.p2`, continuo) y **qué
cambia al clickear** (el toggle/valor que se sostiene después).

**5. Datos del mock**: nombre de la tienda de ejemplo, su color, iniciales del avatar, montos.
Inventá datos plausibles y **decilos en el spec** — el subagente no debe improvisar dominio.

## Paso 2 — Delegar

Invocá `hyperframes-video-builder` con el spec y la orden explícita:
*"no re-explores los componentes ni el README; todo está en el spec"*.

## Paso 3 — Revisar y cerrar

Mirá vos 2-3 frames del MP4 real y cerrá. Si mockeó una pantalla nueva, confirmá que la agregó a
`MOCKS.md`.

---

## Voz del copy (regla dura)

**Español de Chile, registro SOBRIO** — "medio corporativo pero no tanto". Es la voz de
`docs/design.md` §8 bajada un punto de calidez, porque acá se está *enseñando*, no vendiendo.

| Sí | No |
|---|---|
| "Conecta Flow" | "Conecta tu Flow" (posesivo empalagoso) |
| "Sube productos" | "Sube tu primer PDF" |
| "Configura la tienda" | "Configure su tienda" (usted) · "Configurá" (voseo) |
| "Tus ventas llegan a tu cuenta de Flow" | "¡Las lucas te llegan al toque!" (chilenismo/hype) |

- Frases cortas. El beat de concepto explica **una** idea.
- **Plumón** amarillo (`<span class="plumon">`) sobre el verbo clave del titular — una vez por beat
  como máximo.
- Números y montos en `.mono` (IBM Plex Mono, `tabular-nums`), CLP con separador de miles.
- Nada de urgencia de rifa ("¡últimos números!") — es la bandera que el público asocia a estafa.

El usuario pule el copy fino después. Entregá algo correcto y sobrio; no lo sobre-trabajes.

## Marca

Todo sale de los tokens `--st-*` que `build-tokens.mjs` deriva de `src/styles/theme.ts`
(«El Talonario»: cobalto + amarillo + tinta; Fraunces / Bricolage 800 / Instrument Sans /
IBM Plex Mono). **Cero hex a mano.** Si falta un token, se agrega a `_brand/tokens.local.json` y se
regenera — nunca se hardcodea.

Cambiar la marca **no es esto**: es editar `src/styles/theme.ts` (+ `docs/design.md`) y correr
`node videos/hyperframes/build-tokens.mjs`.

## Gate (el subagente lo corre; vos lo exigís)

```
[ ] spec cerrado ANTES de delegar
[ ] new-tour.mjs (clips calculados, nunca aritmética a mano)
[ ] mock desde MOCKS.md si la pantalla ya existe
[ ] node check-classes.mjs <slug>            ✓
[ ] npx hyperframes@0.7.56 lint <slug>       0 errores
[ ] node render.mjs <slug>                   → videos/hyperframes/out/YYYY-MM-DD-<slug>.mp4
[ ] 3 FRAMES DEL MP4 REAL verificados        (fuentes de marca · mock fiel · cursor continuo · estado final)
[ ] MOCKS.md actualizado si mockeó una pantalla nueva
[ ] pase de copy: sin voseo, sin "usted", sin posesivos empalagosos
```

**Los `snapshot` del motor NO son gate**: no reproducen el quirk de estilos inline y dieron falsos
verdes en el repo origen. El único gate visual válido son los **frames del MP4 real**.

## Fuera de alcance

- El **consumo in-app** de los MP4 (tabla `Tutorial`, subida a R2, página de cápsulas del panel) es
  **fase 2 post-F07** del roadmap, no de esta skill.
- Cápsulas del **storefront**: el tour-kit hoy sólo mockea el panel de Organizador. Agregar ese
  frame es trabajo de kit (`_lib/`), con plan propio.
- TTS, música, subtítulos.

## Backlog de cápsulas

`videos/hyperframes/videos.json` → `backlog`: **Conecta Flow** · **Sube productos** ·
**Monta el sorteo**.
