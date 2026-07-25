import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

import { documentoInicial } from "~/lib/pagebuilder/factory";
import { PageDocumentSchema, type PageDocument } from "~/lib/pagebuilder/schema";
import { aplicarMutacionPagina } from "~/server/domain/pagebuilder/aplicarMutacionPagina";
import { publicarPagina } from "~/server/domain/pagebuilder/publicarPagina";

/**
 * Seed de OPERADOR: **3 tiendas demo K-pop** que recrean los 3 prototipos originales del proyecto
 * (`tmp/v-dreamy.tsx`, `tmp/v-concert.tsx`, `tmp/v-editorial.tsx`) sobre el MISMO motor page-builder
 * (arsenal tanda 1+2). La gracia: mismo motor, 3 mundos visualmente distintos. Un solo script
 * IDEMPOTENTE (patrón `scripts/seed-bcac.ts`): find-or-create Tenant + membresía del dueño + Productos
 * (el LIBRO + el catálogo de ejemplo del mock) + Sorteo ACTIVO + Página, y publica el documento por
 * los MISMOS use cases del editor (`apply_page` + `publicarPagina`; NUNCA escribe el jsonb a mano).
 *
 * SIN FlowCredential a propósito (tiendas de demo, no venden): el storefront degrada limpio; solo el
 * checkout exigiría una. NO toca los tenants reales (`autora`/`prueba`/`bcac`) — crea 3 slugs nuevos:
 *   - `demo-dreamy`     → "Dreamy / Borahae": clara, lila tierna, pastel, redondeada (par `dulce`).
 *   - `demo-noche`      → "Concert Night": oscura, neón magenta/violeta, poster (par `impacto`).
 *   - `demo-editorial`  → "Editorial Boutique": marfil, serif refinada, cuadrada (par `clasica`).
 *
 * Colores por FIDELIDAD leídos de los Tailwind de cada prototipo (los hex exactos):
 *   dreamy   → primario violeta `#7c3aed` + acento rosa `#ec4899`.
 *   concert  → primario violeta neón `#a855f7` + acento magenta `#d946ef`.
 *   editorial→ primario violeta tinta `#6d28d9` + acento tinta `#1a1625`.
 *
 * Copy REAL de `tmp/v-mock.ts` (LIBRO/PREMIO/PACKS/STATS/PASOS/FAQS/CATALOGO), no lorem. Idempotente:
 * re-correrlo re-aplica el mismo documento (la version del borrador sube, el publicado queda
 * equivalente). `SOLO_VALIDAR=1` ⇒ valida los 3 documentos sin tocar la DB.
 * Uso: `tsx scripts/seed-demos-kpop.ts` (o `SOLO_VALIDAR=1 tsx scripts/seed-demos-kpop.ts`).
 */

const OWNER_EMAIL = "nikochaima72@gmail.com";
const nid = () => randomUUID();

// ── Datos de EJEMPLO compartidos (copia fiel de `tmp/v-mock.ts` — no se importa desde tmp/) ─────────
const LIBRO_DESC =
  "La guía con humor y corazón para apoyar a tu bias sin fundirte el sueldo: ahorro real, merch inteligente y cómo llegar a verlos en vivo.";

/** Catálogo de ejemplo del mock (5 libros, todos $3.000). El item 0 es el LIBRO principal. */
const CATALOGO: { titulo: string; descripcion: string }[] = [
  { titulo: "Cómo enriquecer a tu idol favorito", descripcion: LIBRO_DESC },
  { titulo: "Cartas a los 7", descripcion: "Cartas íntimas a los siete. Un diario de fandom hecho libro digital." },
  { titulo: "Mi era favorita", descripcion: "Un recorrido por las eras que marcaron a toda una generación ARMY." },
  { titulo: "Diario de una ARMY", descripcion: "Las páginas de una fan: conciertos, ahorros y borahae." },
  { titulo: "Borahae: ensayos de fandom", descripcion: "Ensayos sobre pertenecer, amar y sostener a un fandom." },
];

/** Los 3 pasos del mock (PASOS), copy REAL. */
const PASOS = [
  { icono: "compra" as const, titulo: "Compras el libro", desc: "Pagas $3.000 con tarjeta, transferencia, MACH o Servipag. Sin crear cuenta." },
  { icono: "descarga" as const, titulo: "Recibes todo al instante", desc: "Tu PDF y tu número de sorteo llegan a tu correo apenas se confirma el pago." },
  { icono: "ticket" as const, titulo: "Entras al sorteo", desc: "El sorteo es EN VIVO por Instagram, con testigos y acta. Transparente de punta a punta." },
];

