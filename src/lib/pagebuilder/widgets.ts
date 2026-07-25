import { z } from "zod";

/**
 * Registro de widgets de la Página de tienda (ADR-0016, F02). **Fuente ÚNICA de verdad** del
 * shape de cada widget: por cada `tipo` guarda su `propsSchema` (Zod), `defaultProps` (para
 * sembrar / "agregar sección"), la versión `v` del nodo y la `categoria` (sección vs overlay).
 *
 * Este módulo es PURO (solo Zod) y client+server safe: lo importan el schema del documento
 * (`./schema`), la factory (`./factory`), los use cases del dominio (`~/server/domain/pagebuilder`),
 * el MCP (F06) y el render del storefront (F05). PROHIBIDO importar `~/server` o React acá — corre
 * también en el cliente (mismo criterio que `~/styles/tenantTheme.ts`).
 *
 * Invariantes que este registro materializa:
 * - **Sin HTML libre** (ADR-0018/I3): no existe `propsSchema` con HTML/CSS/JS crudo; todo texto es
 *   string plano con límite; toda imagen/embed es una URL/ref validada. `.strict()` en cada objeto
 *   rechaza campos extra ⇒ un `html`/`embedCode`/`iframeSrc` inyectado no parsea.
 * - **Referencias, no copias** (ADR-0017/I2): el catálogo guarda `productoIds` (referencias), jamás
 *   precios ni títulos; la vitrina del sorteo no guarda datos del `Raffle` (se resuelven server-side).
 * - **Enums cerrados**: íconos/anclas/estilos son `z.enum`, nunca string libre.
 */

// ── Validadores compartidos ──────────────────────────────────────────────────
/** URL de imagen del bucket público (ADR-0013). Exportado para reuso (factory, F03). */
export const urlPublica = z.string().url().max(2048);

/**
 * Anclas de navegación internas permitidas para los CTA (enum cerrado). Ampliado en builder-tanda-1
 * F05/D8 con las anclas semánticas nuevas (`como-funciona`/`autora`/`bases`/`preguntas`) — ADITIVO: los
 * valores viejos (`catalogo`/`sorteo`) siguen parseando, los docs existentes no cambian. Cada valor
 * resuelve a un target de scroll emitido por `render-pagina` (nav.ts `ANCLA_POR_TIPO`).
 */
export const CTA_ANCLAS = [
  "catalogo",
  "sorteo",
  "como-funciona",
  "autora",
  "bases",
  "preguntas",
] as const;

/**
 * Íconos permitidos para los pasos de "cómo funciona" (enum cerrado; el render los mapea).
 * @deprecated (catálogo-v2 F01): alias de compatibilidad — `como_funciona` lo sigue usando y los
 * docs con estos íconos siguen parseando. Los widgets nuevos usan `ICONOS_BENEFICIO` (superset).
 */
export const ICONOS_PASO = [
  "compra",
  "descarga",
  "ticket",
  "regalo",
  "escudo",
  "rayo",
  "chispa",
  "reloj",
] as const;

/**
 * Íconos de beneficio (catálogo-v2 F01, síntesis §2). SUPERSET de `ICONOS_PASO`: los 8 de pasos +
 * los propios de un grid de beneficios ("descarga inmediata", "pago seguro", "soporte"…). Enum
 * cerrado ⇒ el render mapea a Tabler; jamás string libre. Compartido por `beneficios_grid`,
 * `garantias_sorteo` y `bloque_ticket_promo`. Al ser superset, todo doc con un ícono de paso viejo
 * también valida contra este enum (test de superset, F01).
 */
export const ICONOS_BENEFICIO = [
  // — heredados de ICONOS_PASO (superset, no reordenar los 8 primeros) —
  "compra",
  "descarga",
  "ticket",
  "regalo",
  "escudo",
  "rayo",
  "chispa",
  "reloj",
  // — propios del catálogo de beneficios —
  "candado",
  "corazon",
  "estrella",
  "verificado",
  "soporte",
  "pago",
  "mundo",
  "usuarios",
  "grafico",
  "etiqueta",
] as const;

/**
 * Pares tipográficos curados (catálogo-v2 F01/D3, síntesis §3.3). Modelo Shopify: heading+body
 * curados, NUNCA fuente libre (seguridad + perf + licencias). Este es el enum de NOMBRES (puro,
 * client+server safe) — la fuente de verdad del `TemaSchema`. Las instancias `next/font` reales y
 * su mapeo a CSS vars viven en `~/config/fonts.ts` (F02), fuera de este módulo puro (mismo criterio
 * que `theme.ts`, que jamás importa el loader de fuentes). "plataforma" = el par por defecto ya
 * cargado (Bricolage + Instrument).
 */
export const PARES_TIPOGRAFICOS = [
  "plataforma", // Bricolage Grotesque + Instrument Sans — YA cargado (default)
  "editorial", // Fraunces + Inter — elegante/boutique
  "energia", // Space Grotesk + Inter — techy/fandom moderno
  "dulce", // Poppins + Nunito Sans — redondeado (merch/kpop)
  "impacto", // Anton + Roboto — poster/urgencia
  "clasica", // Playfair Display + Source Sans 3 — refinada
  "tecnica", // IBM Plex Sans + IBM Plex Mono — limpia/mono
  "cartel", // Bebas Neue + Space Grotesk — poster/fandom condensado (catálogo-v2 F12)
] as const;
export type ParTipografico = (typeof PARES_TIPOGRAFICOS)[number];

// ── Sistema de estilo por sección y por página (catálogo-v2 F01/D2/D3, síntesis §3) ──────────
//
// TODO estilo del documento es un ENUM CERRADO que resuelve a tokens de la escala del tenant (o a
// un preset curado): jamás hex libre, jamás nombre de fuente string, jamás CSS crudo (I-A). Los
// esquemas de fondo son EMPAREJADOS (fondo + color de texto legible por construcción, modelo
// Shopify) ⇒ ni el Organizador ni el LLM del MCP pueden crear una sección ilegible. La resolución a
// CSS la hace `estiloSeccionACss()` (F02, `~/styles/tenantTheme.ts`), espejo puro de
// `gradienteTematico` (SSR + cliente sin mismatch).

/**
 * Esquemas de fondo emparejados (fondo + texto legible). `tema` = transparente = DEFAULT. Los `acento*`
 * (builder-tanda-1 F01/D1) usan la escala del `colorAcento` del tenant y DEGRADAN a la de marca cuando
 * el tenant no tiene acento (fallback CSS var, I-T2): nunca opción muda ni sección ilegible.
 */
export const ESQUEMAS_FONDO = [
  "tema", // transparente, hereda el fondo de página (DEFAULT)
  "superficie", // blanco / (dark) tinta — texto tinta
  "superficie_alt", // banda gris (gray-1) — texto tinta
  "marfil", // Tanda 2 F14: off-white CÁLIDO (papel/ivory) dark-aware — texto tinta (fidelidad editorial)
  "marca_suave", // marca-0/1 — texto tinta
  "marca", // marca-6 filled — texto claro (autoContrast)
  "marca_profundo", // marca-8 — texto claro
  "acento_suave", // acento-0 — texto tinta (degrada a marca sin acento)
  "acento", // acento filled — texto emparejado (autoContrast; degrada a marca)
  "acento_profundo", // acento-8 — texto claro (degrada a marca)
  "tinta", // gray-9 — texto claro
  "tinta_profunda", // Tanda 2 F15: near-black con tinte de marca (más profundo que gray-9) — texto claro (fidelidad concert)
] as const;
export type EsquemaFondo = (typeof ESQUEMAS_FONDO)[number];

/** Gradientes preset (`marca_vivo` = el `gradienteTematico` actual). */
export const GRADIENTES = ["marca_suave", "marca_vivo", "tinta", "papel"] as const;

/**
 * Tonos de fondo curados para el BICOLOR (builder-tanda-1 F02/D3). Subconjunto de `ESQUEMAS_FONDO`
 * con color de texto emparejado por construcción ⇒ el render empareja el texto de la sección con el
 * tono `colorA` (donde se asienta el contenido). Enum cerrado, jamás hex libre (I-A). Los `acento*`
 * degradan a marca sin acento (I-T2), igual que en los esquemas sólidos.
 */
export const TONOS_FONDO = [
  "superficie",
  "marca_suave",
  "marca",
  "marca_profundo",
  "acento_suave",
  "acento",
  "acento_profundo",
  "tinta",
] as const;
export type TonoFondo = (typeof TONOS_FONDO)[number];

/** Dirección del degradado bicolor (mapea a un ángulo fijo en el render, no CSS libre). */
export const DIRECCIONES_BICOLOR = ["vertical", "horizontal", "diagonal"] as const;

/** Mezcla del bicolor: `dura` = corte duro al 50%, `suave` = degradado continuo entre A y B. */
export const MEZCLAS_BICOLOR = ["dura", "suave"] as const;

/** Overlay sobre un fondo de imagen (para garantizar contraste del texto encima). */
export const OVERLAY_IMAGEN = ["ninguno", "tinta", "marca", "claro"] as const;

/** Posición del fondo de imagen (object-position acotado, no CSS libre). */
export const POSICION_IMAGEN = ["centro", "arriba", "abajo", "izq", "der"] as const;

/**
 * Patrones decorativos (motivo talonario = `perforacion`). `cuadricula_papel` (papel de cuaderno, v4) y
 * `arcos` (motivo scallop, v5) son de Tanda 2 F07/D7 — CSS puro de tokens, cero hex (I-A). Aditivos:
 * `ninguno` sigue de default en las ramas que lo usan; docs previos sin estos valores no cambian.
 */
export const PATRONES = [
  "ninguno",
  "puntos",
  "grilla",
  "diagonales",
  "perforacion",
  "cuadricula_papel", // Tanda 2 F07: grilla de papel-cuaderno (celda ~28px)
  "arcos", // Tanda 2 F07: motivo scallop/arcos repetido
] as const;

/** Espaciado vertical de la sección (0 / md / xl / 48 / 80px). */
export const ESPACIADO_V = ["ninguno", "s", "m", "l", "xl"] as const;

/**
 * Numeral del kicker de sección (Tanda 2 F15/fidelidad editorial): glifos romanos CURADOS (enum cerrado,
 * jamás string libre — I-A). El editor/Organizador elige el numeral EXPLÍCITO por sección (como el
 * prototipo editorial hardcodea `roman="I"`/`"II"`… por bloque) ⇒ sin estado cross-sección ni cómputo en
 * el render (SSR-safe, determinista). `ninguno` (DEFAULT) = sin numeral (no-op, el kicker es solo texto).
 */
export const KICKER_NUMERALES = [
  "ninguno",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
] as const;
export type KickerNumeral = (typeof KICKER_NUMERALES)[number];

/** Ancho del contenido de la sección (Container lg / xl / full-bleed). */
export const ANCHO_SECCION = ["contenido", "ancho", "completo"] as const;

/**
 * Ancho del FONDO de la sección (builder-tanda-1 F02/D4), independiente de `ancho` (que gobierna el
 * Container del CONTENIDO). `completo` = full-bleed = el comportamiento ACTUAL del wrapper (el fondo
 * pinta todo el ancho del `<section>`) ⇒ DEFAULT no-op (I-H). `contenido` acota el fondo a un box del
 * ancho de contenido con radio (sección tipo "card").
 */
export const ANCHO_FONDO = ["completo", "contenido"] as const;

/**
 * Alto MÍNIMO de la sección (builder-tanda-1 F06/D9). `auto` = sin min-height = comportamiento ACTUAL
 * (DEFAULT no-op, I-H). `media` = 60svh, `pantalla` = 100svh (svh = small viewport height ⇒ correcto en
 * mobile con la barra del navegador). El min-height NO se anima (CLS irrelevante, I-C).
 */
export const ALTO_MIN = ["auto", "media", "pantalla"] as const;

/**
 * Alineación VERTICAL del contenido dentro de la sección (builder-tanda-1 F06/D9). Solo tiene efecto
 * cuando `altoMin` da altura extra (media/pantalla). `arriba` = DEFAULT (comportamiento actual, I-H).
 */
export const ALINEAR_VERTICAL = ["arriba", "centro", "abajo"] as const;

/**
 * Visibilidad de una sección por breakpoint (Tanda 3 F10/D16). `todos` = DEFAULT (siempre visible =
 * comportamiento actual, no-op I-U8). `desktop` = oculta en móvil; `movil` = oculta en desktop. Se
 * resuelve como CSS ESTÁTICO (`display:none` por media query, SSR-safe — el slot simplemente no existe
 * a ese ancho, sin JS de resize ni aparición tardía ⇒ CLS controlado, I-U5). Enum cerrado.
 */
export const VISIBLE_EN = ["todos", "desktop", "movil"] as const;
export type VisibleEn = (typeof VISIBLE_EN)[number];

/** Formas de divisor inferior (SVG generado por NOSOTROS, nunca markup del tenant). */
export const FORMAS_DIVISOR = [
  "ninguno",
  "onda",
  "diagonal",
  "curva",
  "triangulo",
  "perforacion",
] as const;

