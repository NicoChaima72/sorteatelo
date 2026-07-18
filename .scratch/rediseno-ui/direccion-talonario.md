# Prototipos de identidad — 5 variantes en código (2026-07-17)

Segunda/tercera iteración del rediseño (la primera, un artifact con
crema+violeta, fue rechazada por el usuario: "muy IA", gradientes, sin
elementos de diseño; luego pidió 5 variantes de landing para comparar).

## Dónde vive

Páginas sandbox reales (sin datos, sin guard, `noindex`), aisladas del theme de
plataforma. Copy compartido en `src/components/prototipo/copy.ts` para que la
comparación sea solo de dirección de arte:

- `/prototipo` — índice comparador de variantes
- `/prototipo/v1-talonario` — **V1 El Talonario** ⭐ (el usuario eligió esta
  idea): impreso popular con bordes duros + sombra dura, perforaciones,
  talonario vivo. Bricolage Grotesque + Instrument Sans + Plex Mono.
  **Iteración 2 (feedback usuario 2026-07-17): fondo BLANCO + azul cobalto
  `#2B3FBF` + amarillo `#FFC530`** (reemplaza el papel manila, que se veía
  "muy IA"); los destacados del titular son ahora DOS trazos de plumón
  orgánicos (`.marcador`/`.marcadorB` en `proto.module.css`: pseudo-elemento
  rotado con radios irregulares). Login y panel heredan los mismos tokens.
  **Iteración 3 (mismo día)**: la página no puede ser toda blanca → bandas de
  sección (celeste `#EEF2FB` para "cómo funciona", franja azul cobalto para
  "el momento clave" con el talonario vivo); el hero recupera el **teléfono
  con la tienda de un tenant + ticket flotante «Compra confirmada · #0428»**
  (idea que el usuario rescató del artifact descartado), en lenguaje talonario
  y con tienda de ejemplo NEUTRA (acuarela, verde) — sin orientación K-pop.
- `/prototipo/v2-noche` — **V2 La Noche del Live**: el sorteo a medianoche
  (café negro `#201812`, ámbar `#FFB53C`, bolitas de tómbola, display Anton).
- `/prototipo/v3-cartel` — **V3 El Cartel de Feria**: afiche popular (hueso,
  bloques planos tinta/cobalto `#2B3FBF`/amarillo, bordes 3px, tira de
  boletos, display Archivo Black).
- `/prototipo/v4-cuaderno` — **V4 El Cuaderno**: papel cuadriculado, UI limpia
  + anotaciones a lápiz azul `#2F4BA0` (Caveat), resaltador `#FFE24A`, cinta
  adhesiva; hero con tachado «Anota en el cuaderno».
- `/prototipo/v5-vitrina` — **V5 La Vitrina**: crema, arcos de vitrina en
  color plano (oliva `#5A7A4E`, mantequilla `#F2C94C`, arcilla), serif
  Fraunces. Pariente bien ejecutado de la referencia Elera.
- `/prototipo/login` y `/prototipo/panel` — login y panel con el sistema V1
- Sistema V1 compartido: `src/components/prototipo/proto.tsx` + `proto.module.css`;
  variantes 2-5: `src/pages/prototipo/v{2..5}*.tsx` + `v{2..5}.module.css`

## El sistema

Estética de **impreso popular** (talonario de rifa elevado), cero corporativa,
cero gradientes:

| Token | Valor |
|---|---|
| Papel (fondo) | `#F6EFE3` manila |
| Superficie | `#FFFDF8` |
| Tinta (texto/bordes) | `#2A231B` / suave `#6E6353` |
| **Amarillo lotería (primario)** | `#FFC530` — botones con texto tinta, resaltado marcador |
| Teal sello (pagado/éxito) | `#1D7A70` |
| Ámbar sello (pendiente) | `#A06B08` |
| Rojo sello (fallido, reservado) | `#C03E2E` |

- Tipografía: **Bricolage Grotesque** (display 800) + **Instrument Sans**
  (texto) + **IBM Plex Mono** (números, montos, etiquetas "SERIE A").
- Elevación: **borde 2px tinta + sombra dura desplazada** (paper-cut), nunca
  sombra difusa ni gradiente. Separadores de sección = **perforaciones**
  (dashed).
- Firma: **talonario vivo** en el hero (grilla de números vendidos/libres, "TÚ"
  en amarillo, sello ¡SALE! rotando cada 3 s; se detiene con
  prefers-reduced-motion).
- Estados de comercio como **sellos de goma** (PAGADO/PENDIENTE/FALLIDO).
- Copy: el de la investigación (`direccion-diseno.md`), tono cercano chileno.

