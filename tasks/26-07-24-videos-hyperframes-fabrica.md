---
slug: videos-hyperframes-fabrica
status: implementing
owner: nicolas
created: 2026-07-24
related_adrs: []              # sin ADR — tooling interno, no decisión de arquitectura del producto (Q8)
related_context: []           # sin vocabulario nuevo del dominio comercial (Q8)

features:
  - id: F01
    behavior: "Kit de marca: build-tokens.mjs deriva tokens --st-* desde src/styles/theme.ts + tokens.local.json para lo exclusivo de video, generando el CSS de marca de la fábrica en videos/hyperframes/_brand/"
    state: active

  - id: F02
    behavior: "Fábrica portada: scripts (new-tour/render/embed-fonts/check-classes), _template-tour, _lib/tour-kit reskineado con frame de panel de Organizador Talonario, videos.json, README con gotchas, gitignore — pipeline completo funcional en esta máquina Windows"
    state: not_started

  - id: F03
    behavior: "Harness Claude adaptado: subagente hyperframes-video-builder + skill orquestadora en .claude/, con spec de marca Talonario y regla de copy sobrio"
    state: not_started

  - id: F04
    behavior: "Video piloto «Configura la tienda»: 6 beats, mock del panel Configuración, renderizado a MP4 real y verificado por frames ffmpeg"
    state: not_started
---

# Fábrica de videos HyperFrames — cápsulas de onboarding

## Contexto

Sorteatelo necesita cápsulas tutoriales de onboarding en video (configurar la tienda, conectar Flow, subir productos, montar el sorteo) para que un Organizador nuevo se active solo. En vez de grabar screencasts (frágiles, envejecen con cada cambio de UI), se porta la **fábrica HyperFrames** ya industrializada en dos repos hermanos (terranova-videos → datawalt-videos, prueba de portabilidad): HTML + CSS + GSAP → MP4 vía Chrome headless + FFmpeg, mocks re-dibujados de las pantallas del producto, videos mudos de 6 beats. Esta tanda entrega la fábrica reskineada con la marca «El Talonario», el harness Claude que baja el costo por video a <10 min, y **1 video piloto** («Configura la tienda») que valida el pipeline entero de punta a punta. El consumo in-app de los MP4s (tabla Tutorial, R2, página de cápsulas) queda explícitamente fuera como fase 2 post-F07.

