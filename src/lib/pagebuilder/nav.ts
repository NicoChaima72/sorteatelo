import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * Nav auto-derivado del Documento de Página (builder-tanda-1 F05/D8). PURO (sin DB, sin React): el
 * `storefront-layout` deriva los items del header desde las secciones marcadas con `nav.incluir`, y el
 * `render-pagina` emite las anclas semánticas. Enum de anclas/etiquetas por tipo CURADO (nunca texto
 * libre de posicionamiento): el Organizador elige QUÉ secciones entran al nav (toggle) y, opcional, su
 * etiqueta ≤20; el ancla y la etiqueta por defecto salen de estos mapas.
 *
 * Regla de degradación (I-H): si NINGUNA sección marca `nav.incluir`, `derivarNav` devuelve `[]` ⇒ el
 * header cae al nav hardcodeado actual (Catálogo/Sorteo/Cómo funciona) SIN cambio.
 */

/** Un item del nav derivado: etiqueta visible + destino de scroll (`#ancla`). */
export type NavItem = { label: string; href: string };

/**
 * Etiqueta humana de un slug de página (Tanda 3 F04/D9): `sobre-mi` → "Sobre mi". Reemplaza guiones por
 * espacios y capitaliza la 1ª letra. Es un default (no hay columna `nombre` de página en el MVP) —
 * REVISABLE agregar un nombre editable. PURO.
 */