/**
 * Subconjunto de `FORMAS_DIVISOR` que el render REALMENTE dibuja (desde F09c: TODAS — triangulo y
 * perforacion ganaron su path a pedido del usuario). El SELECTOR del editor (F10) ofrece solo estas
 * para no mostrar opciones mudas. Debe seguir a `PATHS_DIVISOR` en
 * `src/components/storefront/seccion-wrapper.tsx` — si se agrega un path allá, sumar la forma acá.
 */
export const FORMAS_DIVISOR_DIBUJADAS = [
  "ninguno",
  "onda",
  "diagonal",
  "curva",
  "triangulo",
  "perforacion",
] as const;

/** Altura del divisor. */
export const ALTURA_DIVISOR = ["s", "m", "l"] as const;

/**
 * Presets de animación de ENTRADA por sección (catálogo-v2 F03, síntesis §4.3). Enum cerrado: el
 * Organizador elige el preset, JAMÁS la duración/ease (esos son fijos en `animar.tsx`, I-E). Sin
 * slide horizontal a propósito (riesgo de scroll-x/CLS en mobile). `heredar` ⇒ toma el default del
 * `TemaPagina`.
 */
export const PRESETS_ENTRADA_BASE = [
  "ninguna", // sin animación
  "aparecer", // fade puro
  "subir", // fade + translateY 24px→0
  "escala", // fade + scale 0.96→1
  "desenfoque", // fade + blur 8px→0
] as const;
export const PRESETS_ENTRADA = ["heredar", ...PRESETS_ENTRADA_BASE] as const;
export type PresetEntrada = (typeof PRESETS_ENTRADA)[number];

/**
 * Fondo de una sección (discriminado por `tipo`). `esquema` (emparejado) / `gradiente` (preset) /
 * `imagen` (con overlay por enum, opacidad step-clamp — NO CSS) / `patron` (sobre un esquema base).
 * `.strict()` en cada rama ⇒ un CSS crudo/campo extra no parsea (I-A).
 */
export const FondoSeccionSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("esquema"), esquema: z.enum(ESQUEMAS_FONDO) }).strict(),
  z.object({ tipo: z.literal("gradiente"), preset: z.enum(GRADIENTES) }).strict(),
  // Bicolor (builder-tanda-1 F02/D3): dos TONOS curados (nunca hex), dirección + mezcla por enum. El
  // render empareja el texto con `colorA` (tono dominante donde se asienta el contenido). `.strict()`.
  z
    .object({
      tipo: z.literal("bicolor"),
      colorA: z.enum(TONOS_FONDO),
      colorB: z.enum(TONOS_FONDO),
      direccion: z.enum(DIRECCIONES_BICOLOR).default("vertical"),
      mezcla: z.enum(MEZCLAS_BICOLOR).default("dura"),
    })
    .strict(),
  z
    .object({
      tipo: z.literal("imagen"),
      url: urlPublica,
      overlay: z.enum(OVERLAY_IMAGEN).default("tinta"),
      opacidadOverlay: z.number().int().min(0).max(90).default(45), // step-clamp, no CSS
      posicion: z.enum(POSICION_IMAGEN).default("centro"),
      fijo: z.boolean().default(false), // parallax-lite (desktop only)
    })
    .strict(),
  z
    .object({
      tipo: z.literal("patron"),
      patron: z.enum(PATRONES),
      esquema: z.enum(ESQUEMAS_FONDO).default("superficie"),
    })
    .strict(),
]);
export type FondoSeccion = z.infer<typeof FondoSeccionSchema>;

/**
 * Estilo de una sección (catálogo-v2 F01/D2). Vive en el ENVELOPE del nodo (hermano de `props`), no
 * dentro de `props` (que está discriminado por tipo). TODO opcional/`.default()` ⇒ un nodo sin
 * `estilo` renderiza idéntico al look actual (migración no-op, I-H). `.strict()` rechaza campos
 * extra.
 */
export const EstiloSeccionSchema = z
  .object({
    fondo: FondoSeccionSchema.optional(), // ausente ⇒ "tema"/transparente
    padY: z.enum(ESPACIADO_V).default("l"), // = py actual (xl/48)
    // Espaciado fino (Tanda 2 F06/D6): overrides OPCIONALES de `padY` por lado. Ausentes ⇒ el wrapper usa
    // `padY` (byte-idéntico al actual, no-op I-H). Presente uno ⇒ ese lado usa su enum, el otro cae a `padY`.
    padTop: z.enum(ESPACIADO_V).optional(),
    padBottom: z.enum(ESPACIADO_V).optional(),
    ancho: z.enum(ANCHO_SECCION).default("contenido"),
    // Kicker de sección (Tanda 2 F15/fidelidad editorial): encabezado pequeño en MAYÚSCULAS con un numeral
    // romano opcional (el "I EL LIBRO / II ELIGE TU PACK" del prototipo editorial), renderizado por el
    // `<SeccionWrapper>` ARRIBA del contenido del widget. `texto` plano ≤40 (nunca HTML, I3); `numeral` de
    // un enum de glifos curados (default `ninguno`). Ausente ⇒ sin kicker (no-op, I-H). `.strict()`.
    kicker: z
      .object({
        texto: z.string().min(1).max(40),
        numeral: z.enum(KICKER_NUMERALES).default("ninguno"),
      })
      .strict()
      .optional(),
    anchoFondo: z.enum(ANCHO_FONDO).default("completo"), // F02/D4: full-bleed = comportamiento actual
    altoMin: z.enum(ALTO_MIN).default("auto"), // F06/D9: auto = sin min-height (no-op)
    alinearVertical: z.enum(ALINEAR_VERTICAL).default("arriba"), // F06/D9: arriba = comportamiento actual
    entrada: z.enum(PRESETS_ENTRADA).default("heredar"), // F03
    divisorInferior: z
      .object({
        forma: z.enum(FORMAS_DIVISOR).default("ninguno"),
        altura: z.enum(ALTURA_DIVISOR).default("m"),
        invertir: z.boolean().default(false),
      })
      .strict()
      .optional(),
    // Responsive por nodo (Tanda 3 F10/D16): `movil` es un Partial del SUBSET de LAYOUT (mismos enums,
    // JAMÁS valores nuevos ni px). `fondo`/`entrada`/`divisor` NO se overridean por breakpoint (snowflake +
    // rompe la simplicidad LLM, I-U5) ⇒ NO están en este subset (`.strict()` los rechaza). Ausente ⇒
    // resolver móvil = desktop (byte-idéntico, I-U8). Todos opcionales (Partial).
    movil: z
      .object({
        padY: z.enum(ESPACIADO_V).optional(),
        padTop: z.enum(ESPACIADO_V).optional(),
        padBottom: z.enum(ESPACIADO_V).optional(),
        altoMin: z.enum(ALTO_MIN).optional(),
        alinearVertical: z.enum(ALINEAR_VERTICAL).optional(),
        ancho: z.enum(ANCHO_SECCION).optional(),
      })
      .strict()
      .optional(),
    // Visibilidad por breakpoint (Tanda 3 F10/D16): CSS estático (display:none por media query, I-U5).
    // `todos` = DEFAULT (siempre visible = comportamiento actual, no-op I-U8).
    visibleEn: z.enum(VISIBLE_EN).default("todos"),
  })
  .strict();
export type EstiloSeccion = z.infer<typeof EstiloSeccionSchema>;

// ── Enums del TemaPagina (catálogo-v2 F01/D3, síntesis §3.2) ──────────────────────────────────
// Poblan el `root.props` (hoy vacío). El `TemaSchema` (en `./schema`) los consume. `colorPrimario`
// NO se duplica al documento — sigue como columna de `Tenant` (fuente única, I2 del plan padre).

/** Modo de color de la TIENDA (dark mode del storefront, vía `colorScheme` de Mantine). */
export const MODO_COLOR = ["claro", "oscuro"] as const;

/** Radio global de la tienda (override de `defaultRadius`). */
export const RADIO_GLOBAL = ["nulo", "s", "m", "l", "completo"] as const;

/** Dial de personalidad (radius + sombra). */
export const VIBE = ["nitido", "suave", "editorial"] as const;

/**
 * Ancho de contenido por defecto que heredan las secciones. `estrecho` (Tanda 2 F15/fidelidad editorial):
 * columna angosta (~640px) tipo boutique — el shell centra el contenido en esa medida sobre un lienzo
 * exterior un pelo más oscuro (la "columna marfil sobre crema" del prototipo editorial). Aditivo:
 * `contenido` sigue de default (no-op, I-H).
 */
export const ANCHO_CONTENIDO = ["contenido", "ancho", "estrecho"] as const;
export type AnchoContenido = (typeof ANCHO_CONTENIDO)[number];

/**
 * Ambiente del fondo de página (Tanda 2 F05/D5): "stage-lights". Ortogonal a `fondoPagina` (el color
 * sólido base): AÑADE 2-3 `radial-gradient` FIJOS de tokens del tenant (baja opacidad) sobre ese color.
 * CSS 100% estático (sin JS/rAF/window) ⇒ SSR-safe, reduced-motion-irrelevante (no anima). `ninguno` =
 * DEFAULT no-op (el shell no cambia, I-H). `focos_marca`/`focos_acento` = focos de la escala marca/acento
 * (acento degrada a marca sin acento, I-T2); `aurora` = mezcla marca+acento; `neon` (Tanda 2 F14) = focos
 * más SATURADOS y CONCENTRADOS (el glow púrpura top-center del recital, fidelidad concert). Cero hex (I-A).
 */
export const AMBIENTE_FONDO = ["ninguno", "focos_marca", "focos_acento", "aurora", "neon"] as const;
export type AmbienteFondo = (typeof AMBIENTE_FONDO)[number];

// ── Props de cada widget semilla ─────────────────────────────────────────────

/**
 * Variantes de layout del `hero` (catálogo-v2 F05/D4). `split` = el layout v1 (texto izquierda +
 * visual derecha) ⇒ es el DEFAULT que conserva el look actual en la migración v1→v2. `centrado` =
 * texto centrado sin visual; `imagen_fondo` = imagen full-bleed con overlay; `minimal` = solo titular
 * + CTA compacto.
 */
export const VARIANTES_HERO = ["split", "centrado", "imagen_fondo", "minimal"] as const;
export type VarianteHero = (typeof VARIANTES_HERO)[number];

/**
 * Estilo del `tituloAcento` (builder-tanda-1 F03/D5): `acento` = color de la escala acento; `marca` =
 * color del primario del tenant (F13 — cuando la palabra clave debe ir en el color de MARCA, no el de
 * acento; p.ej. una paleta con marca dorada); `resaltado` = destacador como background del PROPIO span
 * (nunca capa aparte con z-index — lección en memoria del proyecto); `gradiente` = texto con
 * background-clip:text (tokens marca/acento). Enum cerrado. `marca` es ADITIVO (docs viejos sin él
 * parsean; ningún valor previo se rompe).
 */
export const ESTILOS_TITULO_ACENTO = ["acento", "marca", "resaltado", "gradiente"] as const;

/** Estilo del CTA secundario del hero (F03/D6): botón (default) o enlace de texto. */
export const ESTILOS_CTA_SECUNDARIO = ["boton", "enlace"] as const;

/**
 * Color del eyebrow del hero (Tanda 2 F04/D4). `marca` = token del primario (DEFAULT = comportamiento
 * actual, no-op). `acento` = token de la escala acento (degrada a marca sin acento, I-T2). `texto` =
 * color de texto heredado (dimmed). Enum cerrado ⇒ cero hex (I-A); `marca` es el default aditivo.
 */
export const EYEBROW_ESTILOS = ["marca", "acento", "texto"] as const;
export type EyebrowEstilo = (typeof EYEBROW_ESTILOS)[number];

/**
 * Efecto del título del hero (F03/D6). `ninguno` (default = look v2). `revelar_palabras` = reveal por
 * palabra escalonado (CSS puro, SSR-visible I-D, reduced-motion ⇒ estático). `gradiente_animado` =
 * texto con gradiente animado (reusa el keyframe holo; reduced-motion ⇒ gradiente estático). Es prop
 * del hero, NO un preset de `PRESETS_ENTRADA` (que es de sección entera).
 */
export const EFECTOS_TITULO = ["ninguno", "revelar_palabras", "gradiente_animado"] as const;

/**
 * Tamaño del título del hero (Tanda 2 F15/fidelidad concert): `normal` (DEFAULT = el fz actual, no-op
 * I-H). `grande`/`enorme` escalan el `font-size` del `<Title>` a un poster de recital (el "COMPRA EL
 * LIBRO. ANDA A VER A BTS" ENORME del prototipo concert, que con el par `impacto`/Anton pedía tamaño).
 * Enum cerrado ⇒ el render mapea a un fz responsive fijo, jamás px libre.
 */
export const TITULO_TAMANOS = ["normal", "grande", "enorme"] as const;
export type TituloTamano = (typeof TITULO_TAMANOS)[number];

/**
 * Motivo decorativo de la holocard-placeholder `suave` del hero (Tanda 2 F13): qué chips FLOTANTES
 * (además de los blur-blobs) pinta el heroviz suave. `corazon` (default) = solo los blobs (no-op, look
 * F12). `tickets` = 2 mini-tickets flotantes. `estrella` = chips-estrella. Enum cerrado ⇒ cero contenido
 * libre (I-A); el render mapea cada valor a una forma CSS de tokens.
 */