/** Las 3 FAQs del mock (FAQS), copy REAL. */
const FAQS = [
  { pregunta: "¿Cómo recibo el libro?", respuesta: "Por correo, apenas se confirma tu pago, con un enlace privado de descarga. Si vence, pides uno nuevo con un clic." },
  { pregunta: "¿Cómo sé que entré al sorteo?", respuesta: "Cada compra te da un número de sorteo único, que ves al instante y queda en tu correo. Puedes verificarlo cuando quieras." },
  { pregunta: "¿Qué pasa si gano?", respuesta: "Te contactamos por correo y redes. Tienes 30 días para coordinar la entrega de tus 2 entradas. Todo queda en acta firmada." },
];

/** Copy de confianza REAL de los prototipos (Camila R. ARMY-01337). */
const CONFIANZA_METODO =
  "El sorteo es en vivo por Instagram, con testigos y acta firmada. Mostramos a cada ganadora con su número. Nada de cajas negras.";

/** Redes del footer (los enlaces de ejemplo de los prototipos). */
const REDES: { red: "instagram" | "tiktok" | "whatsapp"; url: string }[] = [
  { red: "instagram", url: "https://instagram.com/borahae.demo" },
  { red: "tiktok", url: "https://tiktok.com/@borahae.demo" },
  { red: "whatsapp", url: "https://wa.me/56900000000" },
];

