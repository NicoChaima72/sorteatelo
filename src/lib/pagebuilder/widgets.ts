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

/** Anclas de navegación internas permitidas para los CTA (enum cerrado). */
export const CTA_ANCLAS = ["catalogo", "sorteo"] as const;

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

/** Esquemas de fondo emparejados (fondo + texto legible). `tema` = transparente = DEFAULT. */
export const ESQUEMAS_FONDO = [
  "tema", // transparente, hereda el fondo de página (DEFAULT)
  "superficie", // blanco / (dark) tinta — texto tinta
  "superficie_alt", // banda gris (gray-1) — texto tinta
  "marca_suave", // marca-0/1 — texto tinta
  "marca", // marca-6 filled — texto claro (autoContrast)
  "marca_profundo", // marca-8 — texto claro
  "tinta", // gray-9 — texto claro
] as const;
export type EsquemaFondo = (typeof ESQUEMAS_FONDO)[number];

/** Gradientes preset (`marca_vivo` = el `gradienteTematico` actual). */
export const GRADIENTES = ["marca_suave", "marca_vivo", "tinta", "papel"] as const;

/** Overlay sobre un fondo de imagen (para garantizar contraste del texto encima). */
export const OVERLAY_IMAGEN = ["ninguno", "tinta", "marca", "claro"] as const;

/** Posición del fondo de imagen (object-position acotado, no CSS libre). */
export const POSICION_IMAGEN = ["centro", "arriba", "abajo", "izq", "der"] as const;

/** Patrones decorativos (motivo talonario = `perforacion`). */
export const PATRONES = ["ninguno", "puntos", "grilla", "diagonales", "perforacion"] as const;

/** Espaciado vertical de la sección (0 / md / xl / 48 / 80px). */
export const ESPACIADO_V = ["ninguno", "s", "m", "l", "xl"] as const;

/** Ancho del contenido de la sección (Container lg / xl / full-bleed). */
export const ANCHO_SECCION = ["contenido", "ancho", "completo"] as const;

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
 * Subconjunto de `FORMAS_DIVISOR` que el render REALMENTE dibuja hoy (catálogo-v2 F02: onda/diagonal/
 * curva; `triangulo`/`perforacion` son [pro] y degradan a nada). El SELECTOR del editor (F10) ofrece
 * SOLO estas para no mostrar opciones mudas que se guardan pero nunca aparecen. Debe seguir a
 * `PATHS_DIVISOR` en `src/components/storefront/seccion-wrapper.tsx` — si se agrega un path allá, sumar
 * la forma acá. El schema (`FORMAS_DIVISOR`) conserva las [pro] para forward-compat (un doc con
 * triangulo valida y degrada, I-H).
 */