export const MOTIVOS_TARJETA = ["corazon", "tickets", "estrella"] as const;
export type MotivoTarjeta = (typeof MOTIVOS_TARJETA)[number];

/**
 * Layout del widget `catalogo` (Tanda 2 F13): `grilla` (DEFAULT) = la grilla de tarjetas de siempre
 * (no-op, I-H). `carrusel` = fila horizontal con auto-scroll CSS continuo (marquee, pausa en hover;
 * reduced-motion ⇒ scroll manual con overflow-x), covers compactos tipo el carrusel del prototipo.
 */
export const LAYOUTS_CATALOGO = ["grilla", "carrusel"] as const;
export type LayoutCatalogo = (typeof LAYOUTS_CATALOGO)[number];

/**
 * Visual configurable del hero `split` (Tanda 2 F02/D2): la columna derecha del hero. Discriminado por
 * `tipo`. `imagen` = una imagen (`urlPublica`) con `holo` opcional (marco holográfico). `tarjeta` = una
 * HOLOCARD-placeholder SIN imagen (la del mockup `tienda-libro`): un `titulo`/`subtitulo`/`icono`
 * (enum `ICONOS_BENEFICIO`, NUNCA emoji libre — I-A/D2) dentro del marco. `holo` reusa `MarcoHolo`
 * (borde iridiscente + tilt, ya SSR/reduced-motion-safe). AUSENTE ⇒ el hero cae al `imagenUrl`/gradiente
 * actual (no-op, I-H). `.strict()` en cada rama ⇒ un CSS/campo extra no parsea (I-A).
 */
export const HeroVisualSchema = z.discriminatedUnion("tipo", [
  z
    .object({
      tipo: z.literal("imagen"),
      url: urlPublica,
      holo: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      tipo: z.literal("tarjeta"),
      titulo: z.string().min(1).max(60),
      subtitulo: z.string().min(1).max(80).optional(),
      icono: z.enum(ICONOS_BENEFICIO).optional(),
      holo: z.boolean().default(false),
      // Estilo de la holocard-placeholder (Tanda 2 F12): `plano` = el fondo tematizado sólido (DEFAULT =
      // look actual, no-op I-H). `suave` = "glassy" — mismo gradiente + 2-3 blur-blobs decorativos de
      // tokens (el heroviz soft del prototipo dreamy). CSS puro, sin motion, cero hex (I-A). NO usa `holo`.
      estilo: z.enum(["plano", "suave"]).default("plano"),
      // Motivo decorativo del estilo `suave` (Tanda 2 F13): sobre los blur-blobs, agrega 1–2 chips
      // FLOTANTES (mini-tickets/estrellas) con blur + rotación leve — el heroviz del prototipo dreamy tenía
      // corazón + 2 tickets. `corazon` (DEFAULT) = solo los blobs actuales (no-op, I-H). `tickets` = 2
      // mini-tickets flotantes. `estrella` = chips-estrella. CSS estático de tokens, aria-hidden, no anima
      // (I-C). Solo aplica en `suave` (en `plano` se ignora). Cero hex (I-A).
      motivo: z.enum(MOTIVOS_TARJETA).default("corazon"),
    })
    .strict(),
]);
export type HeroVisual = z.infer<typeof HeroVisualSchema>;

// ── Motor de texto rico ESTRUCTURADO: runs (Tanda 3 F01/D1, evolución B) ──────────────────────────
//
// Subset propio estilo Portable Text (NO la librería, D6/I-U10): un `RichTexto` es una lista de `Run`
// (spans de texto plano con marcas de un ENUM CERRADO) + `markDefs` (definiciones de link TIPADAS,
// referenciadas por `id` desde un run). Es MÁS seguro que HTML (I-U1): `t` es texto plano; marcas y
// destinos son enums/uniones cerradas; `.strict()` en cada nivel rechaza lo demás; el render (RunsTexto)
// JAMÁS emite `dangerouslySetInnerHTML`. Sin Tiptap/Lexical (caso acotado: marcas planas, sin bloques
// anidados). Puro Zod, client+server safe (lo consumen migrate, el render y el EditorRuns del panel).
// Definido ARRIBA de `heroProps`/`texto_rico` (que lo consumen) para respetar el orden de evaluación.

/**
 * Marcas inline de un run (enum CERRADO). La directiva pide fuerte/enfasis/acento/resaltado/escala; el
 * planner desdobla `escala` en `escala_lg`/`escala_xl` (D1, REVISABLE). El render mapea cada marca a un
 * estilo por TOKEN (peso / itálica / color acento con fallback a marca / color de marca / gradiente
 * background-clip / destacador como background del propio span / escala tipográfica en `em`), JAMÁS hex
 * ni CSS libre del tenant (I-A/I-U1).
 *
 * `marca` y `gradiente` son ADITIVOS a la lista de la directiva (Tanda 3 F02/D4, REVISABLE): existen para
 * que la absorción de `tituloAcento` del hero (estilos acento/marca/resaltado/gradiente) sea LOSSLESS —
 * cada estilo del hero mapea 1:1 a una marca de run. Su CSS ESPEJA `estiloAcentoCss` de `titulo-hero.tsx`
 * (byte-idéntico) ⇒ un hero migrado renderiza igual. La toolbar del editor (F03/D6) ofrece la lista
 * curada (negrita/énfasis/acento/resaltado/escala); marca/gradiente quedan como marcas válidas
 * preservadas por la migración (sin botón de toolbar por ahora — REVISABLE si se agregan).
 */
export const MARCAS_RUN = [
  "fuerte",
  "enfasis",
  "acento",
  "resaltado",
  "marca",
  "gradiente",
  "escala_lg",
  "escala_xl",
] as const;
export type MarcaRun = (typeof MARCAS_RUN)[number];

/** Tope de chars de un run (D1). La migración v1→v2 (`runsDeTexto`) trocea strings largos en runs de
 *  este tamaño ⇒ un párrafo v1 de 2000 chars migra LOSSLESS a 2 runs (la concatenación lo reproduce). */
export const RUN_MAX_CHARS = 1000;

/**
 * Slug de página válido (kebab ≤64) para el destino `pagina` de un link (Tanda 3 F01/F04). PURO — NO
 * importa `esSlugValido` (vive en `~/server`, off-limits para este módulo puro); replica el criterio
 * kebab. El render resuelve a `/slug`. Lo REUSA `crearPagina` (F04) ⇒ la misma forma de slug de página
 * en toda la plataforma. Distinto del subdominio del tenant (ese es `esSlugValido`, DNS label).
 */
export const slugPagina = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug inválido (usa minúsculas y guiones)");

/**
 * URL de un link inline: SOLO https, ≤2048 (I-U1). `z.string().url()` ACEPTA `javascript:alert(1)`
 * (es una URL válida por el constructor `URL`) ⇒ el refine por protocolo NO es cosmético, es la defensa
 * anti-XSS/anti-phishing (par de ADR-0018/0019: un `javascript:` en un subdominio cabalga la sesión
 * wildcard). Rechaza http/mailto/data/javascript.
 */
export const urlLinkSegura = z
  .string()
  .max(2048)
  .refine((s) => {
    try {
      return new URL(s).protocol === "https:";
    } catch {
      return false;
    }
  }, "El enlace debe ser una URL https válida");

/**
 * Destino de un link inline, discriminado por `tipo`: `ancla` (scroll interno, enum `CTA_ANCLAS`),
 * `pagina` (otra página del tenant, `slugPagina`), `url` (externa https). UN SOLO vocabulario de
 * destinos en toda la plataforma — lo REUSA el `MenuItem` del chrome (F06/D10). `.strict()` por rama ⇒
 * nunca `<a href>` libre del tenant (I-U1/ADR-0018).
 */
export const DestinoLinkSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("ancla"), ancla: z.enum(CTA_ANCLAS) }).strict(),
  z.object({ tipo: z.literal("pagina"), slug: slugPagina }).strict(),
  z.object({ tipo: z.literal("url"), url: urlLinkSegura }).strict(),
]);
export type DestinoLink = z.infer<typeof DestinoLinkSchema>;

/**
 * Definición de un link (markDef, modelo Portable Text): `id` estable ≤64 + `destino` tipado. Los runs
 * lo referencian por `run.link === id` ⇒ un mismo link puede abarcar varios runs. `.strict()`.
 */
export const MarkDefLinkSchema = z
  .object({ id: z.string().min(1).max(64), destino: DestinoLinkSchema })
  .strict();
export type MarkDefLink = z.infer<typeof MarkDefLinkSchema>;

/**
 * Un run: texto plano `t` (1–`RUN_MAX_CHARS`) + `m` (0–4 marcas del enum, SIN duplicados) + `link`
 * opcional (id de un markDef). `.strict()` ⇒ un `html`/campo extra no parsea (I-U1).
 */
export const RunSchema = z
  .object({
    t: z.string().min(1).max(RUN_MAX_CHARS),
    m: z
      .array(z.enum(MARCAS_RUN))
      .max(4)
      .refine((a) => new Set(a).size === a.length, "Marcas duplicadas")
      .optional(),
    link: z.string().min(1).max(64).optional(),
  })
  .strict();
export type Run = z.infer<typeof RunSchema>;

/**
 * `RichTexto`: `children` (1–50 runs) + `markDefs` (0–10). Un `superRefine` cierra la integridad
 * referencial del modelo (modelo LIMPIO, más seguro que un grafo suelto):
 *  - ids de markDef ÚNICOS (sin duplicado ⇒ resolución ambigua);
 *  - todo `run.link` referencia un markDef existente (sin dangling);
 *  - todo markDef está referenciado por ≥1 run (sin huérfanos — el serializer del editor los limpia).
 * `.strict()` en el envelope. El nombre `huérfano` cubre ambas puntas (dangling + no-usado): cualquier
 * link roto o markDef muerto ⇒ rechazo.
 */
export const RichTextoSchema = z
  .object({
    children: z.array(RunSchema).min(1).max(50),
    markDefs: z.array(MarkDefLinkSchema).max(10).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const defs = val.markDefs ?? [];
    const ids = defs.map((d) => d.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "markDefs con id duplicado", path: ["markDefs"] });
    }
    const idSet = new Set(ids);
    const usados = new Set<string>();
    val.children.forEach((run, i) => {
      if (run.link !== undefined) {
        usados.add(run.link);
        if (!idSet.has(run.link)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `link "${run.link}" sin markDef (dangling)`,
            path: ["children", i, "link"],
          });
        }
      }
    });
    defs.forEach((d, i) => {
      if (!usados.has(d.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `markDef "${d.id}" huérfano (ningún run lo usa)`,
          path: ["markDefs", i],
        });
      }
    });
  });
export type RichTexto = z.infer<typeof RichTextoSchema>;

/**
 * Convierte un string plano a `RichTexto` (Tanda 3 F01/D3): trocea en runs de ≤`RUN_MAX_CHARS` chars
 * (LOSSLESS — la concatenación de los `t` reproduce el original EXACTO). Base de la migración v1→v2 de
 * `texto_rico` (migrate.ts) y del hero (F02), y del fallback del EditorRuns. PURA, determinista.
 */
export function runsDeTexto(texto: string): RichTexto {
  const t = texto.length === 0 ? " " : texto; // el schema exige t≥1; un v1 nunca trae vacío (min 1)
  const children: Run[] = [];
  for (let i = 0; i < t.length; i += RUN_MAX_CHARS) {
    children.push({ t: t.slice(i, i + RUN_MAX_CHARS) });
  }
  return { children };
}

/**
 * Mapa `estilo de tituloAcento` (ESTILOS_TITULO_ACENTO) → `MarcaRun` equivalente (Tanda 3 F02/D4). Los
 * 4 estilos del hero mapean 1:1 a una marca de run (acento/marca/resaltado/gradiente) ⇒ la absorción de
 * `tituloAcento` es LOSSLESS. Definido acá (no en el hero) porque lo consume la migración pura (migrate.ts).
 */
export const MARCA_POR_ESTILO_ACENTO = {
  acento: "acento",
  marca: "marca",
  resaltado: "resaltado",
  gradiente: "gradiente",
} as const satisfies Record<(typeof ESTILOS_TITULO_ACENTO)[number], MarcaRun>;

/**
 * Convierte un `titulo` string + `tituloAcento {palabra, estilo}` a `RichTexto` (Tanda 3 F02/D4): la
 * PRIMERA ocurrencia case-insensitive de `palabra` queda en su propio run con la marca equivalente; el
 * texto de antes/después son runs planos (byte-idéntico al render de `<TituloHero>` con substring, I-U8).
 * Sin match (o palabra vacía) ⇒ `runsDeTexto(titulo)` (título plano). PURA, determinista.
 */
export function runsDeTituloAcento(
  titulo: string,
  palabra: string,
  estilo: (typeof ESTILOS_TITULO_ACENTO)[number],
): RichTexto {
  const i = palabra.length === 0 ? -1 : titulo.toLowerCase().indexOf(palabra.toLowerCase());
  if (i === -1) return runsDeTexto(titulo);
  const antes = titulo.slice(0, i);
  const match = titulo.slice(i, i + palabra.length);
  const despues = titulo.slice(i + palabra.length);
  const children: Run[] = [];
  if (antes) children.push({ t: antes });
  children.push({ t: match, m: [MARCA_POR_ESTILO_ACENTO[estilo]] });
  if (despues) children.push({ t: despues });
  return { children };
}