// ── Especificación de una tienda demo ───────────────────────────────────────────────────────────
interface SpecTienda {
  slug: string;
  nombre: string;
  descripcion: string;
  colorPrimario: string;
  colorAcento: string;
  heroTitulo: string;
  heroSubtitulo: string;
  doc: unknown; // se valida con PageDocumentSchema antes de tocar la DB
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// TIENDA 1 — "Dreamy / Borahae": clara, lila tierna, pastel, redondeada (par `dulce`, ambiente aurora)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const docDreamy = {
  schemaVersion: 1,
  root: {
    props: {
      modo: "claro",
      radio: "l", // muy redondeado (rounded-2xl / rounded-[28px] del prototipo)
      vibe: "suave",
      tipografia: "dulce", // Poppins + Nunito Sans — redondeado merch/kpop
      anchoContenido: "contenido",
      fondoPagina: "marca_suave", // lila palísimo (primary-0) ≈ el #f6f4fb del prototipo (NO saturado)
      ambiente: "ninguno", // F12: el original NO tiene aurora; sobre fondo claro daba el lila saturado del bug
    },
  },
  secciones: [
    // ── HERO SPLIT: texto + holocard suave (heart) a la derecha ──
    {
      id: nid(),
      tipo: "hero",
      v: 2,
      props: {
        variante: "split",
        eyebrow: "Sorteo abierto 💜",
        eyebrowEstilo: "acento", // kicker ROSA (el #ec4899 del prototipo)
        titulo: "Compra el libro. Anda a ver a BTS.",
        tituloAcento: { palabra: "BTS", estilo: "marca" }, // F13: "BTS." en violeta PRIMARIO (no rosa), como el original
        subtitulo:
          "Cada libro que compras ($3.000) te inscribe automáticamente en el sorteo de 2 entradas para BTS en el Estadio Nacional · oct 2026.",
        destacado: { texto: "$3.000", nota: "1 libro (PDF) · +1 número para el sorteo" },
        ctaTexto: "Quiero participar",
        ctaAncla: "catalogo",
        ctaSecundario: { texto: "Ver los libros", ancla: "catalogo" },
        ctaSecundarioEstilo: "enlace",
        mostrarConfianza: true,
        mostrarBadgeSorteo: false,
        efectoTitulo: "ninguno",
        visual: {
          tipo: "tarjeta",
          titulo: "2 entradas para BTS 💜",
          subtitulo: "Estadio Nacional · Octubre 2026",
          icono: "corazon",
          holo: false, // dreamy = suave, sin holo neón
          estilo: "suave", // F12: glassy — gradiente + blur-blobs del heroviz del prototipo
          motivo: "tickets", // F13: 2 mini-tickets flotantes (el heroviz del prototipo tenía corazón + 2 tickets)
        },
      },
      estilo: { padTop: "xl", padBottom: "m", entrada: "aparecer" },
    },
    // ── STATS (los 3 STATS del mock) ──
    {
      id: nid(),
      tipo: "estadisticas",
      v: 1,
      props: {
        estiloVisual: "tarjetas_suaves", // F12: tarjetas blancas con sombra suave (el `cards` NO envolvía en tarjeta)
        items: [
          { valor: 2480, prefijo: "+", etiqueta: "participando", icono: "ticket" },
          { valor: 12, etiqueta: "días para el cierre", icono: "reloj" },
          { valor: 2, etiqueta: "entradas · el premio", icono: "corazon" },
        ],
      },
      estilo: { padTop: "s", padBottom: "l", entrada: "subir" },
    },
    // ── CATÁLOGO de libros (el carrusel de 5 del prototipo) ──
    {
      id: nid(),
      tipo: "catalogo",
      v: 1,
      props: { titulo: "Elige tu libro (y tu chance)", modo: "todos", columnas: 3, layout: "carrusel" }, // F13: carrusel horizontal como el prototipo
      estilo: { padY: "xl", entrada: "aparecer" },
      nav: { incluir: true, etiqueta: "Libros" },
    },
    // ── PACKS (F12): tarjetas de precio reales del prototipo (1 libro / pack 4 libros destacado) ──
    {
      id: nid(),
      tipo: "packs_precio",
      v: 1,
      props: {
        titulo: "Más libros, más chances",
        items: [
          { titulo: "1 libro", precio: 3000, detalle: "1 participación", ctaTexto: "Comprar", ctaAncla: "catalogo" },
          { titulo: "Pack 4 libros", precio: 10000, detalle: "4 participaciones", destacado: true, badge: "Más elegido", ctaTexto: "Comprar", ctaAncla: "catalogo" },
        ],
      },
      estilo: { padY: "l", entrada: "subir" },
    },
    // ── CÓMO FUNCIONA (los 3 PASOS del mock) ──
    {
      id: nid(),
      tipo: "como_funciona",
      v: 1,
      props: { titulo: "Comprar es participar", pasos: PASOS },
      estilo: { padY: "xl", entrada: "aparecer" },
      nav: { incluir: true, etiqueta: "Cómo funciona" },
    },
    // ── EL PREMIO (sorteo activo) — banner COMPACTO (F12: anchoFondo contenido + contraste legible) ──
    {
      id: nid(),
      tipo: "sorteo_vitrina",
      v: 1,
      props: { mostrarBases: true, estiloConteo: "destacado" },
      estilo: {
        fondo: { tipo: "bicolor", colorA: "marca_profundo", colorB: "marca", direccion: "diagonal", mezcla: "suave" },
        anchoFondo: "contenido", // F12: card contenida (no full-bleed) = el banner compacto del prototipo
        padY: "l",
        entrada: "aparecer",
      },
      nav: { incluir: true, etiqueta: "El sorteo" },
    },
    // ── ¡ESTÁS DENTRO! (F12): la tarjeta aspiracional del número de sorteo (ARMY-04821) ──
    {
      id: nid(),
      tipo: "momento_ticket",
      v: 1,
      props: {
        titulo: "¡Estás dentro! 💜",
        etiqueta: "Tu número de sorteo:",
        codigoEjemplo: "ARMY-04821",
        ctaTexto: "Compartir y sumar más chances",
        ctaAncla: "catalogo",
        nota: "Número de ejemplo — recibes el tuyo al comprar.",
      },
      estilo: { padTop: "s", padBottom: "l", entrada: "subir" },
    },
    // ── CONFIANZA (sorteo 100% transparente) ──
    {
      id: nid(),
      tipo: "garantias_sorteo",
      v: 1,
      props: {
        titulo: "Sorteo 100% transparente",
        metodo: CONFIANZA_METODO,
        items: [
          { icono: "verificado", titulo: "En vivo por Instagram", desc: "Con testigos y acta firmada, a la vista de todas." },
          { icono: "escudo", titulo: "Cada ganadora con su número", desc: "Mostramos el ticket ganador. Nada de cajas negras." },
        ],
      },
      estilo: { padY: "l", entrada: "subir" },
    },
    // ── GANADORA anterior (Camila R.) ──
    {
      id: nid(),
      tipo: "ganadores",
      v: 2,
      props: {
        titulo: "Ya hubo ganadoras",
        fuente: "manual",
        items: [{ nombre: "Camila R.", premio: "Ganó el sorteo anterior · Ticket ARMY-01337", fecha: "entregado en vivo (ejemplo)" }],
      },
      estilo: { padY: "l", entrada: "aparecer" },
    },
    // ── FAQ (las 3 FAQs del mock) ──
    {
      id: nid(),
      tipo: "faq",
      v: 1,
      props: { titulo: "Preguntas frecuentes", items: FAQS },
      estilo: { padY: "xl", entrada: "aparecer" },
      nav: { incluir: true, etiqueta: "Preguntas" },
    },
    // ── FOOTER social (Instagram / TikTok / WhatsApp del prototipo) ──
    {
      id: nid(),
      tipo: "botones_sociales",
      v: 1,
      props: { titulo: "Síguenos", estilo: "relleno", redes: REDES },
      estilo: { padY: "l", entrada: "aparecer" },
    },
  ],
  // F12: el prototipo dreamy NO tiene ticker/cinta bajo el nav (solo el chip del topbar) ⇒ sin overlay.
  overlays: [],
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// TIENDA 2 — "Concert Night": oscura, neón magenta/violeta, poster (par `impacto`, stage-lights aurora)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const docNoche = {
  schemaVersion: 1,
  root: {
    props: {
      modo: "oscuro",
      radio: "m", // rounded-xl del prototipo (más filoso que dreamy)
      vibe: "nitido", // neón, borde marcado
      tipografia: "impacto", // Anton + Roboto — poster/recital en mayúsculas
      anchoContenido: "contenido",
      fondoPagina: "tinta", // near-black (#070310 del prototipo) = gray-9
      ambiente: "aurora", // stage-lights violeta + magenta (los haces de luz del recital)
    },
  },
  secciones: [
    // ── HERO SPLIT: texto + HOLOCARD neón (holo) a la derecha ──
    {
      id: nid(),
      tipo: "hero",
      v: 2,
      props: {
        variante: "split",
        eyebrow: "● Sorteo en vivo abierto",
        eyebrowEstilo: "acento", // kicker MAGENTA (el #d946ef del prototipo)
        titulo: "Compra el libro. Anda a ver a BTS.",
        tituloAcento: { palabra: "BTS", estilo: "gradiente" }, // neón violeta→magenta
        subtitulo:
          "Cada libro que compras ($3.000) te mete al sorteo de 2 entradas para BTS · Estadio Nacional · oct 2026.",
        destacado: { texto: "$3.000", nota: "1 libro (PDF) · +1 número al sorteo" },
        ctaTexto: "Quiero participar",
        ctaAncla: "catalogo",
        ctaSecundario: { texto: "Ver los libros", ancla: "catalogo" },
        ctaSecundarioEstilo: "enlace",
        mostrarConfianza: true,
        mostrarBadgeSorteo: false,
        efectoTitulo: "gradiente_animado", // el título neón animado
        visual: {
          tipo: "tarjeta",
          titulo: "2 entradas para BTS",
          subtitulo: "Estadio Nacional · Octubre 2026",
          icono: "estrella",
          holo: true, // HOLOCARD iridiscente + tilt = el corazón neón del prototipo
        },
      },
      estilo: { padTop: "xl", padBottom: "m", entrada: "aparecer" },
    },
    // ── CINTA NEÓN (ticker de recital) — extra fiel a la energía concert ──
    {
      id: nid(),
      tipo: "cinta_texto",
      v: 1,
      props: {
        mensajes: ["SORTEO EN VIVO", "2 ENTRADAS PARA BTS", "ESTADIO NACIONAL", "COMPRA Y PARTICIPA"],
        separador: "estrella",
        velocidad: "media",
        esquema: "acento", // banda magenta neón
      },
      estilo: { padY: "ninguno", entrada: "ninguna" },
    },
    // ── STATS ──
    {
      id: nid(),
      tipo: "estadisticas",
      v: 1,
      props: {
        estiloVisual: "cards",
        items: [
          { valor: 2480, prefijo: "+", etiqueta: "participando", icono: "ticket" },
          { valor: 12, etiqueta: "días para el cierre", icono: "reloj" },
          { valor: 2, etiqueta: "entradas · el premio", icono: "estrella" },
        ],
      },
      estilo: { padTop: "l", padBottom: "l", entrada: "subir" },
    },
    // ── CATÁLOGO ──
    {
      id: nid(),
      tipo: "catalogo",
      v: 1,
      props: { titulo: "Elige tu libro (y tu chance)", modo: "todos", columnas: 3 },
      estilo: { padY: "xl", entrada: "aparecer" },
      nav: { incluir: true, etiqueta: "Libros" },
    },
    // ── PACKS ──
    {
      id: nid(),
      tipo: "estadisticas",
      v: 1,
      props: {
        titulo: "Más libros, más chances",
        estiloVisual: "cards",
        items: [
          { valor: 3000, prefijo: "$", etiqueta: "1 libro · 1 participación", icono: "ticket" },
          { valor: 10000, prefijo: "$", etiqueta: "Pack 4 libros · 4 participaciones", icono: "regalo" },
        ],
      },
      estilo: { padY: "l", entrada: "subir" },
    },
    // ── CÓMO FUNCIONA ──
    {
      id: nid(),
      tipo: "como_funciona",
      v: 1,
      props: { titulo: "Comprar es participar", pasos: PASOS },
      estilo: { padY: "xl", entrada: "aparecer" },
      nav: { incluir: true, etiqueta: "Cómo funciona" },
    },
    // ── EL PREMIO — banda neón violeta→magenta profunda ──
    {
      id: nid(),
      tipo: "sorteo_vitrina",
      v: 1,
      props: { mostrarBases: true, estiloConteo: "destacado" },
      estilo: {
        fondo: { tipo: "bicolor", colorA: "marca_profundo", colorB: "acento", direccion: "diagonal", mezcla: "suave" },
        padY: "xl",
        entrada: "aparecer",
      },
      nav: { incluir: true, etiqueta: "El sorteo" },
    },
    // ── CONFIANZA ──
    {
      id: nid(),
      tipo: "garantias_sorteo",
      v: 1,
      props: {
        titulo: "Sorteo 100% transparente",
        metodo: CONFIANZA_METODO,
        items: [
          { icono: "verificado", titulo: "En vivo por Instagram", desc: "Con testigos y acta firmada, a la vista de todas." },
          { icono: "escudo", titulo: "Cada ganadora con su número", desc: "Mostramos el ticket ganador. Nada de cajas negras." },
        ],
      },
      estilo: { padY: "l", entrada: "subir" },
    },
    // ── GANADORA anterior ──
    {
      id: nid(),
      tipo: "ganadores",
      v: 2,
      props: {
        titulo: "Ya hubo ganadoras",
        fuente: "manual",
        items: [{ nombre: "Camila R.", premio: "Ganó el sorteo anterior · Ticket ARMY-01337", fecha: "entregado en vivo (ejemplo)" }],
      },
      estilo: { padY: "l", entrada: "aparecer" },
    },
    // ── FAQ ──
    {
      id: nid(),
      tipo: "faq",
      v: 1,
      props: { titulo: "Preguntas frecuentes", items: FAQS },
      estilo: { padY: "xl", entrada: "aparecer" },
      nav: { incluir: true, etiqueta: "Preguntas" },
    },
    // ── FOOTER social ──
    {
      id: nid(),
      tipo: "botones_sociales",
      v: 1,
      props: { titulo: "Síguenos", estilo: "relleno", redes: REDES },
      estilo: { padY: "l", entrada: "aparecer" },
    },
  ],
  overlays: [
    {
      id: nid(),
      tipo: "aviso_barra",
      v: 2,
      props: {
        mensajes: [
          "SORTEO EN VIVO ABIERTO",
          "2 ENTRADAS PARA BTS",
          "ESTADIO NACIONAL · OCTUBRE 2026",
        ],
        modo: "marquee",
        esquema: "tinta", // banda oscura sobre el nav (el tope del prototipo)
        posicion: "sobre_nav",
        mostrarCountdown: true,
      },
    },
  ],
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// TIENDA 3 — "Editorial Boutique": marfil, serif refinada, cuadrada (par `clasica`, patrón papel)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const docEditorial = {
  schemaVersion: 1,
  root: {
    props: {
      modo: "claro",
      radio: "nulo", // botones/cajas CUADRADAS (el rasgo firma del prototipo editorial)
      vibe: "editorial",
      tipografia: "clasica", // Playfair Display + Source Sans 3 — serif refinada boutique
      anchoContenido: "contenido",
      fondoPagina: "superficie", // marfil limpio (aprox. del #faf7f2 — gap: el token no es cálido)
      ambiente: "ninguno", // editorial = plano, sin glows
    },
  },
  secciones: [
    // ── HERO CENTRADO (editorial es una columna, sin visual) ──
    {
      id: nid(),
      tipo: "hero",
      v: 2,
      props: {
        variante: "centrado",
        eyebrow: "Sorteo abierto — edición ARMY",
        eyebrowEstilo: "texto", // kicker taupe/dimmed (el #8a8175 del prototipo, NO el acento)
        titulo: "Compra el libro. Anda a ver a BTS.",
        tituloAcento: { palabra: "BTS", estilo: "marca" }, // BTS violeta tinta (#6d28d9)
        subtitulo:
          "Cada libro que compras ($3.000) te inscribe en el sorteo de 2 entradas para BTS en el Estadio Nacional, octubre 2026.",
        destacado: { texto: "$3.000", nota: "Libro digital · Incluye tu número para el sorteo" },
        ctaTexto: "Quiero participar",
        ctaAncla: "catalogo",
        mostrarConfianza: true,
        mostrarBadgeSorteo: false,
        efectoTitulo: "ninguno", // editorial = estático, refinado
      },
      estilo: { padTop: "l", padBottom: "l", entrada: "aparecer" },
    },
    // ── STATS (fila dividida, cifras serif — estiloVisual simple) ──
    {
      id: nid(),
      tipo: "estadisticas",
      v: 1,
      props: {
        estiloVisual: "simple", // cifras limpias sin tarjetas (la fila dividida del prototipo)
        items: [
          { valor: 2480, prefijo: "+", etiqueta: "participando" },
          { valor: 12, etiqueta: "días para el cierre" },
          { valor: 2, etiqueta: "entradas · el premio" },
        ],
      },
      estilo: { padY: "m", entrada: "aparecer" },
    },
    // ── I · EL LIBRO (el objeto del deseo) — bloque editorial ──
    {
      id: nid(),
      tipo: "texto_rico",
      v: 1,
      props: {
        ancho: "normal",
        bloques: [
          { tipo: "subtitulo", texto: "El objeto del deseo" },
          { tipo: "cita", texto: "«Cómo enriquecer a tu idol favorito»", autor: "por la autora" },
          { tipo: "parrafo", texto: LIBRO_DESC },
        ],
      },
      estilo: { padY: "l", entrada: "subir" },
    },
    // ── EL CATÁLOGO ──
    {
      id: nid(),
      tipo: "catalogo",
      v: 1,
      props: { titulo: "El catálogo", modo: "todos", columnas: 2 },
      estilo: { padY: "l", entrada: "aparecer" },
      nav: { incluir: true, etiqueta: "El catálogo" },
    },
    // ── II · PACKS (fila limpia, cifras serif) ──
    {
      id: nid(),
      tipo: "estadisticas",
      v: 1,
      props: {
        titulo: "Más libros, más chances",
        estiloVisual: "simple",
        items: [
          { valor: 3000, prefijo: "$", etiqueta: "1 libro · 1 participación" },
          { valor: 10000, prefijo: "$", etiqueta: "Pack 4 libros · 4 participaciones" },
        ],
      },
      estilo: { padY: "l", entrada: "subir" },
    },
    // ── III · EL MÉTODO (cómo funciona) — sobre PAPEL CUADRICULADO (patrón papel del arsenal) ──
    {
      id: nid(),
      tipo: "como_funciona",
      v: 1,
      props: { titulo: "Comprar es participar", pasos: PASOS },
      estilo: {
        fondo: { tipo: "patron", patron: "cuadricula_papel", esquema: "superficie_alt" },
        padY: "xl",
        entrada: "aparecer",
      },
      nav: { incluir: true, etiqueta: "El método" },
    },
    // ── EL PREMIO — caja violeta suave (el #f1ecfa del prototipo) ──
    {
      id: nid(),
      tipo: "sorteo_vitrina",
      v: 1,
      props: { mostrarBases: true, estiloConteo: "badge" },
      estilo: {
        fondo: { tipo: "esquema", esquema: "marca_suave" },
        padY: "xl",
        entrada: "aparecer",
      },
    },
    // ── V · CONFIANZA (un sorteo a la vista de todas) ──
    {
      id: nid(),
      tipo: "garantias_sorteo",
      v: 1,
      props: {
        titulo: "Un sorteo a la vista de todas",
        metodo: CONFIANZA_METODO,
        items: [
          { icono: "verificado", titulo: "En vivo por Instagram", desc: "Con testigos y acta firmada. Transparencia, no promesas." },
          { icono: "escudo", titulo: "Cada ganadora con su número", desc: "Camila R. ganó el sorteo anterior · Ticket ARMY-01337." },
        ],
      },
      estilo: { padY: "l", entrada: "subir" },
    },
    // ── VI · FAQ ──
    {
      id: nid(),
      tipo: "faq",
      v: 1,
      props: { titulo: "Preguntas frecuentes", items: FAQS },
      estilo: { padY: "l", entrada: "aparecer" },
      nav: { incluir: true, etiqueta: "Preguntas" },
    },
    // ── FOOTER social ──
    {
      id: nid(),
      tipo: "botones_sociales",
      v: 1,
      props: { titulo: "Síguenos", estilo: "contorno", redes: REDES },
      estilo: { padY: "l", entrada: "aparecer" },
    },
  ],
  overlays: [
    {
      id: nid(),
      tipo: "aviso_barra",
      v: 2,
      props: {
        mensajes: ["Sorteo abierto — edición ARMY"],
        modo: "estatico",
        esquema: "tema", // transparente + borde inferior (el topbar sobrio del prototipo)
        posicion: "bajo_nav",
        mostrarCountdown: true,
      },
    },
  ],
};

