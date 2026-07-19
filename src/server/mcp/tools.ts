import { type PrismaClient } from "@prisma/client";

import { type PageDocument } from "~/lib/pagebuilder/schema";
import {
  ALTURA_DIVISOR,
  ANCHO_CONTENIDO,
  ANCHO_SECCION,
  ESPACIADO_V,
  ESQUEMAS_FONDO,
  FORMAS_DIVISOR,
  GRADIENTES,
  MODO_COLOR,
  OVERLAY_IMAGEN,
  PARES_TIPOGRAFICOS,
  PATRONES,
  POSICION_IMAGEN,
  PRESETS_ENTRADA,
  RADIO_GLOBAL,
  TIPOS_SECCION,
  VIBE,
  WIDGET_REGISTRY,
} from "~/lib/pagebuilder/widgets";
import { DomainError } from "~/server/domain/errors";
import { aplicarMutacionPagina } from "~/server/domain/pagebuilder/aplicarMutacionPagina";
import { getPagina } from "~/server/domain/pagebuilder/getPagina";
import { listarVersiones } from "~/server/domain/pagebuilder/listarVersiones";
import { publicarPagina } from "~/server/domain/pagebuilder/publicarPagina";
import { revertirPagina } from "~/server/domain/pagebuilder/revertirPagina";
import {
  type CualDocumento,
  type MutacionPagina,
} from "~/server/domain/pagebuilder/schemas";

/**
 * Lógica de las tools del Editor MCP (F06/PD5/D10, ADR-0016). CERO lógica propia: cada tool resuelve
 * el `tenantId` desde `storeSlug` SERVER-SIDE (I1 — jamás un `tenantId` crudo del cliente) y delega
 * en los use cases de F04. Testeable sin HTTP (el borde `route.ts` solo cabla mcp-handler + auth).
 *
 * El MCP escribe SOLO el Borrador (I6): `publish_page` es la única acción que toca lo publicado, y es
 * el checkpoint humano del Operador. El MCP no expone efectos fuera del documento (I12).
 */
type DbMcp = Pick<
  PrismaClient,
  "tenant" | "storefrontPage" | "storefrontPageVersion" | "product" | "$transaction"
>;

/** Etiqueta de auditoría del publicador vía MCP (god-mode del Operador, F12). */
const PUBLICADOR_MCP = "operador";

/**
 * Resuelve el `tenantId` desde `storeSlug` (I1). GOD-MODE del Operador: resuelve CUALQUIER tienda por
 * slug sin importar su estado (edita drafts de tiendas no publicadas). `NOT_FOUND` si el slug no existe.
 */
export async function resolverTenantIdPorSlug({
  db,
  storeSlug,
}: {
  db: Pick<PrismaClient, "tenant">;
  storeSlug: string;
}): Promise<string> {
  const t = await db.tenant.findUnique({
    where: { slug: storeSlug },
    select: { id: true },
  });
  if (!t) {
    throw new DomainError("NOT_FOUND", `No existe una tienda con slug "${storeSlug}".`);
  }
  return t.id;
}

/** Outline numerado de las secciones — direcciona las mutaciones del LLM por índice + id. */
export function outlineDe(doc: PageDocument): string {
  if (doc.secciones.length === 0) return "(sin secciones)";
  return doc.secciones.map((s, i) => `${i}. ${s.tipo} · id=${s.id}`).join("\n");
}

/** `get_page`: lee el Borrador (o el Publicado) con outline + JSON + version (para expectedVersion). */
export async function mcpGetPage({
  db,
  storeSlug,
  cual,
}: {
  db: DbMcp;
  storeSlug: string;
  cual?: CualDocumento;
}) {
  const tenantId = await resolverTenantIdPorSlug({ db, storeSlug });
  const res = await getPagina({ db, tenantId, cual: cual ?? "draft" });
  return {
    version: res.version,
    publicado: res.publicado,
    publishedAt: res.publishedAt,
    outline: outlineDe(res.documento),
    documento: res.documento,
  };
}

/** `list_widget_types`: los tipos de sección disponibles + sus defaultProps (no toca tenant). */
export function mcpListWidgetTypes() {
  return TIPOS_SECCION.map((tipo) => ({
    tipo,
    categoria: WIDGET_REGISTRY[tipo].categoria,
    v: WIDGET_REGISTRY[tipo].v,
    defaultProps: WIDGET_REGISTRY[tipo].defaultProps,
  }));
}

