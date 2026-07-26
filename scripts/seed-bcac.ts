import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

import { documentoInicial } from "~/lib/pagebuilder/factory";
import { PageDocumentSchema } from "~/lib/pagebuilder/schema";
import { aplicarMutacionPagina } from "~/server/domain/pagebuilder/aplicarMutacionPagina";
import { publicarPagina } from "~/server/domain/pagebuilder/publicarPagina";

/**
 * Réplica del 2º mockup del cliente (`C:/Users/NicolásChaima/Downloads/tienda-libro.html` — estética
 * "holographic idol card") en una tienda NUEVA `bcac`. Seed de OPERADOR IDEMPOTENTE (builder-tanda-1
 * F14): crea/actualiza el Tenant + la membresía del dueño + el Producto + el Sorteo ACTIVO + la Página
 * de tienda, y publica el documento por los MISMOS use cases del editor (`apply_page` + `publicarPagina`;
 * NUNCA escribe el jsonb a mano). Réplica 100% con las capacidades EXISTENTES de la tanda — no toca código.
 *
 * SIN FlowCredential a propósito: la tienda no vende todavía. El storefront degrada limpio (el home NO
 * consulta credenciales); SOLO el checkout exige una (`crearFlowServiceDeTenant` ⇒ DomainError INVALID
 * si alguien intenta pagar). No se arregla acá — es el estado esperado de una tienda pre-venta.
 *
 * Fidelidad de color (el signature del mockup es la TARJETA HOLOGRÁFICA violeta): `colorPrimario` = VIOLETA
 * (#b983ff) gobierna el borde holo + los CTAs + el destacado; `colorAcento` = DORADO (#e8c468) alimenta los
 * esquemas `acento*`, el `tituloAcento` estilo "acento" (la palabra "Enriquecer" en dorado) Y el EYEBROW
 * (Tanda 2 F04 `eyebrowEstilo:"acento"` — el eyebrow dorado del mockup, ya desacoplado del violeta de marca).
 * Tipografía `energia` (Space Grotesk display + Inter) = el par más fiel al display del mockup.
 *
 * Tanda 2 (fidelidad al techo) sobre F14: la HOLOCARD ahora vive DENTRO del hero split (visual `tarjeta`
 * holo — F02, ya no una `imagen_destacada` full-width 864×1150 apilada); "Un libro a la vez" usa el widget
 * DEDICADO `vitrina_proximamente` (F01, con candados + estado, ya no `beneficios_grid`); el shell lleva
 * STAGE-LIGHTS violeta (`ambiente:"focos_marca"` — F05); espaciado fino por `padTop`/`padBottom` (F06).
 *
 * IDEMPOTENTE: find-or-create por slug/título/(tenant,ACTIVO); re-correrlo re-aplica el mismo documento
 * (la version del borrador sube, el publicado queda equivalente). Tolerante si el User dueño aún no inició
 * sesión (la membresía se omite con aviso; el storefront funciona igual). `SOLO_VALIDAR=1` ⇒ valida el
 * documento sin tocar la DB. Uso: `tsx scripts/seed-bcac.ts` (o `SOLO_VALIDAR=1 tsx scripts/seed-bcac.ts`).
 */

const SLUG = "bcac";
const NOMBRE = "BCAC · Ediciones";
const OWNER_EMAIL = "nikochaima72@gmail.com";

const COLOR_VIOLETA = "#b983ff"; // MARCA (primario): borde holo + CTA + destacado + botones + stage-lights
const COLOR_DORADO = "#e8c468"; // ACENTO: esquemas acento* + tituloAcento + EYEBROW (eyebrowEstilo:acento)

const PRODUCTO_TITULO = "Cómo Enriquecer a tu Artista Favorito";
const PRODUCTO_DESC =
  "Una guía real sobre cómo tu apoyo financiero llega —o no— a quien admiras. Cada copia que compras suma un número al sorteo de entradas al recital del 14 de octubre.";

const nid = () => randomUUID();

