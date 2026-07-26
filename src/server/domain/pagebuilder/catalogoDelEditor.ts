import { type PageDocument } from "~/lib/pagebuilder/schema";
import {
  ALINEAR_VERTICAL,
  ALTO_MIN,
  ALTURA_DIVISOR,
  AMBIENTE_FONDO,
  ANCHO_CONTENIDO,
  ANCHO_FONDO,
  ANCHO_SECCION,
  DIRECCIONES_BICOLOR,
  ESPACIADO_V,
  ESQUEMAS_FONDO,
  FORMAS_DIVISOR,
  GRADIENTES,
  MEZCLAS_BICOLOR,
  MODO_COLOR,
  OVERLAY_IMAGEN,
  PARES_TIPOGRAFICOS,
  PATRONES,
  POSICION_IMAGEN,
  PRESETS_ENTRADA,
  RADIO_GLOBAL,
  TIPOS_SECCION,
  TONOS_FONDO,
  VIBE,
  WIDGET_REGISTRY,
} from "~/lib/pagebuilder/widgets";

/**
 * Descriptores de SOLO LECTURA del builder: el outline de un documento y el catálogo de tipos de
 * widget / opciones de estilo disponibles. Es lo que el asistente de IA del editor (`asistente.ts`)
 * necesita LEER para razonar sobre la página sin ver el JSON crudo ni inventar hex/CSS.
 *
 * Puros: no tocan `db`, `env` ni sesión. Los valores salen SIEMPRE de la fuente única
 * (`~/lib/pagebuilder/widgets`), nunca de una lista a mano.
 *
 * Vivían en `~/server/mcp/tools` (Editor MCP, ADR-0016) hasta el retiro del rol Operador de
 * plataforma (`tasks/26-07-25-plataforma-retiro-operador.md` F01/D8): el MCP murió entero y estos
 * tres helpers se reubicaron acá, que es donde estaba su único consumidor sobreviviente.
 */

/** Outline numerado de las secciones — direcciona las mutaciones del LLM por índice + id. */
export function outlineDe(doc: PageDocument): string {
  if (doc.secciones.length === 0) return "(sin secciones)";
  return doc.secciones.map((s, i) => `${i}. ${s.tipo} · id=${s.id}`).join("\n");
}