// ── Las 3 specs ─────────────────────────────────────────────────────────────────────────────────
const TIENDAS: SpecTienda[] = [
  {
    slug: "demo-dreamy",
    nombre: "borahae",
    descripcion: "Borahae · edición dreamy — libros ARMY con corazón, sorteo de entradas BTS.",
    colorPrimario: "#7c3aed", // violeta dreamy
    colorAcento: "#ec4899", // rosa (kickers, corazones, badges)
    heroTitulo: "Compra el libro. Anda a ver a BTS.",
    heroSubtitulo:
      "Cada libro que compras ($3.000) te inscribe automáticamente en el sorteo de 2 entradas para BTS en el Estadio Nacional · oct 2026.",
    doc: docDreamy,
  },
  {
    slug: "demo-noche",
    nombre: "borahae",
    descripcion: "Borahae · concert night — libros ARMY en clave neón, sorteo de entradas BTS.",
    colorPrimario: "#a855f7", // violeta neón
    colorAcento: "#d946ef", // magenta neón
    heroTitulo: "Compra el libro. Anda a ver a BTS.",
    heroSubtitulo:
      "Cada libro que compras ($3.000) te mete al sorteo de 2 entradas para BTS · Estadio Nacional · oct 2026.",
    doc: docNoche,
  },
  {
    slug: "demo-editorial",
    nombre: "borahae",
    descripcion: "Borahae · editorial boutique — libros ARMY refinados, sorteo de entradas BTS.",
    colorPrimario: "#6d28d9", // violeta tinta editorial
    colorAcento: "#1a1625", // tinta (los elementos ink del prototipo)
    heroTitulo: "Compra el libro. Anda a ver a BTS.",
    heroSubtitulo:
      "Cada libro que compras ($3.000) te inscribe en el sorteo de 2 entradas para BTS en el Estadio Nacional, octubre 2026.",
    doc: docEditorial,
  },
];

