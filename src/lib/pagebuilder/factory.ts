import {
  PageDocumentSchema,
  SCHEMA_VERSION,
  type PageDocument,
} from "~/lib/pagebuilder/schema";
import { runsDeTexto, urlPublica, WIDGET_REGISTRY } from "~/lib/pagebuilder/widgets";

/**
 * Factory PURA del Documento de Página inicial (ADR-0016, F03). Reproduce la plantilla actual del
 * storefront (las 4 secciones semilla: hero, catálogo, vitrina del sorteo, cómo funciona) a partir
 * de las columnas de branding del `Tenant`. El pivote es ADITIVO (I11): las columnas se mantienen
 * como seed/fallback; esta factory las "fotografía" a un documento equivalente 1:1 para el backfill
 * (F03) y para las Tiendas nuevas (R5). Client+server safe (solo Zod).
 *
 * PUREZA (test F03): sin `Date`, sin random, sin I/O. Ids de nodo DETERMINISTAS (`sec-*`) — una sola
 * de cada sección en la semilla. Mismo branding ⇒ mismo documento, byte a byte. Las mutaciones del
 * MCP (F04) generan ids nuevos con `crypto.randomUUID()`; la semilla no.
 *
 * DEGRADACIÓN ELEGANTE: los overrides de texto/imagen del hero SOLO se incluyen si la columna existe
 * y es válida — sin ellos el render cae al `nombre`/`descripcion`/gradiente del Tenant (resueltos
 * server-side; NO se copian al documento, I2). Los textos se recortan al límite del schema y una
 * `imagenUrl` inválida se descarta ⇒ la factory NUNCA produce un documento que no parsee.
 */

/** Columnas de branding del `Tenant` que la semilla "fotografía" al documento (hero + aviso). */
export interface BrandingSemilla {
  heroTitulo: string | null;
  heroSubtitulo: string | null;
  heroImageUrl: string | null;
  /** Banner de aviso (F10): si está, se emite un overlay `aviso_barra` (migra el chrome, R1).
   *  Opcional (ausente ⇒ sin overlay) para no romper los callers previos a F10. */
  avisoTexto?: string | null;
}

/** Recorta al límite del schema (defensa: una columna larga no rompe el backfill). `null` ⇒ omitido. */
function recortar(valor: string | null, max: number): string | undefined {
  if (!valor) return undefined;
  const limpio = valor.trim();
  if (!limpio) return undefined;
  return limpio.length > max ? limpio.slice(0, max) : limpio;
}

/** URL válida o `undefined` (una `imagenUrl` corrupta se descarta ⇒ el render cae al gradiente). */
function urlODescartar(valor: string | null): string | undefined {
  if (!valor) return undefined;
  return urlPublica.safeParse(valor.trim()).success ? valor.trim() : undefined;
}

/** Omite las claves `undefined` para que el documento no persista campos vacíos (I2/I11). */
function sinVacios<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
}

/**
 * Construye el Documento de Página inicial. Devuelve un `PageDocument` VALIDADO (`parse`): la factory
 * garantiza su propia salida — si algún día produjera algo inválido, es un bug que se caza acá, no en
 * el borde de escritura.
 */