### Contexto relevado de los repos origen (NO re-explorar; cacheado por el orchestrator)
- Motor: HyperFrames de HeyGen (Apache 2.0), pinneado `npx hyperframes@0.7.56` — HTML+CSS+GSAP → MP4 vía Chrome headless + FFmpeg. Remotion congelado en origen, no se usa.
- Un video = directorio con `index.html` (6 beats fijos: poster · concepto · paso 1-3 · outro; timeline GSAP inline), `app.js` (mock DOM + geometría `window.TOUR.P`) y `assets/`. Videos mudos, mocks re-dibujados (no screenshots), 1920×1080 @30fps.
- Pipeline: `new-tour.mjs` (scaffold desde `_template-tour/`) → editar → `check-classes.mjs` + `npx hyperframes lint` → `render.mjs -o out/*.mp4` → verificar 3 frames del MP4 real con ffmpeg.
- Fuente canónica a portar: `C:\Users\NicolásChaima\Desktop\PROGRAMACION\DATAWALT\datawalt-app\terranova_ADMIN\terranova-videos\hyperframes\` (con `_lib/tour-kit.{css,js}`, `_template-tour/`, scripts mjs, `videos.json`, README con 12 gotchas, `MOCKS.md`). Kit de marca hermano `terranova-brand/` (tokens.json + build/sync.mjs + fonts). El repo origen NO se modifica.
- Harness Claude en origen: subagente `hyperframes-video-builder` (opus) + skill `brand-artifact` (orquestador) + rule `brand.md`.
- Gotchas críticos: (9) motor descarta styling inline del DOM inyectado — app.js solo asigna CLASES; (12) @font-face url() externa falla silencioso — embed base64 en render-time; (11) `á` del username rompe FFmpeg — render.mjs copia binarios a `C:\Users\Public\hf\` + `HYPERFRAMES_FFMPEG_PATH`; (1) `hyperframes init` crashea en Windows — se usa `_template-tour/`. Node 22+, FFmpeg/ffprobe, telemetría off.
- Esfuerzo estimado: 1-2 días de reskin (grueso: `tour-kit.js` ~500 líneas — sidebar/topbar/browser-frame + geometría del layout a mockear) + kit de marca. `MOCKS.md` no se porta.
- Marca RESUELTA: «El Talonario» — blanco + cobalto #2b3fbf + amarillo #ffc530 + tinta #191b22; Fraunces/Bricolage 800/Instrument Sans/IBM Plex Mono (todas Google Fonts OFL). Fuente de verdad: `src/styles/theme.ts` + `docs/design.md`. La landing del apex (`src/components/landing/`) es la referencia de estilo declarada para las cápsulas: bandas cobalto/blanco/amarillo/gris/tinta, radius 18, sombra difusa, plumón amarillo en verbos, perforaciones dashed, sellos de goma, chip de ticket con muescas, mono en números.

## Decisiones

- **D1 — Alcance de la tanda: fábrica + harness Claude + 1 piloto** (Q1, opción c). Razón: el harness es lo que baja el costo de cada video siguiente y ya está probado en dos repos; sin piloto no hay forma de saber que el reskin funciona (los snapshots dan falso verde). El consumo in-app queda como fase 2 post-F07.
- **D2 — Un solo frame: panel de Organizador** (Q2, opción a). El tour-kit se reskinea para mockear el panel (rail tinta colapsable «Oscuro + calmo», §4 de `docs/design.md`), conservando el browser-frame genérico del kit origen con el **subdominio del tenant en la URL bar**. El frame de storefront NO se construye (out of scope) — los 4 tutoriales de onboarding transcurren en el panel. El tour-kit queda estructurado para que agregar un segundo frame después sea aditivo.
- **D3 — Ubicación: `videos/hyperframes/` en la raíz del repo** (Q3), hermano de `src/`, fuera del build de Next (patrón origen). No se toca `next.config` ni el tsconfig de la app; solo verificar que lint/tsc no barran la carpeta.
- **D4 — Tokens derivados de `theme.ts`, no a mano** (Q3, opción b). `build-tokens.mjs` importa `src/styles/theme.ts` (vía `npx tsx` o import dinámico) y genera el CSS de tokens de la fábrica; `tokens.local.json` cubre lo exclusivo de video que no existe en theme.ts (geometría del frame 1920×1080, medidas del rail, grosores del plumón, etc.). **Degradación documentada**: si el import de theme.ts resulta frágil, el implementer degrada a tokens copiados a mano con comentario "sincronizar a mano con theme.ts" — pero el intento (b) va primero.
- **D5 — Prefijo `--st-*`; la marca vive dentro de la fábrica** (Q4, opción a): `videos/hyperframes/_brand/` (CSS de tokens generado + `tokens.local.json` + fonts). Sin directorio hermano en la raíz (theme.ts ya es la fuente de verdad — un `sorteatelo-brand/` duplicaría rol). NO consumir `--mantine-color-*` (runtime de la app, naming de framework). El renombre `--tn-*` → `--st-*` es mecánico sobre tour-kit.css/js + template.
- **D6 — Voz del copy: chileno-neutro SOBRIO** (Q5 + ajuste). "Medio corporativo pero no tanto": sin posesivos empalagosos ("Conecta Flow", "Sube productos", "Configura la tienda" — no "Conecta tu Flow" ni "Sube tu primer PDF"), sin caer al impersonal "Configure su tienda", sin voseo, sin chilenismos arriesgados. Gramática visual de la landing: plumón amarillo en verbos clave, números en IBM Plex Mono. **El usuario pulirá el copy fino después** — la regla del spec del subagente debe reflejar este registro sin bloquear iteración posterior del copy.
- **D7 — Piloto: «Configura la tienda»** (Q6, opción a; título en registro sobrio). Primer paso del journey, mock representativo del panel (forms + switch de publicar, sin file-upload), será la cápsula #1 de la serie. Los otros 3 videos (conectar Flow, subir productos, montar sorteo) = **backlog de la fábrica**, fuera de esta tanda.
- **D8 — Gate propio de la fábrica en vez de Vitest/E2E** (Q7): ver Validaciones. Vitest y E2E navegador no aplican (tooling fuera de `src/`); el feature-tester valida corriendo el pipeline y mirando los 3 frames extraídos del MP4 real con ffmpeg.
- **D9 — Higiene git y docs** (Q8): se commitean las fuentes de la fábrica + harness Claude; gitignore para `out/*.mp4` (destino final: R2 en fase 2), fuentes efímeras de render y artefactos; el CSS de tokens generado puede commitearse o regenerarse (lo decide el implementer, documentado). README autocontenido dentro de `videos/hyperframes/` (12 gotchas adaptados) + párrafo corto en `CLAUDE.md`. **Sin ADR y sin tocar CONTEXT.md.**

## Plan

1. **Scaffold + kit de marca** (F01): crear `videos/hyperframes/` con la estructura del origen. Escribir `build-tokens.mjs` que deriva tokens `--st-*` (paleta cobalto/amarillo/tinta, radios, nombres de fuentes) desde `src/styles/theme.ts` y los emite en `_brand/` junto a `tokens.local.json` (medidas exclusivas de video). Traer las 4 fuentes (Fraunces, Bricolage Grotesque 800, Instrument Sans, IBM Plex Mono — Google Fonts OFL) al flujo de embed base64 de `embed-fonts.mjs`. Degradación D4 si el import falla. (F01)
2. **Port de scripts + template** (F02): copiar y adaptar `new-tour.mjs`, `render.mjs` (incl. workaround del `á`: copia de binarios a `C:\Users\Public\hf\` + `HYPERFRAMES_FFMPEG_PATH`), `embed-fonts.mjs`, `check-classes.mjs`, `_template-tour/`, `videos.json`. Pin `npx hyperframes@0.7.56`, telemetría off. Gitignore según D9. (F02)
3. **Reskin del tour-kit** (F02): `_lib/tour-kit.{css,js}` — renombre `--tn-*`→`--st-*`, chrome del panel de Organizador Talonario (rail tinta colapsable + topbar según §4 de `docs/design.md` y `src/components/admin/`), browser-frame genérico con subdominio en URL bar, gramática visual de la landing (radius 18, sombra difusa, plumón, perforaciones dashed, sellos, chip de ticket). Actualizar geometría FRAME/CONTENT. (F02)
4. **README + MOCKS** (F02): README adaptado con los 12 gotchas (rutas y nombres de este repo) + `MOCKS.md` nuevo que arranca con el mock del panel/Configuración. (F02)
5. **Harness Claude** (F03): adaptar `.claude/agents/hyperframes-video-builder.md` (spec cerrado, "no re-explores", marca Talonario, regla de copy D6, frame de panel D2) y la skill orquestadora en `.claude/skills/` (spec de 6 beats → delega → verifica frames; meta <10 min/video). (F03)
6. **Video piloto «Configura la tienda»** (F04): scaffold con `new-tour.mjs`, mock de la página Configuración del panel (re-dibujada en HTML/CSS con clases del tour-kit — cero styling inline en app.js, gotcha 9), 6 beats (poster · concepto · paso 1-3 · outro), copy sobrio D6, timeline GSAP inline. Lint + check-classes + render + verificación de 3 frames. (F04)
7. **Cierre** (F04): párrafo en `CLAUDE.md` registrando la fábrica; listar los 3 videos backlog en `videos.json`/README; `npm run check` del repo intacto. (F02, F04)

## Validaciones

Gate propio de la fábrica (D8). Vitest y E2E navegador no aplican salvo la no-regresión del repo.

### F01 — Kit de marca derivado

**Vitest**: 
- [ ] (no aplica — tooling de video fuera de src/; gate propio de la fábrica)

**Gate fábrica**:
- [ ] `build-tokens.mjs` corre y genera el CSS de tokens `--st-*` con colores/fuentes consistentes con `src/styles/theme.ts` (cobalto #2b3fbf, amarillo #ffc530, tinta #191b22, 4 familias tipográficas) — `videos/hyperframes/build-tokens.mjs` → `videos/hyperframes/_brand/brand.tokens.css` (128 tokens; verificable con `node videos/hyperframes/build-tokens.mjs --check`)
- [ ] `tokens.local.json` cubre lo exclusivo de video y el CSS resultante no contiene hex hardcodeados fuera de los derivados/locales — `videos/hyperframes/_brand/tokens.local.json` (cero hex: las sombras declaran color por NOMBRE de token derivado + alpha)

**E2E**:
- [ ] (no aplica — sin navegador de usuario)

### F02 — Fábrica portada y reskineada

**Vitest**:
- [ ] (no aplica)

**Gate fábrica**:
- [ ] `new-tour.mjs <slug>` scaffoldea un tour desde `_template-tour/` sin errores en esta máquina Windows (sin usar `hyperframes init` — gotcha 1) — `videos/hyperframes/new-tour.mjs` (verificado con el slug descartable `prueba-scaffold`: 6 clips borde a borde, registro en `videos.json`)
- [ ] `check-classes.mjs` + `npx hyperframes lint` pasan sobre el template scaffoldeado — `videos/hyperframes/check-classes.mjs` ✓ + `npx hyperframes@0.7.56 lint` **0 errores** (1 warning esperable `timeline_track_too_dense`)
- [ ] `render.mjs` funciona con el workaround del `á` (binarios en `C:\Users\Public\hf\` + `HYPERFRAMES_FFMPEG_PATH`) — `videos/hyperframes/render.mjs` (MP4 real renderizado 2 veces en esta máquina)
- [ ] Fonts embebidas base64 en render-time (sin `@font-face` con url() externa — gotcha 12) — `videos/hyperframes/embed-fonts.mjs` + `fetch-fonts.mjs` (`embed-fonts: 6 face(s) embebido(s)`; frame del MP4 confirma Fraunces/Bricolage/Instrument/Plex, no fuente de sistema)
- [ ] `out/` y efímeros gitignoreados; ningún MP4/binario en el repo — `videos/hyperframes/.gitignore` (`out/`, `*.mp4`, `*/assets/`, `_brand/fonts/`, `index.embed.html`)
- [ ] `npm run check` del repo sigue verde (videos/ no rompe tsc/lint/vitest de la app) — `npx tsc --noEmit`: **0 errores desde `videos/`** (quedan los 2 preexistentes ajenos de `montoEsperado`); `npx next lint`: 1 warning preexistente en `wordmark.tsx`, no barre `videos/`

**E2E**:
- [ ] (no aplica)

### F03 — Harness Claude

**Vitest**:
- [ ] (no aplica)

**Gate fábrica**:
- [ ] Subagente `hyperframes-video-builder` adaptado: rutas de este repo, marca Talonario, frame de panel, regla de copy sobrio (D6), "no re-explorar el repo origen"
- [ ] Skill orquestadora adaptada: spec de 6 beats → delega al subagente → exige verificación de frames del MP4 real (nunca snapshots)

**E2E**:
- [ ] (no aplica)

### F04 — Piloto «Configura la tienda»

**Vitest**:
- [ ] (no aplica)

**Gate fábrica**:
- [ ] MP4 real renderizado: 1920×1080 @30fps, 6 beats, duración esperada
- [ ] 3 frames extraídos del MP4 con ffmpeg verificados visualmente: marca Talonario correcta (cobalto/amarillo/tinta, tipografías), panel mockeado reconocible como el panel real, copy sobrio legible, plumón en verbos y mono en números
- [ ] `app.js` del piloto solo asigna CLASES (cero styling inline tipográfico — gotcha 9), verificado por `check-classes.mjs`
- [ ] Video mudo (sin pista de audio en el MP4)

**E2E**:
- [ ] (no aplica — la verificación visual es sobre frames del MP4, no navegador)

## Invariantes

- I1: **El repo origen NO se modifica** (`terranova-videos`, `datawalt-videos`, `terranova-brand` son solo lectura).
- I2: **`src/` de la app no se toca** salvo el párrafo en `CLAUDE.md` y el gitignore; `theme.ts` es read-only (fuente de tokens). `npm run check` debe seguir verde.
- I3: Motor **HyperFrames pinneado `0.7.56`**, telemetría deshabilitada, sin fork del motor. Remotion NO se usa.
- I4: **Mocks re-dibujados en HTML/CSS, nunca screenshots**; `app.js` solo asigna clases (gotcha 9); fonts embebidas base64 en render-time (gotcha 12); `hyperframes init` prohibido en Windows (gotcha 1) — scaffold vía `_template-tour/`.
- I5: **Verificación final SIEMPRE sobre frames extraídos del MP4 real con ffmpeg** — los snapshots del motor dan falso verde.
- I6: Videos **mudos** (sin TTS ni música), 1920×1080 @30fps, 6 beats fijos.
- I7: Copy en registro sobrio D6; cero hex inline en los tours — todo via tokens `--st-*`.
- I8: Ningún MP4, binario ni font efímera commiteados (D9).

## Out of scope

- **Consumo in-app** (fase 2 post-F07): tabla `Tutorial` en schema, subida de MP4s a R2, página de cápsulas en el panel.
- **Frame de storefront** en el tour-kit (D2).
- **Los otros 3 videos** (conectar Flow, subir productos, montar sorteo) — backlog de la fábrica.
- TTS, música, subtítulos, Remotion.
- Port de `MOCKS.md` del origen (cada pantalla de ESTE producto se mockea una vez, desde cero).
- ADR nuevo o cambios a `CONTEXT.md` (D9).
- Pulido fino del copy (lo hace el usuario después, D6).

## Especialistas a consultar

- `frontend-reviewer` — fidelidad de marca del tour-kit reskineado y del mock del panel vs `docs/design.md` §4 y la landing (`src/components/landing/`).
- `change-set-reviewer` — diff final (gitignore correcto, nada efímero commiteado, CLAUDE.md).
- `feature-tester` — corre el pipeline completo (scaffold → lint → render) y valida los 3 frames del MP4 del piloto. NO usa navegador.

## Bitácora

- [2026-07-24 00:00] [planner-grill] Arranco grill. Contexto de los repos origen ya relevado por el orchestrator (cacheado arriba en Contexto). Q1: alcance de esta tanda — ¿solo fábrica + piloto, o también el harness Claude (subagente + skill)? Recomendada: fábrica + harness + 1 piloto; consumo in-app (tabla Tutorial, MP4s en R2, página de cápsulas) explícitamente FUERA como fase 2 post-F07.
- [2026-07-24 00:10] [planner-grill] Q1 answered: (c) — fábrica + harness Claude (subagente + skill) + 1 video piloto. Consumo in-app FUERA (fase 2 post-F07). Esta tanda termina con MP4s locales en out/.
- [2026-07-24 00:10] [planner-grill] Q2: qué layout mockea el tour-kit — ¿solo panel de Organizador (rail tinta «Oscuro + calmo»), solo storefront, o ambos frames? Recomendada: solo el panel en esta tanda; el frame de storefront queda out of scope (los 4 tutoriales de onboarding pasan en el panel).
- [2026-07-24 00:20] [planner-grill] Q2 answered: (a) — solo frame de panel Organizador (rail tinta «Oscuro + calmo»), conservando browser-frame genérico con subdominio en URL bar. Frame de storefront → Out of scope.
- [2026-07-24 00:20] [planner-grill] Q3: ubicación en el repo + estrategia de tokens de marca — ¿`videos/hyperframes/` en raíz (patrón origen, fuera del build de Next) y tokens DERIVADOS de `src/styles/theme.ts` vía script (evita drift) vs `tokens.json` a mano (patrón origen)? Recomendada: `videos/hyperframes/` en raíz + script `build-tokens.mjs` que importa theme.ts/design tokens y genera el CSS de tokens de la fábrica (single source of truth).
- [2026-07-24 00:30] [planner-grill] Q3 answered: ubicación `videos/hyperframes/` en raíz OK; tokens opción (b) — `build-tokens.mjs` deriva de `src/styles/theme.ts` + `tokens.local.json` para lo exclusivo de video (geometría frame, plumón, etc.); degradación documentada a tokens.json a mano si el import resulta frágil.
- [2026-07-24 00:30] [planner-grill] Q4: prefijo de variables CSS de tokens y nombre del dir de marca — origen usa `--tn-*`/`--dw-*` con dir de marca hermano. Recomendada: prefijo `--st-*` y sin dir hermano separado — la marca vive dentro de `videos/hyperframes/_brand/` (tokens generados + fonts), porque theme.ts ya es la fuente de verdad y un `sorteatelo-brand/` raíz duplicaría rol.
- [2026-07-24 00:40] [planner-grill] Q4 answered: (a) — prefijo `--st-*`; marca dentro de `videos/hyperframes/_brand/` (CSS generado + tokens.local.json + fonts); sin dir hermano en raíz.
- [2026-07-24 00:40] [planner-grill] Q5: idioma/voz del copy de las cápsulas — origen usa es-neutro anti-voseo; sorteatelo es chileno con voz cercana ("tu plata llega directa a ti"). Recomendada: tuteo chileno-neutro alineado a la voz de la landing (tú/tu, sin voseo "vos", sin es-neutro impersonal), documentado como regla en el spec del subagente.
- [2026-07-24 00:50] [planner-grill] Q5 answered: (a) — tuteo chileno-neutro alineado a la landing; sin voseo ni chilenismos arriesgados; plumón en verbos, mono en números. Regla va al spec del subagente.
- [2026-07-24 00:50] [planner-grill] Q6: cuál es el video piloto (1 solo) — candidatos: configurar tienda / conectar Flow / subir producto / montar sorteo. Recomendada: "Configura tu tienda" (primer paso del journey de onboarding, mockea la página Configuración del panel, valida pipeline entero sin ser el mock más complejo).
- [2026-07-24 01:00] [planner-grill] AJUSTE a Q5: registro un punto MÁS SOBRIO — chileno-neutro "medio corporativo pero no tanto". Sin posesivos empalagosos ("Conecta Flow", "Sube productos"), sin llegar al impersonal "Configure su tienda". El usuario pulirá el copy fino después — la regla del spec no debe bloquear iteración posterior.
- [2026-07-24 01:00] [planner-grill] Q6 answered: (a) — piloto "Configura la tienda" (título en registro sobrio). Los otros 3 videos (Flow, productos, sorteo) = backlog de la fábrica, fuera de esta tanda.
- [2026-07-24 01:00] [planner-grill] Q7: validaciones/gates — Vitest y E2E navegador NO aplican (tooling fuera de src/); propongo reemplazar por el gate propio de la fábrica: check-classes + hyperframes lint + render real + verificación de 3 frames del MP4 con ffmpeg + `npm run check` del repo intacto (videos/ no rompe tsc/lint). Recomendada: sí, ese es el gate; el feature-tester valida mirando los frames extraídos.
- [2026-07-24 01:10] [planner-grill] Q7 answered: sí — gate de 6 puntos aprobado tal cual; Vitest/E2E "(no aplica)" con nota.
- [2026-07-24 01:10] [planner-grill] Q8: higiene git + docs — qué se commitea (¿MP4s de out/? ¿fonts descargadas? ¿binarios?) y qué docs se tocan. Recomendada: gitignore out/, fonts efímeras y binarios (repo solo fuentes: scripts, _lib, _template-tour, _brand/tokens.local.json, tours, videos.json, README+gotchas); MP4s NO al repo (su destino es R2 en fase 2). Docs: README portado dentro de videos/hyperframes/ + párrafo corto en CLAUDE.md; harness en .claude/agents/ y .claude/skills/.
- [2026-07-24 01:20] [planner-grill] Q8 answered: sí tal cual — commit de fuentes + harness; gitignore MP4/efímeros; README autocontenido + párrafo CLAUDE.md; sin ADR, sin CONTEXT.md.
- [2026-07-24 01:20] [planner-grill] Grill cerrado (8 rondas). Plan escrito: D1-D9, F01-F04, gate propio de la fábrica en Validaciones. AWAITING USER APPROVAL.
- [2026-07-24 02:00] [feature-implementer] Arranca implementación. Features pendientes: F01, F02, F03, F04. `Skill("tdd")` NO se invoca: D8 declara que Vitest no aplica (tooling fuera de `src/`), el gate es el pipeline de la fábrica + frames del MP4.
- [2026-07-24 02:05] [feature-implementer] Read pass + 3 hallazgos del entorno ANTES de escribir código:
  (1) **`npm run check:types` ya está ROJO en HEAD** (baseline ajeno, 2 errores): `src/__tests__/server/correo/enviarCorreoDescargaDeOrden.test.ts:184` y `src/__tests__/server/pago/aplicarEfectosPostPago.test.ts:471` — falta `montoEsperado` en `FlowRuteado`. Es territorio de `launch-crear-sorteo-y-hardening` F03, NO se toca acá (I2 se mide como "videos/ no AGREGA errores").
  (2) **`tsconfig.json` SÍ barre `videos/`**: `include` trae `**/*.js` + `checkJs: true` ⇒ un `tour-kit.js` portado tal cual mete 52 errores TS. La premisa de D3 ("verificar que lint/tsc no barran la carpeta") resultó falsa. Como D3 prohíbe tocar el tsconfig de la app, se resuelve DENTRO de `videos/`: `// @ts-nocheck` en la 1ª línea de cada `.js` de navegador (se propaga solo, porque el `app.js` del template lo lleva). Verificado: con eso tsc no reporta nada de `videos/`. Alternativa descartada (requeriría tocar el tsconfig): agregar `"videos"` a `exclude`.
  (3) `next lint` NO barre `videos/` (Next 14 lintea solo app/pages/components/lib/src y `next.config.js` no define `eslint.dirs`); `vitest` tampoco (`include: ["src/__tests__/**"]`). Solo tsc era el riesgo.
- [2026-07-25 00:05] [feature-implementer] **F01 IMPLEMENTADA** — kit de marca en `videos/hyperframes/_brand/`. D4 opción (b) CONFIRMADA: `build-tokens.mjs` importa `src/styles/theme.ts` de verdad con `npx tsx` (extractor `.mts` efímero que se borra en el `finally`, así no suma superficie al `check:types`) y emite **131 tokens `--st-*`** — las 8 tuplas de 10 tonos (`sorteatelo→cobalto`, `amarillo`, `exito`, `premio`, `pendiente`, `red→ladrillo`, `gray→gris`, `hundido`) + `black`/`white` + roles semánticos anclados al `primaryShade` LEÍDO del theme (no asumido). NO hizo falta la degradación a hex a mano. `tokens.local.json` cubre lo exclusivo de video (4 familias con su query de Google Fonts, canvas 1920×1080, medidas del chrome, radios, plumón) y **no contiene un solo hex**: sombras, tintes y velo declaran color por NOMBRE de token derivado + alpha, y el script los resuelve a `rgba()`. Extras: `--check` (falla si el CSS quedó viejo) y un **gate de drift** que compara las constantes `CHROME` de `_lib/tour-kit.js` contra `tokens.local.json → chrome`. Fuentes: `fetch-fonts.mjs` baja el subset latin de las 4 familias (OFL) a `_brand/fonts/` — 6 faces, gitignored (I8: cero binarios en git), reproducible.
- [2026-07-25 00:30] [feature-implementer] **F02 IMPLEMENTADA** — fábrica portada y reskineada. Scripts: `new-tour.mjs` · `render.mjs` · `embed-fonts.mjs` · `check-classes.mjs` · `_lib/materializar.mjs`. Kit `_lib/tour-kit.{css,js}` reescrito con el panel de Organizador «Oscuro + calmo» (rail tinta 232/68 con wordmark invertido + ítem esbelto, topbar 64 sin borde con chip de tienda/⌘K/Ver mi tienda/avatar, canvas gray-0, `PanelCard` sin borde con `SOMBRA_PANEL`, PageHeader, campos/botones/switch/badges) + gramática del talonario (plumón como background-image del propio span, perforación dashed, sello, chip de ticket, mono en números). **Divergencia deliberada del origen** (documentada en README): `<video>/assets/` es EFÍMERO — `materializar.mjs` copia kit+tokens+gsap desde la fuente única al scaffoldear/chequear/renderizar, así un fix del kit o un cambio de paleta llega a TODOS los videos y git no guarda N copias de un generado. Pipeline verificado de punta a punta en esta máquina: scaffold → check-classes ✓ → `lint` 0 errores → **render MP4 real 1920×1080@30fps sin pista de audio** → 3 frames extraídos con ffmpeg y mirados.
- [2026-07-25 00:35] [feature-implementer] **2 gotchas NUEVOS descubiertos rindiendo el piloto de humo** (documentados como 13-15 en el README):
  (13) el tsconfig de la app barre `videos/**/*.js` con `checkJs` ⇒ `// @ts-nocheck` en todo `.js` de navegador de la fábrica (se propaga solo vía el `app.js` del template).
  (14) **un glob con la secuencia asterisco-barra dentro de un comentario de bloque CIERRA el comentario** y rompe el `.js` en silencio: el primer render salió **estático** (109 KB / 35.8 s) porque `app.js` tiraba `Unexpected token '*'`, el timeline nunca se registraba y el único aviso era un `Sub-composition timelines not registered` perdido en el log. Lo cazó `npx hyperframes validate <slug>`. Tras el fix: `pollSubCompositionTimelines complete (ready)`.
  (15) el isotipo va INLINE, no como `<img src="*.svg">`: un SVG externo no hereda las `@font-face` embebidas y la «S» caería a fuente de sistema (mismo síntoma del gotcha 12). `TourKit.isotipo()` lo emite inline y estila la letra por CLASE.