// ── Siembra idempotente de UNA tienda (patrón seed-bcac) ──────────────────────────────────────────
async function sembrarTienda(db: PrismaClient, spec: SpecTienda, doc: PageDocument): Promise<string> {
  // 1) Tenant — find-or-create por slug (idempotente); branding + PUBLICADA.
  let tenant = await db.tenant.findUnique({ where: { slug: spec.slug } });
  const tenantCreado = tenant === null;
  if (!tenant) {
    tenant = await db.tenant.create({ data: { slug: spec.slug, nombre: spec.nombre, estado: "PUBLICADA" } });
  }
  await db.tenant.update({
    where: { id: tenant.id },
    data: {
      nombre: spec.nombre,
      estado: "PUBLICADA", // solo PUBLICADA resuelve storefront
      colorPrimario: spec.colorPrimario,
      colorAcento: spec.colorAcento,
      descripcion: spec.descripcion,
      heroTitulo: spec.heroTitulo,
      heroSubtitulo: spec.heroSubtitulo,
      contactoEmail: OWNER_EMAIL,
      instagramUrl: "https://instagram.com/borahae.demo",
      tiktokUrl: "https://tiktok.com/@borahae.demo",
      whatsappUrl: "https://wa.me/56900000000",
    },
  });

  // 2) Membresía del dueño — idempotente, tolerante si el User aún no inició sesión.
  const user = await db.user.findUnique({ where: { email: OWNER_EMAIL } });
  let membresia = "sin-user (login pendiente)";
  if (user) {
    const existe = await db.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      select: { id: true },
    });
    if (!existe) await db.tenantMembership.create({ data: { userId: user.id, tenantId: tenant.id } });
    membresia = existe ? "existía" : "creada";
  }

  // 3) Productos — el LIBRO + el catálogo de ejemplo (5), idempotentes por (tenantId, título).
  //    Todos $3.000, opt-in al sorteo (cada compra suma un número, ADR-0012).
  let creados = 0;
  for (const libro of CATALOGO) {
    const existente = await db.product.findFirst({
      where: { tenantId: tenant.id, titulo: libro.titulo },
      select: { id: true },
    });
    if (!existente) {
      await db.product.create({
        data: {
          tenantId: tenant.id,
          titulo: libro.titulo,
          descripcion: libro.descripcion,
          precio: "3000", // Decimal, IVA incluido
          pdfPath: null, // PDF pendiente (tienda de demo)
          participaEnSorteo: true,
          activo: true,
        },
      });
      creados++;
    } else {
      await db.product.update({
        where: { id: existente.id },
        data: { descripcion: libro.descripcion, precio: "3000", participaEnSorteo: true, activo: true },
      });
    }
  }

  // 4) Sorteo ACTIVO — idempotente por (tenantId, estado=ACTIVO): a lo sumo uno. Premio del mock.
  const raffleExistente = await db.raffle.findFirst({
    where: { tenantId: tenant.id, estado: "ACTIVO" },
    select: { id: true },
  });
  const datosRaffle = {
    nombre: "Sorteo 2 entradas para BTS",
    premio: "2 entradas para BTS · Estadio Nacional · Octubre 2026",
    fechaInicio: new Date("2026-07-01T00:00:00Z"),
    fechaFin: new Date("2026-10-15T00:00:00Z"), // futuro ⇒ el countdown tictaquea
  };
  if (!raffleExistente) {
    await db.raffle.create({ data: { tenantId: tenant.id, estado: "ACTIVO", ...datosRaffle } });
  } else {
    await db.raffle.update({ where: { id: raffleExistente.id }, data: datosRaffle });
  }

  // 5) StorefrontPage — asegura la fila (create con documentoInicial si falta; jamás pisa un draft).
  let page = await db.storefrontPage.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug: "home" } },
    select: { version: true },
  });
  if (!page) {
    const seedDoc = documentoInicial({
      heroTitulo: spec.heroTitulo,
      heroSubtitulo: spec.heroSubtitulo,
      heroImageUrl: null,
      avisoTexto: null,
    });
    page = await db.storefrontPage.create({
      data: {
        tenantId: tenant.id,
        slug: "home",
        draftJson: seedDoc,
        publishedJson: seedDoc,
        publishedAt: new Date(),
      },
      select: { version: true },
    });
  }

  // 6) Aplicar la réplica al Borrador (apply_page) + PUBLICAR — los MISMOS use cases del editor.
  const r1 = await aplicarMutacionPagina({
    db,
    tenantId: tenant.id,
    slug: "home",
    mutacion: { accion: "apply_page", documento: doc },
    expectedVersion: page.version,
  });
  const r2 = await publicarPagina({
    db,
    tenantId: tenant.id,
    slug: "home",
    publicadoPor: `operador (demo k-pop ${spec.slug})`,
  });

  return (
    `${tenantCreado ? "✓ creado " : "= existía"} "${spec.slug}" (${tenant.id}) — ` +
    `membresía:${membresia} productos:${creados} nuevos borrador→v${r1.version} PUBLICADO rev ${r2.revision}`
  );
}

