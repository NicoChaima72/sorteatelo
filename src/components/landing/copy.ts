import { APP_CONFIG } from "~/config/app";
import { clp } from "~/lib/formato";

/**
 * Copy de la landing oficial de plataforma «El Talonario». Reposicionado **sorteo-first** por
 * `tasks/26-07-25-landing-reposicionamiento.md`: el producto es «monta tu sorteo online tú mismo,
 * en un día» y lo que se vende es el vehículo para participar (ADR-0008). Tono cercano chileno,
 * tuteo, sin urgencia ni escasez (design.md §8). Marca/dominio SIEMPRE desde `APP_CONFIG` (I7).
 *
 * Tres invariantes de TEXTO que este archivo no puede romper (los cubre
 * `src/__tests__/components/landing-copy.test.ts`):
 * - **cero «rifa»** en cualquier string visible (D1/I2) — la palabra solo vive en la metadata
 *   invisible del SEO (`seo.ts`);
 * - **«Flow» exactamente una vez** en toda la landing, dentro de la FAQ «¿Cómo me llega la plata?»
 *   y presentado como *el procesador* (D10/I3): el lector común no sabe qué es Flow;
 * - **nunca «sin comisiones» a secas** — siempre con el apellido «por venta» / «nuestras»
 *   (D9/I4): el procesador SÍ cobra su tarifa por transacción, y decirlo es parte de la promesa.
 */

export const HERO = {
  eyebrow: "Organiza sorteos online · Chile",
  /** El titular lleva plumón sobre «sorteo» y «Hoy» (se arma en el componente). */
  monta: "Monta tu ",
  sorteo: "sorteo",
  online: " online. ",
  hoy: "Hoy",
  mismo: " mismo.",
  bajada: `Con ${APP_CONFIG.name} armas tú mismo la tienda de tu sorteo: subes lo que vas a vender, activas los pagos con tarjeta y compartes el enlace — todo en un día, sin programadores ni cotizaciones.`,
  cta: "Crea tu tienda gratis",
  ctaGoogle: "Continuar con Google",
  nota: "Gratis para partir · Sin tarjeta",
};

export const HEADER_CTA = "Crea tu tienda gratis";

export const COMO_FUNCIONA = {
  eyebrow: "Cómo funciona",
  titulo: "De cero a tu sorteo andando, sin planillas ni cuadernos",
  /**
   * Remate de la sección: la promesa del «en un día» dicha al final de los pasos, no en el titular.
   * Va con plumón sobre `remateDestacado` (se arma en el componente) — así se lee como CIERRE de la
   * sección y no como un 5º paso huérfano bajo la grilla.
   */
  remate: "Todo esto, ",
  remateDestacado: "en una tarde.",
};

export const PASOS = [
  {
    numero: "01",
    titulo: "Crea tu tienda",
    texto:
      "Eliges la plantilla, pones tu logo y tus colores, escribes tus textos. Lista.",
  },
  {
    numero: "02",
    titulo: "Sube lo que vas a vender",
    texto:
      "Tu producto digital: una novela, un fanzine, una guía. Le pones precio y queda publicado.",
  },
  {
    numero: "03",
    titulo: "Activa los pagos con tarjeta",
    texto:
      "Conectas tu cuenta para cobrar y cada peso llega directo a ti. Te guiamos en el paso a paso.",
  },
  {
    numero: "04",
    titulo: "Comparte y sortea en vivo",
    texto:
      "Cada compra participa en el sorteo con su número. El ganador sale frente a todos.",
  },
];

export const MOMENTO = {
  eyebrow: "El momento clave",
  titulo: "El sorteo corre frente a todos, no a puertas cerradas",
  // HONESTIDAD (I9): la versión anterior cerraba con «un talonario que toda tu comunidad puede
  // ver». No existe esa superficie pública — el storefront muestra el CONTEO de participaciones,
  // no una grilla de números. Lo que sí es cierto, y es la fuerza del live: al apretar sortear, el
  // ganador aparece al instante en la pantalla del Organizador (`ejecutarSorteo`), que es lo que él
  // muestra o anuncia en vivo. La promesa pasa a ser el MOMENTO, no una vitrina que no existe.
  texto:
    "Cada compra pagada entra al sorteo con su número correlativo al tiro. Cuando cierras la venta, aprietas sortear en pleno live y el ganador aparece al instante en tu pantalla: lo anuncias ahí mismo, con tu comunidad mirando, en vez de «mañana les aviso».",
};

