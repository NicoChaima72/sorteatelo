import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

import { documentoInicial } from "~/lib/pagebuilder/factory";
import { PageDocumentSchema, type PageDocument } from "~/lib/pagebuilder/schema";
import { aplicarMutacionPagina } from "~/server/domain/pagebuilder/aplicarMutacionPagina";
import { publicarPagina } from "~/server/domain/pagebuilder/publicarPagina";

/**
 * Seed de OPERADOR: tienda **ISELK Sorteos** (`iselk`) — clon de la demo "borahae dreamy"
 * (`scripts/seed-demos-kpop.ts`, tienda 1) con la marca ISELK y su primer sorteo:
 * **"Entrada para ver a BTS"** (1 entrada; la demo original sorteaba 2 — el copy de la página
 * se ajusta en todas las menciones para no prometer un premio distinto al del Raffle).
 *
 * Mismo patrón IDEMPOTENTE que `seed-bcac.ts`: find-or-create Tenant + membresía del dueño +
 * Productos (el catálogo de ejemplo de la demo — se reemplazan después desde el panel) +
 * Sorteo ACTIVO + Página, publicada por los MISMOS use cases del editor (`apply_page` +
 * `publicarPagina`; NUNCA escribe el jsonb a mano).
 *
 * SIN FlowCredential a propósito (tienda recién configurada, no vende todavía): el storefront
 * degrada limpio; solo el checkout exigiría una. Se conecta Flow después desde el panel.
 *
 * `SOLO_VALIDAR=1` ⇒ valida el documento sin tocar la DB.
 * Uso: `tsx scripts/seed-iselk.ts`
 */

const SLUG = "iselk";
const NOMBRE = "ISELK Sorteos";
const OWNER_EMAIL = "nikochaima72@gmail.com";

// Paleta dreamy/borahae (fidelidad al clon): violeta primario + rosa acento.
const COLOR_PRIMARIO = "#7c3aed";
const COLOR_ACENTO = "#ec4899";

const nid = () => randomUUID();

// ── El libro REAL de ISELK (título exacto del acta notarial; el PDF se sube después) ────────────
// La tienda vende UN solo producto. Los 4 títulos de relleno heredados de la demo borahae se
// DESACTIVAN (no se borran: podría haber referencias) y el principal se renombra al título del acta.
// Título definitivo (usuario 2026-07-26): "tu idol favorito". OJO: el acta notarial dice
// "¿Cómo enriquecer a tu idol?" a secas — alinear el acta antes de notariarla.
const LIBRO_TITULO = "¿Cómo enriquecer a tu idol favorito?";
const LIBRO_DESC =
  "Una guía real, con humor y corazón, sobre cómo tu apoyo llega —o no— a quien admiras. Cada copia que compras suma un número al sorteo.";
/** Títulos de versiones anteriores de este seed (se renombran al definitivo si existen). */
const LIBRO_TITULO_ANTERIOR = "¿Cómo enriquecer a tu idol?";
/** Relleno de la demo borahae: se ELIMINAN si existen (decisión del usuario 2026-07-26 — la tienda
 *  nunca vendió, así que no hay OrderItem/Entitlement que los referencie; ISELK vende un solo libro). */
const DEMO_TITULOS = [
  "Cartas a los 7",
  "Mi era favorita",
  "Diario de una ARMY",
  "Borahae: ensayos de fandom",
];

// Honestidad (espejo del copy de la landing): el comprador NO ve su número — el correo lleva la
// descarga y la inscripción al sorteo es automática. Nada de prometer "tu número llega al correo".
const PASOS = [
  { icono: "compra" as const, titulo: "Compras el libro", desc: "Pagas $3.000 con tarjeta, transferencia, MACH o Servipag. Sin crear cuenta." },
  { icono: "descarga" as const, titulo: "Recibes tu PDF al instante", desc: "Tu libro llega a tu correo con un enlace privado, apenas se confirma el pago." },
  { icono: "ticket" as const, titulo: "Entras al sorteo", desc: "Tu compra queda inscrita automáticamente, con su número correlativo. Sin planillas ni cuadernos." },
];