- [2026-07-25 00:45] [feature-implementer] **frontend-reviewer (F01+F02): APPROVE, 0 blockers, 5 nits** — todos de fidelidad del chrome, todos CORREGIDOS antes de hornearlos en el piloto: (a) `.btn-primario` tenía radio 12 + sombra difusa de color (gramática de MARCA) siendo el default de `boton()`, y en el panel real no existe ⇒ se separó `--st-radio-control: 8` (escala Mantine del producto) para botones/inputs/inset/nav y quedó `.btn-marca` aparte, sólo para superficies de marca; (b) chip de tienda `radius="sm"` ⇒ `--st-radio-chip: 4`; (c) badges `radius="sm"` ⇒ `--st-radio-badge: 4` (era 6 hardcodeado, el único radio sin token); (d) el avatar de la sesión es `variant="light"` de Mantine (tinte pálido + texto cobalto), no una moneda sólida. Confirmado por el reviewer: **cero hex de marca fuera del CSS generado**, Bricolage 800 confinado a wordmark/isotipo, Fraunces sólo en headlines/títulos, `SOMBRA_PANEL` idéntica byte a byte. Único nit no accionable: `--st-rail-divisor` aproxima el `dark.5` de Mantine con `gris-8` (la paleta `dark` stock no está expuesta en `theme.ts`).
- [2026-07-24 02:10] [feature-implementer] Corrección factual a D2 (URL bar): el panel de Organizador vive en el **apex** (`sorteatelo.cl/admin/*`, `src/middleware.ts` + `parsearHost`), no en el subdominio del tenant — el subdominio es del storefront. Poner `<slug>.sorteatelo.cl` en la URL bar de un tutorial del panel sería enseñar una ruta que no existe. Se implementa el `browserFrame(url, …)` **genérico con la URL como parámetro** (que es lo que D2 pide de fondo: conservar el browser-frame del kit origen) y el piloto usa `sorteatelo.cl/admin/configuracion`. Cuando exista un tour de storefront, esa misma función recibe `<slug>.sorteatelo.cl`. REVISABLE por el usuario: es un string.