/**
 * `hero` (semilla, v2 en catálogo-v2 F05). `titulo`/`subtitulo`/`imagenUrl` son OVERRIDES opcionales
 * — sin ellos el render cae al `nombre`/`descripcion`/gradiente del Tenant (degradación elegante,
 * resueltos server-side; NO se copian al documento, I2/I11). El badge "Sorteo abierto" y los badges
 * de confianza los decide el render (dato del sorteo server-side).
 *
 * v2 (aditivo, migrate-on-read trivial): `variante` (default `split` = look v1), `overlayOscuridad`
 * (para la variante `imagen_fondo`) y `ctaSecundario` opcional (2º CTA, p.ej. "Ver bases"). Todo con
 * default/optional ⇒ un hero v1 parsea y conserva su aspecto (I-H).
 *
 * v3 (Tanda 3 F02/D4): `titulo`/`subtitulo` pasan a `RichTexto` (runs). El viejo `tituloAcento`
 * DESAPARECE del schema — la migración v2→v3 lo ABSORBE en el `titulo` (la palabra acentuada queda en
 * un run con la marca equivalente, LOSSLESS, migrate.ts). Un hero v2 con `titulo:string` + `tituloAcento`
 * migra byte-idéntico. `efectoTitulo`/`tituloTamano`/`tituloMayusculas` siguen como props del `<Title>`.
 */
export const heroProps = z
  .object({
    titulo: RichTextoSchema.optional(),
    subtitulo: RichTextoSchema.optional(),
    imagenUrl: urlPublica.optional(),
    ctaTexto: z.string().min(1).max(40).optional(),
    ctaAncla: z.enum(CTA_ANCLAS).default("catalogo"),
    ctaSecundario: z
      .object({
        texto: z.string().min(1).max(40),
        ancla: z.enum(CTA_ANCLAS),
      })
      .strict()
      .optional(),
    variante: z.enum(VARIANTES_HERO).default("split"), // split = look v1 (migración no-op, I-H)
    overlayOscuridad: z.number().int().min(0).max(90).default(45), // solo variante imagen_fondo
    mostrarBadgeSorteo: z.boolean().default(true),
    // ── Hero puente (builder-tanda-1 F03/D5/D6), TODO aditivo/opcional ⇒ un hero v2 parsea igual ──
    // Eyebrow (F13/fidelidad): kicker pequeño en MAYÚSCULAS sobre el título (texto plano ≤80). Cuando
    // está presente REEMPLAZA al badge "Sorteo abierto" (el mockup lo usa como firma de autoría). Aditivo.
    eyebrow: z.string().min(1).max(80).optional(),
    // Color del eyebrow (Tanda 2 F04/D4): desacopla el eyebrow del token de primario. `marca` = color del
    // primario (DEFAULT = comportamiento actual, no-op). `acento` = token de la escala acento (degrada a
    // marca sin acento, I-T2). `texto` = color de texto heredado. Cero hex (I-A).
    eyebrowEstilo: z.enum(EYEBROW_ESTILOS).default("marca"),
    // `tituloAcento` (v2) FUE ABSORBIDO por el `titulo` RichTexto en v3 (Tanda 3 F02/D4): la palabra
    // acentuada vive ahora como un run con su marca. La migración v2→v3 (migrate.ts) lo consume; el campo
    // ya no existe en el schema (un doc con `tituloAcento` crudo NO parsea ⇒ se migra ANTES, on-read).
    // Cifra/etiqueta destacada del hero (el "$3.000 + nota"). Texto plano con límite.
    destacado: z
      .object({
        texto: z.string().min(1).max(24),
        nota: z.string().min(1).max(120).optional(),
      })
      .strict()
      .optional(),
    ctaSecundarioEstilo: z.enum(ESTILOS_CTA_SECUNDARIO).default("boton"),
    mostrarConfianza: z.boolean().default(true), // toggle de los trust badges (hoy hardcodeados)
    efectoTitulo: z.enum(EFECTOS_TITULO).default("ninguno"),
    // Tamaño + mayúsculas del título (Tanda 2 F15/fidelidad concert): `tituloTamano` escala el fz del
    // `<Title>` (normal = actual, no-op I-H); `tituloMayusculas` aplica `text-transform:uppercase` por CSS
    // (NO reescribe el copy — el texto en DB queda en su casing). Ambos aditivos con default no-op.
    tituloTamano: z.enum(TITULO_TAMANOS).default("normal"),
    tituloMayusculas: z.boolean().default(false),
    // Visual configurable del hero split (Tanda 2 F02/D2): imagen (opción holo) o holocard-tarjeta.
    // Ausente ⇒ el hero cae al `imagenUrl`/gradiente actual (no-op, I-H). Solo lo consume la variante `split`.
    visual: HeroVisualSchema.optional(),
  })
  .strict();
export type HeroProps = z.infer<typeof heroProps>;

/**
 * `catalogo` (semilla): grilla de productos. `modo:'todos'` lista todo el catálogo activo del tenant;
 * `modo:'seleccion'` lista solo los `productoIds` (REFERENCIAS validadas server-side contra el tenant,
 * D6/I2 — jamás precios/títulos copiados). `columnas` acota el layout.
 */
export const catalogoProps = z
  .object({
    titulo: z.string().min(1).max(80).default("Catálogo"),
    modo: z.enum(["todos", "seleccion"]).default("todos"),
    productoIds: z.array(z.string().cuid()).max(60).optional(),
    columnas: z.union([z.literal(2), z.literal(3)]).default(3),
    // Layout de la sección (Tanda 2 F13): `grilla` (default = no-op, I-H) o `carrusel` (marquee horizontal).
    layout: z.enum(LAYOUTS_CATALOGO).default("grilla"),
  })
  .strict();
export type CatalogoProps = z.infer<typeof catalogoProps>;

/**
 * `sorteo_vitrina` (semilla): vitrina del `Raffle` ACTIVO. NO guarda premio/fechas/conteo — se
 * resuelven server-side al render (I2). Se auto-oculta sin sorteo activo. El Disclaimer del sorteo
 * (ADR-0008/I8) NO es configurable: `mostrarBases` solo controla el texto de bases del Organizador.
 */
export const sorteoVitrinaProps = z
  .object({
    mostrarBases: z.boolean().default(true),
    estiloConteo: z.enum(["badge", "destacado"]).default("badge"),
  })
  .strict();
export type SorteoVitrinaProps = z.infer<typeof sorteoVitrinaProps>;

/**
 * Layout de `como_funciona` (Tanda 2 F15/fidelidad editorial): `tarjetas` (DEFAULT) = la grilla de cards
 * de siempre (no-op, I-H). `lista` = lista NUMERADA vertical elegante (numeral serif grande a la izquierda
 * + título/desc), el "método" del prototipo editorial. Enum cerrado.
 */
export const LAYOUTS_COMO_FUNCIONA = ["tarjetas", "lista"] as const;
export type LayoutComoFunciona = (typeof LAYOUTS_COMO_FUNCIONA)[number];

/**
 * `como_funciona` (semilla): pasos de conversión. Sin `pasos` ⇒ el render usa los 3 pasos FIJOS de
 * plataforma (copy actual). `icono` es un enum cerrado (nunca string libre); textos con límite.
 */
export const comoFuncionaProps = z
  .object({
    titulo: z.string().min(1).max(80).default("Cómo funciona"),
    // Layout (Tanda 2 F15): `tarjetas` (default = grilla de cards, no-op I-H) o `lista` (numerada vertical).
    layout: z.enum(LAYOUTS_COMO_FUNCIONA).default("tarjetas"),
    pasos: z
      .array(
        z
          .object({
            icono: z.enum(ICONOS_PASO),
            titulo: z.string().min(1).max(60),
            desc: z.string().min(1).max(200),
          })
          .strict(),
      )
      .max(4)
      .optional(),
  })
  .strict();
export type ComoFuncionaProps = z.infer<typeof comoFuncionaProps>;

// ── Widgets PRO de conversión (F10) ──────────────────────────────────────────

/**
 * `contador_tickets` (sección, F10): muestra el conteo REAL de tickets del sorteo ACTIVO (server-side,
 * sin PII — ADR-0004). Auto-oculto sin sorteo activo. `metaTickets` habilita una barra de progreso.
 */
export const contadorTicketsProps = z
  .object({
    metaTickets: z.number().int().positive().max(1_000_000).optional(),
    etiqueta: z.string().min(1).max(80).optional(),
    mostrarPorcentaje: z.boolean().default(false),
  })
  .strict();
export type ContadorTicketsProps = z.infer<typeof contadorTicketsProps>;

/**
 * `urgencia_countdown` (sección, F10): cuenta regresiva al cierre del sorteo ACTIVO. Auto-oculto si no
 * hay sorteo o ya venció (§3). `intensidad` modula el énfasis visual.
 */
export const urgenciaCountdownProps = z
  .object({
    mensaje: z.string().min(1).max(120).optional(),
    ctaTexto: z.string().min(1).max(40).optional(),
    ctaAncla: z.enum(CTA_ANCLAS).default("catalogo"),
    intensidad: z.enum(["suave", "fuerte"]).default("suave"),
  })
  .strict();
export type UrgenciaCountdownProps = z.infer<typeof urgenciaCountdownProps>;

// ── Widgets PRO de conversión — OVERLAYS (F10) ───────────────────────────────

/**
 * `whatsapp_flotante` (overlay, F10): botón flotante (FAB) a WhatsApp. Sin `numero` (E.164) ⇒ oculto.
 * El `mensajePredefinido` prellena el chat. `posicion` = abajo-derecha / abajo-izquierda.
 */
export const whatsappFlotanteProps = z
  .object({
    numero: z
      .string()
      .regex(/^\+[1-9]\d{6,14}$/, "Número E.164, ej. +56912345678")
      .optional(),
    mensajePredefinido: z.string().min(1).max(120).optional(),
    posicion: z.enum(["br", "bl"]).default("br"),
  })
  .strict();
export type WhatsappFlotanteProps = z.infer<typeof whatsappFlotanteProps>;

/**
 * Modo de la cinta de aviso (builder-tanda-1 F04/D7). `estatico` = un mensaje fijo (= look v1).
 * `rotacion` = cicla los mensajes con un fade (client-side; SSR muestra el 1º). `marquee` = ticker
 * horizontal continuo (CSS puro, pausa en hover, reduced-motion ⇒ estático). Enum cerrado.
 */
export const MODOS_AVISO_BARRA = ["estatico", "rotacion", "marquee"] as const;
export type ModoAvisoBarra = (typeof MODOS_AVISO_BARRA)[number];

/**
 * Posición de la cinta relativa al header (builder-tanda-1 F13/fidelidad). `bajo_nav` (DEFAULT =
 * comportamiento actual: la cinta es el 1er hijo de `<main>`, bajo el header sticky) o `sobre_nav`
 * (la cinta se renderiza ANTES del header, en el tope absoluto — el ticker "sobre el nav" del mockup).
 * Default `bajo_nav` ⇒ migración no-op total (I-T3): ningún doc previo cambia de posición.
 */
export const POSICIONES_AVISO_BARRA = ["sobre_nav", "bajo_nav"] as const;
export type PosicionAvisoBarra = (typeof POSICIONES_AVISO_BARRA)[number];

/**
 * `aviso_barra` v2 (builder-tanda-1 F04/D7; overlay, F10): cinta de aviso arriba de todo (sobre el
 * nav). v-bump v1→v2 con migrate-on-read `texto → mensajes:[texto]` que CONSERVA el look (I-T3): los
 * defaults `modo:"estatico"` + `esquema:"tema"` (transparente, borde inferior) + `mostrarCountdown:false`
 * reproducen la barra v1 exacta. `mensajes` 1–10 (≤120 = el límite v1 de `texto` ⇒ migrate lossless;
 * el editor sugiere textos cortos para el marquee — el cap subió de 5 a 10 en F13/fidelidad, aditivo:
 * docs con 1–5 siguen válidos). `esquema` reusa `ESQUEMAS_FONDO` (incl. `acento*`, que degradan a marca
 * sin acento, I-T2). `posicion` (F13) pone la cinta sobre o bajo el nav (default `bajo_nav` = look
 * actual). `mostrarCountdown` muestra el chip del sorteo ACTIVO (server-side; sin sorteo ⇒ auto-oculto).
 * Texto plano (nunca HTML, I3); `enlaceUrl/enlaceTexto/descartable` se conservan de v1.
 */
export const avisoBarraProps = z
  .object({
    mensajes: z.array(z.string().min(1).max(120)).min(1).max(10),
    modo: z.enum(MODOS_AVISO_BARRA).default("estatico"),
    esquema: z.enum(ESQUEMAS_FONDO).default("tema"), // "tema" = transparente = look v1
    posicion: z.enum(POSICIONES_AVISO_BARRA).default("bajo_nav"), // bajo_nav = look actual (no-op)
    mostrarCountdown: z.boolean().default(false),
    enlaceUrl: z.string().url().max(2048).optional(),
    enlaceTexto: z.string().min(1).max(40).optional(),
    descartable: z.boolean().default(false),
  })
  .strict();
