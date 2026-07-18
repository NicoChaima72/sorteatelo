import { APP_CONFIG } from "~/config/app";

/**
 * Copy de la landing oficial de plataforma «El Talonario» (F03). **Migrado tal cual** del copy
 * aprobado del prototipo (`src/components/prototipo/copy.ts` + `v1-talonario.tsx`), sin reescribir
 * (I8) — solo se reemplazan los literales de marca por `APP_CONFIG` (nombre/dominio nunca
 * hardcodeados, I8). Tono cercano chileno, tuteo (design.md §8).
 */

export const HERO = {
  eyebrow: "Para creadores que hacen lives · Chile",
  /** El titular lleva plumón sobre «Vende» y «Sortea» (se arma en el componente). */
  vende: "Vende",
  entre: " lo que hiciste. ",
  sortea: "Sortea",
  despues: " entre quienes te compraron.",
  bajada: `${APP_CONFIG.name} es tu tienda para vender tus PDFs y hacer sorteos en vivo — sin saber de páginas web, cobrando con tu propia cuenta de Flow.`,
  cta: "Crea tu tienda gratis",
  ctaGoogle: "Continuar con Google",
  nota: "Gratis para partir · Sin tarjeta",
};

export const HEADER_CTA = "Crea tu tienda gratis";

export const COMO_FUNCIONA = {
  eyebrow: "Cómo funciona",
  titulo: "De cero a tu primer sorteo, sin planillas ni cuadernos",
};

export const PASOS = [
  {
    numero: "01",
    titulo: "Sube tus PDFs",
    texto:
      "Tu novela, tu fanzine, tus guías. Les pones precio y quedan a la venta.",
  },
  {
    numero: "02",
    titulo: "Conecta tu Flow",
    texto: "Cobras con tu propia cuenta. Cada peso llega directo a ti.",
  },
  {
    numero: "03",
    titulo: "Comparte tu tienda",
    texto: "Tu propio enlace, listo para la bio y para mostrarlo en el live.",
  },
  {
    numero: "04",
    titulo: "Sortea en vivo",
    texto: "Cada compra da un número. El ganador sale frente a todos.",
  },
];

export const MOMENTO = {
  eyebrow: "El momento clave",
  titulo: "El sorteo corre frente a todos, no a puertas cerradas",
  texto:
    "Cada compra pagada recibe su número correlativo al tiro. Cuando cierras la venta, aprietas sortear en tu live y el ganador sale de un talonario que toda tu comunidad puede ver.",
};

export const CONFIANZA_INTRO = {
  eyebrow: "Sin letra chica",
  titulo: "Tu comunidad confía en ti. Acá se nota.",
  bajada:
    "Las rifas truchas se delatan solas: números que nunca llegan, plata a cuentas personales, sorteos a puertas cerradas. " +
    `${APP_CONFIG.name} hace visible lo contrario.`,
};

/** Cada tarjeta de confianza; el ícono Tabler se elige en el componente. */
export const CONFIANZA = [
  {
    titulo: "Tu plata nunca pasa por nosotros",
    texto: `Cobras con tu propia cuenta de Flow (Webpay, tarjetas). ${APP_CONFIG.name} no toca ni retiene tu plata.`,
  },
  {
    titulo: "Cada número queda registrado al tiro",
    texto:
      "Apenas se confirma el pago, quien compró ve su número en pantalla y en su correo. Nada de «después te lo mando».",
  },
  {
    titulo: "Tus PDFs, solo para quien compró",
    texto:
      "Cada compra genera un enlace privado que expira. Tu trabajo no termina circulando gratis por ahí.",
  },
];

/** Testimonio del piloto — atribución HONESTA (pendiente de autorización, I8/plan D9). */
export const TESTIMONIO = {
  cita: "«Antes anotaba los números en un cuaderno y rezaba para no equivocarme. Ahora cada compra queda con su número al tiro, y mi comunidad lo ve.»",
  atribucion: "Organizadora del piloto · nombre y foto pendientes de autorización",
};

export const FAQ_INTRO = {
  eyebrow: "Preguntas frecuentes",
  titulo: "Lo que preguntaría tu yo de hace cinco minutos",
};

export const FAQ = [
  {
    pregunta: "¿Necesito iniciar actividades en el SII o dar boleta?",
    respuesta:
      "Vender por internet en Chile tiene obligaciones tributarias que dependen de tu situación (inicio de actividades, boleta, IVA). Eso corre por tu cuenta como organizador — te dejamos una guía para partir, pero para tu caso puntual conviene asesorarse.",
  },
  {
    pregunta: "¿Cómo se elige al ganador del sorteo?",
    respuesta:
      "Cada compra pagada recibe números correlativos. Cuando cierras el sorteo, la plataforma sortea entre esos números y te muestra el resultado para que lo anuncies en tu live, frente a tu comunidad.",
  },
  {
    pregunta: "¿Qué pasa si un pago falla o queda a medias?",
    respuesta:
      "Solo las compras confirmadas por Flow participan del sorteo y pueden descargar el PDF. Si un pago queda pendiente o falla, queda marcado tal cual en tu panel — sin números fantasma.",
  },
  {
    pregunta: "¿Cuánto cuesta?",
    respuesta:
      "Crear tu tienda es gratis. El detalle de precios está en definición para el lanzamiento — sin comisiones escondidas sobre tus ventas: tú cobras con tu Flow y sabes exactamente qué paga cada compra.",
  },
];

export const CTA_FINAL = {
  eyebrow: "Admite a 1 (una) tienda nueva",
  titulo: "Tu próximo sorteo puede ser el más ordenado de tu vida",
  bajada:
    "Crea tu tienda hoy, sube tu primer PDF y deja que los números se repartan solos.",
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