async function main() {
  // 1) Validar los 3 documentos ANTES de tocar la DB (feedback inmediato sin conexión).
  const parseados: PageDocument[] = [];
  for (const spec of TIENDAS) {
    const parsed = PageDocumentSchema.safeParse(spec.doc);
    if (!parsed.success) {
      console.error(`DOC INVÁLIDO (${spec.slug}):`);
      console.error(JSON.stringify(parsed.error.issues.slice(0, 12), null, 2));
      process.exit(1);
    }
    console.log(
      `Documento VÁLIDO ✓ ${spec.slug} (secciones: ${parsed.data.secciones.length}, overlays: ${parsed.data.overlays.length})`,
    );
    parseados.push(parsed.data);
  }

  if (process.env.SOLO_VALIDAR === "1") {
    console.log("SOLO_VALIDAR=1 ⇒ no toco la DB.");
    return;
  }

  // Node 20.6+/24: carga .env sin dependencia externa (mismo patrón que seed-tenants).
  try {
    process.loadEnvFile();
  } catch {
    // .env ausente: seguimos con process.env tal cual.
  }

  const db = new PrismaClient();
  try {
    for (let i = 0; i < TIENDAS.length; i++) {
      const resumen = await sembrarTienda(db, TIENDAS[i]!, parseados[i]!);
      console.log(resumen);
      console.log(`  Verificá en: http://${TIENDAS[i]!.slug}.localhost:3001`);
    }
  } finally {
    await db.$disconnect();
  }
}

// Solo corre como script invocado; importar el núcleo desde un test NO dispara main().
if (process.argv[1]?.includes("seed-demos-kpop")) {
  main().catch((e) => {
    console.error("✗ Falló el seed de demos k-pop:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
