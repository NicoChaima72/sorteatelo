# E2E — Countdown con presencia (`urgencia_countdown` estiloVisual)

Checks de navegador para `tasks/26-07-26-builder-countdown-presencia.md`. Los ejecuta el
`feature-tester` con la skill `browser-verify`. Cada check tiene un ID que el plan referencia desde sus
Validaciones. Marcado `[x]` solo por el feature-tester.

> **Dev server**: un `next dev` en **:3001** (única instancia; memoria del proyecto). El storefront del
> piloto vive en `iselk.localhost:3001`; las demos en `demo-dreamy` / `demo-noche` / `demo-editorial`.
> El widget se auto-oculta sin sorteo ACTIVO (I3), así que la tienda que se use para verificar tiene que
> tener uno con `fechaFin` futura — `iselk` lo tiene (cierra el 18 de septiembre de 2026).

## F01 — variante `panel`

- [x] **countdown.panel.001** ✅ 2026-07-26 — En una tienda con sorteo activo, poner el countdown en `estiloVisual:
  "panel"` (desde el editor o el seed) y mirar la sección publicada: se ven los **4 bloques** Días /
  Horas / Min / Seg en una banda translúcida liviana, y el bloque de **segundos baja de a 1 cada
  segundo** sin recargar la página (el tick es lo que se viene a ver: un screenshot no alcanza — hay que
  observar dos valores distintos con ~2 s de diferencia). Los números no "bailan" al cambiar de dígito
  (`tabular-nums`, ancho de bloque fijo) y no hay scroll horizontal en móvil (390 px). (Plan F01 E2E)
  > **Corrida 2026-07-26** (chromium propio por CDP — los dos MCP de navegador estaban tomados). La
  > variante se ejerció **reescribiendo el documento en vuelo** (interceptor de red sobre el payload SSR
  > de `iselk`, `"estiloVisual":"tarjeta"` → `"panel"`): cero escritura en la DB, el render lo hace la app
  > con su propio código. 4 bloques `Días/Horas/Min/Seg`; banda translúcida REAL medida por computed
  > style (`background-color: color(srgb 1 1 1 / 0.72)`); conserva el `mensaje` del Organizador y NO trae
  > badge ni premio; **tick en vivo 54 → 52 en 2,3 s**; `scrollWidth` 390 ≤ `innerWidth` 390; los 4
  > bloques con ancho idéntico (48 px) ⇒ los dígitos no bailan. Sin pulso (es de `tarjeta`, D7).

## F02 — variante `tarjeta`

- [x] **countdown.tarjeta.001** ✅ 2026-07-26 — La `tarjeta` se ve completa en una tienda real: badge arriba, nombre
  del premio del sorteo ACTIVO, reloj enorme en el color de acento con los segundos latiendo, caption
  «TIEMPO RESTANTE» y CTA grande que lleva a donde dice `ctaAncla`. Con la sección en `ambiente: neon`
  el glow envuelve la tarjeta **sin que exista ninguna variante `neon`** del widget (D1/I6: la
  composición la aporta el estilo de la sección). Verificar además con `prefers-reduced-motion: reduce`
  (DevTools → Rendering → Emulate CSS media feature): el pulso de los segundos se apaga pero **el reloj
  sigue corriendo** (I5/D6). (Plan F02 E2E)
  > **Corrida 2026-07-26** sobre `iselk.localhost:3001` publicado (revisión 8), desktop 1280. Badge «El
  > sorteo cierra el 18 de septiembre» → premio «1 entrada para ver a BTS · Santiago» → reloj **56 px** en
  > `rgb(236,72,153)` = `--mantine-color-acento-filled` `#ec4899` (D5 confirmado en computed style, no a
  > ojo) → caption «TIEMPO RESTANTE» → CTA `Quiero participar` → `#catalogo`, fullWidth, alto 50 px.
  > Pulso SOLO en el bloque de segundos: `animation-name` = `["none","none","none","animar-pulso"]`.
  > **Tick en vivo** 36 → 34 en 2,3 s. **reduced-motion**: con `prefers-reduced-motion: reduce` los 4
  > bloques quedan en `animation-name: none` y el reloj **sigue corriendo** (34 → 31) ⇒ I5/D6 exacto.
  > **Neón**: `ambiente: neon` se aplicó por el canal propio de la app (`usePreviewPatch`, postMessage
  > same-origin revalidado por el Zod estricto ⇒ **cero escritura en la DB**); el shell recomputa a los 3
  > `radial-gradient` de `AMBIENTE_CAPAS.neon` y la tarjeta queda **idéntica** (mismo badge/premio/4
  > bloques, card opaca `rgb(255,255,255)`, reloj corriendo) ⇒ el glow lo aporta el ambiente y el widget
  > no estrena variante (D1/I6). **Precisión del check**: `ambiente` NO es del estilo de la SECCIÓN —
  > vive en el TEMA de página (`root.props.ambiente`, `src/lib/pagebuilder/schema.ts:183`) y lo pinta el
  > shell (`src/components/storefront/storefront-layout.tsx:153`). El comportamiento es el que el plan
  > quiere; la redacción de este check (y el comentario de `widgets.ts:944`) está corrida.