// Alineadas al ACTA notarial: notificación dentro de 24 h del sorteo y 24 h corridas para aceptar
// (numeral 9); si no hay respuesta, sorteo sustituto (numeral 8). Nunca "30 días".
const FAQS = [
  { pregunta: "¿Cómo recibo el libro?", respuesta: "Por correo, apenas se confirma tu pago, con un enlace privado de descarga. Si vence, pides uno nuevo con un clic." },
  { pregunta: "¿Cómo sé que entré al sorteo?", respuesta: "Tu compra entra automáticamente apenas se confirma el pago — no tienes que hacer nada más. En la tienda se ve el total de participaciones al día." },
  { pregunta: "¿Qué pasa si gano?", respuesta: "Te contactamos por correo dentro de las 24 horas siguientes al sorteo, y tienes 24 horas para confirmar que aceptas el premio. Si no respondes, se realiza un sorteo sustituto, como establecen las bases." },
];

const CONFIANZA_METODO =
  "El sorteo es notarial y se transmite en vivo por Instagram. Cada compra pagada queda inscrita automáticamente con su número correlativo, y todo queda respaldado en las bases y el acta.";

const REDES: { red: "instagram" | "tiktok" | "whatsapp"; url: string }[] = [
  { red: "instagram", url: "https://www.instagram.com/iselk.sorteos/" },
  { red: "tiktok", url: "https://www.tiktok.com/@iselk.sorteos" },
  { red: "whatsapp", url: "https://wa.me/56900000000" },
];

