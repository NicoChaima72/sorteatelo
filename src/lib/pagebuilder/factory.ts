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
 * DEGRADACIÓN ELEGANTE: los overrides de texto/imagen del hero SOLO se incluyen si vienen y son
 * válidos — sin ellos el render cae al `nombre`/`descripcion`/gradiente del Tenant (resueltos
 * server-side; NO se copian al documento, I2). Los textos se recortan al límite del schema y una
 * `imagenUrl` inválida se descarta ⇒ la factory NUNCA produce un documento que no parsee.
 */

/**
 * Valores con los que SEMBRAR el hero/aviso del documento inicial. Hasta admin-bases-pdf F07 esto
 * "fotografiaba" columnas del `Tenant` (`heroTitulo`/`heroSubtitulo`/`heroImageUrl`/`avisoTexto`);
 * esas columnas ya NO existen — el hero vive solo en el Documento. Hoy son datos que trae el CALLER:
 * los seeds siembran una tienda demo con su hero, y `crearTienda` no pasa ninguno (una Tienda nueva
 * nace sin overrides y el render degrada a su nombre/descripción). Todos OPCIONALES.
 */
export interface BrandingSemilla {
  heroTitulo?: string | null;
  heroSubtitulo?: string | null;
  heroImageUrl?: string | null;
  /** Banner de aviso: si está, se emite un overlay `aviso_barra`. */
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
  const heroTitulo = recortar(branding.heroTitulo ?? null, 120);
  const heroSubtitulo = recortar(branding.heroSubtitulo ?? null, 300);
  const heroProps = {
    ...WIDGET_REGISTRY.hero.defaultProps,
    ...sinVacios({
      titulo: heroTitulo ? runsDeTexto(heroTitulo) : undefined,
      subtitulo: heroSubtitulo ? runsDeTexto(heroSubtitulo) : undefined,
      imagenUrl: urlODescartar(branding.heroImageUrl ?? null),
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

/** Las 4 columnas MUERTAS de la card «Tu tienda» del admin, que F05 vuelca al Documento. */
export interface TextosDeTienda {
  heroTitulo: string | null;
  heroSubtitulo: string | null;
  heroImageUrl: string | null;
  avisoTexto: string | null;
}

/**
 * Vuelca al Documento de Página el contenido que quedó atrapado en las **columnas muertas** del
 * Tenant (`heroTitulo`/`heroSubtitulo`/`heroImageUrl`/`avisoTexto`) — admin-bases-pdf F05, D7/opción E.
 * PURA e IDEMPOTENTE; la usa el script `scripts/migrar-tu-tienda-a-documento.ts` antes del DROP de F07.
 *
 * Por qué existe: desde que el storefront lee TODO del Documento, esos 4 inputs del admin guardaban
 * con un toast «Cambios guardados.» y **no cambiaban nada**. Un Organizador que escribió ahí después
 * del backfill tiene texto suyo que solo vive en la columna; borrar la columna sin rescatarlo sería
 * perder contenido de un usuario.
 *
 * Regla única: **rellenar huecos, jamás pisar**. Si el hero ya tiene `titulo`/`subtitulo`/`imagenUrl`,
 * esos ganan siempre (el builder es la fuente de verdad; la columna es el legado). De ahí sale la
 * idempotencia gratis: tras la primera corrida ya no hay huecos, y la segunda es un no-op exacto.
 *
 * Toca SOLO el primer `hero` del documento; si el Organizador lo eliminó, no se re-crea (respetar su
 * página vale más que rescatar un título). El aviso va por `conAvisoBarra`, que es overlay y no
 * depende del hero. Devuelve un documento VALIDADO.
 */
export function conTextosDeTienda(
  doc: PageDocument,
  columnas: TextosDeTienda,
): PageDocument {
  const titulo = recortar(columnas.heroTitulo, 120);
  const subtitulo = recortar(columnas.heroSubtitulo, 300);
  const imagenUrl = urlODescartar(columnas.heroImageUrl);

  let conHero = doc;
  const hayAlgoDeHero = titulo ?? subtitulo ?? imagenUrl;
  if (hayAlgoDeHero !== undefined) {
    let tocado = false;
    const secciones = doc.secciones.map((s) => {
      // Solo el PRIMER hero (`tocado` corta): un documento con dos heros no se toca dos veces.
      if (s.tipo !== "hero" || tocado) return s;
      tocado = true;
      // `sinVacios` + el spread al final garantizan que lo EXISTENTE gana sobre la columna.
      const props = {
        ...sinVacios({
          titulo: titulo ? runsDeTexto(titulo) : undefined,
          subtitulo: subtitulo ? runsDeTexto(subtitulo) : undefined,
          imagenUrl,
        }),
        ...s.props,
      };
      return { ...s, props };
    });
    if (tocado) {
      conHero = PageDocumentSchema.parse({ ...doc, secciones });
    }
  }

  return conAvisoBarra(conHero, columnas.avisoTexto);
}
