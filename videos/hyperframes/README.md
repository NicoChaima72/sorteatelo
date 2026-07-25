# videos/hyperframes — fábrica de cápsulas de onboarding (HyperFrames)

Cápsulas tutoriales en video para que un **Organizador** nuevo se active solo (configurar la
tienda, conectar Flow, subir productos, montar el sorteo). **No son screencasts**: el mock del
producto se **re-dibuja en HTML/CSS**, así el video no envejece con cada cambio de UI y se
regenera con un comando.

Motor: **HyperFrames** (HeyGen, Apache 2.0) — HTML + CSS + GSAP → MP4 vía Chrome headless +
FFmpeg. Versión pinneada **`hyperframes@0.7.56`**.

Port de la fábrica ya industrializada en dos repos hermanos (`terranova-videos` →
`datawalt-videos`), reskineada con la identidad **«El Talonario»** (`docs/design.md`).
Plan: [`tasks/26-07-24-videos-hyperframes-fabrica.md`](../../tasks/26-07-24-videos-hyperframes-fabrica.md).

> **Alcance de esta tanda**: la fábrica + el harness de Claude + 1 cápsula piloto. El **consumo
> in-app** (tabla `Tutorial`, MP4s en R2, página de cápsulas en el panel) es **fase 2 post-F07**.
> Hoy los MP4 quedan en `out/`, fuera de git.

---

## Pipeline (5 comandos)

```bash
cd videos/hyperframes

node new-tour.mjs configura-la-tienda "Configura la tienda" \
     --beats 5,5.5,7.5,7.5,8,5 --module tienda      # 1. scaffold (~1 s)
# 2. editar index.html (copy de los beats + clases del mock) y app.js (geometría + mock)
node check-classes.mjs configura-la-tienda           # 3. gate estático (~1 s)
npx hyperframes@0.7.56 lint configura-la-tienda      # 4. lint (0 errores)
node render.mjs configura-la-tienda                  # 5. → out/YYYY-MM-DD-<slug>.mp4
# 6. VERIFICAR 3 frames del MP4 REAL (poster / paso medio / cierre) con ffmpeg
```

`render.mjs` es el **único** camino de render: baja las fuentes si faltan, materializa los assets
compartidos, embebe las woff2 en base64 y aplica el override de FFmpeg de Windows. Nunca corras
`npx hyperframes render` a mano (gotcha 12).

### Setup por máquina

- **Node 22+** (acá: v24) y **FFmpeg + ffprobe en el PATH** (`npx hyperframes@0.7.56 doctor`).
- Primera vez: `npx hyperframes@0.7.56 telemetry disable` (gotcha 7).
- Las fuentes se bajan solas la primera vez que renderizás; a mano:
  `node fetch-fonts.mjs` (requiere red — Google Fonts, licencia OFL).

---

## Estructura

```
videos/hyperframes/
├── _brand/                     ← MARCA de la fábrica
│   ├── tokens.local.json       ← tokens EXCLUSIVOS de video (fuentes, chrome, radios, sombras)
│   ├── brand.tokens.css        ← GENERADO: variables --st-* (colores derivados de theme.ts)
│   └── fonts/                  ← woff2 OFL — GITIGNORED, las baja fetch-fonts.mjs
├── _lib/                       ← FUENTE ÚNICA de lo compartido (tracked)
│   ├── tour-kit.css / .js      ← chrome del panel, PanelCard, campos, tooltip, spotlight, cursor
│   ├── gsap.min.js             ← vendored pinneado (gotcha 6: local, no CDN)
│   └── materializar.mjs        ← copia los compartidos al folder de cada video
├── _template-tour/             ← esqueleto de los 6 beats que usa new-tour.mjs
│   ├── index.html              ← pelado: @font-face url("assets/fonts/…") + timeline GSAP inline
│   └── app.js                  ← mock + geometría (window.TOUR.P)
├── <slug>/                     ← UN FOLDER POR VIDEO — al repo va sólo index.html + app.js
│   └── assets/                 ← EFÍMERO (gitignored): kit + tokens + gsap materializados
├── out/                        ← EFÍMERO: todos los MP4 juntos (YYYY-MM-DD-<slug>.mp4)
├── build-tokens.mjs            ← genera _brand/brand.tokens.css desde src/styles/theme.ts
├── fetch-fonts.mjs             ← baja las 4 familias a _brand/fonts/
├── new-tour.mjs                ← scaffolder (clips borde a borde + videos.json)
├── render.mjs                  ← wrapper de render (fuentes + assets + embed + FFmpeg)
├── embed-fonts.mjs             ← sub-rutina: url() → data:base64 (gotcha 12)
├── check-classes.mjs           ← gate estático de clases faltantes (bug #1)
├── videos.json                 ← registro de cápsulas + backlog
├── MOCKS.md                    ← catálogo de pantallas ya mockeadas
└── README.md
```