// ── El Documento de Página (réplica del mockup con widgets existentes) ─────────────────────────
// Orden del mockup: hero (+tarjeta holo) → vitrina "Un libro a la vez" (próximos bloqueados) →
// "Cada compra suma números" (mecánica + pricing) → comprar → sorteo → bases legales.
const doc = {
  schemaVersion: 1,
  root: {
    props: {
      modo: "oscuro", // fondo casi negro del mockup (#0b0b14)
      radio: "l", // tarjetas/botones redondeados (radius ~18px del mockup)
      vibe: "suave",
      tipografia: "energia", // Space Grotesk (display) + Inter — el par más fiel al mockup
      anchoContenido: "contenido",
      fondoPagina: "tinta", // gray-9 en modo oscuro ≈ el near-black del mockup
      ambiente: "focos_marca", // Tanda 2 F05: stage-lights violeta (los gradientes radiales del mockup)
    },
  },
  secciones: [
    // ── HERO SPLIT: texto izquierda + HOLOCARD (tarjeta-placeholder holo) derecha — el hero 2-col del
    //    mockup (Tanda 2 F02: la holocard vive DENTRO del hero split, compacta, ya no full-width). El
    //    eyebrow va DORADO (F04 eyebrowEstilo:"acento"); "Enriquecer" dorado; $3.000 destacado; 2 CTAs. ──
    {
      id: nid(),
      tipo: "hero",
      v: 3,
      props: {
        variante: "split",
        eyebrow: "A la venta ahora · Edición única",
        eyebrowEstilo: "acento", // Tanda 2 F04: eyebrow DORADO (acento), desacoplado del violeta de marca
        // Fidelidad al mockup: el h1 es BLANCO ENTERO (sin palabra en dorado) y el hero NO lleva precio
        // (el $3.000 vive recién en la sección de pricing "Elige cómo participar", como en tienda-libro).
        titulo: {
          children: [{ t: "Cómo Enriquecer a tu Artista Favorito" }],
        },
        subtitulo: {
          children: [
            { t: "Una guía real sobre cómo tu apoyo financiero llega —o no— a quien admiras. Cada copia que compras suma un número al sorteo de entradas al recital del 14 de octubre." },
          ],
        },
        ctaTexto: "Comprar y participar",
        ctaAncla: "catalogo",
        ctaSecundario: { texto: "Ver bases del sorteo", ancla: "bases" },
        ctaSecundarioEstilo: "boton", // botón fantasma (variant default)
        mostrarConfianza: false, // el mockup no tiene trust badges
        mostrarBadgeSorteo: false, // el eyebrow reemplaza al badge
        efectoTitulo: "ninguno", // el título del mockup es estático
        // Tanda 2 F02: la HOLOCARD del mockup como visual del split — tarjeta-placeholder SIN imagen,
        // con título/ícono dentro del marco holo (borde iridiscente violeta + tilt 3D). Compacta por ser
        // la columna derecha del split (cierra el GAP de la holocard 864×1150 sobredimensionada de F14).
        visual: {
          tipo: "tarjeta",
          titulo: "Cómo Enriquecer a tu Artista Favorito",
          subtitulo: "PDF descargable · ES / EN",
          icono: "microfono", // 🎤 con glow (el mic-icon del mockup)
          holo: true,
          estilo: "cristal", // interior OSCURO radial + scanlines + borde iridiscente arcoíris (idol card)
        },
      },
      // Composición fina (F06): sin `altoMin:pantalla` (evita el void del full-viewport que dejó F14);
      // padTop amplio pegado a la cinta, padBottom medio para acercar la vitrina siguiente.
      estilo: { padTop: "xl", padBottom: "m", entrada: "aparecer" },
    },
    // ── VITRINA "Un libro a la vez": 4 próximos lanzamientos BLOQUEADOS (widget dedicado Tanda 2 F01) ──
    {
      id: nid(),
      tipo: "vitrina_proximamente",
      v: 1,
      props: {
        titulo: "Un libro a la vez",
        columnas: 4,
        estilo: "ficha", // fichas compactas OSCURAS (candado + estado mono), no covers 3:4 rellenos
        items: [
          { titulo: "I. Claude", subtitulo: "Próximamente" },
          { titulo: "Rezado", subtitulo: "Próximamente" },
          { titulo: "Patrón de Rechazo", subtitulo: "Próximamente" },
          { titulo: "OilLoop", subtitulo: "Próximamente" },
        ],
        notaPie: "Publicamos un título por temporada. El próximo se anuncia al cerrar el sorteo.",
      },
      estilo: { padTop: "m", padBottom: "xl", entrada: "subir" },
      nav: { incluir: true, etiqueta: "Próximos" },
    },
    // ── "Cada compra suma números": mecánica del sorteo (bloque_ticket_promo) ──
    {
      id: nid(),
      tipo: "bloque_ticket_promo",
      v: 1,
      props: {
        titulo: "Cada compra suma números",
        descripcion:
          "Sorteo con notario y bolillero físico. Bases completas más abajo.",
        // Fidelidad al mockup: la sección "Mecánica del sorteo" es MINIMAL (eyebrow + h2 + lead a la
        // izquierda), SIN las 3 cards de proceso ni CTA ni badge — el pricing va directo debajo.
        mostrarMecanica: false,
        mostrarSorteoActivo: false,
        alineacion: "izquierda",
      },
      // Kicker dorado "MECÁNICA DEL SORTEO" (el eyebrow mono del mockup) + padBottom chico para pegar el pricing.
      estilo: {
        kicker: { texto: "Mecánica del sorteo", estilo: "acento" },
        padTop: "xl",
        padBottom: "s",
        entrada: "aparecer",
      },
      nav: { incluir: true, etiqueta: "Sorteo" },
    },
    // ── PRICING: los 2 tiers del mockup ($3.000 = 1 número / $10.000 = 4 números). Widget dedicado
    //    `packs_precio` variante `ficha`: price-cards VERTICALES oscuras con badge mono ①/④ + precio en
    //    IBM Plex Mono; la 2ª es FEATURED (borde dorado + tinte). GAP de dominio: "pack de tickets". ──
    {
      id: nid(),
      tipo: "packs_precio",
      v: 1,
      props: {
        // Sin título: el pricing va DIRECTO bajo "Cada compra suma números" (el mockup no tiene 2º heading).
        variante: "ficha",
        items: [
          { titulo: "1 copia", precio: 3000, badge: "① número", detalle: "1 copia del libro (PDF)" },
          {
            titulo: "Pack de 4",
            precio: 10000,
            badge: "④ números",
            detalle: "Pack de 4 copias — más chances, mismo libro",
            destacado: true,
          },
        ],
      },
      estilo: { padTop: "s", padBottom: "xl", entrada: "subir" },
    },
    // ── COMPRAR (catálogo real — el producto de la tienda) ──
    {
      id: nid(),
      tipo: "catalogo",
      v: 1,
      props: { titulo: "Compra el libro", modo: "todos", columnas: 2 },
      estilo: { padY: "xl", entrada: "aparecer" },
      nav: { incluir: true, etiqueta: "Comprar" },
    },
    // ── SORTEO: vitrina del Raffle ACTIVO (premio + countdown) sobre banda holográfica violeta→negro ──
    {
      id: nid(),
      tipo: "sorteo_vitrina",
      v: 1,
      props: { mostrarBases: true, estiloConteo: "destacado" },
      estilo: {
        fondo: { tipo: "bicolor", colorA: "marca_profundo", colorB: "tinta", direccion: "diagonal", mezcla: "suave" },
        padY: "xl",
        entrada: "aparecer",
      },
    },
    // ── BASES: ya NO van como sección inline (ADR-0008). Viven como PDF/enlace FIJO en el navbar
    //    (`chromeJson.header.basesPdf`, abajo). El item "Bases" del nav lo agrega el chrome, no una sección.
  ],
  // SIN overlay de cinta/ticker (fidelidad al mockup — bajar el "techo de chrome"): el original de
  // tienda-libro NO tiene cinta marquee; su nav es marca + pill "D-— para el sorteo". El pill D-day lo
  // aporta el `CountdownChip` del topbar (independiente, alimentado por el sorteo ACTIVO server-side),
  // así que quitar el overlay deja el nav limpio como el mockup SIN perder el countdown.
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
  console.log(
    `Documento VÁLIDO ✓ (secciones: ${parsed.data.secciones.length}, overlays: ${parsed.data.overlays.length})`,
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
    // 2) Tenant `bcac` — find-or-create por slug (idempotente); branding VIOLETA+DORADO, PUBLICADA.
    let tenant = await db.tenant.findUnique({ where: { slug: SLUG } });
    const tenantCreado = tenant === null;
    if (!tenant) {
      tenant = await db.tenant.create({
        data: { slug: SLUG, nombre: NOMBRE, estado: "PUBLICADA" },
      });
    }
    await db.tenant.update({
      where: { id: tenant.id },
      data: {
        nombre: NOMBRE,
        estado: "PUBLICADA", // solo PUBLICADA resuelve storefront (S9)
        colorPrimario: COLOR_VIOLETA,
        colorAcento: COLOR_DORADO,
        descripcion:
          "Ediciones digitales de BCAC. Cada compra participa en un sorteo promocional con notario.",
        contactoEmail: OWNER_EMAIL,
        // Bases del sorteo como enlace FIJO del navbar (ADR-0008): placeholder inerte `ancla:"bases"`
        // (no hay sección #bases ⇒ no navega) hasta cargar el PDF, cuando se cambia a `{tipo:"url", url}`.
        // `fondo:"pagina"` = el header se funde con el fondo de la página (en vez del body neutro).
        chromeJson: { header: { fondo: "pagina", basesPdf: { tipo: "ancla", ancla: "bases" } } },
      },
    });

    // 3) Membresía del dueño — idempotente. Tolerante si el User aún no inició sesión (el adapter de
    //    NextAuth crea el User al primer login; no lo inventamos acá). El storefront funciona igual.
    const user = await db.user.findUnique({ where: { email: OWNER_EMAIL } });
    let membresia: "creada" | "existía" | "sin-user (login pendiente)";
    if (user) {
      const existe = await db.tenantMembership.findUnique({
        where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
        select: { id: true },
      });
      if (!existe) {
        await db.tenantMembership.create({ data: { userId: user.id, tenantId: tenant.id } });
      }
      membresia = existe ? "existía" : "creada";
    } else {
      membresia = "sin-user (login pendiente)";
    }

    // 4) Producto — idempotente por (tenantId, título). PDF pendiente (null), opt-in al sorteo.
    const prodExistente = await db.product.findFirst({
      where: { tenantId: tenant.id, titulo: PRODUCTO_TITULO },
      select: { id: true },
    });
    const productoCreado = prodExistente === null;
    if (!prodExistente) {
      await db.product.create({
        data: {
          tenantId: tenant.id,
          titulo: PRODUCTO_TITULO,
          descripcion: PRODUCTO_DESC,
          precio: "3000", // Decimal, IVA incluido
          pdfPath: null, // PDF pendiente
          participaEnSorteo: true, // cada compra genera un ticket (ADR-0012)
          activo: true,
        },
      });
    } else {
      await db.product.update({
        where: { id: prodExistente.id },
        data: { descripcion: PRODUCTO_DESC, precio: "3000", participaEnSorteo: true, activo: true },
      });
    }

    // 5) Sorteo ACTIVO — idempotente por (tenantId, estado=ACTIVO): a lo sumo uno (S5).
    const raffleExistente = await db.raffle.findFirst({
      where: { tenantId: tenant.id, estado: "ACTIVO" },
      select: { id: true },
    });
    const raffleCreado = raffleExistente === null;
    const datosRaffle = {
      nombre: "Sorteo entradas recital",
      premio: "Entradas al recital del 14 de octubre",
      fechaInicio: new Date("2026-07-01T00:00:00Z"),
      fechaFin: new Date("2026-08-15T00:00:00Z"),
    };
    if (!raffleExistente) {
      await db.raffle.create({
        data: { tenantId: tenant.id, estado: "ACTIVO", ...datosRaffle },
      });
    } else {
      await db.raffle.update({ where: { id: raffleExistente.id }, data: datosRaffle });
    }

    // 6) StorefrontPage — asegura la fila (create con documentoInicial si falta; jamás pisa un draft
    //    ya editado a mano). Después se sobreescribe con la réplica por apply_page.
    let page = await db.storefrontPage.findUnique({
      where: { tenantId_slug: { tenantId: tenant.id, slug: "home" } },
      select: { version: true },
    });
    if (!page) {
      const seedDoc = documentoInicial({
        heroTitulo: PRODUCTO_TITULO,
        heroSubtitulo: PRODUCTO_DESC,
        heroImageUrl: null,
        avisoTexto: null,
      });
      const creada = await db.storefrontPage.create({
        data: {
          tenantId: tenant.id,
          slug: "home",
          draftJson: seedDoc,
          publishedJson: seedDoc,
          publishedAt: new Date(),
        },
        select: { version: true },
      });
      page = creada;
    }

    // 7) Aplicar la réplica al Borrador (apply_page) + PUBLICAR — los MISMOS use cases del editor.
    const r1 = await aplicarMutacionPagina({
      db,
      tenantId: tenant.id,
      slug: "home",
      mutacion: { accion: "apply_page", documento: parsed.data },
      expectedVersion: page.version,
    });
    const r2 = await publicarPagina({
      db,
      tenantId: tenant.id,
      slug: "home",
      publicadoPor: "operador (réplica tienda-libro bcac F14)",
    });

    console.log(
      `${tenantCreado ? "✓ creado " : "= existía"} tenant "${SLUG}" (${tenant.id}) — ` +
        `membresía:${membresia} producto:${productoCreado ? "creado" : "actualizado"} ` +
        `sorteo:${raffleCreado ? "creado" : "actualizado"} ` +
        `borrador→v${r1.version} PUBLICADO revisión ${r2.revision}`,
    );
    console.log(`Verificá en: http://${SLUG}.localhost:3001`);
  } finally {
    await db.$disconnect();
  }
}

// Solo corre como script invocado; importar el núcleo desde un test NO dispara main().
if (process.argv[1]?.includes("seed-bcac")) {
  main().catch((e) => {
    console.error("✗ Falló el seed de bcac:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