export type AvisoBarraProps = z.infer<typeof avisoBarraProps>;

// ── Widgets PRO de confianza (F11) ───────────────────────────────────────────

/** `testimonios` (sección, F11): reseñas. Texto plano con límites (nunca HTML, I3). */
export const testimoniosProps = z
  .object({
    titulo: z.string().min(1).max(80).optional(),
    layout: z.enum(["grid", "carrusel"]).default("grid"),
    items: z
      .array(
        z
          .object({
            nombre: z.string().min(1).max(60),
            texto: z.string().min(1).max(280),
            avatarUrl: urlPublica.optional(),
            estrellas: z.number().int().min(1).max(5).optional(),
            handle: z.string().min(1).max(40).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();
export type TestimoniosProps = z.infer<typeof testimoniosProps>;

/** Fuente de los ganadores: lista MANUAL del Organizador, o AUTOMÁTICA desde raffles cerrados (F06). */
export const FUENTE_GANADORES = ["manual", "automatico"] as const;

/**
 * `ganadores` (sección, v2 en catálogo-v2 F06). `fuente:"manual"` (default = look v1) usa la lista
 * `items` que escribe el Organizador (consentimiento suyo, §3). `fuente:"automatico"` IGNORA `items` y
 * muestra los raffles CERRADOS del tenant con el ganador ENMASCARADO server-side (ADR-0004,
 * `getSorteoResumenStorefront`); `maxAutomaticos` acota cuántos. `items` es OPCIONAL (aditivo v1→v2:
 * un doc v1 con items + `fuente` default "manual" conserva el look; el automatico no necesita items).
 */
export const ganadoresProps = z
  .object({
    titulo: z.string().min(1).max(80).optional(),
    layout: z.enum(["grid", "carrusel"]).default("grid"),
    fuente: z.enum(FUENTE_GANADORES).default("manual"),
    maxAutomaticos: z.number().int().min(1).max(20).default(6),
    items: z
      .array(
        z
          .object({
            nombre: z.string().min(1).max(60),
            premio: z.string().min(1).max(80),
            fecha: z.string().min(1).max(40).optional(),
            fotoUrl: urlPublica.optional(),
            handle: z.string().min(1).max(40).optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
  })
  .strict();
export type GanadoresProps = z.infer<typeof ganadoresProps>;

/** `faq` (sección, F11): preguntas frecuentes. Texto plano pre-wrap con límites (nunca HTML, I3). */
export const faqProps = z
  .object({
    titulo: z.string().min(1).max(80).default("Preguntas frecuentes"),
    items: z
      .array(
        z
          .object({
            pregunta: z.string().min(1).max(160),
            respuesta: z.string().min(1).max(600),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
export type FaqProps = z.infer<typeof faqProps>;

/**
 * `video` (sección, F11): video embebido — iframe-only sobre el contrato de F07 (`construirEmbedSrc`).
 * `plataforma` mapea a `RedEmbed`; `videoId` es la ref (validada por la regex de la red en el render).
 * NUNCA HTML/iframeSrc crudo (I3/I4): el documento guarda `{ plataforma, videoId }`, la src la arma
 * `<EmbedFrame>` server/registry-side.
 */
export const videoProps = z
  .object({
    plataforma: z.enum(["youtube", "tiktok", "instagram"]),
    videoId: z.string().min(1).max(100),
    titulo: z.string().min(1).max(80).optional(),
    ratio: z.enum(["16:9", "9:16"]).default("16:9"),
  })
  .strict();
export type VideoProps = z.infer<typeof videoProps>;

/**
 * `embed_social` (sección, F11): post/perfil social embebido — iframe-only sobre F07. `red` mapea a
 * `RedEmbed`; `ref` es el id/handle validado por regex en el render. Corazón del brief fandom.
 */
export const embedSocialProps = z
  .object({
    red: z.enum(["tiktok", "instagram"]),
    tipo: z.enum(["post", "perfil"]).default("post"),
    ref: z.string().min(1).max(100),
    leyenda: z.string().min(1).max(120).optional(),
  })
  .strict();
export type EmbedSocialProps = z.infer<typeof embedSocialProps>;

// ── Widgets [mvp-v2] · lote contenido/estructura (catálogo-v2 F04, síntesis §2) ───────────────
// Checklist invariante de la síntesis §6: props `.strict()` (rechazo de HTML/campo extra), texto =
// string plano con límite, enums cerrados, imágenes = `urlPublica`. Ninguno guarda HTML/CSS/URL de
// iframe crudo. La degradación (imagen rota, sin sorteo) la maneja el componente (I-G).

/**
 * `beneficios_grid` (sección, F04): grilla 2–6 de beneficios (ícono + título + desc). Los íconos son
 * `ICONOS_BENEFICIO` (enum cerrado, mapeado a Tabler en el render — jamás string libre). `columnas`
 * acota el layout. Textos planos con límite.
 */
export const beneficiosGridProps = z
  .object({
    titulo: z.string().min(1).max(80).optional(),
    columnas: z.union([z.literal(2), z.literal(3)]).default(3),
    items: z
      .array(
        z
          .object({
            icono: z.enum(ICONOS_BENEFICIO),
            titulo: z.string().min(1).max(60),
            desc: z.string().min(1).max(200).optional(),
          })
          .strict(),
      )
      .min(2)
      .max(6),
  })
  .strict();
export type BeneficiosGridProps = z.infer<typeof beneficiosGridProps>;

/** Estilo de lista de un bloque `texto_rico`. */
export const ESTILOS_LISTA = ["vinetas", "numerada"] as const;

/**
 * Bloque de `texto_rico` v2 (Tanda 3 F01/D1/D3, discriminated-union por `tipo`, NUNCA HTML — I-U1).
 * `subtitulo`/`parrafo`/`cita` llevan `rico` (un `RichTexto` = runs + marcas + links inline); `cita.autor`
 * y `lista.items` quedan STRING plano (texto corto, sin ROI editorial — D3). `.strict()` en cada rama ⇒
 * un bloque con campo extra, un `tipo` desconocido, o el `texto` string VIEJO (v1) no parsea (se migra
 * ANTES, on-read, migrate.ts). El campo se llama `rico` (no `children`) para no chocar con el `children`
 * INTERNO del RichTexto (los runs).
 */
export const BloqueTextoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("subtitulo"), rico: RichTextoSchema }).strict(),
  z.object({ tipo: z.literal("parrafo"), rico: RichTextoSchema }).strict(),
  z
    .object({
      tipo: z.literal("cita"),
      rico: RichTextoSchema,
      autor: z.string().min(1).max(80).optional(),
    })
    .strict(),
  z
    .object({
      tipo: z.literal("lista"),
      estilo: z.enum(ESTILOS_LISTA).default("vinetas"),
      items: z.array(z.string().min(1).max(200)).min(1).max(12),
    })
    .strict(),
]);
export type BloqueTexto = z.infer<typeof BloqueTextoSchema>;

/**
 * `texto_rico` v2 (sección, F04 + Tanda 3 F01): cuerpo editorial estructurado por bloques tipados
 * (subtítulo/párrafo/cita con runs, lista con strings) — NO HTML (I-U1). `ancho` acota la columna de
 * lectura. v-bump v1→v2 con migrate-on-read LOSSLESS (`string → runs`, migrate.ts).
 */
export const textoRicoProps = z
  .object({
    ancho: z.enum(["estrecho", "normal"]).default("normal"),
    bloques: z.array(BloqueTextoSchema).min(1).max(30),
  })
  .strict();
export type TextoRicoProps = z.infer<typeof textoRicoProps>;

/** Relación de aspecto de una imagen destacada (`natural` = alto intrínseco de la imagen). */
export const RATIOS_IMAGEN = ["natural", "16:9", "4:3", "1:1", "3:4"] as const;

/**
 * Máscara de forma de una imagen (builder-tanda-1 F07/D11): clip-paths/border-radius CURADOS por
 * NOSOTROS (nunca clip-path libre del tenant, I-A/I4). `ninguna` = DEFAULT no-op (I-H). `ticket` reusa
 * el motivo troquel (muescas laterales). El slot reserva tamaño por el `ratio` ⇒ CLS=0 (I-C).
 */
export const FORMAS_IMAGEN = ["ninguna", "circulo", "blob", "arco", "ticket"] as const;
export type FormaImagen = (typeof FORMAS_IMAGEN)[number];

/**
 * `imagen_destacada` (sección, F04): una imagen grande con `alt` (obligatorio, accesibilidad),
 * `caption` y enlace opcionales. `imagenUrl` = `urlPublica` (bucket, ADR-0013). URL rota ⇒ el
 * componente degrada a un placeholder tematizado (I-G).
 */
export const imagenDestacadaProps = z
  .object({
    imagenUrl: urlPublica,
    alt: z.string().min(1).max(200),
    caption: z.string().min(1).max(200).optional(),
    // Ancho de la imagen (Tanda 2 F03/D3): `card` (~420px, holocard/portada compacta) ADITIVO junto a
    // `contenido` (≈900px, DEFAULT no-op) y `completo` (full-bleed). Cierra el gap de la holocard
    // sobredimensionada 864×1150 que dejó la Tanda 1.
    ancho: z.enum(["card", "contenido", "completo"]).default("contenido"),
    ratio: z.enum(RATIOS_IMAGEN).default("natural"),
    forma: z.enum(FORMAS_IMAGEN).default("ninguna"), // F07/D11: máscara de forma curada (default no-op)
    enlaceUrl: z.string().url().max(2048).optional(),
    // Variante holográfica (F12): borde de gradiente animado (tokens de marca) + tilt 3D al mouse
    // (transform-only, reduced-motion/SSR-safe). Aditivo/opcional ⇒ un doc v1 sin `holo` es idéntico.
    holo: z.boolean().default(false),
  })
  .strict();
export type ImagenDestacadaProps = z.infer<typeof imagenDestacadaProps>;

/** Estilo del `separador` decorativo (SVG generado por NOSOTROS, nunca markup del tenant). */
export const ESTILOS_SEPARADOR = ["linea", "puntos", "onda", "perforacion", "zigzag"] as const;
/** Tamaño (alto) del separador. */
export const TAMANOS_SEPARADOR = ["s", "m", "l"] as const;

/**
 * `separador` (sección, F04): separador decorativo entre secciones (línea/puntos/onda/perforación de
 * ticket/zigzag). Enum cerrado ⇒ el render dibuja el motivo, jamás markup del tenant.
 */
export const separadorProps = z
  .object({
    estilo: z.enum(ESTILOS_SEPARADOR).default("linea"),
    tamano: z.enum(TAMANOS_SEPARADOR).default("m"),
  })
  .strict();
export type SeparadorProps = z.infer<typeof separadorProps>;

/** Altura de un `espaciador` vertical. */
export const ALTURAS_ESPACIADOR = ["xs", "s", "m", "l", "xl"] as const;

/** `espaciador` (sección, F04): espacio vertical vacío ajustable (estructural, sin contenido). */
export const espaciadorProps = z
  .object({
    alto: z.enum(ALTURAS_ESPACIADOR).default("m"),
  })
  .strict();
export type EspaciadorProps = z.infer<typeof espaciadorProps>;

/**
 * `banner_cta` (sección, F04): banda CTA full-bleed sobre fondo de marca / gradiente / imagen. Sin
 * `imagenFondoUrl` ⇒ el componente pinta el gradiente de marca (degradación, I-G). `ctaAncla` es un
 * enum cerrado (`CTA_ANCLAS`); `overlayOscuridad` es un entero step-clamp 0–90 (jamás CSS libre).
 */
export const bannerCtaProps = z
  .object({
    titulo: z.string().min(1).max(120),
    subtitulo: z.string().min(1).max(300).optional(),
    ctaTexto: z.string().min(1).max(40),
    ctaAncla: z.enum(CTA_ANCLAS).default("catalogo"),
    imagenFondoUrl: urlPublica.optional(),
    overlayOscuridad: z.number().int().min(0).max(90).default(45), // step-clamp, no CSS
  })
  .strict();
export type BannerCtaProps = z.infer<typeof bannerCtaProps>;

// ── Widgets [mvp-v2] · lote social/prueba (catálogo-v2 F05, síntesis §2) ───────────────────────

/**
 * Estilo visual de `estadisticas` (builder-tanda-1 F06/D10): `cards` = render actual (ThemeIcon, sin
 * contenedor); `simple` = limpio; `tarjetas_suaves` (Tanda 2 F12) = cada cifra en una TARJETA blanca con
 * sombra suave (las stats del prototipo dreamy — el `cards` histórico NO envolvía en tarjeta). Aditivo:
 * `cards` sigue de default (no-op, I-H).
 */
export const ESTILOS_ESTADISTICA = ["cards", "simple", "tarjetas_suaves"] as const;

/**
 * `estadisticas` (sección, F05): fila 2–4 de cifras grandes con count-up. `valor` es ENTERO (no
 * string — el count-up parsea confiable, síntesis §2 dedup); `prefijo`/`sufijo` acotados ("+", "★",
 * "%"). `etiqueta` describe la cifra. Los números son NARRADOS por el Organizador (no datos
 * server-side garantizados — §5): esta pieza es prueba social editorial, no el conteo real del sorteo
 * (ese es `contador_tickets`/`meta_progreso_sorteo`).
 */
export const estadisticasProps = z
  .object({
    titulo: z.string().min(1).max(80).optional(),
    // Estilo visual (builder-tanda-1 F06/D10): `cards` = render ACTUAL (default no-op, I-H); `simple` =
    // cifras limpias sin ThemeIcon ni contenedor (las stats del mockup).
    estiloVisual: z.enum(ESTILOS_ESTADISTICA).default("cards"),
    items: z
      .array(
        z
          .object({
            valor: z.number().int().min(0).max(1_000_000_000),
            prefijo: z.string().min(1).max(8).optional(),
            sufijo: z.string().min(1).max(8).optional(),
            etiqueta: z.string().min(1).max(60),
            icono: z.enum(ICONOS_BENEFICIO).optional(),
          })
          .strict(),
      )
      .min(2)
      .max(4),
  })
  .strict();
export type EstadisticasProps = z.infer<typeof estadisticasProps>;

/** Redes de un `botones_sociales` (enum cerrado ⇒ el render mapea a ícono/color de marca). */
export const REDES_SOCIALES = [
  "instagram",
  "tiktok",
  "whatsapp",
  "youtube",
  "x",
  "facebook",
  "threads",
  "telegram",
] as const;
/** Estilo visual de los botones sociales. */
export const ESTILO_BOTON_SOCIAL = ["relleno", "contorno", "minimal"] as const;

/**
 * `botones_sociales` (sección, F05): fila "sígueme" con enlaces a redes. `red` es un enum cerrado;
 * `url` es una URL validada (el render la abre en pestaña nueva). Sin SDKs de terceros (solo enlaces).
 */
export const botonesSocialesProps = z
  .object({
    titulo: z.string().min(1).max(80).optional(),
    estilo: z.enum(ESTILO_BOTON_SOCIAL).default("relleno"),
    redes: z
      .array(
        z
          .object({
            red: z.enum(REDES_SOCIALES),
            url: z.string().url().max(2048),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();
export type BotonesSocialesProps = z.infer<typeof botonesSocialesProps>;

/** Animación de la banda de logos: estática (grilla) o cinta (marquee CSS). */
export const ANIMACION_LOGOS = ["estatica", "cinta"] as const;

/**
 * `logos_confianza` (sección, F05): banda de logos/aliados/medios (imagen + alt). `animacion:"cinta"`
 * es un marquee CSS (F03, pausa en hover); `estatica` es una grilla centrada. Imágenes = `urlPublica`
 * (degradan vía `<ImagenConFallback>` ante URL rota, I-G).
 */
export const logosConfianzaProps = z
  .object({
    titulo: z.string().min(1).max(80).optional(),
    animacion: z.enum(ANIMACION_LOGOS).default("estatica"),
    items: z
      .array(
        z
          .object({
            imagenUrl: urlPublica,
            alt: z.string().min(1).max(120),
          })
          .strict(),
      )
      .min(1)
      .max(24),
  })
  .strict();
export type LogosConfianzaProps = z.infer<typeof logosConfianzaProps>;

// ── Widgets [mvp-v2] · lote sorteo/conversión (catálogo-v2 F06, síntesis §2) ───────────────────

/**
 * `bloque_ticket_promo` (sección, F06): explicador "compra = participas" (producto→ticket→sorteo),
 * corazón del modelo. Sin datos del sorteo copiados (I2): la presencia del sorteo activo la decide el
 * render server-side. `mostrarMecanica` muestra los 3 pasos; `mostrarSorteoActivo` el badge de sorteo.
 */
export const bloqueTicketPromoProps = z
  .object({
    titulo: z.string().min(1).max(120).default("Compra y participa del sorteo"),
    descripcion: z.string().min(1).max(400).optional(),
    mostrarMecanica: z.boolean().default(true),
    ctaTexto: z.string().min(1).max(40).optional(),
    ctaAncla: z.enum(CTA_ANCLAS).default("catalogo"),
    mostrarSorteoActivo: z.boolean().default(true),
  })
  .strict();
export type BloqueTicketPromoProps = z.infer<typeof bloqueTicketPromoProps>;

/** Estilo de la barra de progreso hacia la meta. */
export const ESTILO_META = ["barra", "termometro"] as const;

/**
 * `meta_progreso_sorteo` (sección, F06): barra/termómetro hacia una meta de tickets (goal-gradient).
 * `metaTickets` es la meta del Organizador (del documento); el PROGRESO real (conteo de tickets) lo
 * resuelve el render server-side (I2, `getSorteoActivoStorefront`). Sin sorteo activo ⇒ auto-oculto.
 * `hitos` son marcas intermedias opcionales.
 */
export const metaProgresoSorteoProps = z
  .object({
    titulo: z.string().min(1).max(80).optional(),
    metaTickets: z.number().int().positive().max(1_000_000),
    estilo: z.enum(ESTILO_META).default("barra"),
    mostrarRestantes: z.boolean().default(true),
    hitos: z
      .array(
        z
          .object({
            en: z.number().int().positive().max(1_000_000),
            etiqueta: z.string().min(1).max(60),
          })
          .strict(),
      )
      .max(6)
      .optional(),
  })
  .strict();
export type MetaProgresoSorteoProps = z.infer<typeof metaProgresoSorteoProps>;

/**
 * `garantias_sorteo` (sección, F06): "cómo elegimos al ganador" — transparencia (anti caso Naya
 * Fácil). Texto plano del `metodo` + `items` (ícono + título + desc). Contenido editorial, sin datos
 * server-side.
 */
export const garantiasSorteoProps = z
  .object({
    titulo: z.string().min(1).max(80).default("Cómo elegimos al ganador"),
    metodo: z.string().min(1).max(600).optional(),
    items: z
      .array(
        z
          .object({
            icono: z.enum(ICONOS_BENEFICIO),
            titulo: z.string().min(1).max(60),
            desc: z.string().min(1).max(200).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(6)
      .optional(),
  })
  .strict();
export type GarantiasSorteoProps = z.infer<typeof garantiasSorteoProps>;

/** Canales de difusión de `compartir_sorteo` (deeplinks / Web Share, sin SDKs). */
export const CANALES_COMPARTIR = ["whatsapp", "copiar", "x", "telegram", "facebook"] as const;

/**
 * `compartir_sorteo` (sección, F06): botones de difusión (WhatsApp/copiar/X/Telegram/Facebook) —
 * motor viral. `mensaje` es el texto a compartir (la URL de la tienda la arma el render con el host
 * actual). Sin SDKs de terceros: deeplinks + Web Share API + copiar al portapapeles.
 */
export const compartirSorteoProps = z
  .object({
    titulo: z.string().min(1).max(80).optional(),
    mensaje: z.string().min(1).max(200).optional(),
    canales: z.array(z.enum(CANALES_COMPARTIR)).min(1).max(5).default(["whatsapp", "copiar", "x"]),
  })
  .strict();
export type CompartirSorteoProps = z.infer<typeof compartirSorteoProps>;

// ── Widget [mvp-v2] · galería (catálogo-v2 F08, requiere storage multi-imagen) ────────────────

/** Layout de la galería: grilla / mampostería (masonry) / carrusel horizontal. */
export const LAYOUT_GALERIA = ["grid", "masonry", "carrusel"] as const;

/**
 * `galeria` (sección, F08): 2–24 imágenes con `url` (`urlPublica`, del `PageAsset`) + `alt` + leyenda
 * opcional. `layout` (grid/masonry/carrusel) + `columnas` + `lightbox`. Cada celda usa
 * `<ImagenConFallback>` ⇒ una URL rota degrada sin romper la grilla (I-G).
 */
export const galeriaProps = z
  .object({
    titulo: z.string().min(1).max(80).optional(),
    layout: z.enum(LAYOUT_GALERIA).default("grid"),
    columnas: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
    lightbox: z.boolean().default(true),
    items: z
      .array(
        z
          .object({
            url: urlPublica,
            alt: z.string().min(1).max(200),
            leyenda: z.string().min(1).max(200).optional(),
          })
          .strict(),
      )
      .min(2)
      .max(24),
  })
  .strict();
export type GaleriaProps = z.infer<typeof galeriaProps>;

// ── Widgets v2b · gap vs mockups del cliente (catálogo-v2 F12) ────────────────────────────────

/** Separador visual entre los mensajes de una `cinta_texto` (enum cerrado → glifo · / ★ / —). */
export const SEPARADORES_CINTA = ["punto", "estrella", "guion"] as const;
/** Velocidad del marquee de la cinta (mapea a `animation-duration` fijo en el render, no CSS libre). */
export const VELOCIDADES_CINTA = ["lenta", "media", "rapida"] as const;

/**
 * `cinta_texto` (sección, F12): marquee infinito tipo ticker ("SORTEO ABIERTO · ENVÍO INSTANTÁNEO").
 * `mensajes` (1–10, ≤40 chars c/u) se intercalan con `separador` y corren en cinta CSS (patrón del
 * marquee de `logos_confianza`, pausa en hover, reduced-motion ⇒ estático). `esquema` pinta la banda
 * (fondo + texto legible por construcción, mismo sistema que `estiloSeccion`); el `nodo.estilo`
 * explícito gana. Texto plano con límite (nunca HTML, I3); `.strict()`.
 */
export const cintaTextoProps = z
  .object({
    mensajes: z.array(z.string().min(1).max(40)).min(1).max(10),
    separador: z.enum(SEPARADORES_CINTA).default("punto"),
    velocidad: z.enum(VELOCIDADES_CINTA).default("media"),
    esquema: z.enum(ESQUEMAS_FONDO).default("marca"),
  })
  .strict();
export type CintaTextoProps = z.infer<typeof cintaTextoProps>;

/**
 * `perfil_autora` (sección, F12): bloque editorial "sobre mí" centrado — avatar (imagen del picker o
 * iniciales del `nombre` si no hay), `nombre` (≤60), `bio` (≤400) y `redes` (≤6, reusa el shape de
 * `botones_sociales`: `{ red ∈ REDES_SOCIALES, url }`). Sin SDKs de terceros (solo enlaces). Texto
 * plano con límite (nunca HTML, I3); imagen = `urlPublica` (degrada elegante ante URL rota, I-G);
 * `.strict()`.
 */
export const perfilAutoraProps = z
  .object({
    nombre: z.string().min(1).max(60),
    // `bio` promovida a RichTexto (Tanda 3 F02/D5): prosa editorial donde el formato inline tiene ROI (un
    // nombre en negrita, una frase en itálica). v-bump v1→v2 con migrate-on-read LOSSLESS string→runs.
    bio: RichTextoSchema.optional(),
    avatarUrl: urlPublica.optional(),
    redes: z
      .array(
        z
          .object({
            red: z.enum(REDES_SOCIALES),
            url: z.string().url().max(2048),
          })
          .strict(),
      )
      .max(6)
      .optional(),
  })
  .strict();
export type PerfilAutoraProps = z.infer<typeof perfilAutoraProps>;

// ── Widgets Tanda 2 · fidelidad al techo (los 6 gaps del feature-tester) ───────────────────────

/**
 * `vitrina_proximamente` (sección, Tanda 2 F01/D1): grid de LANZAMIENTOS FUTUROS bloqueados — el caso
 * "Un libro a la vez" del mockup `tienda-libro.html` (bcac). Cada ítem es un cover con candado + estado
 * "Próximamente" + tratamiento visual bloqueado (grayscale/opacidad, lo aplica el render). `items` 1–8
 * de `{ titulo ≤60, subtitulo? ≤80, imagenUrl? }`; sin `imagenUrl` el render degrada a un placeholder
 * tematizado (I-G). `columnas` acota el layout; `notaPie` es una aclaración editorial opcional. Texto
 * plano con límite (nunca HTML, I3); imagen = `urlPublica` (ADR-0013); `.strict()`.
 */
export const vitrinaProximamenteProps = z
  .object({
    titulo: z.string().min(1).max(80).optional(),
    columnas: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
    items: z
      .array(
        z
          .object({
            titulo: z.string().min(1).max(60),
            subtitulo: z.string().min(1).max(80).optional(),
            imagenUrl: urlPublica.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    notaPie: z.string().min(1).max(120).optional(),
  })
  .strict();
export type VitrinaProximamenteProps = z.infer<typeof vitrinaProximamenteProps>;

/**
 * `packs_precio` (sección, Tanda 2 F12): tarjetas de PRECIO/pack — la sección "Más libros, más chances"
 * del prototipo dreamy. Cada ítem es un pack con `precio` (ENTERO, COPY de marketing — NO es un cobro: el
 * checkout cobra el `Decimal` real del producto, ADR-0006/regla de oro; es editorial como el `valor` de
 * `estadisticas`, narrado por el Organizador). `destacado` pinta el pack como la opción principal (fondo
 * filled del primario + `badge` de acento, como la card violeta "MÁS ELEGIDO"); el resto son tarjetas
 * claras con sombra suave. El CTA ancla al catálogo (enum cerrado, `CTA_ANCLAS`). El precio se formatea
 * con `Intl.NumberFormat` (CLP) en el render. Texto plano con límite (nunca HTML, I3); `.strict()`.
 */
export const packsPrecioProps = z
  .object({
    titulo: z.string().min(1).max(80).optional(),
    items: z
      .array(
        z
          .object({
            titulo: z.string().min(1).max(40),
            // Precio DE EXHIBICIÓN (copy). Entero limpio (CLP no tiene decimales); NO se usa para cobrar.
            precio: z.number().int().min(0).max(1_000_000_000),
            detalle: z.string().min(1).max(80).optional(),
            destacado: z.boolean().default(false),
            badge: z.string().min(1).max(20).optional(),
            ctaTexto: z.string().min(1).max(30).optional(),
            ctaAncla: z.enum(CTA_ANCLAS).default("catalogo"),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict();
export type PacksPrecioProps = z.infer<typeof packsPrecioProps>;

/**
 * `momento_ticket` (sección, Tanda 2 F12): la tarjeta aspiracional "¡Estás dentro!" del prototipo dreamy
 * — la visualización del número de sorteo que recibes al comprar. Borde punteado del acento, ícono
 * confetti FIJO (Tabler, hardcodeado en el render — parte de la identidad del widget, cero emoji libre
 * I-A), `titulo` (el titular), `etiqueta` (la línea "Tu número de sorteo:"), `codigoEjemplo` (el número
 * de EJEMPLO en chip mono, p.ej. "ARMY-04821"), `ctaTexto`/`nota` opcionales. Es contenido editorial
 * (no depende del sorteo real). El CTA ancla por enum cerrado. Texto plano con límite (I3); `.strict()`.
 */
export const momentoTicketProps = z
  .object({
    titulo: z.string().min(1).max(60),
    etiqueta: z.string().min(1).max(40).optional(),
    codigoEjemplo: z.string().min(1).max(20),
    ctaTexto: z.string().min(1).max(30).optional(),
    nota: z.string().min(1).max(120).optional(),
    ctaAncla: z.enum(CTA_ANCLAS).default("catalogo"),
  })
  .strict();
export type MomentoTicketProps = z.infer<typeof momentoTicketProps>;

/**
 * `producto_spotlight` (sección, Tanda 2 F15/fidelidad editorial): destaca UN producto por REFERENCIA
 * (`productoId`, I2/ADR-0017 — jamás copia precio/título al documento; el render lo resuelve tenant-scoped
 * server-side vía `listarProductosDeCatalogo`, D6/I1). Es "El objeto del deseo" del prototipo editorial:
 * mini portada (imagen del producto o `TapaLibro` tematizada) + cita/descripción + PRECIO REAL (el
 * `Product.precio`, no un número narrado) + CTA. `productoId` OPCIONAL: ausente ⇒ el render usa el 1er
 * producto activo del catálogo (degradación elegante, I-G). `titulo` (el h2 de la sección) y `autoria`
 * (la línea "por la autora") son texto plano con límite (nunca HTML, I3). `.strict()`.
 */
export const productoSpotlightProps = z
  .object({
    titulo: z.string().min(1).max(80).optional(),
    productoId: z.string().cuid().optional(),
    autoria: z.string().min(1).max(60).optional(),
    ctaTexto: z.string().min(1).max(30).optional(),
    ctaAncla: z.enum(CTA_ANCLAS).default("catalogo"),
  })
  .strict();
export type ProductoSpotlightProps = z.infer<typeof productoSpotlightProps>;

// ── Widget `fila`: layout de columnas con slots tipados (Tanda 3 F08/D13, evolución fila) ──────
//
// La `fila` es una SECCIÓN cuyo `props` contiene `columnas` de nodos-HOJA. Los nodos-HOJA son una union
// discriminada WHITELIST que NO incluye `fila` ⇒ **recursión imposible por construcción** (I-U4): sección
// → fila → hoja, nunca 3 niveles. No hay box-model libre; el reparto es un enum de spans curados. Definido
// ACÁ (no en `./schema`) porque `filaProps` lo consume y `./schema` importa `filaProps` de este módulo
// (la dependencia va schema→widgets, jamás al revés).

/** Reparto de columnas de una `fila` (enum cerrado → spans curados en el render, jamás CSS libre). */
export const REPARTOS_FILA = ["50_50", "66_33", "33_66", "33_33_33"] as const;
export type RepartoFila = (typeof REPARTOS_FILA)[number];

/** Cuántas columnas exige cada reparto (el `superRefine` de `filaProps` obliga esta coherencia). */
export const COLUMNAS_POR_REPARTO: Record<RepartoFila, number> = {
  "50_50": 2,
  "66_33": 2,
  "33_66": 2,
  "33_33_33": 3,
};

/**
 * Whitelist de tipos-HOJA que pueden vivir dentro de una columna de `fila` (D13). Deliberadamente NO
 * incluye `fila` (recursión imposible, I-U4) ni widgets full-bleed que no rinden angostos (hero, catálogo,
 * sorteo…). Son piezas que se ven bien en una columna. El editor filtra la galería de "agregar hoja" por
 * esta lista (F09). REVISABLE: ampliar/recortar según lo que renderice bien.
 */
export const HOJAS_FILA = [
  "texto_rico",
  "imagen_destacada",
  "beneficios_grid",
  "botones_sociales",
  "estadisticas",
  "separador",
  "espaciador",
  "banner_cta",
] as const;
export type HojaFilaTipo = (typeof HOJAS_FILA)[number];

/** Tope de hojas por columna (cordura anti-abuso, espejo de `MAX_SECCIONES`). */
export const MAX_HOJAS_POR_COLUMNA = 4;

/**
 * Nodo-HOJA: `{ id, tipo, v, props }` estricto, SIN `estilo`/`nav` (el estilo de sección vive en la
 * FILA, no por hoja — D14). El `id` es estable (direcciona selección/edición en el editor, F09).
 */
function nodoHoja<T extends string, P extends z.ZodTypeAny>(tipo: T, props: P) {
  return z
    .object({
      id: z.string().min(1).max(64),
      tipo: z.literal(tipo),
      v: z.number().int().positive(),
      props,
    })
    .strict();
}

/**
 * Union discriminada de nodos-HOJA (whitelist SIN `fila`, D13/I-U4). Un tipo fuera de la whitelist —o
 * una `fila` metida dentro de una columna— NO parsea ⇒ la recursión es imposible por construcción, no
 * por una guarda de profundidad en runtime. Debe seguir a `HOJAS_FILA` (mismos tipos).
 */
export const NodoHojaSchema = z.discriminatedUnion("tipo", [
  nodoHoja("texto_rico", textoRicoProps),
  nodoHoja("imagen_destacada", imagenDestacadaProps),
  nodoHoja("beneficios_grid", beneficiosGridProps),
  nodoHoja("botones_sociales", botonesSocialesProps),
  nodoHoja("estadisticas", estadisticasProps),
  nodoHoja("separador", separadorProps),
  nodoHoja("espaciador", espaciadorProps),
  nodoHoja("banner_cta", bannerCtaProps),
]);
export type NodoHoja = z.infer<typeof NodoHojaSchema>;

/**
 * `fila` (sección, F08/D13): layout de 2–3 columnas de nodos-HOJA. `reparto` fija los spans curados;
 * `columnas` es un array (2 o 3, coherente con el reparto vía `superRefine`) de arrays de hojas (0–4
 * c/u). La recursión es imposible por construcción (NodoHojaSchema no contiene `fila`, I-U4). `.strict()`.
 */
export const filaProps = z
  .object({
    reparto: z.enum(REPARTOS_FILA).default("50_50"),
    columnas: z.array(z.array(NodoHojaSchema).max(MAX_HOJAS_POR_COLUMNA)).min(2).max(3),
  })
  .strict()
  .superRefine((val, ctx) => {
    const esperadas = COLUMNAS_POR_REPARTO[val.reparto];
    if (val.columnas.length !== esperadas) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `El reparto "${val.reparto}" exige ${esperadas} columnas (hay ${val.columnas.length}).`,
        path: ["columnas"],
      });
    }
  });
export type FilaProps = z.infer<typeof filaProps>;

// ── Registro ─────────────────────────────────────────────────────────────────

/** Categoría de un widget: en el flujo vertical de `secciones[]` o en el slot `overlays[]`. */
export type CategoriaWidget = "seccion" | "overlay";

export interface WidgetDef<P extends z.ZodTypeAny = z.ZodTypeAny> {
  categoria: CategoriaWidget;
  /** Versión del nodo (migrate-on-read por `v`, F05). Los widgets semilla nacen en v1. */
  v: number;
  propsSchema: P;
  /** Props por defecto — parsean contra `propsSchema` (test generativo F02). */
  defaultProps: z.input<P>;
}

/** Helper que ata `defaultProps` al `propsSchema` en compile-time (evita drift default↔schema). */
function definirWidget<P extends z.ZodTypeAny>(d: WidgetDef<P>): WidgetDef<P> {
  return d;
}

/**
 * El registro. Cada entrada es la definición completa de un `tipo`. `as const` en las claves para
 * derivar `WidgetTipo`. Agregar un widget = agregar una entrada acá + su rama en la union de
 * `./schema` (la exhaustividad se testea, F02).
 */
export const WIDGET_REGISTRY = {
  hero: definirWidget({
    categoria: "seccion",
    v: 3, // Tanda 3 F02/D4: titulo/subtitulo→RichTexto, tituloAcento ABSORBIDO (migrate-on-read v2→v3)
    propsSchema: heroProps,
    defaultProps: { ctaAncla: "catalogo", variante: "split", mostrarBadgeSorteo: true },
  }),
  catalogo: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: catalogoProps,
    defaultProps: { titulo: "Catálogo", modo: "todos", columnas: 3 },
  }),
  sorteo_vitrina: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: sorteoVitrinaProps,
    defaultProps: { mostrarBases: true, estiloConteo: "badge" },
  }),
  como_funciona: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: comoFuncionaProps,
    defaultProps: { titulo: "Cómo funciona" },
  }),
  // ── PRO de conversión (F10) ──
  contador_tickets: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: contadorTicketsProps,
    defaultProps: { mostrarPorcentaje: false },
  }),
  urgencia_countdown: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: urgenciaCountdownProps,
    defaultProps: { ctaAncla: "catalogo", intensidad: "suave" },
  }),
  // ── Overlays PRO (F10) ──
  whatsapp_flotante: definirWidget({
    categoria: "overlay",
    v: 1,
    propsSchema: whatsappFlotanteProps,
    defaultProps: { posicion: "br" },
  }),
  aviso_barra: definirWidget({
    categoria: "overlay",
    v: 2, // builder-tanda-1 F04/D7: v-bump v1→v2 (mensajes[]/modo/esquema/countdown; migrate-on-read texto→mensajes)
    propsSchema: avisoBarraProps,
    defaultProps: { mensajes: ["Novedad"], descartable: false },
  }),
  // ── PRO de confianza (F11) ──
  testimonios: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: testimoniosProps,
    defaultProps: {
      layout: "grid",
      items: [{ nombre: "Cliente feliz", texto: "Excelente experiencia de compra." }],
    },
  }),
  ganadores: definirWidget({
    categoria: "seccion",
    v: 2, // catálogo-v2 F06: +fuente/+maxAutomaticos (migrate-on-read v1→v2, default manual = look v1)
    propsSchema: ganadoresProps,
    defaultProps: {
      layout: "grid",
      fuente: "manual",
      items: [{ nombre: "Ganador", premio: "Premio del sorteo" }],
    },
  }),
  faq: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: faqProps,
    defaultProps: {
      titulo: "Preguntas frecuentes",
      items: [
        {
          pregunta: "¿Cómo recibo mi compra?",
          respuesta: "Te llega al correo el enlace de descarga apenas se confirma el pago.",
        },
      ],
    },
  }),
  video: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: videoProps,
    defaultProps: { plataforma: "youtube", videoId: "dQw4w9WgXcQ", ratio: "16:9" },
  }),
  embed_social: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: embedSocialProps,
    defaultProps: { red: "tiktok", tipo: "post", ref: "7231338487075343622" },
  }),
  // ── [mvp-v2] lote contenido/estructura (F04) ──
  beneficios_grid: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: beneficiosGridProps,
    defaultProps: {
      columnas: 3,
      items: [
        { icono: "descarga", titulo: "Descarga inmediata", desc: "Recibes tu compra al instante, sin esperas." },
        { icono: "pago", titulo: "Pago seguro", desc: "Tus datos van cifrados; nunca los guardamos." },
        { icono: "soporte", titulo: "Te acompaño", desc: "Cualquier duda, escríbeme y te respondo." },
      ],
    },
  }),
  texto_rico: definirWidget({
    categoria: "seccion",
    v: 2, // Tanda 3 F01/D1/D3: v-bump v1→v2 (bloques con runs; migrate-on-read string→runs LOSSLESS)
    propsSchema: textoRicoProps,
    defaultProps: {
      bloques: [
        { tipo: "subtitulo", rico: { children: [{ t: "Sobre esta tienda" }] } },
        { tipo: "parrafo", rico: { children: [{ t: "Escribe aquí tu historia, cómo funciona tu tienda o lo que quieras contar a quien te visita." }] } },
      ],
    },
  }),
  imagen_destacada: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: imagenDestacadaProps,
    defaultProps: { imagenUrl: "https://placehold.co/1200x675", alt: "Imagen destacada" },
  }),
  separador: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: separadorProps,
    defaultProps: { estilo: "linea", tamano: "m" },
  }),
  espaciador: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: espaciadorProps,
    defaultProps: { alto: "m" },
  }),
  banner_cta: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: bannerCtaProps,
    defaultProps: { titulo: "¿List@ para participar?", ctaTexto: "Ver el catálogo", ctaAncla: "catalogo", overlayOscuridad: 45 },
  }),
  // ── [mvp-v2] lote social/prueba (F05) ──
  estadisticas: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: estadisticasProps,
    defaultProps: {
      items: [
        { valor: 1200, prefijo: "+", etiqueta: "tickets vendidos", icono: "ticket" },
        { valor: 340, prefijo: "+", etiqueta: "compradores felices", icono: "corazon" },
        { valor: 100, sufijo: "%", etiqueta: "entrega al instante", icono: "rayo" },
      ],
    },
  }),
  botones_sociales: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: botonesSocialesProps,
    defaultProps: {
      estilo: "relleno",
      redes: [{ red: "instagram", url: "https://instagram.com/tu_tienda" }],
    },
  }),
  logos_confianza: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: logosConfianzaProps,
    defaultProps: {
      animacion: "estatica",
      items: [{ imagenUrl: "https://placehold.co/160x60", alt: "Aliado" }],
    },
  }),
  // ── [mvp-v2] lote sorteo/conversión (F06) ──
  bloque_ticket_promo: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: bloqueTicketPromoProps,
    defaultProps: { titulo: "Compra y participa del sorteo", mostrarMecanica: true, mostrarSorteoActivo: true, ctaAncla: "catalogo" },
  }),
  meta_progreso_sorteo: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: metaProgresoSorteoProps,
    defaultProps: { metaTickets: 500, estilo: "barra", mostrarRestantes: true },
  }),
  garantias_sorteo: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: garantiasSorteoProps,
    defaultProps: {
      titulo: "Cómo elegimos al ganador",
      metodo: "El ganador se elige al azar entre todos los tickets válidos, en la fecha de cierre publicada. Todo queda registrado.",
      items: [
        { icono: "escudo", titulo: "Sorteo transparente", desc: "Al azar entre los tickets pagados." },
        { icono: "reloj", titulo: "Fecha fija", desc: "Se realiza el día del cierre, sin prórrogas." },
      ],
    },
  }),
  compartir_sorteo: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: compartirSorteoProps,
    defaultProps: { canales: ["whatsapp", "copiar", "x"] },
  }),
  // ── [mvp-v2] galería (F08) ──
  galeria: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: galeriaProps,
    defaultProps: {
      layout: "grid",
      columnas: 3,
      lightbox: true,
      items: [
        { url: "https://placehold.co/600x400?text=1", alt: "Imagen 1" },
        { url: "https://placehold.co/600x400?text=2", alt: "Imagen 2" },
      ],
    },
  }),
  // ── v2b · gap vs mockups del cliente (F12) ──
  cinta_texto: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: cintaTextoProps,
    defaultProps: {
      mensajes: ["SORTEO ABIERTO", "ENVÍO AL INSTANTE", "COMPRA Y PARTICIPA"],
      separador: "estrella",
      velocidad: "media",
      esquema: "marca",
    },
  }),
  perfil_autora: definirWidget({
    categoria: "seccion",
    v: 2, // Tanda 3 F02/D5: `bio` string→RichTexto (migrate-on-read LOSSLESS)
    propsSchema: perfilAutoraProps,
    defaultProps: {
      nombre: "Tu nombre",
      bio: { children: [{ t: "Cuenta quién eres en una o dos frases: qué vendes, por qué, y qué hace especial a tu tienda." }] },
    },
  }),
  // ── Tanda 2 · fidelidad al techo (F01) ──
  vitrina_proximamente: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: vitrinaProximamenteProps,
    defaultProps: {
      titulo: "Próximamente",
      columnas: 3,
      items: [
        { titulo: "Próximo lanzamiento", subtitulo: "Muy pronto" },
        { titulo: "En preparación", subtitulo: "Muy pronto" },
      ],
    },
  }),
  // ── Tanda 2 · fidelidad demo-dreamy (F12) ──
  packs_precio: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: packsPrecioProps,
    defaultProps: {
      titulo: "Elige tu pack",
      items: [
        { titulo: "1 libro", precio: 3000, detalle: "1 participación", ctaTexto: "Comprar", ctaAncla: "catalogo" },
        { titulo: "Pack 4 libros", precio: 10000, detalle: "4 participaciones", destacado: true, badge: "Más elegido", ctaTexto: "Comprar", ctaAncla: "catalogo" },
      ],
    },
  }),
  momento_ticket: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: momentoTicketProps,
    defaultProps: {
      titulo: "¡Estás dentro!",
      etiqueta: "Tu número de sorteo:",
      codigoEjemplo: "ARMY-04821",
      ctaTexto: "Compartir y sumar más chances",
      ctaAncla: "catalogo",
    },
  }),
  // ── Tanda 2 · fidelidad editorial (F15) ──
  producto_spotlight: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: productoSpotlightProps,
    defaultProps: {
      titulo: "El objeto del deseo",
      autoria: "por la autora",
      ctaTexto: "Quiero este",
      ctaAncla: "catalogo",
    },
  }),
  // ── Tanda 3 · fila con slots tipados (F08/D13) ──
  fila: definirWidget({
    categoria: "seccion",
    v: 1,
    propsSchema: filaProps,
    // Nace con 2 columnas VACÍAS (50/50): el Organizador las puebla desde la galería filtrada (F09).
    defaultProps: { reparto: "50_50", columnas: [[], []] },
  }),
} as const;

