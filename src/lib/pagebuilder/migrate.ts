import {
  OverlayNodeSchema,
  PageDocumentSchema,
  SeccionNodeSchema,
  TemaSchema,
  type OverlayNode,
  type PageDocument,
  type SeccionNode,
} from "~/lib/pagebuilder/schema";
import {
  ESTILOS_TITULO_ACENTO,
  runsDeTexto,
  runsDeTituloAcento,
} from "~/lib/pagebuilder/widgets";

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
  const out: Record<string, unknown> = { ...doc };
  if (Array.isArray(doc.secciones)) out.secciones = doc.secciones.map(migrarNodo);
  // Los OVERLAYS también se migran (builder-tanda-1 F04/D7: aviso_barra v1→v2). Antes migrarDocumento
  // solo tocaba `secciones` ⇒ un overlay con `v` viejo llegaba crudo al parse.
  if (Array.isArray(doc.overlays)) out.overlays = doc.overlays.map(migrarOverlay);
  return out;
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
  // hero v2 → v3 (Tanda 3 F02/D4): `titulo`/`subtitulo` string → RichTexto; `tituloAcento` ABSORBIDO
  // en el `titulo` (la palabra acentuada queda en un run con su marca, byte-idéntico al render previo,
  // I-U8). El campo `tituloAcento` se elimina (ya no existe en v3). Idempotente.
  if (out.tipo === "hero" && v < 3) {
    out = { ...out, v: 3, props: migrarHeroV3Props(out.props) };
    v = 3;
  }
  // ganadores v1 → v2 (aditivo: default `fuente:"manual"` conserva los items y el look actual).
  if (out.tipo === "ganadores" && v < 2) {
    out = { ...out, v: 2 };
    v = 2;
  }
  // perfil_autora v1 → v2 (Tanda 3 F02/D5): `bio` string → RichTexto (migrate-on-read LOSSLESS). Un
  // perfil sin `bio` o con `bio` ya RichTexto (v2) pasa igual (idempotente).
  if (out.tipo === "perfil_autora" && v < 2) {
    out = { ...out, v: 2, props: migrarPropStringARuns(out.props, "bio") };
    v = 2;
  }
  // texto_rico v1 → v2 (Tanda 3 F01/D3): los bloques subtitulo/parrafo/cita llevaban `texto: string`;
  // v2 usa `children: RichTexto`. Migrate-on-read LOSSLESS `texto → runsDeTexto(texto)` (mismo contenido
  // visible; los límites de chars se conservan a nivel de suma — un párrafo largo se trocea en runs). El
  // `lista` (items string) y `cita.autor` quedan intactos (D3). Un bloque YA v2 (con `children`) pasa
  // igual (idempotente ⇒ un re-migrado no lo rompe).
  if (out.tipo === "texto_rico" && v < 2) {
    out = { ...out, v: 2, props: migrarTextoRicoProps(out.props) };
    v = 2;
  }
  return out;
}

/** `true` sii `estilo` es un valor válido de ESTILOS_TITULO_ACENTO (narrowing para `runsDeTituloAcento`). */
function esEstiloAcento(estilo: unknown): estilo is (typeof ESTILOS_TITULO_ACENTO)[number] {
  return typeof estilo === "string" && (ESTILOS_TITULO_ACENTO as readonly string[]).includes(estilo);
}

/**
 * Migra los `props` de un `hero` v2 a v3 (Tanda 3 F02/D4): `titulo`/`subtitulo` string → RichTexto,
 * absorbiendo `tituloAcento` en el `titulo`. Un `titulo` con `tituloAcento {palabra, estilo}` válido usa
 * `runsDeTituloAcento` (byte-idéntico al render con substring, I-U8); sin acento usa `runsDeTexto`. El
 * `tituloAcento` se elimina. Un `titulo` ya RichTexto (v3, re-migrado) se deja intacto (idempotente).
 * Nota (edge case documentado): un hero con `tituloAcento` PERO SIN `titulo` (usa el fallback
 * `branding.nombre`, resuelto server-side) NO puede absorber el acento en el doc (violaría I2 —copiar
 * el nombre—) ⇒ el acento se pierde en el fallback. Ningún tenant seed/publicado tiene esa combinación.
 */