### Qué se commitea y qué no (D9/I8)

| Va a git | No va a git |
|---|---|
| scripts `.mjs`, `_lib/`, `_template-tour/` | `out/` y todo `*.mp4` |
| `_brand/tokens.local.json` + `brand.tokens.css` | `_brand/fonts/` (binarios OFL, reproducibles) |
| `<slug>/index.html` + `<slug>/app.js` | `<slug>/assets/` (kit/tokens/gsap materializados) |
| `videos.json`, `README.md`, `MOCKS.md` | `index.embed.html` (el base64 nunca queda en el árbol) |

**Divergencia deliberada del kit origen**: allá cada video committeaba su copia de
`tour-kit.{css,js}` + tokens, así que un fix del kit sólo alcanzaba a los videos **nuevos**. Acá
esas copias son efímeras (`_lib/materializar.mjs`) ⇒ un fix del kit o un cambio de paleta llega a
**todos** los videos al re-renderizar, y git no guarda N copias de un generado.

---

## Marca: los tokens salen de `theme.ts`, nunca a mano

```bash
node build-tokens.mjs            # regenera _brand/brand.tokens.css
node build-tokens.mjs --check    # falla si quedó desactualizado
```

- Los **colores** se derivan de **`src/styles/theme.ts`** (la paleta «El Talonario» vive ahí y
  sólo ahí, `docs/design.md` §2/§9). `build-tokens.mjs` importa el theme real con `npx tsx` y
  emite las tuplas de 10 tonos como `--st-cobalto-*`, `--st-amarillo-*`, `--st-gris-*`, etc.
  **Cambiar la paleta = editar `theme.ts` y re-correr el script.**
- Lo **exclusivo del medio video** (canvas 1920×1080, medidas del chrome mockeado, radios,
  sombras, grosor del plumón, las 4 familias tipográficas) vive en `_brand/tokens.local.json`,
  que **no contiene ningún hex**: las sombras y tintes declaran el color por *nombre de token
  derivado* + alpha.
- En el HTML/JS de un video: `var(--st-acento)`, `var(--st-premio)`, `var(--st-texto-suave)`…
  **nunca un hex a mano** (I7).
- `build-tokens.mjs` además **falla si la geometría del chrome divergió**: las constantes
  `CHROME` de `_lib/tour-kit.js` tienen que coincidir con `tokens.local.json → chrome`.

Tipografía (design.md §3): **Fraunces** (headlines) · **Bricolage Grotesque 800** (wordmark) ·
**Instrument Sans** (texto) · **IBM Plex Mono** (números y etiquetas). Las cuatro son Google
Fonts (OFL) y se bajan con `fetch-fonts.mjs`.

---

## Reglas del kit

- Un fix visual **genérico** va a `_lib/` (no al video). Los videos ya renderizados no se
  re-generan salvo que haga falta.
- El `app.js` del video trae **sólo el mock de esa pantalla** + la geometría (`window.TOUR.P`),
  que el timeline lee para mover el cursor → mock, spotlight, tooltip y cursor quedan alineados
  **por construcción**, nunca a ojo.
- Todo elemento que **cambia de estado** durante el tour usa `TourKit.stackEl()` (crossfade con
  la caja reservada). Sin eso el elemento se cae de su fila.
- `check-classes` + `lint` son la mitad barata del gate. La otra mitad —**mirar frames del MP4
  real**— es obligatoria: el `snapshot` NO reproduce el quirk del gotcha 9 y da falso verde.