- [x] **countdown.tarjeta.002** ✅ 2026-07-26 — **Ancho móvil**: la `tarjeta` entra sin **scroll horizontal** a **360 px**
  (Android común) y a **320 px** (iPhone SE), con los 4 bloques del reloj dentro del borde de la card.
  Es el check que faltaba y que el `frontend-reviewer` destapó calculando el box-model en F02: con el
  padding original la tarjeta pedía 8 px más de los que hay a 360 px y el bloque «Seg» se salía. Medir
  con `document.documentElement.scrollWidth <= window.innerWidth`, no a ojo. **En desktop** (≥ 768 px)
  mirar lo contrario: que los 4 bloques NO queden apretados entre sí (el `gap` del reloj es fijo `xs` —
  `Group.gap` no admite responsive — y el aire de desktop lo da el `miw` de cada bloque). Verificar además sobre el
  esquema de sección POR DEFECTO (`superficie`/`tema`, que es el de la piloto), no solo sobre uno
  contrastante: ahí el fondo de la card y el de la sección resuelven al MISMO token y lo único que las
  separa es el borde de acento + la sombra. (Plan F02 E2E)
  > **Corrida 2026-07-26**, medido con `document.documentElement.scrollWidth <= window.innerWidth` y con
  > los rects de los 4 bloques contra el **content box** de la card (borde y padding descontados), sobre
  > el esquema por defecto de la piloto. **360 px**: 360 ≤ 360, los 4 bloques dentro, holgura 24 px por
  > lado. **320 px**: 320 ≤ 320, los 4 dentro, holgura **4 px por lado** — el presupuesto del
  > `frontend-reviewer` se cumple, aunque el margen real es **4 px y no los 8 px** que decía su
  > aritmética (el reloj a 320 pide ~246 px y la card deja ~254, pero el `Group` se centra ⇒ 4 px por
  > lado). Sigue habiendo aire, pero es el punto más ajustado del diseño: subir el `miw` base o el `px`
  > de la card lo rompe. **Desktop 1280**: gaps de 10 px entre bloques y bloques de 76 px (el `miw` `sm`)
  > ⇒ no quedan apretados.

## F03 — seed del piloto

- [x] **countdown.iselk.001** ✅ 2026-07-26 — Tras `npx tsx scripts/seed-iselk.ts` y republicar, `iselk.localhost:3001`
  muestra el countdown en variante `tarjeta`. Las demás tiendas (`autora`, `prueba`, `demo-dreamy`,
  `demo-noche`, `demo-editorial`) siguen como estaban — verificación por `curl` del SSR. **Salvedad de la
  enmienda D2**: una tienda que ya usara `urgencia_countdown` en `clasico` ahora muestra minutos y
  segundos en su reloj; hay que censar antes cuáles usan el widget para no leer ese cambio esperado como
  una regresión. (Plan F03 E2E)
  > **Corrida 2026-07-26**. `iselk.localhost:3001` muestra la `tarjeta` en el navegador (ver
  > `countdown.tarjeta.001`). **No-regresión**: las 7 tiendas responden HTTP 200 y ninguna trae marcadores
  > de las variantes nuevas en su SSR. El **censo del implementer se reprodujo de forma independiente**
  > desde el payload SSR de cada tienda: `urgencia_countdown` aparece en **1 sola** página publicada
  > (`iselk`, con `"estiloVisual":"tarjeta"`); `autora`, `prueba`, `bcac` y las 3 demos tienen **0**
  > nodos del widget ⇒ **la salvedad de la enmienda D2 no aplica a ninguna tienda viva**. Confirmado
  > además que el widget **no está en el SSR en ninguna variante** (su sorteo llega por
  > `checkout.getSorteoActivoStorefront`, query de cliente) y que la precondición de dato existe: ese
  > endpoint devuelve para `iselk` un sorteo ACTIVO, premio «1 entrada para ver a BTS · Santiago»,
  > `fechaFin` 2026-09-18.
  > **Extra (no pedido acá, pero la enmienda D2 no la mira ninguna tienda)**: `clasico` verificado en
  > navegador por la misma reescritura en vuelo — renderiza `54d 02h 25m 21s` en UN solo nodo, sin
  > bloques/badge/caption/premio, tickeando, y el chip del header sigue en `formatoCompacto` («54d 02h»)
  > ⇒ I1 y el Out of scope se sostienen en vivo.