/**
 * Empareja cada VALOR de un enum (fuente única, `widgets.ts`) con su descripción semántica de una
 * línea. Los valores salen del enum (nunca lista a mano); el `Record<T,string>` OBLIGA en compile-time
 * a describir todos (si se agrega un valor al enum sin descripción, no compila). Espejo de
 * `list_widget_types`: el LLM del MCP elige por INTENCIÓN NOMBRADA, no por hex.
 */
function describir<T extends string>(
  valores: readonly T[],
  desc: Record<T, string>,
): { valor: T; descripcion: string }[] {
  return valores.map((valor) => ({ valor, descripcion: desc[valor] }));
}

/**
 * `list_style_options`: TODOS los enums de estilo (por sección) y de tema (por página) con su
 * descripción de una línea, derivados de la fuente única (`widgets.ts`). El LLM del MCP los usa para
 * `set_section_style` (fondo/spacing/ancho/divisor/entrada) y `set_page_theme` (modo/radio/vibe/
 * tipografía/ancho/fondo de página) — jamás hex ni CSS libre (I-A). Sin efectos, no toca tenant.
 */
export function mcpListStyleOptions() {
  return {
    estiloSeccion: {
      fondoEsquema: describir(ESQUEMAS_FONDO, {
        tema: "Transparente: hereda el fondo de la página (por defecto).",
        superficie: "Blanco (o tinta en modo oscuro), texto tinta.",
        superficie_alt: "Banda gris suave para separar del fondo.",
        marca_suave: "Tinte claro del color de la tienda, texto tinta.",
        marca: "Color de la tienda a fondo lleno, texto claro legible.",
        marca_profundo: "Versión oscura del color de la tienda, texto claro.",
        tinta: "Fondo casi negro, texto claro (alto contraste).",
      }),
      fondoGradiente: describir(GRADIENTES, {
        marca_suave: "Degradado suave entre tonos claros de la marca.",
        marca_vivo: "Degradado vivo de la marca (el del hero).",
        tinta: "Degradado oscuro tinta.",
        papel: "Degradado gris muy claro tipo papel.",
      }),
      fondoImagenOverlay: describir(OVERLAY_IMAGEN, {
        ninguno: "Sin capa sobre la imagen.",
        tinta: "Capa oscura para que el texto claro se lea.",
        marca: "Capa del color de la tienda sobre la imagen.",
        claro: "Capa clara para texto oscuro.",
      }),
      fondoImagenPosicion: describir(POSICION_IMAGEN, {
        centro: "Centrada.",
        arriba: "Anclada arriba.",
        abajo: "Anclada abajo.",
        izq: "Anclada a la izquierda.",
        der: "Anclada a la derecha.",
      }),
      fondoPatron: describir(PATRONES, {
        ninguno: "Sin patrón.",
        puntos: "Puntos sutiles.",
        grilla: "Grilla fina.",
        diagonales: "Líneas diagonales.",
        perforacion: "Motivo de troquel de ticket.",
      }),
      espaciadoVertical: describir(ESPACIADO_V, {
        ninguno: "Sin aire arriba/abajo.",
        s: "Poco aire.",
        m: "Aire medio.",
        l: "Aire amplio (por defecto).",
        xl: "Aire muy amplio.",
      }),
      ancho: describir(ANCHO_SECCION, {
        contenido: "Ancho de lectura (por defecto).",
        ancho: "Más ancho.",
        completo: "De borde a borde (full-bleed).",
      }),
      divisorForma: describir(FORMAS_DIVISOR, {
        ninguno: "Sin divisor.",
        onda: "Onda suave hacia la sección siguiente.",
        diagonal: "Corte diagonal.",
        curva: "Curva.",
        triangulo: "Triángulo (aún no dibujado).",
        perforacion: "Troquel de ticket (aún no dibujado).",
      }),
      divisorAltura: describir(ALTURA_DIVISOR, {
        s: "Bajo.",
        m: "Medio.",
        l: "Alto.",
      }),
      entrada: describir(PRESETS_ENTRADA, {
        heredar: "Usa el default del tema de la página.",
        ninguna: "Sin animación de entrada.",
        aparecer: "Aparece con un fundido.",
        subir: "Sube y aparece (por defecto).",
        escala: "Crece levemente y aparece.",
        desenfoque: "Se enfoca desde un desenfoque.",
      }),
    },
    temaPagina: {
      modo: describir(MODO_COLOR, {
        claro: "Tienda en modo claro.",
        oscuro: "Tienda en modo oscuro.",
      }),
      radio: describir(RADIO_GLOBAL, {
        nulo: "Esquinas rectas.",
        s: "Esquinas apenas redondeadas.",
        m: "Redondeo medio (por defecto).",
        l: "Redondeo amplio.",
        completo: "Muy redondeado / pastilla.",
      }),
      vibe: describir(VIBE, {
        nitido: "Nítido y sobrio.",
        suave: "Suave y amable (por defecto).",
        editorial: "Editorial / boutique.",
      }),
      tipografia: describir(PARES_TIPOGRAFICOS, {
        plataforma: "Par por defecto (Bricolage + Instrument).",
        editorial: "Elegante boutique (Fraunces + Inter).",
        energia: "Techy/fandom moderno (Space Grotesk + Inter).",
        dulce: "Redondeado merch/kpop (Poppins + Nunito).",
        impacto: "Póster/urgencia (Anton + Roboto).",
        clasica: "Refinada (Playfair + Source Sans).",
        tecnica: "Limpia/mono (IBM Plex Sans + Mono).",
      }),
      anchoContenido: describir(ANCHO_CONTENIDO, {
        contenido: "Ancho de lectura por defecto de las secciones.",
        ancho: "Secciones más anchas por defecto.",
      }),
      fondoPagina: describir(ESQUEMAS_FONDO, {
        tema: "Transparente (usa el fondo del shell).",
        superficie: "Blanco/tinta (por defecto).",
        superficie_alt: "Gris suave de fondo.",
        marca_suave: "Tinte claro de la marca de fondo.",
        marca: "Color de la marca a fondo lleno.",
        marca_profundo: "Marca oscura de fondo.",
        tinta: "Fondo casi negro.",
      }),
    },
  };
}