- Si la pantalla ya está en [`MOCKS.md`](MOCKS.md), **se copia el builder**; no se re-deriva
  leyendo el componente React.

## Formato (no negociable)

- **1920×1080 @30fps, mudo** (sin TTS ni música), **6 beats fijos**: poster · concepto ·
  paso 1 · paso 2 · paso 3 · outro.
- **Frame 0 = poster legible** (la intro no tiene animación de entrada — es el thumbnail).
- **Cursor continuo**: cada paso arranca donde terminó el anterior (`P.p0 → P.p1 → P.p2`).
- **Un estado se sostiene**: lo que se abrió en el paso N sigue abierto en el N+1.
- **Mock = producto real**: el panel de Organizador «Oscuro + calmo» (design.md §4) — rail tinta
  colapsable, topbar sin borde, canvas gray-0, `PanelCard` sin borde con sombra difusa.
- **Voz**: español de Chile **sobrio** — tuteo sin posesivos empalagosos ("Conecta Flow",
  "Sube productos"), sin "usted", sin voseo, sin chilenismos arriesgados. Plumón amarillo en los
  verbos clave, números en mono.

---

## Gotchas

Heredados del POC datawalt (2026-07-09) y del port terranova (2026-07-13/17). **Los 12 valen
igual acá**: mismo Windows, mismo username con acento.

1. **`npx hyperframes init` CRASHEA en Windows** (bug del scaffolder, agravado por el acento del
   path del usuario). No usarlo: el scaffold es `new-tour.mjs` desde `_template-tour/`.
   `render`/`lint`/`check`/`snapshot` funcionan perfecto, incluso con acento en el path.
2. **El timeline GSAP va INLINE en `index.html`** — el guard estático no ve `.js` externos y
   bloquea el render (`missing_timeline_registry`). `app.js` (builders de DOM) sí puede ser externo.
3. **Clips del mismo `data-track-index` NO pueden solaparse** ni un frame — duraciones exactas
   (frames/30, 4 decimales), beats consecutivos borde a borde. Los calcula `new-tour.mjs`.
4. El root necesita `data-start="0"` + `data-duration="<seg>"`.
5. Timeline registrado con key = `data-composition-id` del root, `{paused: true}`, tweens con
   `ease: "none"` salvo curva buscada.
6. **GSAP local** (`assets/gsap.min.js`), no CDN — render determinista sin red. La copia canónica
   vive en `_lib/gsap.min.js` y `materializar.mjs` la pone efímera en cada video.
7. Telemetría de HeyGen activa por default: `npx hyperframes@0.7.56 telemetry disable`.
8. Requisitos: Node 22+, FFmpeg en PATH (`npx hyperframes@0.7.56 doctor`).
9. **El styling INLINE del contenido que inyecta `app.js` se DESCARTA — el quirk es TOTAL.** El
   motor honra el styling inline del HTML **estático** (los clips/beats), pero del DOM que
   `app.js` mete por `innerHTML` **ignora toda la tipografía inline** (`font-family`/`font-size`/
   `font-weight`/`letter-spacing`/`text-transform`/`white-space`) **y el `gap`**. Sobrevive inline:
   la geometría (`position`/`left`/`top`/`width`/`height`), `background`, `border`,
   `border-radius`, `box-shadow`. **REGLA: `app.js` sólo asigna CLASES para todo el styling
   visual/tipográfico** — las clases viven en `tour-kit.css` o en el `<style>` del `index.html`.
   El inline queda para la geometría de frame y para lo que anima GSAP. Una clase inexistente es
   silenciosa → por eso existe `check-classes.mjs`.
10. **El cursor se mueve con `transform` (`x`/`y`), no `left`/`top`** — el guard bloquea el render
    con `gsap_non_transform_motion`. Posicionalo en `left:0;top:0` y animá `x`/`y`; fijá la
    posición inicial con `tl.set("#cursor-N", {x, y}, 0)`.