export function humanizarSlug(slug: string): string {
  const texto = slug.replace(/-/g, " ").trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Ancla semántica por TIPO de sección (slug DOM estable). La PRIMERA sección de cada tipo emite su
 * ancla (`render-pagina`); varias del mismo tipo comparten el ancla de la primera. Curado: solo los
 * tipos "navegables" tienen entrada; el resto no aporta ancla semántica (cae al `id` del nodo).
 */
export const ANCLA_POR_TIPO: Partial<Record<SeccionNode["tipo"], string>> = {
  catalogo: "catalogo",
  sorteo_vitrina: "sorteo",
  bloque_ticket_promo: "sorteo",
  meta_progreso_sorteo: "sorteo",
  como_funciona: "como-funciona",
  perfil_autora: "autora",
  garantias_sorteo: "bases",
  // F13/fidelidad: dos tipos que en el mockup entran al nav ("El libro" / "Bases") pero antes caían al
  // fallback `#<uuid>`. `beneficios_grid` → grilla de destacados; `texto_rico` → bloque de bases/legal.
  beneficios_grid: "beneficios",
  texto_rico: "bases",
  faq: "preguntas",
  testimonios: "opiniones",
  galeria: "galeria",
  ganadores: "ganadores",
  // Tanda 2 F01: la vitrina de "próximos lanzamientos" entra al nav ("Próximos" en el mockup bcac).
  vitrina_proximamente: "proximos",
  // Tanda 2 F15: el producto destacado ("El libro" en el prototipo editorial) entra al nav como catálogo.
  producto_spotlight: "catalogo",
};

/** Etiqueta por defecto del nav por TIPO (si la sección no trae `nav.etiqueta` explícita). */
export const ETIQUETA_POR_TIPO: Partial<Record<SeccionNode["tipo"], string>> = {
  hero: "Inicio",
  catalogo: "Catálogo",
  sorteo_vitrina: "Sorteo",
  bloque_ticket_promo: "Sorteo",
  meta_progreso_sorteo: "Sorteo",
  como_funciona: "Cómo funciona",
  perfil_autora: "Autora",
  garantias_sorteo: "Bases",
  faq: "Preguntas",
  testimonios: "Opiniones",
  galeria: "Galería",
  ganadores: "Ganadores",
  beneficios_grid: "Beneficios",
  texto_rico: "Bases",
  imagen_destacada: "Destacado",
  vitrina_proximamente: "Próximos",
  producto_spotlight: "El libro",
};

/**
 * Anclas cuyo ítem de nav NO es un scroll dentro de la página sino una RUTA de plataforma
 * (admin-bases-pdf D13, amendment del usuario).
 *
 * Caso único hoy: **`bases`**. El ítem «Bases» del navbar es un enlace LEGAL (ADR-0008) y tiene que
 * abrir SIEMPRE el PDF de bases del sorteo activo —la página `/bases`—, nunca hacer scroll a una
 * sección de la home que el Organizador redactó. Antes, `garantias_sorteo`/`texto_rico` derivaban a
 * `#bases` y convivían con el enlace del footer a `/bases`: dos destinos distintos bajo la misma
 * palabra, uno de ellos legal. Esto los unifica.
 *
 * Se ancla al ANCLA (no al tipo de widget) a propósito: es UNA regla, y cualquier tipo que en el
 * futuro derive a `bases` la hereda sin tocar este archivo.
 *
 * Es incondicional (no depende de que haya sorteo activo con PDF) porque `derivarNav` es PURO — no
 * ve la DB — y porque `/bases` ya resuelve ese caso con un estado vacío neutral (D5): linkear
 * siempre es seguro y honesto.
 */
export const ANCLAS_QUE_SON_RUTA: Record<string, string> = {
  bases: "/bases",
};

/**
 * Resuelve UN ancla a su href: la RUTA de plataforma si el ancla es una de `ANCLAS_QUE_SON_RUTA`
 * (hoy solo `bases`), o el target de scroll `#<ancla>` de siempre. PURO.
 *
 * Es la FUENTE ÚNICA de la regla D13/D14 y la consumen las tres superficies que resuelven un ancla:
 * el nav derivado (`derivarNav`, acá), el chrome configurable (`hrefMenuItem`, `chrome.ts` — header
 * `menu`/`basesPdf` y links del footer) y los CTA de los widgets de contenido (hero, banner, packs,
 * momento-ticket…). Cada una resolvía `#${ancla}` por su cuenta, y por eso «Bases» llegó a tener
 * dos destinos distintos en la misma tienda: el footer al PDF y el botón del hero a un ancla que
 * ni siquiera existía en el documento.
 *
 * NO la usa `hrefDestino` de los runs (`runs-texto.tsx`): un link INLINE dentro del texto que el
 * Organizador redactó apunta a donde él quiso apuntar; D13/D14 hablan de la navegación y los CTA.
 */
export function hrefDeAncla(ancla: string): string {
  return ANCLAS_QUE_SON_RUTA[ancla] ?? `#${ancla}`;
}

/**
 * Mapa `id de nodo → ancla semántica` para la PRIMERA sección de cada ancla (evita ids DOM duplicados:
 * dos secciones del mismo tipo, solo la primera recibe el ancla semántica). Lo consume `render-pagina`
 * para emitir un target de scroll invisible antes de cada sección anclada. PURO.
 */
export function anclasSemanticas(secciones: SeccionNode[]): Record<string, string> {
  const usados = new Set<string>();
  const out: Record<string, string> = {};
  for (const s of secciones) {
    const ancla = ANCLA_POR_TIPO[s.tipo];
    if (ancla && !usados.has(ancla)) {
      usados.add(ancla);
      out[s.id] = ancla;
    }
  }
  return out;
}

/**
 * Deriva los items del nav desde las secciones marcadas con `nav.incluir`, en ORDEN del documento. El
 * `href` apunta al ancla semántica del tipo (si esta sección es la primera de su tipo) o al `id` del
 * propio nodo (fallback robusto — siempre existe como target). La etiqueta sale de `nav.etiqueta`
 * explícita, o del mapa por tipo, o "Sección". Sin ninguna sección marcada ⇒ `[]` (el header cae al
 * nav actual, I-H). PURO.
 */
export function derivarNav(secciones: SeccionNode[]): NavItem[] {
  const tiposVistos = new Set<string>();
  const items: NavItem[] = [];
  for (const s of secciones) {
    const esPrimeraDeTipo = !tiposVistos.has(s.tipo);
    tiposVistos.add(s.tipo);
    if (!s.nav?.incluir) continue;
    const anclaTipo = ANCLA_POR_TIPO[s.tipo];
    // Un ancla de RUTA (hoy solo `bases`, D13) gana SIEMPRE — incluso si esta no es la primera
    // sección de su tipo: el destino es de plataforma, no un target de scroll del documento.
    const ruta = anclaTipo ? ANCLAS_QUE_SON_RUTA[anclaTipo] : undefined;
    const href =
      ruta ?? (anclaTipo && esPrimeraDeTipo ? `#${anclaTipo}` : `#${s.id}`);
    const label = s.nav.etiqueta ?? ETIQUETA_POR_TIPO[s.tipo] ?? "Sección";
    items.push({ label, href });
  }
  return items;
}