/**
 * Banda BLANCA «hazlo tú mismo» (F02) — el diferenciador contra montar el sorteo con una agencia:
 * autoservicio total, hoy, sin intermediarios. El argumento se hace por CONTRASTE y **sin nombrar a
 * nadie**: la landing no compara marcas ni enlaza a terceros (lo cubre `landing.hazlo.001`).
 */
export const HAZLO_TU_MISMO = {
  eyebrow: "Hazlo tú mismo",
  titulo: "No necesitas que nadie te lo monte",
  items: [
    {
      titulo: "Sin cotizaciones",
      texto:
        "Nadie te manda un presupuesto ni te deja esperando una respuesta. Entras, configuras y sigues con lo tuyo.",
    },
    {
      titulo: "Sin programadores",
      texto:
        "Cambiar un precio, una foto o un texto lo haces tú, cuando quieras, sin pedirle permiso a nadie.",
    },
    {
      titulo: "Sin dos semanas de espera",
      texto:
        "No hay proyecto ni plazo de entrega: tu tienda queda en línea el mismo día que la creas.",
    },
  ],
};

/**
 * Banda AMARILLA «precio» (F02) — el modelo comercial impreso completo (D3–D6). El monto vive UNA
 * vez como NÚMERO (`montoMensualClp`): la UI lo muestra formateado con el helper de moneda
 * (`clp`, nunca un `$` concatenado a mano) y el `Offer` del JSON-LD (F04) consume el número crudo.
 *
 * Honestidad obligatoria de esta sección (I9): el cobro de la suscripción TODAVÍA NO EXISTE — acá se
 * declara el modelo (configuras gratis, el plan corre cuando publicas), no un flujo de pago vivo.
 */
const MONTO_MENSUAL_CLP = 25_000;

export const PRECIO = {
  eyebrow: "Precio",
  titulo: "Un solo plan, todo incluido",
  /** Fuente única del monto. La UI usa `monto`; el JSON-LD usa este número. */
  montoMensualClp: MONTO_MENSUAL_CLP,
  monto: clp(MONTO_MENSUAL_CLP),
  periodo: "al mes",
  nota: "IVA incluido",
  incluye: [
    "Tu tienda en tu propio subdominio",
    "Pagos con tarjeta que llegan a tu cuenta",
    "Sorteos con participaciones automáticas",
    "Entrega automática de lo que vendes",
  ],
  gratis: "Configura tu tienda gratis. El plan corre cuando publicas.",
  multiTienda: "¿Otra tienda? La segunda en adelante, a mitad de precio.",
  comision: "Cero comisión por venta — pagas el plan fijo y punto.",
  remate: "Menos de mil pesos al día.",
};

export const CONFIANZA_INTRO = {
  eyebrow: "Sin letra chica",
  titulo: "Tu comunidad confía en ti. Acá se nota.",
  bajada:
    "Los sorteos truchos se delatan solos: números que nunca llegan, plata a cuentas personales, ganadores que nadie vio salir. " +
    `${APP_CONFIG.name} hace visible lo contrario — y no te cobra comisión por venta.`,
};

/** Cada tarjeta de confianza; el ícono Tabler se elige en el componente. */
export const CONFIANZA = [
  {
    titulo: "Tu plata nunca pasa por nosotros",
    texto: `Cobras directo en tu propia cuenta, con pago con tarjeta (Webpay). ${APP_CONFIG.name} no toca ni retiene tu plata.`,
  },
  {
    titulo: "Cada número queda registrado al tiro",
    // HONESTIDAD (I9), tercera versión y la primera que puede prometer algo. Las dos anteriores
    // decían de menos por buenas razones: «quien compró ve su número en pantalla y en su correo»
    // era falso (ninguna superficie lo mostraba) y se recortó a solo el registro automático.
    // **F03/C1 lo volvió cierto por el lado del correo**: la confirmación de compra lleva los
    // números —con el prefijo de la Tienda si lo configuró— y nombra el sorteo. Lo que sigue sin
    // existir es la PANTALLA (retorno post-pago / buscador de tickets, backlog de
    // `landing-reposicionamiento`), así que la frase habla de correo y no de ver.
    // Ojo con lo que NO se puede afirmar acá: el Organizador SÍ puede arrastrar participantes de un
    // sorteo anterior (modal de importar en `src/pages/admin/sorteo.tsx`), así que un "nadie agrega
    // participantes después" sería falso. Lo cierto es que la compra pagada entra sola.
    texto:
      "Apenas se confirma el pago, esa compra entra al sorteo con sus números correlativos y le llegan por correo a quien compró. Automático: nadie tiene que anotar nada en un cuaderno.",
  },
  {
    // "Tus PDFs" hasta productos-tipos-digitales F04: la promesa de entrega privada nunca fue del
    // PDF en particular (el enlace por token y su expiración son iguales para las 9 extensiones),
    // así que nombrar un solo tipo acá dejaba la tarjeta contradiciendo a la FAQ de abajo.
    titulo: "Tus archivos, solo para quien compró",
    texto:
      "Cada compra genera un enlace privado que expira. Tu trabajo no termina circulando gratis por ahí.",
  },
];