/** Los tipos de sección disponibles + sus `defaultProps` (para agregar una sección). */
export function listarTiposWidget() {
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
 * `listarTiposWidget`: el asistente elige por INTENCIÓN NOMBRADA, no por hex.
 */
function describir<T extends string>(
  valores: readonly T[],
  desc: Record<T, string>,
): { valor: T; descripcion: string }[] {
  return valores.map((valor) => ({ valor, descripcion: desc[valor] }));
}

/**
 * TODOS los enums de estilo (por sección) y de tema (por página) con su descripción de una línea,
 * derivados de la fuente única (`widgets.ts`). El asistente los usa para las mutaciones
 * `set_section_style` (fondo/spacing/ancho/divisor/entrada) y `set_page_theme` (modo/radio/vibe/
 * tipografía/ancho/fondo de página) — jamás hex ni CSS libre (I-A). Sin efectos, no toca tenant.
 */
export function listarOpcionesEstilo() {
  return {
    estiloSeccion: {
      fondoEsquema: describir(ESQUEMAS_FONDO, {
        tema: "Transparente: hereda el fondo de la página (por defecto).",
        superficie: "Blanco (o tinta en modo oscuro), texto tinta.",
        superficie_alt: "Banda gris suave para separar del fondo.",
        marfil: "Off-white cálido tipo papel (editorial/boutique), texto tinta.",
        marca_suave: "Tinte claro del color de la tienda, texto tinta.",
        marca: "Color de la tienda a fondo lleno, texto claro legible.",
        marca_profundo: "Versión oscura del color de la tienda, texto claro.",
        acento_suave: "Tinte claro del 2º color de marca; sin acento cae al de marca.",
        acento: "2º color de marca a fondo lleno, texto emparejado; sin acento cae al de marca.",
        acento_profundo: "Versión oscura del 2º color de marca, texto claro; cae a marca sin acento.",
        tinta: "Fondo casi negro, texto claro (alto contraste).",
        tinta_profunda: "Negro profundo con un dejo de marca (más oscuro que tinta), texto claro.",
        tinta_profunda_acento: "Negro profundo con un dejo del ACENTO (morado), texto claro.",
      }),
      fondoGradiente: describir(GRADIENTES, {
        marca_suave: "Degradado suave entre tonos claros de la marca.",
        marca_vivo: "Degradado vivo de la marca (el del hero).",
        tinta: "Degradado oscuro tinta.",
        papel: "Degradado gris muy claro tipo papel.",
      }),
      // Bicolor (F02): dos TONOS curados + dirección + mezcla. El texto se empareja con colorA.
      fondoBicolorTono: describir(TONOS_FONDO, {
        superficie: "Superficie clara (texto tinta).",
        marca_suave: "Tinte claro de la marca (texto tinta).",
        marca: "Color de la marca a fondo lleno (texto emparejado).",
        marca_profundo: "Marca oscura (texto claro).",
        acento_suave: "Tinte claro del 2º color de marca (cae a marca sin acento).",
        acento: "2º color de marca lleno (cae a marca sin acento).",
        acento_profundo: "2º color de marca oscuro (cae a marca sin acento).",
        tinta: "Casi negro (texto claro).",
      }),
      fondoBicolorDireccion: describir(DIRECCIONES_BICOLOR, {
        vertical: "A arriba, B abajo.",
        horizontal: "A izquierda, B derecha.",
        diagonal: "Diagonal de A a B.",
      }),
      fondoBicolorMezcla: describir(MEZCLAS_BICOLOR, {
        dura: "Corte duro al 50% (dos bandas).",
        suave: "Degradado continuo entre A y B.",
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
        cuadricula_papel: "Papel de cuaderno cuadriculado.",
        arcos: "Motivo de arcos (scallop).",
      }),
      espaciadoVertical: describir(ESPACIADO_V, {
        ninguno: "Sin aire arriba/abajo.",
        s: "Poco aire.",
        m: "Aire medio.",
        l: "Aire amplio (por defecto).",
        xl: "Aire muy amplio.",
      }),
      // Espaciado fino por lado (Tanda 2 F06/D6): overrides opcionales de `espaciadoVertical` por lado.
      padArriba: describir(ESPACIADO_V, {
        ninguno: "Sin aire arriba.",
        s: "Poco aire arriba.",
        m: "Aire medio arriba.",
        l: "Aire amplio arriba.",
        xl: "Aire muy amplio arriba.",
      }),
      padAbajo: describir(ESPACIADO_V, {
        ninguno: "Sin aire abajo.",
        s: "Poco aire abajo.",
        m: "Aire medio abajo.",
        l: "Aire amplio abajo.",
        xl: "Aire muy amplio abajo.",
      }),
      ancho: describir(ANCHO_SECCION, {
        contenido: "Ancho de lectura (por defecto).",
        ancho: "Más ancho.",
        completo: "De borde a borde (full-bleed).",
      }),
      anchoFondo: describir(ANCHO_FONDO, {
        completo: "Fondo de borde a borde (por defecto).",
        contenido: "Fondo acotado al contenido, con esquinas redondeadas (tipo tarjeta).",
      }),
      altoMin: describir(ALTO_MIN, {
        auto: "Alto según el contenido (por defecto).",
        media: "Al menos media ventana de alto.",
        pantalla: "Al menos toda la ventana de alto (hero a pantalla completa).",
      }),
      alinearVertical: describir(ALINEAR_VERTICAL, {
        arriba: "Contenido arriba (por defecto).",
        centro: "Contenido centrado en vertical (útil con alto de pantalla).",
        abajo: "Contenido abajo.",
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
        cartel: "Póster condensado (Bebas Neue + Space Grotesk).",
        clasica: "Refinada (Playfair + Source Sans).",
        tecnica: "Limpia/mono (IBM Plex Sans + Mono).",
      }),
      anchoContenido: describir(ANCHO_CONTENIDO, {
        contenido: "Ancho de lectura por defecto de las secciones.",
        ancho: "Secciones más anchas por defecto.",
        estrecho: "Columna angosta tipo boutique (editorial), centrada sobre un lienzo un pelo más oscuro.",
      }),
      fondoPagina: describir(ESQUEMAS_FONDO, {
        tema: "Transparente (usa el fondo del shell).",
        superficie: "Blanco/tinta (por defecto).",
        superficie_alt: "Gris suave de fondo.",
        marfil: "Off-white cálido tipo papel (editorial/boutique).",
        marca_suave: "Tinte claro de la marca de fondo.",
        marca: "Color de la marca a fondo lleno.",
        marca_profundo: "Marca oscura de fondo.",
        acento_suave: "Tinte claro del 2º color de marca (cae a marca sin acento).",
        acento: "2º color de marca a fondo lleno (cae a marca sin acento).",
        acento_profundo: "2º color de marca oscuro (cae a marca sin acento).",
        tinta: "Fondo casi negro.",
        tinta_profunda: "Negro profundo con un dejo de marca (más oscuro que tinta, fidelidad concert).",
        tinta_profunda_acento: "Negro profundo con un dejo del ACENTO (morado, fidelidad landing_idol).",
      }),
      // Ambiente / stage-lights (Tanda 2 F05/D5): focos radiales de tokens sobre el fondo de página.
      ambiente: describir(AMBIENTE_FONDO, {
        ninguno: "Sin focos (por defecto).",
        focos_marca: "Focos radiales del color de la marca (stage-lights).",
        focos_acento: "Focos radiales del 2º color de marca (cae a marca sin acento).",
        aurora: "Aurora: mezcla de focos de marca y acento.",
        neon: "Neón: focos saturados y concentrados (glow de recital), fidelidad concert.",
      }),
    },
  };
}