export const FORMAS_DIVISOR_DIBUJADAS = [
  "ninguno",
  "onda",
  "diagonal",
  "curva",
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
    ancho: z.enum(ANCHO_SECCION).default("contenido"),
    entrada: z.enum(PRESETS_ENTRADA).default("heredar"), // F03
    divisorInferior: z
      .object({
        forma: z.enum(FORMAS_DIVISOR).default("ninguno"),
        altura: z.enum(ALTURA_DIVISOR).default("m"),
        invertir: z.boolean().default(false),
      })
      .strict()
      .optional(),
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

/** Ancho de contenido por defecto que heredan las secciones. */
export const ANCHO_CONTENIDO = ["contenido", "ancho"] as const;

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
 * `hero` (semilla, v2 en catálogo-v2 F05). `titulo`/`subtitulo`/`imagenUrl` son OVERRIDES opcionales
 * — sin ellos el render cae al `nombre`/`descripcion`/gradiente del Tenant (degradación elegante,
 * resueltos server-side; NO se copian al documento, I2/I11). El badge "Sorteo abierto" y los badges
 * de confianza los decide el render (dato del sorteo server-side).
 *
 * v2 (aditivo, migrate-on-read trivial): `variante` (default `split` = look v1), `overlayOscuridad`
 * (para la variante `imagen_fondo`) y `ctaSecundario` opcional (2º CTA, p.ej. "Ver bases"). Todo con
 * default/optional ⇒ un hero v1 parsea y conserva su aspecto (I-H).
 */
export const heroProps = z
  .object({
    titulo: z.string().min(1).max(120).optional(),
    subtitulo: z.string().min(1).max(300).optional(),
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
 * `como_funciona` (semilla): pasos de conversión. Sin `pasos` ⇒ el render usa los 3 pasos FIJOS de
 * plataforma (copy actual). `icono` es un enum cerrado (nunca string libre); textos con límite.
 */
export const comoFuncionaProps = z
  .object({
    titulo: z.string().min(1).max(80).default("Cómo funciona"),
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
 * `aviso_barra` (overlay, F10): barra de aviso arriba de todo. Migra el `avisoTexto` del chrome (R1).
 * Sin `texto` ⇒ oculto. `descartable` permite cerrarla. Texto plano (nunca HTML, I3).
 */
export const avisoBarraProps = z
  .object({
    texto: z.string().min(1).max(120),
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
 * Bloque de `texto_rico` (discriminated-union por `tipo`, NUNCA HTML — I3). Cada bloque es texto
 * plano con límite; `lista` es un array de strings acotado. `.strict()` en cada rama ⇒ un bloque con
 * campo extra o un `tipo` desconocido no parsea.
 */
export const BloqueTextoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("subtitulo"), texto: z.string().min(1).max(120) }).strict(),
  z.object({ tipo: z.literal("parrafo"), texto: z.string().min(1).max(2000) }).strict(),
  z
    .object({
      tipo: z.literal("cita"),
      texto: z.string().min(1).max(500),
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
 * `texto_rico` (sección, F04): cuerpo editorial estructurado por bloques tipados (subtítulo/párrafo/
 * cita/lista) — NO HTML (elegido sobre markdown por seguridad, síntesis §2). `ancho` acota la columna
 * de lectura.
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
 * `imagen_destacada` (sección, F04): una imagen grande con `alt` (obligatorio, accesibilidad),
 * `caption` y enlace opcionales. `imagenUrl` = `urlPublica` (bucket, ADR-0013). URL rota ⇒ el
 * componente degrada a un placeholder tematizado (I-G).
 */
export const imagenDestacadaProps = z
  .object({
    imagenUrl: urlPublica,
    alt: z.string().min(1).max(200),
    caption: z.string().min(1).max(200).optional(),
    ancho: z.enum(["contenido", "completo"]).default("contenido"),
    ratio: z.enum(RATIOS_IMAGEN).default("natural"),
    enlaceUrl: z.string().url().max(2048).optional(),
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
 * `estadisticas` (sección, F05): fila 2–4 de cifras grandes con count-up. `valor` es ENTERO (no
 * string — el count-up parsea confiable, síntesis §2 dedup); `prefijo`/`sufijo` acotados ("+", "★",
 * "%"). `etiqueta` describe la cifra. Los números son NARRADOS por el Organizador (no datos
 * server-side garantizados — §5): esta pieza es prueba social editorial, no el conteo real del sorteo
 * (ese es `contador_tickets`/`meta_progreso_sorteo`).
 */
export const estadisticasProps = z
  .object({
    titulo: z.string().min(1).max(80).optional(),
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
    v: 2, // catálogo-v2 F05: +variante/+ctaSecundario/+overlayOscuridad (migrate-on-read v1→v2)
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
    v: 1,
    propsSchema: avisoBarraProps,
    defaultProps: { texto: "Novedad", descartable: false },
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
    v: 1,
    propsSchema: textoRicoProps,
    defaultProps: {
      bloques: [
        { tipo: "subtitulo", texto: "Sobre esta tienda" },
        { tipo: "parrafo", texto: "Escribe aquí tu historia, cómo funciona tu tienda o lo que quieras contar a quien te visita." },
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
} as const;

export type WidgetTipo = keyof typeof WIDGET_REGISTRY;

/**
 * Metadata de DISPLAY del catálogo (catálogo-v2 F09/F10/D8): título + descripción de una línea por
 * widget, para el picker y la lista de secciones del editor visual. Client-safe (puro, sin React). El
 * `Record<WidgetTipo, …>` OBLIGA en compile-time a describir cada widget del registro (un widget nuevo
 * sin metadata no compila). Es la fuente única de los nombres legibles (el editor NUNCA muestra el
 * `tipo` snake_case crudo).
 */
export const WIDGET_META: Record<WidgetTipo, { titulo: string; descripcion: string }> = {
  hero: { titulo: "Encabezado (hero)", descripcion: "El titular grande de arriba con imagen y botón." },
  catalogo: { titulo: "Catálogo", descripcion: "La grilla de tus productos a la venta." },
  sorteo_vitrina: { titulo: "Vitrina del sorteo", descripcion: "Muestra el premio y las bases del sorteo activo." },
  como_funciona: { titulo: "Cómo funciona", descripcion: "Los pasos: comprar, recibir, participar." },
  contador_tickets: { titulo: "Contador de tickets", descripcion: "El total de tickets vendidos del sorteo." },
  urgencia_countdown: { titulo: "Cuenta regresiva", descripcion: "El tiempo que queda para el cierre del sorteo." },
  testimonios: { titulo: "Testimonios", descripcion: "Reseñas de tus compradores." },
  ganadores: { titulo: "Ganadores", descripcion: "Los ganadores de sorteos anteriores (a mano o automático)." },
  faq: { titulo: "Preguntas frecuentes", descripcion: "Un acordeón de dudas comunes." },
  video: { titulo: "Video", descripcion: "Un video de YouTube, TikTok o Instagram." },
  embed_social: { titulo: "Post social", descripcion: "Un post o perfil de TikTok/Instagram embebido." },
  beneficios_grid: { titulo: "Beneficios", descripcion: "Una grilla de ventajas con íconos." },
  texto_rico: { titulo: "Texto", descripcion: "Un bloque de texto con subtítulos, párrafos, citas y listas." },
  imagen_destacada: { titulo: "Imagen", descripcion: "Una imagen grande con pie de foto opcional." },
  separador: { titulo: "Separador", descripcion: "Una línea o motivo decorativo entre secciones." },
  espaciador: { titulo: "Espacio", descripcion: "Un espacio vacío para dar aire." },
  banner_cta: { titulo: "Banda de acción", descripcion: "Una banda ancha con un botón destacado." },
  estadisticas: { titulo: "Estadísticas", descripcion: "Cifras grandes con animación de conteo." },
  botones_sociales: { titulo: "Redes sociales", descripcion: "Botones para seguirte en tus redes." },
  logos_confianza: { titulo: "Logos / aliados", descripcion: "Una banda de logos de aliados o medios." },
  bloque_ticket_promo: { titulo: "Compra = participas", descripcion: "Explica que cada compra suma tickets al sorteo." },
  meta_progreso_sorteo: { titulo: "Meta del sorteo", descripcion: "Una barra de progreso hacia tu meta de tickets." },
  garantias_sorteo: { titulo: "Transparencia del sorteo", descripcion: "Cómo eliges al ganador (genera confianza)." },
  compartir_sorteo: { titulo: "Compartir", descripcion: "Botones para difundir tu tienda por WhatsApp, etc." },
  galeria: { titulo: "Galería", descripcion: "Varias imágenes en grilla, mosaico o carrusel." },
  whatsapp_flotante: { titulo: "WhatsApp flotante", descripcion: "Un botón flotante de WhatsApp (overlay)." },
  aviso_barra: { titulo: "Barra de aviso", descripcion: "Una barra de aviso arriba de todo (overlay)." },
};

/** Todos los tipos de sección del registro (categoria === 'seccion'). */
export const TIPOS_SECCION = (
  Object.keys(WIDGET_REGISTRY) as WidgetTipo[]
).filter((t) => WIDGET_REGISTRY[t].categoria === "seccion");

/** Todos los tipos de overlay del registro (categoria === 'overlay'). Vacío hasta F10. */
export const TIPOS_OVERLAY = (
  Object.keys(WIDGET_REGISTRY) as WidgetTipo[]
).filter((t) => WIDGET_REGISTRY[t].categoria === "overlay");