export type WidgetTipo = keyof typeof WIDGET_REGISTRY;

/**
 * Categorías de UI del catálogo de widgets (catálogo-v2 F11, WidgetGallery): agrupan los widgets en
 * tabs del picker. `todos` NO vive acá (es la meta-tab que no filtra); solo estas 5 son valores
 * almacenados en `WIDGET_META.categoria`. Enum cerrado ⇒ un widget nuevo debe elegir una (compila).
 */
export const CATEGORIAS_WIDGET = [
  "contenido",
  "sorteo",
  "social",
  "medios",
  "estructura",
] as const;
export type CategoriaWidgetUI = (typeof CATEGORIAS_WIDGET)[number];

/** Etiquetas humanas de las categorías + la meta-tab "todos" (para los tabs de la galería, F11). */
export const CATEGORIAS_WIDGET_LABEL: Record<CategoriaWidgetUI | "todos", string> = {
  todos: "Todos",
  contenido: "Contenido",
  sorteo: "Sorteo",
  social: "Social",
  medios: "Medios",
  estructura: "Estructura",
};

/**
 * Metadata de DISPLAY del catálogo (catálogo-v2 F09/F10/D8; +`categoria` en F11): título + descripción
 * de una línea + categoría de UI por widget, para el picker (WidgetGallery), sus tabs y la lista de
 * secciones del editor visual. Client-safe (puro, sin React). El `Record<WidgetTipo, …>` OBLIGA en
 * compile-time a describir cada widget del registro (un widget nuevo sin metadata/categoria no compila).
 * Es la fuente única de los nombres legibles (el editor NUNCA muestra el `tipo` snake_case crudo).
 */