export function documentoInicial(branding: BrandingSemilla): PageDocument {
  // Las props salen del REGISTRO (fuente única, NIT-1): solo el hero mezcla los overrides de branding
  // encima de sus defaults. Un cambio a `WIDGET_REGISTRY.<tipo>.defaultProps` se propaga solo. El hero
  // v3 (Tanda 3 F02/D4) usa `titulo`/`subtitulo` como RichTexto ⇒ el override de branding (string) se
  // envuelve en un run plano (`runsDeTexto`); ausente ⇒ el render cae al `nombre`/`descripcion` del Tenant.
  const heroTitulo = recortar(branding.heroTitulo, 120);
  const heroSubtitulo = recortar(branding.heroSubtitulo, 300);
  const heroProps = {
    ...WIDGET_REGISTRY.hero.defaultProps,
    ...sinVacios({
      titulo: heroTitulo ? runsDeTexto(heroTitulo) : undefined,
      subtitulo: heroSubtitulo ? runsDeTexto(heroSubtitulo) : undefined,
      imagenUrl: urlODescartar(branding.heroImageUrl),
    }),
  };

  const raw = {
    schemaVersion: SCHEMA_VERSION,
    root: { props: {} },
    secciones: [
      { id: "sec-hero", tipo: "hero", v: WIDGET_REGISTRY.hero.v, props: heroProps },
      {
        id: "sec-catalogo",
        tipo: "catalogo",
        v: WIDGET_REGISTRY.catalogo.v,
        props: { ...WIDGET_REGISTRY.catalogo.defaultProps },
      },
      {
        id: "sec-sorteo",
        tipo: "sorteo_vitrina",
        v: WIDGET_REGISTRY.sorteo_vitrina.v,
        props: { ...WIDGET_REGISTRY.sorteo_vitrina.defaultProps },
      },
      {
        id: "sec-como-funciona",
        tipo: "como_funciona",
        v: WIDGET_REGISTRY.como_funciona.v,
        props: { ...WIDGET_REGISTRY.como_funciona.defaultProps },
      },
    ],
    overlays: [],
  };

  // El `avisoTexto` del Tenant se emite como overlay `aviso_barra` (F10, migra el chrome R1).
  return conAvisoBarra(PageDocumentSchema.parse(raw), branding.avisoTexto ?? null);
}

/**
 * Documento inicial de una PÁGINA NUEVA multi-página (Tanda 3 F04/D8): un starter mínimo VÁLIDO — un hero
 * con el nombre de la página como título (RichTexto) + un bloque de texto placeholder. El Organizador lo
 * edita/expande. Ids fijos (únicos dentro del doc; cada página es su propia fila). PURA, determinista.
 */
export function documentoNuevaPagina(titulo: string): PageDocument {
  const nombre = recortar(titulo, 120) ?? "Nueva página";
  const raw = {
    schemaVersion: SCHEMA_VERSION,
    root: { props: {} },
    secciones: [
      {
        id: "sec-hero",
        tipo: "hero",
        v: WIDGET_REGISTRY.hero.v,
        props: {
          ...WIDGET_REGISTRY.hero.defaultProps,
          titulo: runsDeTexto(nombre),
          mostrarBadgeSorteo: false,
          mostrarConfianza: false,
        },
      },
      {
        id: "sec-texto",
        tipo: "texto_rico",
        v: WIDGET_REGISTRY.texto_rico.v,
        props: { ...WIDGET_REGISTRY.texto_rico.defaultProps },
      },
    ],
    overlays: [],
  };
  return PageDocumentSchema.parse(raw);
}

/** Id determinista del overlay de aviso de la semilla (idempotencia del backfill/migración). */
const ID_OVERLAY_AVISO = "overlay-aviso";

/**
 * Devuelve el documento con un overlay `aviso_barra` (texto = `avisoTexto` recortado). IDEMPOTENTE:
 * sin texto ⇒ documento intacto; si ya hay un `aviso_barra` ⇒ intacto (no duplica). PURA — la usan la
 * factory (F10) y la migración del `avisoTexto` de los tenants existentes (F10). Determinista.
 */
export function conAvisoBarra(
  doc: PageDocument,
  avisoTexto: string | null,
): PageDocument {
  const texto = recortar(avisoTexto, 120);
  if (!texto) return doc; // sin aviso ⇒ sin cambio
  if (doc.overlays.some((o) => o.tipo === "aviso_barra")) return doc; // idempotente

  const overlay = {
    id: ID_OVERLAY_AVISO,
    tipo: "aviso_barra" as const,
    v: WIDGET_REGISTRY.aviso_barra.v, // = 2 (builder-tanda-1 F04/D7)
    // aviso_barra v2: el `avisoTexto` del chrome entra como el 1er (único) mensaje de la cinta.
    props: { ...WIDGET_REGISTRY.aviso_barra.defaultProps, mensajes: [texto] },
  };
  return PageDocumentSchema.parse({ ...doc, overlays: [...doc.overlays, overlay] });
}