## Prototipo activo (skill prototype/UI.md) — hero de la landing V1

**Pregunta:** el hero se ve "muy blanco" — ¿qué tratamiento de fondo lleva?
Variantes en `/prototipo/v1-talonario?variant=`, barra flotante ← →.

**Ronda 1** (a/b/c/d): al usuario le gustó `b` (franja cobalto) pero "se ve
muy de juguete" y el verde de la tienda demo "ni pega ni junta". `c` y `d`
descartadas. Ajuste transversal: `--tenant` verde → índigo `#3A4FC9`.

**Ronda 2** (la clase `finoRoot` quita bordes negros gruesos, sombras duras y
rotaciones; plumón pasa de bloque a subrayado grueso):

- `a` — Papel blanco (línea base)
- `b` — Cobalto impreso (la de "juguete", para comparar)
- `e` — Cobalto sobrio (banda cobalto + ejecución fina)
- `f` — Tinta de noche (banda navy `#172152`, la más seria)
- `g` — Gris perla fino (página `#F1F3F8`, sin banda, hairlines)

**VEREDICTO (2026-07-17): ganó `b` — "Cobalto impreso".** El usuario prefirió
mantener los bordes duros/sombras del talonario (las variantes sobrias e/f/g
no ganaron) con el hero sobre franja cobalto. Variantes perdedoras, switcher
(`prototype-switcher.tsx`) y clases CSS asociadas: ELIMINADAS.

**Composición final de bandas — REGLA DEL USUARIO (4ª iteración, definitiva):
dos secciones blancas nunca van juntas; colores disponibles: azul, blanco,
gris, amarillo.** Secuencia aprobada:
**AZUL (hero) → BLANCO (cómo funciona) → AMARILLO (momento clave + talonario)
→ BLANCO (confianza) → GRIS #EEF0F5 (FAQ) → AZUL (boleto CTA, talón amarillo)
→ TINTA (footer)**. Ningún blanco adyacente a otro blanco, ningún color se
repite consecutivo, y los 4 colores de la paleta tienen sección propia.

## Prototipo activo — RONDA 3: gramática de ESTILO (el neobrutalismo no gustó)

**Pregunta:** identificado el estilo como neobrutalismo, el usuario lo
descartó ("no me gusta"). ¿Qué gramática visual reemplaza los bordes negros +
sombras duras? Mismo contenido/bandas/paleta, `?variant=` + barra flotante:

- `a` — Neobrutal (base, para comparar)
- `b` — **Suave**: sin bordes, sombras difusas, radios 12-18px (SaaS moderno)
- `c` — **Fino**: hairlines 1px, cero sombra, radios 6px (editorial impreso)
- `d` — **Redondo**: flat total, pills, radios 24-40px, fills grises (consumer)

**VEREDICTO RONDA 3 (2026-07-17): ganó `b` — SUAVE.** Sin bordes duros,
sombras difusas (cards 18px radius, botones 12px con sombra de color azul,
teléfono radius 34 sin rotación, chip de ticket sin borde). Consolidada en
las clases base de `proto.module.css`; variantes fino/redondo eliminadas.
Se conservan del talonario: perforaciones dashed, sellos, plumón en bloque,
mono para números, muescas del chip.

## Prototipo activo — RONDA 4: estructura del LOGIN

3 variantes en `/prototipo/login?variant=` (gramática suave ya aplicada):
- `a` — Entrada centrada: card-boleto con cabecera azul, talón con serie
- `b` — Split cobalto: mitad azul (wordmark + talonario vivo + testimonio),
  mitad blanca con el acceso
- `c` — Mínima sin card: solo logo + saludo + botón sobre gris perla

**VEREDICTO RONDA 4 (2026-07-17): ganó `b` — SPLIT COBALTO.** Consolidado en
`src/pages/prototipo/login.tsx`; variantes a/c y switcher eliminados. Ajuste
transversal del mismo día: sombras de botones rebajadas (0 3px 10px, antes
0 10px 24px) en todo el sistema. Nota: se probó la mitad de marca AMARILLA a
pedido del usuario y él mismo la descartó — el login queda con mitad AZUL.

## Pendiente de decisión del usuario

- Visto bueno (o iteración) de la dirección.
- Si se aprueba: volcar paleta/tipografía a `docs/design.md` +
  `src/styles/theme.ts` (tuplas Mantine, `autoContrast` para el amarillo) y
  reconstruir landing/login/panel reales con Mantine — vía planner.