export const WIDGET_META: Record<
  WidgetTipo,
  { titulo: string; descripcion: string; categoria: CategoriaWidgetUI }
> = {
  hero: { titulo: "Encabezado (hero)", descripcion: "El titular grande de arriba con imagen y botón.", categoria: "contenido" },
  catalogo: { titulo: "Catálogo", descripcion: "La grilla de tus productos a la venta.", categoria: "contenido" },
  sorteo_vitrina: { titulo: "Vitrina del sorteo", descripcion: "Muestra el premio y las bases del sorteo activo.", categoria: "sorteo" },
  como_funciona: { titulo: "Cómo funciona", descripcion: "Los pasos: comprar, recibir, participar.", categoria: "contenido" },
  contador_tickets: { titulo: "Contador de tickets", descripcion: "El total de tickets vendidos del sorteo.", categoria: "sorteo" },
  urgencia_countdown: { titulo: "Cuenta regresiva", descripcion: "El tiempo que queda para el cierre del sorteo.", categoria: "sorteo" },
  testimonios: { titulo: "Testimonios", descripcion: "Reseñas de tus compradores.", categoria: "social" },
  ganadores: { titulo: "Ganadores", descripcion: "Los ganadores de sorteos anteriores (a mano o automático).", categoria: "sorteo" },
  faq: { titulo: "Preguntas frecuentes", descripcion: "Un acordeón de dudas comunes.", categoria: "contenido" },
  video: { titulo: "Video", descripcion: "Un video de YouTube, TikTok o Instagram.", categoria: "medios" },
  embed_social: { titulo: "Post social", descripcion: "Un post o perfil de TikTok/Instagram embebido.", categoria: "medios" },
  beneficios_grid: { titulo: "Beneficios", descripcion: "Una grilla de ventajas con íconos.", categoria: "contenido" },
  texto_rico: { titulo: "Texto", descripcion: "Un bloque de texto con subtítulos, párrafos, citas y listas.", categoria: "contenido" },
  imagen_destacada: { titulo: "Imagen", descripcion: "Una imagen grande con pie de foto opcional.", categoria: "medios" },
  separador: { titulo: "Separador", descripcion: "Una línea o motivo decorativo entre secciones.", categoria: "estructura" },
  espaciador: { titulo: "Espacio", descripcion: "Un espacio vacío para dar aire.", categoria: "estructura" },
  banner_cta: { titulo: "Banda de acción", descripcion: "Una banda ancha con un botón destacado.", categoria: "contenido" },
  estadisticas: { titulo: "Estadísticas", descripcion: "Cifras grandes con animación de conteo.", categoria: "social" },
  botones_sociales: { titulo: "Redes sociales", descripcion: "Botones para seguirte en tus redes.", categoria: "social" },
  logos_confianza: { titulo: "Logos / aliados", descripcion: "Una banda de logos de aliados o medios.", categoria: "social" },
  bloque_ticket_promo: { titulo: "Compra = participas", descripcion: "Explica que cada compra suma tickets al sorteo.", categoria: "sorteo" },
  meta_progreso_sorteo: { titulo: "Meta del sorteo", descripcion: "Una barra de progreso hacia tu meta de tickets.", categoria: "sorteo" },
  garantias_sorteo: { titulo: "Transparencia del sorteo", descripcion: "Cómo eliges al ganador (genera confianza).", categoria: "sorteo" },
  compartir_sorteo: { titulo: "Compartir", descripcion: "Botones para difundir tu tienda por WhatsApp, etc.", categoria: "sorteo" },
  galeria: { titulo: "Galería", descripcion: "Varias imágenes en grilla, mosaico o carrusel.", categoria: "medios" },
  cinta_texto: { titulo: "Cinta de texto", descripcion: "Una cinta con frases que se desplazan (tipo ticker).", categoria: "estructura" },
  perfil_autora: { titulo: "Perfil / sobre mí", descripcion: "Tu foto, nombre, bio y redes — un bloque editorial.", categoria: "contenido" },
  vitrina_proximamente: { titulo: "Próximamente", descripcion: "Una grilla de lanzamientos futuros bloqueados, con candado y estado.", categoria: "contenido" },
  packs_precio: { titulo: "Packs de precio", descripcion: "Tarjetas de precio con una opción destacada (más elegido).", categoria: "sorteo" },
  momento_ticket: { titulo: "Tu número de sorteo", descripcion: "La tarjeta aspiracional '¡Estás dentro!' con un número de ejemplo.", categoria: "sorteo" },
  producto_spotlight: { titulo: "Producto destacado", descripcion: "Destaca un producto con su portada, descripción y precio.", categoria: "contenido" },
  fila: { titulo: "Fila / columnas", descripcion: "Coloca 2 o 3 elementos lado a lado; en el celular se apilan.", categoria: "estructura" },
  whatsapp_flotante: { titulo: "WhatsApp flotante", descripcion: "Un botón flotante de WhatsApp (overlay).", categoria: "social" },
  aviso_barra: { titulo: "Barra de aviso", descripcion: "Una barra de aviso arriba de todo (overlay).", categoria: "estructura" },
};

/** Todos los tipos de sección del registro (categoria === 'seccion'). */
export const TIPOS_SECCION = (
  Object.keys(WIDGET_REGISTRY) as WidgetTipo[]
).filter((t) => WIDGET_REGISTRY[t].categoria === "seccion");

/** Todos los tipos de overlay del registro (categoria === 'overlay'). Vacío hasta F10. */
export const TIPOS_OVERLAY = (
  Object.keys(WIDGET_REGISTRY) as WidgetTipo[]
).filter((t) => WIDGET_REGISTRY[t].categoria === "overlay");