11. **`render` falla en Git Bash con username acentuado** (`NicolásChaima` → el `á` se mangyea al
    pasar el PATH a node y el existence-check de FFmpeg no encuentra el binario). `render.mjs` lo
    **encapsula**: copia `ffmpeg.exe`/`ffprobe.exe` a `C:\Users\Public\hf\` y setea
    `HYPERFRAMES_FFMPEG_PATH` / `HYPERFRAMES_FFPROBE_PATH`. `lint`/`check`/`snapshot` no se ven
    afectados (usan Chrome, no FFmpeg).
12. **Las `@font-face` con `url()` a woff2 externo NO cargan en el render** — el motor serializa el
    DOM y no resuelve esos `src`; el texto cae **en silencio** a una fuente del sistema. Fix:
    **base64** (`data:font/woff2;base64,…`). El `index.html` versionado queda **pelado** con
    `src: url("assets/fonts/<Familia>.woff2")` — token **root-relative** que el lint acepta (NO
    uses `../`: lo rechaza con `invalid_parent_traversal_in_asset_path`) y que **no existe en
    disco**. `render.mjs` embebe el base64 en una copia efímera `index.embed.html` vía
    `embed-fonts.mjs`, con los bytes de `_brand/fonts/`. Señal buena en el log: `media + fonts +
    tailwind ready`.

### Gotchas nuevos de este port (2026-07-24)

13. **El `tsconfig.json` de la app barre `videos/`**: su `include` trae todos los `.js` con
    `checkJs: true`, así que un `.js` de navegador de la fábrica pone rojo `npm run check:types`
    del repo. Por eso **todo `.js` de `videos/` arranca con `// @ts-nocheck`** (el `app.js` del
    template ya lo trae ⇒ se propaga a cada video nuevo). `next lint` y `vitest` **no** barren
    `videos/` (Next lintea `app|pages|components|lib|src`; vitest incluye sólo `src/__tests__/`).
14. **Un glob con la secuencia asterisco-barra dentro de un comentario de bloque CIERRA el
    comentario** y rompe el `.js` en silencio: `app.js` tira `Unexpected token '*'`, el timeline
    no se registra y el MP4 sale **estático** sin ningún error visible en el render (sólo un
    `Sub-composition timelines not registered` perdido en el log). Pasó de verdad en este port.
    Diagnóstico rápido: `npx hyperframes@0.7.56 validate <slug>` muestra el error de JS
    (los 404 de `assets/fonts/*.woff2` ahí son **esperables**: corre sobre el HTML pelado).
15. **El isotipo va INLINE, no como `<img src="isologo.svg">`**: un SVG externo no hereda las
    `@font-face` embebidas del documento, así que la «S» del isotipo caería a fuente del sistema
    (mismo síntoma del gotcha 12). `TourKit.isotipo()` emite el SVG inline y estila la letra por
    **clase** (`.iso-letra`), nunca inline (gotcha 9).

---

## Comandos de referencia

```bash
node build-tokens.mjs [--check]                       # tokens de marca desde theme.ts
node fetch-fonts.mjs [--force]                        # woff2 OFL → _brand/fonts/
node new-tour.mjs <slug> "<título>" --beats a,b,c,d,e,f [--module m]
node check-classes.mjs <slug> | --all                 # clases usadas y no definidas
npx hyperframes@0.7.56 lint <slug>                    # gate estático (overlaps, timeline, assets)
npx hyperframes@0.7.56 validate <slug>                # SOLO para diagnosticar errores de JS
node render.mjs <slug> [-o out/YYYY-MM-DD-<slug>.mp4] # MP4 1080p30
ffmpeg -y -loglevel error -ss <t> -i out/<x>.mp4 -frames:v 1 frames/f.png   # verificar
```

`snapshot` **no es gate** (no reproduce el gotcha 9 — dio falsos verdes en el repo origen). El
único gate visual válido son los **frames del MP4 real**.

## Backlog de cápsulas

Registradas en [`videos.json`](videos.json) → `backlog`: **Conecta Flow** · **Sube productos** ·
**Monta el sorteo**. Cada una se produce con la skill `capsula-video` del harness (ver
`.claude/skills/capsula-video/SKILL.md`), que delega en el subagente `hyperframes-video-builder`.