// ── El Documento de Página: clon del doc "dreamy" de seed-demos-kpop, premio en singular ────────
const doc = {
  schemaVersion: 1,
  root: {
    props: {
      modo: "claro",
      radio: "l",
      vibe: "suave",
      tipografia: "dulce",
      anchoContenido: "contenido",
      fondoPagina: "marca_suave",
      ambiente: "ninguno",
    },
  },
  secciones: [
    // ── HERO SPLIT: texto + holocard suave (heart) a la derecha ──
    {
      id: nid(),
      tipo: "hero",
      v: 3,
      props: {
        variante: "split",
        eyebrow: "Sorteo abierto 💜",
        eyebrowEstilo: "acento",
        titulo: {
          children: [
            { t: "Compra el libro. Anda a ver a " },
            { t: "BTS", m: ["marca"] },
            { t: "." },
          ],
        },
        subtitulo: {
          children: [
            // Fechas/recinto del ACTA: vigencia hasta el 18/09/2026 y "Santiago" a secas (la fecha del
            // recital aún es placeholder en el acta) — nada de "Estadio Nacional · oct" sin respaldo.
            { t: "Cada libro que compras ($3.000) te inscribe automáticamente en el sorteo de 1 entrada para ver a BTS en Santiago. Participas hasta el 18 de septiembre 2026." },
          ],
        },
        destacado: { texto: "$3.000", nota: "1 libro (PDF) · +1 número para el sorteo" },
        ctaTexto: "Quiero participar",
        ctaAncla: "catalogo",
        ctaSecundario: { texto: "Ver el libro", ancla: "catalogo" },
        ctaSecundarioEstilo: "enlace",
        mostrarConfianza: true,
        mostrarBadgeSorteo: false,
        efectoTitulo: "ninguno",
        // Foto compuesta (póster del tour + boleto ARMY dibujado, `tmp/compose/componer.mjs`) subida
        // al bucket público en la key `keyHeroTenant` (branding/hero). `holo: true` = marco
        // iridiscente animado + tilt (MarcoHolo). La URL lleva su cache-buster ?v= (re-subir la
        // imagen sobre la misma key exige refrescar este ?v= y re-publicar).
        visual: {
          tipo: "imagen",
          url: "https://pub-1bf9038e0d7445fd8ca6d17952e30459.r2.dev/cms1zomt40000nkk27yi4e7ca/branding/hero?v=1785091962118",
          holo: true,
        },
      },
      estilo: { padTop: "xl", padBottom: "m", entrada: "aparecer" },
    },
    // ── COUNTDOWN REAL al cierre (reemplaza las stats "Cifras de ejemplo" de la demo: ISELK es una
    //    tienda real y no muestra participación inventada — honestidad, espejo de la landing I9). El
    //    widget lee el sorteo ACTIVO server-side y se auto-oculta si venció. ──
    //    `estiloVisual: "tarjeta"` (builder-countdown-presencia F03/D8): la piloto estrena la variante
    //    con presencia — badge + premio del sorteo + reloj con segundos + CTA grande. Es el propósito de
    //    la tanda y es reversible en un click desde el editor. `intensidad` queda como está: en `tarjeta`
    //    no significa nada (D7), pero conserva la elección por si vuelve a `clasico`.
    {
      id: nid(),
      tipo: "urgencia_countdown",
      v: 1,
      props: {
        mensaje: "El sorteo cierra el 18 de septiembre",
        ctaTexto: "Quiero participar",
        ctaAncla: "catalogo",
        intensidad: "suave",
        estiloVisual: "tarjeta",
      },
      estilo: { padTop: "s", padBottom: "l", entrada: "subir" },
    },
    // ── EL LIBRO (un solo producto ⇒ grilla de 2 col, no el carrusel de 5 de la demo) ──
    {
      id: nid(),
      tipo: "catalogo",
      v: 1,
      props: {
        titulo: "Compra el libro y participa",
        modo: "todos",
        columnas: 2,
      },
      estilo: { padY: "xl", entrada: "aparecer", kicker: { texto: "El libro", estilo: "acento" } },
      nav: { incluir: true, etiqueta: "El libro" },
    },
    // ── PACKS — las 3 opciones reales de compra: 1, 2 o 4 copias (4x $10.000) ──
    {
      id: nid(),
      tipo: "packs_precio",
      v: 1,
      props: {
        titulo: "Más copias, más chances",
        items: [
          { titulo: "1 libro", precio: 3000, detalle: "1 participación", ctaTexto: "Comprar", ctaAncla: "catalogo" },
          { titulo: "2 libros", precio: 6000, detalle: "2 participaciones", ctaTexto: "Comprar", ctaAncla: "catalogo" },
          { titulo: "Pack 4 libros", precio: 10000, detalle: "4 participaciones", destacado: true, badge: "Más conveniente", ctaTexto: "Comprar", ctaAncla: "catalogo" },
        ],
      },
      estilo: { padY: "l", entrada: "subir", kicker: { texto: "Elige tu pack", estilo: "acento" } },
    },
    // ── CÓMO FUNCIONA ──
    {
      id: nid(),
      tipo: "como_funciona",
      v: 1,
      // `estiloTarjeta: "dreamy"` = el paso del prototipo (card translúcida + círculo primario numerado a
      // la izquierda). El `layout` queda en su default `tarjetas`, que es sobre el que dreamy aplica.
      props: { titulo: "Comprar es participar", estiloTarjeta: "dreamy", pasos: PASOS },
      estilo: { padY: "xl", entrada: "aparecer", kicker: { texto: "En 3 pasos", estilo: "acento" } },
      nav: { incluir: true, etiqueta: "Cómo funciona" },
    },
    // ── EL PREMIO — banner compacto (banda promocional dreamy) ──
    {
      id: nid(),
      tipo: "banner_cta",
      v: 1,
      props: {
        titulo: "Entrada para ver a BTS 💜",
        subtitulo: "Recital en Santiago · Participas hasta el 18 de septiembre 2026",
        ctaTexto: "Participar ahora",
        ctaAncla: "catalogo",
      },
      estilo: {
        fondo: { tipo: "bicolor", colorA: "marca_profundo", colorB: "marca", direccion: "diagonal", mezcla: "suave" },
        anchoFondo: "contenido",
        padY: "l",
        entrada: "aparecer",
        kicker: { texto: "El premio", estilo: "acento" },
      },
      nav: { incluir: true, etiqueta: "El sorteo" },
    },
    // ── ¡ESTÁS DENTRO! (tarjeta aspiracional del número de sorteo) ──
    {
      id: nid(),
      tipo: "momento_ticket",
      v: 1,
      props: {
        titulo: "¡Estás dentro! 💜",
        etiqueta: "Tu número de sorteo:",
        codigoEjemplo: "ARMY-04821",
        // Sin CTA: "Compartir y sumar más chances" era FALSO (compartir no suma números — solo
        // comprar). Honestidad, espejo de la landing I9.
        nota: "Número de ejemplo — recibes el tuyo al comprar.",
      },
      estilo: { padTop: "s", padBottom: "l", entrada: "subir", kicker: { texto: "Apenas compras", estilo: "acento" } },
    },
    // ── CONFIANZA ──
    {
      id: nid(),
      tipo: "garantias_sorteo",
      v: 1,
      props: {
        titulo: "Sorteo 100% transparente",
        estiloVisual: "dreamy", // cards translúcidas con ring blanco + ícono en círculo suave
        metodo: CONFIANZA_METODO,
        items: [
          { icono: "verificado", titulo: "Sorteo ante notario", desc: "El número ganador se determina mediante sorteo notarial, transmitido en vivo por Instagram." },
          { icono: "escudo", titulo: "Cada ganadora con su número", desc: "Mostramos el ticket ganador. Nada de cajas negras." },
        ],
      },
      estilo: { padY: "l", entrada: "subir", kicker: { texto: "Confianza", estilo: "acento" } },
    },
    // ── FAQ ──
    {
      id: nid(),
      tipo: "faq",
      v: 1,
      // `estiloVisual: "dreamy"` = items translúcidos + toggle `＋` primario que rota 45° al abrir.
      props: { titulo: "Preguntas frecuentes", estiloVisual: "dreamy", items: FAQS },
      estilo: { padY: "xl", entrada: "aparecer", kicker: { texto: "Dudas", estilo: "acento" } },
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
  overlays: [],
};

async function main() {
  // 1) Validar el documento ANTES de tocar la DB (feedback inmediato sin conexión).
  const parsed = PageDocumentSchema.safeParse(doc);
  if (!parsed.success) {
    console.error("DOC INVÁLIDO:");
    console.error(JSON.stringify(parsed.error.issues.slice(0, 12), null, 2));
    process.exit(1);
  }
  const documento: PageDocument = parsed.data;
  console.log(
    `Documento VÁLIDO ✓ (secciones: ${documento.secciones.length}, overlays: ${documento.overlays.length})`,
  );

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
    // 2) Tenant `iselk` — find-or-create por slug (idempotente); branding dreamy, PUBLICADA.
    let tenant = await db.tenant.findUnique({ where: { slug: SLUG } });
    const tenantCreado = tenant === null;
    if (!tenant) {
      tenant = await db.tenant.create({ data: { slug: SLUG, nombre: NOMBRE, estado: "PUBLICADA" } });
    }
    await db.tenant.update({
      where: { id: tenant.id },
      data: {
        nombre: NOMBRE,
        estado: "PUBLICADA", // solo PUBLICADA resuelve storefront
        colorPrimario: COLOR_PRIMARIO,
        colorAcento: COLOR_ACENTO,
        descripcion: "ISELK Sorteos — libros digitales ARMY; cada compra participa en el sorteo de una entrada para ver a BTS.",
        contactoEmail: OWNER_EMAIL,
        instagramUrl: REDES[0]!.url,
        tiktokUrl: REDES[1]!.url,
        whatsappUrl: REDES[2]!.url,
        // Chrome (Tanda 3 F06): el header se FUNDE con el lila `marca_suave` del tema (fondo
        // "pagina" — sin el vidrio blanco default que cortaba feo contra la página) + el enlace
        // fijo "Bases" (ADR-0008): `ancla:"bases"` normaliza a la ruta /bases (visor del PDF).
        chromeJson: {
          header: { fondo: "pagina", basesPdf: { tipo: "ancla", ancla: "bases" } },
        },
      },
    });

    // 3) Membresía del dueño — idempotente, tolerante si el User aún no inició sesión.
    const user = await db.user.findUnique({ where: { email: OWNER_EMAIL } });
    let membresia: string;
    if (user) {
      const existe = await db.tenantMembership.findUnique({
        where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
        select: { id: true },
      });
      if (!existe) await db.tenantMembership.create({ data: { userId: user.id, tenantId: tenant.id } });
      membresia = existe ? "existía" : "creada";
    } else {
      membresia = "sin-user (login pendiente)";
    }

    // 4) Producto ÚNICO — el libro del acta. Migración desde el seed anterior: si existe el título
    //    viejo se RENOMBRA (misma fila ⇒ conserva portada/archivos si ya se cargaron); el relleno de
    //    la demo borahae se DESACTIVA (no se borra: una orden podría referenciarlo algún día).
    let creados = 0;
    const existente =
      (await db.product.findFirst({
        where: { tenantId: tenant.id, titulo: LIBRO_TITULO },
        select: { id: true },
      })) ??
      (await db.product.findFirst({
        where: { tenantId: tenant.id, titulo: LIBRO_TITULO_ANTERIOR },
        select: { id: true },
      }));
    if (!existente) {
      await db.product.create({
        data: {
          tenantId: tenant.id,
          titulo: LIBRO_TITULO,
          descripcion: LIBRO_DESC,
          precio: "3000", // Decimal, IVA incluido
          pdfPath: null, // PDF pendiente (se sube desde el panel)
          participaEnSorteo: true, // cada compra suma un número (ADR-0012)
          activo: true,
        },
      });
      creados++;
    } else {
      await db.product.update({
        where: { id: existente.id },
        data: {
          titulo: LIBRO_TITULO,
          descripcion: LIBRO_DESC,
          precio: "3000",
          participaEnSorteo: true,
          activo: true,
        },
      });
    }
    const eliminados = await db.product.deleteMany({
      where: { tenantId: tenant.id, titulo: { in: DEMO_TITULOS } },
    });

    // 5) Sorteo ACTIVO "Entrada para ver a BTS" — idempotente por (tenantId, estado=ACTIVO).
    const raffleExistente = await db.raffle.findFirst({
      where: { tenantId: tenant.id, estado: "ACTIVO" },
      select: { id: true },
    });
    const raffleCreado = raffleExistente === null;
    // Fechas del ACTA notarial (numerales 3 y 7): vigencia 27/07/2026 → 18/09/2026, sorteo final a
    // las 20:00 hora de Chile continental (≈ 23:00 UTC). El recinto queda fuera del premio (el acta
    // solo dice "Santiago"; la fecha del recital aún es placeholder).
    const datosRaffle = {
      nombre: "Entrada para ver a BTS",
      premio: "1 entrada para ver a BTS · Santiago",
      fechaInicio: new Date("2026-07-27T00:00:00Z"),
      fechaFin: new Date("2026-09-18T23:00:00Z"), // 18/09/2026 20:00 Chile — cierre según el acta
    };
    if (!raffleExistente) {
      await db.raffle.create({ data: { tenantId: tenant.id, estado: "ACTIVO", ...datosRaffle } });
    } else {
      await db.raffle.update({ where: { id: raffleExistente.id }, data: datosRaffle });
    }

    // 6) StorefrontPage — asegura la fila (create con documentoInicial si falta; jamás pisa un draft).
    let page = await db.storefrontPage.findUnique({
      where: { tenantId_slug: { tenantId: tenant.id, slug: "home" } },
      select: { version: true },
    });
    if (!page) {
      const seedDoc = documentoInicial({
        heroTitulo: "Compra el libro. Anda a ver a BTS.",
        heroSubtitulo:
          "Cada libro que compras ($3.000) te inscribe automáticamente en el sorteo de 1 entrada para ver a BTS en Santiago.",
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

    // 7) Aplicar el clon al Borrador (apply_page) + PUBLICAR — los MISMOS use cases del editor.
    const r1 = await aplicarMutacionPagina({
      db,
      tenantId: tenant.id,
      slug: "home",
      mutacion: { accion: "apply_page", documento },
      expectedVersion: page.version,
    });
    const r2 = await publicarPagina({
      db,
      tenantId: tenant.id,
      slug: "home",
      publicadoPor: "operador (seed iselk — clon borahae dreamy)",
    });

    console.log(
      `${tenantCreado ? "✓ creado " : "= existía"} tenant "${SLUG}" (${tenant.id}) — ` +
        `membresía:${membresia} productos:${creados} nuevos, ${eliminados.count} demo eliminados ` +
        `sorteo:${raffleCreado ? "creado" : "actualizado"} ` +
        `borrador→v${r1.version} PUBLICADO revisión ${r2.revision}`,
    );
    console.log(`Verificá en: http://${SLUG}.localhost:3001`);
  } finally {
    await db.$disconnect();
  }
}

// Solo corre como script invocado; importar el núcleo desde un test NO dispara main().
if (process.argv[1]?.includes("seed-iselk")) {
  main().catch((e) => {
    console.error("✗ Falló el seed de iselk:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