/** `list_products`: los productos de la tienda (para referenciar en un catálogo `modo:'seleccion'`). */
export async function mcpListProducts({
  db,
  storeSlug,
}: {
  db: DbMcp;
  storeSlug: string;
}) {
  const tenantId = await resolverTenantIdPorSlug({ db, storeSlug });
  const productos = await db.product.findMany({
    where: { tenantId }, // tenant-scoped server-side (I1)
    select: {
      id: true,
      titulo: true,
      precio: true,
      activo: true,
      participaEnSorteo: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return productos.map((p) => ({
    id: p.id,
    titulo: p.titulo,
    // precio como número: DISPLAY-ONLY para el LLM (referenciar el producto). NO se hace aritmética
    // con él — el monto autoritativo es `Product.precio` (Decimal), que congela iniciarCheckout (I2/I4).
    precio: p.precio.toNumber(),
    activo: p.activo,
    participaEnSorteo: p.participaEnSorteo,
  }));
}

/** Núcleo de las 6 tools de mutación: resuelve tenant + delega en `aplicarMutacionPagina` (F04). */
export async function mcpMutar({
  db,
  storeSlug,
  mutacion,
  expectedVersion,
}: {
  db: DbMcp;
  storeSlug: string;
  mutacion: MutacionPagina;
  expectedVersion: number;
}) {
  const tenantId = await resolverTenantIdPorSlug({ db, storeSlug });
  const res = await aplicarMutacionPagina({
    db,
    tenantId,
    mutacion,
    expectedVersion,
  });
  return {
    version: res.version,
    outline: outlineDe(res.documento),
    documento: res.documento,
  };
}

/** `publish_page`: publica el Borrador (checkpoint humano del Operador, I6) + snapshot de revisión (F12). */
export async function mcpPublishPage({
  db,
  storeSlug,
  expectedVersion,
}: {
  db: DbMcp;
  storeSlug: string;
  expectedVersion?: number;
}) {
  const tenantId = await resolverTenantIdPorSlug({ db, storeSlug });
  return publicarPagina({ db, tenantId, expectedVersion, publicadoPor: PUBLICADOR_MCP });
}

/** `list_versions`: historial de publicaciones (revisiones) de la Página (F12). */
export async function mcpListVersions({
  db,
  storeSlug,
}: {
  db: DbMcp;
  storeSlug: string;
}) {
  const tenantId = await resolverTenantIdPorSlug({ db, storeSlug });
  return listarVersiones({ db, tenantId });
}

/** `rollback_page`: copia una `revision` vieja al Borrador (D4); hay que RE-PUBLICAR para hacerla visible (I6). */
export async function mcpRollback({
  db,
  storeSlug,
  revision,
}: {
  db: DbMcp;
  storeSlug: string;
  revision: number;
}) {
  const tenantId = await resolverTenantIdPorSlug({ db, storeSlug });
  const res = await revertirPagina({ db, tenantId, revision });
  return {
    version: res.version,
    outline: outlineDe(res.documento),
    documento: res.documento,
    nota: "Se copió la revisión al borrador. Publicá (publish_page) para hacerla visible.",
  };
}