/**
 * Testimonio del piloto — atribución HONESTA (pendiente de autorización, I8/plan D9).
 *
 * Ojo: una cita también AFIRMA cosas del producto, y no deja de ser una promesa por ir entre
 * comillas. La versión anterior terminaba con «y mi comunidad lo ve» (el número), superficie que no
 * existe — se reemplazó por lo que la Organizadora sí vive: el registro automático y correr el
 * sorteo en vivo sin miedo a equivocarse.
 */
export const TESTIMONIO = {
  cita: "«Antes anotaba los números en un cuaderno y rezaba para no equivocarme. Ahora cada compra queda registrada sola y el sorteo lo corro en vivo, tranquila.»",
  atribucion: "Organizadora del piloto · nombre y foto pendientes de autorización",
};

export const FAQ_INTRO = {
  eyebrow: "Preguntas frecuentes",
  titulo: "Lo que preguntaría tu yo de hace cinco minutos",
};

/**
 * FAQ — 9 entradas en el ORDEN aprobado (D12): la plata y el «¿esto es para mí?» primero, lo
 * tributario al final. El orden es load-bearing por partida doble: es el orden en que se leen en
 * pantalla Y el orden del `FAQPage` del JSON-LD, que se DERIVA de este array (F04/I10) — nunca se
 * duplican los textos a mano.
 *
 * Dos reglas duras viven acá:
 * - la respuesta de «¿Cómo me llega la plata?» es la **única** de toda la landing que puede nombrar
 *   a Flow, y siempre como *el procesador* (D10/I3);
 * - las respuestas de producto son HONESTAS (I9): un sorteo ACTIVO a la vez por tienda (el guard
 *   secuencial real del dominio) y el set de tipos + el límite de 20 MB por archivo que el pipeline
 *   realmente acepta (productos-tipos-digitales D1/D7). Prometer de más acá se paga en soporte —
 *   y prometer de MENOS espanta al Organizador que sí calza.
 */
