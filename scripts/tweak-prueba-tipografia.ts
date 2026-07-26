import { PrismaClient } from "@prisma/client";

import { parsearDocumento } from "~/lib/pagebuilder/migrate";
import { PageDocumentSchema } from "~/lib/pagebuilder/schema";
import { aplicarMutacionPagina } from "~/server/domain/pagebuilder/aplicarMutacionPagina";
import { publicarPagina } from "~/server/domain/pagebuilder/publicarPagina";

/**
 * Ajuste puntual de fidelidad para la tienda `prueba` (réplica de `landing_idol.html` — el mockup
 * morado/dorado BTS): flip de la tipografía del root a `cartel` (Bebas Neue condensada ALL-CAPS + Space
 * Grotesk), que es la identidad visual del mockup. Toma el documento PUBLICADO actual, cambia SOLO
 * `root.props.tipografia`, y republica por los MISMOS use cases del editor (apply_page + publicar).
 * Idempotente. Uso: `tsx scripts/tweak-prueba-tipografia.ts`.
 */

const SLUG_TENANT = "prueba";

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    // .env ausente: seguimos con process.env
  }

  const db = new PrismaClient();
  try {
    const tenant = await db.tenant.findUnique({ where: { slug: SLUG_TENANT } });
    if (!tenant) throw new Error(`No existe el tenant "${SLUG_TENANT}"`);

    // Colores del tenant (fidelidad landing_idol): el ORO es el color de ACCIÓN (primario: botones, precio,
    // bordes, eyebrows) y el MORADO es la SUPERFICIE (acento: fondo near-black + cards). El morado-mid
    // #2A1560 del mockup alimenta la escala del acento ⇒ `tinta_profunda_acento` ≈ #120828 y cards ≈ #1E0E45.
    await db.tenant.update({
      where: { id: tenant.id },
      data: {
        colorPrimario: "#C9A130",
        colorAcento: "#2A1560",
        // Bases del sorteo como enlace FIJO del navbar (ADR-0008): placeholder inerte hasta cargar el PDF.
        // `fondo:"pagina"` = el header se funde con el fondo morado de la página (en vez del body neutro).
        chromeJson: { header: { fondo: "pagina", basesPdf: { tipo: "ancla", ancla: "bases" } } },
      },
    });

    const page = await db.storefrontPage.findUnique({
      where: { tenantId_slug: { tenantId: tenant.id, slug: "home" } },
      select: { version: true, publishedJson: true, draftJson: true },
    });
    if (!page) throw new Error(`No existe la página home de "${SLUG_TENANT}"`);

    // El borrador es la base editable; si no hay, cae al publicado. `parsearDocumento` MIGRA primero
    // (los bloques legacy `texto`→`rico`, etc.) y luego valida estricto.
    const base = page.draftJson ?? page.publishedJson;
    const parsed = parsearDocumento(base);

    const antes = parsed.root.props.tipografia;

    // Remapeo de iconos de las feature cards al emoji del mockup (Fan economics 📊 / Streaming 💸 /
    // Merch 🎤 / Comunidad 🏦), por coincidencia de título (robusto al orden).
    const ICONO_POR_TITULO: Record<string, string> = {
      "Fan economics real": "grafico",
      "Streaming y ganancias": "dinero",
      "Merch inteligente": "microfono",
      "Comunidad como poder": "banco",
    };

    const secciones = parsed.secciones.map((s) => {
      // HERO: título POSTER (~96px, el gigante del mockup) + altura de escenario (min-height ~pantalla,
      // contenido centrado vertical) — el hero 90vh centrado del landing_idol.
      if (s.tipo === "hero") {
        return {
          ...s,
          props: { ...s.props, tituloTamano: "poster" as const },
          estilo: { ...s.estilo, altoMin: "media" as const, alinearVertical: "centro" as const, padTop: "l" as const, padBottom: "l" as const },
        };
      }
      // "Cómo participar": cards que se FUNDEN con el fondo (transparente + borde), sin el tinte marrón
      // del relleno del body ni las cajas de ícono cálidas.
      if (s.tipo === "como_funciona") {
        return { ...s, props: { ...s.props, estiloTarjeta: "contorno" as const } };
      }
      if (s.tipo === "beneficios_grid") {
        return {
          ...s,
          props: {
            ...s.props,
            estiloItem: "emoji_borde" as const,
            items: s.props.items.map((it) => ({
              ...it,
              icono: (ICONO_POR_TITULO[it.titulo] ?? it.icono) as typeof it.icono,
            })),
          },
        };
      }
      // Sorteo "2 ENTRADAS PARA BTS" como BANNER centrado (el bloque grande del mockup), con el conteo
      // destacado.
      if (s.tipo === "sorteo_vitrina") {
        return {
          ...s,
          props: { ...s.props, variante: "banner" as const, estiloConteo: "destacado" as const },
          // Panel morado PLANO (acento-8 ≈ #1E0E45 del mockup), sin el degradado bicolor previo (el glow
          // dorado a la derecha que el original no tiene).
          estilo: { ...s.estilo, fondo: { tipo: "esquema" as const, esquema: "acento_profundo" as const }, padY: "xl" as const },
        };
      }
      return s;
    })
      // BASES: dejan de ir como sección inline (ADR-0008) — ahora son PDF/enlace FIJO en el navbar
      // (`chromeJson.header.basesPdf`). Se quita el `texto_rico` de "Bases de la promoción".
      .filter((s) => s.tipo !== "texto_rico");

    const doc = {
      ...parsed,
      root: {
        ...parsed.root,
        props: {
          ...parsed.root.props,
          tipografia: "cartel" as const,
          escalaTitulos: "poster" as const,
          // Fondo near-black tintado con el ACENTO (morado) — el #120828 del mockup.
          fondoPagina: "tinta_profunda_acento" as const,
        },
      },
      secciones,
    };
    const revalidado = PageDocumentSchema.parse(doc);

    const r1 = await aplicarMutacionPagina({
      db,
      tenantId: tenant.id,
      slug: "home",
      mutacion: { accion: "apply_page", documento: revalidado },
      expectedVersion: page.version,
    });
    const r2 = await publicarPagina({
      db,
      tenantId: tenant.id,
      slug: "home",
      publicadoPor: "operador (fidelidad prueba: tipografia cartel/Bebas)",
    });

    console.log(
      `tipografia: ${antes} → cartel · borrador→v${r1.version} · PUBLICADO revisión ${r2.revision}`,
    );
    console.log(`Verificá en: http://${SLUG_TENANT}.localhost:3001`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error("✗ Falló el tweak:", e instanceof Error ? e.message : e);
  process.exit(1);
});