function migrarHeroV3Props(props: unknown): unknown {
  if (!props || typeof props !== "object") return props;
  const p = { ...(props as Record<string, unknown>) };
  if (typeof p.titulo === "string") {
    const acento = p.tituloAcento as { palabra?: unknown; estilo?: unknown } | undefined;
    if (acento && typeof acento.palabra === "string" && esEstiloAcento(acento.estilo)) {
      p.titulo = runsDeTituloAcento(p.titulo, acento.palabra, acento.estilo);
    } else {
      p.titulo = runsDeTexto(p.titulo);
    }
  }
  if (typeof p.subtitulo === "string") {
    p.subtitulo = runsDeTexto(p.subtitulo);
  }
  delete p.tituloAcento; // consumido por la absorción (o descartado si no había titulo)
  return p;
}

/** Promueve UN campo string de un props a RichTexto (Tanda 3 F02/D5, migrate-on-read LOSSLESS). Solo toca
 *  el campo si es un string (un RichTexto ya migrado, o ausente, pasa igual ⇒ idempotente). */
function migrarPropStringARuns(props: unknown, campo: string): unknown {
  if (!props || typeof props !== "object") return props;
  const p = props as Record<string, unknown>;
  if (typeof p[campo] !== "string") return props;
  return { ...p, [campo]: runsDeTexto(p[campo] as string) };
}

/** Migra los `props` de un `texto_rico` v1 a v2: cada bloque de texto (`texto` string) → `children` runs. */
function migrarTextoRicoProps(props: unknown): unknown {
  if (!props || typeof props !== "object") return props;
  const p = props as Record<string, unknown>;
  if (!Array.isArray(p.bloques)) return props;
  const bloques = p.bloques as unknown[];
  return {
    ...p,
    bloques: bloques.map((bloque: unknown): unknown => {
      if (!bloque || typeof bloque !== "object") return bloque;
      const b = bloque as Record<string, unknown>;
      // Solo los bloques de texto migran (`lista` no tiene `texto`). Un bloque ya v2 (con `rico`)
      // se deja intacto; solo se toca si trae el `texto` string viejo.
      if (typeof b.texto === "string" && b.rico === undefined) {
        const { texto, ...resto } = b;
        return { ...resto, rico: runsDeTexto(texto) };
      }
      return bloque;
    }),
  };
}

/**
 * Migra UN overlay de su `v` viejo a la actual (PURO). Paso vigente:
 *  - `aviso_barra` v1 → v2 (builder-tanda-1 F04/D7): la barra v1 llevaba `texto` (string); v2 usa
 *    `mensajes` (array 1–5). Migrate-on-read LOSSLESS: `texto → mensajes:[texto]` (el límite ≤120 de v2
 *    = el de v1 ⇒ nunca falla el parse). Los defaults `modo:"estatico"`/`esquema:"tema"`/
 *    `mostrarCountdown:false` reproducen el look v1 exacto (I-T3). `enlaceUrl/enlaceTexto/descartable`
 *    quedan intactos. Un nodo sin `v` se normaliza a v1 primero (paso genérico, como en `migrarNodo`).
 */
function migrarOverlay(o: unknown): unknown {
  if (!o || typeof o !== "object") return o;
  const nodo = o as Record<string, unknown>;
  let out = nodo;
  let v = typeof nodo.v === "number" ? nodo.v : 1;
  if (nodo.v === undefined) out = { ...out, v };
  if (out.tipo === "aviso_barra" && v < 2) {
    const props = (out.props ?? {}) as Record<string, unknown>;
    const nuevoProps: Record<string, unknown> = { ...props };
    if (typeof props.texto === "string") {
      nuevoProps.mensajes = [props.texto];
      delete nuevoProps.texto;
    }
    out = { ...out, v: 2, props: nuevoProps };
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

  // El TemaPagina (`root.props`, catálogo-v2 F02/D3) se RESCATA tolerante: si parsea contra
  // `TemaSchema` se conserva (modo/radio/tipografía/ancho/fondo llegan al render); si está podrido,
  // cae a `{}` (defaults) SIN tumbar las secciones. Antes se descartaba a `{}` incondicionalmente
  // ⇒ TemaPagina era no-op en el render público/preview (bug modo:oscuro y compañía).
  const rootCrudo =
    obj.root && typeof obj.root === "object"
      ? (obj.root as Record<string, unknown>).props
      : undefined;
  const temaParse = TemaSchema.safeParse(rootCrudo ?? {});
  const rootProps = temaParse.success ? temaParse.data : {};

  // El resto del continente se valida entero; si algo del root está mal, documento vacío.
  const doc = PageDocumentSchema.safeParse({
    schemaVersion: 1,
    root: { props: rootProps },
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