export const FAQ = [
  {
    pregunta: "¿Cuánto cuesta?",
    respuesta:
      `Configurar tu tienda es gratis: el plan corre cuando publicas. Son ${PRECIO.monto} al mes, IVA incluido. Si abres una segunda tienda, esa y las que sigan quedan a mitad de precio. No te cobramos comisión por venta — lo que vendas es tuyo. Eso sí: el procesador de pagos cobra su tarifa por transacción, la ves en tu propia cuenta y no pasa por nosotros.`,
  },
  {
    pregunta: "¿Qué puedo vender?",
    // productos-tipos-digitales F04/D1/D7: dejó de ser PDF-only. La letra chica que SÍ va acá es el
    // límite de peso (un WAV largo o un ZIP grande no entran) y que video todavía no — las dos
    // preguntas que llegarían a soporte igual. El límite lo verifica `landing.faq.006` contra
    // `LIMITE_BYTES_ARCHIVO_PRODUCTO`, así que no puede quedar desactualizado en silencio.
    respuesta:
      "Productos digitales: PDF, EPUB, imágenes (PNG, JPG, WebP), audio (MP3, M4A, WAV) y ZIP para armar packs — tu novela, tu fanzine, tu guía, tus plantillas, tus stickers. Hasta 20 MB por archivo; video todavía no. Le pones precio, se entrega solo apenas se confirma el pago, y cada compra participa en el sorteo.",
  },
  {
    pregunta: "¿Necesito saber de páginas web?",
    respuesta:
      "No. Eliges la plantilla, subes tu logo, eliges tus colores y escribes tus textos. No hay nada que programar ni nadie a quien contratarle: lo que ves es lo que queda publicado.",
  },
  {
    pregunta: "¿Cómo me llega la plata?",
    respuesta:
      "Directo a tu cuenta: tu plata nunca pasa por nosotros. Los pagos con tarjeta los recibe Flow, el procesador que gestiona el cobro de tu tienda; creas tu cuenta gratis mientras configuras y te vamos guiando paso a paso. El procesador cobra su tarifa por transacción y la ves en tu propia cuenta.",
  },
  {
    // HONESTIDAD (I9) — la pregunta nació reformulada porque la original («¿con qué número quedó?»)
    // no tenía respuesta verdadera: el número se generaba pero NADIE lo veía.
    // **F03/C1 (Q1-e) la volvió respondible**: el correo de confirmación lleva los Números del
    // sorteo de esa compra y nombra el sorteo, así que ahora la respuesta puede decir exactamente
    // eso — que es, además, lo que el Comprador realmente pregunta.
    // Lo que sigue SIN existir, y por eso no se promete: una pantalla donde consultarlos
    // (`src/pages/checkout/retorno.tsx` solo confirma el pago, y no hay cuenta de Comprador —
    // ADR-0004). El panel del Organizador sí los muestra, pero es SU panel, no una superficie del
    // Comprador: por eso la frase del panel habla de lo que ve el Organizador.
    pregunta: "¿Cómo sabe el comprador que su compra entró al sorteo?",
    respuesta:
      "Al confirmarse el pago le llega un correo con sus números del sorteo, el nombre del sorteo y cuándo cierra, junto con la descarga de lo que compró. En tu tienda se ve el total de participaciones al día, y en tu panel ves quién participó, con cuántos tickets y con qué números. Nadie tiene que anotar nada a mano.",
  },
  {
    pregunta: "¿Cómo se elige al ganador del sorteo?",
    respuesta:
      "Cada compra pagada recibe números correlativos. Cuando cierras el sorteo, la plataforma sortea entre esos números y te muestra el resultado para que lo anuncies en tu live, frente a tu comunidad.",
  },
  {
    pregunta: "¿Puedo hacer más de un sorteo?",
    respuesta:
      "Todos los que quieras, uno después de otro: cada tienda tiene un sorteo activo a la vez, y cuando cierras uno montas el siguiente con la misma tienda. Si necesitas dos corriendo en paralelo, abres una segunda tienda — esa y las que sigan van a mitad de precio.",
  },
  {
    pregunta: "¿Qué pasa si un pago falla o queda a medias?",
    respuesta:
      "Solo las compras confirmadas participan del sorteo y pueden descargar el archivo. Si un pago queda pendiente o falla, queda marcado tal cual en tu panel — sin números fantasma.",
  },
  {
    pregunta: "¿Necesito iniciar actividades en el SII o dar boleta?",
    respuesta:
      "Vender por internet en Chile tiene obligaciones tributarias que dependen de tu situación (inicio de actividades, boleta, IVA). Eso corre por tu cuenta como organizador — te dejamos una guía para partir, pero para tu caso puntual conviene asesorarse.",
  },
];

export const CTA_FINAL = {
  // Grafía de boleto real («ADMIT ONE»), NO escasez. La versión anterior decía «Admite a 1 (una)
  // tienda NUEVA», que se leía como «solo aceptamos una tienda más» — lenguaje de cupo limitado,
  // justo la bandera de estafa que design.md §8 prohíbe en el chrome de plataforma. Sin «nueva», la
  // línea vuelve a ser lo que dice un talón: este boleto vale para una tienda (que además es el
  // modelo real — la segunda tienda es otro plan, a mitad de precio).
  eyebrow: "Admite a 1 (una) tienda",
  titulo: "Tu próximo sorteo puede ser el más ordenado de tu vida",
  bajada:
    "Crea tu tienda hoy, sube tu producto y deja que los números se repartan solos.",
  numero: "Nº 000001",
  cta: "Crea tu tienda gratis",
};

export const FOOTER = `© 2026 · ${APP_CONFIG.dominio} · Cada tienda es operada de forma independiente por su organizador.`;

/** Copy del login split cobalto (F04). */
export const LOGIN = {
  eyebrow: "Panel del organizador",
  titulo: "Hola de nuevo",
  bajada: "Entra a tu tienda y mira cómo va tu sorteo.",
  cta: "Continuar con Google",
  errorMsg: "No se pudo iniciar sesión. Intenta de nuevo.",
  testimonio:
    "«Antes anotaba los números en un cuaderno y rezaba para no equivocarme. Ahora cada compra queda con su número al tiro.»",
  testimonioAtribucion: "Organizadora del piloto",
  sinCuenta: "¿Todavía no tienes tienda?",
  sinCuentaCta: "Crea la tuya gratis",
};
