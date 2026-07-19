import {
  OverlayNodeSchema,
  PageDocumentSchema,
  SeccionNodeSchema,
  type OverlayNode,
  type PageDocument,
  type SeccionNode,
} from "~/lib/pagebuilder/schema";

/**
 * Migrate-on-read del Documento de Página (ADR-0016/I9, F04/F05). Transforma un documento CRUDO de
 * versiones viejas a la actual de forma PURA (nunca escribe a DB) ANTES de parsear. Hoy solo existe
 * `v1` ⇒ identidad; F05+ agrega pasos por nodo (vN→vN+1). Puro, client+server safe.
 *
 * Punto de extensión: cuando un widget suba su `v`, agregar acá un paso `migrarNodo(tipo, vViejo)`
 * que remapee sus props ⇒ el documento se migra al LEER, sin `jsonb_set` masivo que rompa páginas
 * publicadas (I9).
 */
export function migrarDocumento(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const doc = raw as Record<string, unknown>;
  if (!Array.isArray(doc.secciones)) return raw;
  const secciones = doc.secciones as unknown[];
  return { ...doc, secciones: secciones.map(migrarNodo) };
}

/**
 * Migra UN nodo de sección de su `v` viejo a la actual (PURO — spread, no muta la entrada). Pasos:
 *  1. Un nodo legacy SIN `v` se normaliza a `v:1` (pre-versionado ⇒ shape v1).
 *  2. `hero` v<2 → v2 (catálogo-v2 F05/D4): aditivo (variante/ctaSecundario/overlayOscuridad, default
 *     `variante:"split"` conserva el look v1) ⇒ la migración solo sube el marcador `v`.
 *  3. `ganadores` v<2 → v2 (catálogo-v2 F06/D4): aditivo (fuente/maxAutomaticos, default
 *     `fuente:"manual"` conserva los `items` y el look v1) ⇒ solo sube el marcador `v`.
 * El parse rellena los campos nuevos (I-H). Los futuros vN→vN+1 se encadenan acá.
 */
function migrarNodo(s: unknown): unknown {
  if (!s || typeof s !== "object") return s;
  const nodo = s as Record<string, unknown>;
  let out = nodo;
  let v = typeof nodo.v === "number" ? nodo.v : 1;
  if (nodo.v === undefined) out = { ...out, v };
  // hero v1 → v2 (aditivo: default `variante:"split"` conserva el look actual).
  if (out.tipo === "hero" && v < 2) {
    out = { ...out, v: 2 };
    v = 2;
  }
  // ganadores v1 → v2 (aditivo: default `fuente:"manual"` conserva los items y el look actual).
  if (out.tipo === "ganadores" && v < 2) {
    out = { ...out, v: 2 };
    v = 2;
  }
  return out;
}

/**
 * Parseo canónico ESTRICTO: migra + valida contra `PageDocumentSchema`. Úsalo para EDITAR (getPagina
 * del borrador, F04): el borrador siempre debe ser válido (cada mutación lo revalidó). Lanza si no.
 */
export function parsearDocumento(raw: unknown): PageDocument {
  return PageDocumentSchema.parse(migrarDocumento(raw));
}

/**
 * Lectura TOLERANTE para el RENDER público (F05, I9): migra el documento y descarta en silencio las
 * secciones cuyo `tipo` es desconocido o cuyas props no parsean — un documento publicado NUNCA
 * crashea la página entera. Devuelve un `PageDocument` válido con solo las secciones sanas.
 *
 * Distinto de `parsearDocumento` (estricto, para editar): acá la robustez del render manda sobre la
 * exactitud. Si el continente (root/overlays/schemaVersion) está corrupto, cae a un documento vacío
 * renderizable en vez de tirar.
 */
export function leerDocumentoParaRender(raw: unknown): PageDocument {
  const migrado = migrarDocumento(raw);

  const obj = migrado && typeof migrado === "object" ? (migrado as Record<string, unknown>) : {};

  // Rescatar las secciones sanas una por una (una podrida no tumba al resto).
  const secciones: SeccionNode[] = [];
  for (const cruda of Array.isArray(obj.secciones) ? obj.secciones : []) {
    const res = SeccionNodeSchema.safeParse(cruda);
    if (res.success) secciones.push(res.data); // tipo desconocido / props inválidas ⇒ se omite (I9)
  }

  // Ídem para los overlays (F10): un overlay podrido se omite, no tumba el resto.
  const overlays: OverlayNode[] = [];
  for (const cruda of Array.isArray(obj.overlays) ? obj.overlays : []) {
    const res = OverlayNodeSchema.safeParse(cruda);
    if (res.success) overlays.push(res.data);
  }

  // El resto del continente se valida entero; si algo del root está mal, documento vacío.
  const doc = PageDocumentSchema.safeParse({
    schemaVersion: 1,
    root: { props: {} },
    secciones,
    overlays,
  });
  // Fallback: documento vacío VÁLIDO (parse rellena los defaults del TemaSchema, catálogo-v2 F01).
  return doc.success
    ? doc.data
    : PageDocumentSchema.parse({
        schemaVersion: 1,
        root: { props: {} },
        secciones: [],
        overlays: [],
      });
}
