import { remitenteDeCorreo } from "~/config/correo";
import { escaparHtml, sanearCabecera } from "~/server/domain/correo/_correoBase";
import {
  construirFrom,
  envolverEnLayout,
  estilosDeCuerpo,
  FUENTE_MONO,
  sanearNombreTienda,
  temaDeCorreo,
  ticketsDeNumeros,
} from "~/server/domain/correo/layoutCorreo";

/**
 * Plantillas PURAS del **resultado del sorteo** — C4 (ganador) y C5 (no ganador), F04/D4. Sin `db`,
 * sin red, sin `env`: reciben los datos ya derivados del `Raffle` y devuelven el
 * `{ from, subject, text, html }` listo para el `CorreoService`.
 *
 * ── Los dos correos son hermanos, y por eso viven juntos ───────────────────────────────────────
 * Salen del MISMO hecho (el sorteo se ejecutó) y comparten casi todo: el sorteo NOMBRADO (I10), el
 * número ganador como boleto (D10) con el prefijo de la Tienda (D12), el mismo layout con la marca
 * del tenant (I11) y la misma voz. Separarlos en dos archivos haría que se desincronizaran en el
 * primer cambio de copy; lo único que difiere es a quién le habla cada uno.
 *
 * ── D4: qué lleva el de NO ganador y qué NO ─────────────────────────────────────────────────────
 * Decisión cerrada del plan: va **a todos** los participantes, **limpio y transaccional**, con el
 * número ganador pero **SIN nombre ni email del ganador** (Ley 21.719 — el ganador no consintió que
 * su identidad se difunda a los demás compradores) y **sin promo adentro** (el descuento de
 * consuelo, C9, sería otro correo y es de otra tanda).
 *
 * Eso último no es solo una regla escrita: `SorteoResuelto` **no tiene un campo donde meter la
 * identidad del ganador**. Una plantilla que no puede recibir el dato no puede filtrarlo por
 * descuido — el número ganador viaja como `number`, que es exactamente lo comunicable.
 *
 * Voz chilena sobria, tuteo (docs/design.md §8). Sin lenguaje de urgencia ni de rifa: el correo de
 * no ganador es el que más fácil se vuelve un aviso publicitario, y no lo es.
 */

/** Lo que se sabe del sorteo YA EJECUTADO. No incluye —ni puede incluir— quién ganó (D4). */
export interface SorteoResuelto {
  /** Nombre del sorteo — obligatorio: todo correo que habla de un sorteo lo NOMBRA (I10). */
  nombre: string;
  /** `Raffle.premio`: qué se ganó. Es la razón por la que el Comprador entró. */
  premio: string;
  /**
   * `Raffle.ganadorNumero` — el Número del sorteo del ticket ganador (ADR-0024 §5). `null` solo en
   * sorteos ejecutados antes de ADR-0024 (histórico irreconstruible): el correo sale igual, sin el
   * boleto, en vez de imprimir un número inventado (design.md §5.2).
   */
  numeroGanador: number | null;
  /** `Tenant.prefijoTicket` (D12) — el MISMO texto que muestra el panel. `null` ⇒ número pelado. */
  prefijoTicket: string | null;
  /** `Raffle.basesPdfUrl` (ADR-0008). Ausente ⇒ no se muestra el enlace, nunca uno roto. */
  basesUrl?: string | null;
}

export interface CorreoResultadoArmado {
  from: string;
  subject: string;
  text: string;
  html: string;
}

/** Branding de la Tienda que el layout necesita (D9-rev/I11). Igual en los dos correos. */
interface MarcaDeLaTienda {
  nombreTienda: string;
  /** `Tenant.logoUrl` — encabezado con el logo; sin él, el nombre como texto (D11). */
  logoUrl?: string | null;
  /** `Tenant.colorPrimario` — tematiza el cuerpo; inválido/ausente ⇒ theme base (I11). */
  colorPrimario?: string | null;
  /** `Tenant.identidadLegal` (F05/D6) — quién responde por la venta, en el pie. Ausente ⇒ sin línea. */
  identidadLegal?: string | null;
}

/** Rótulo del boleto ganador. Mono y en versalitas, como el resto de los sellos del talonario. */
const ROTULO_GANADOR = "NÚMERO GANADOR";
/** Rótulo de los números propios en el correo de no ganador. */
const ROTULO_PROPIOS = "TUS NÚMEROS";

/**
 * El sorteo, listo para usar en una CABECERA y en el cuerpo.
 *
 * Estos son los primeros correos del sistema cuyo **asunto** lleva texto del sorteo (los de C1 solo
 * llevaban el nombre de la Tienda, que ya venía saneado), así que el nombre y el premio —que escribe
 * el Organizador, y con el self-service escribe cualquiera— tienen que pasar por el saneo de
 * cabeceras ANTES de entrar al `subject`: un `\r\n` ahí es una cabecera inyectada, no un renglón.
 *
 * Vacío tras sanear ⇒ `nombre: ""`, y cada frase decide cómo decirlo sin dejar un hueco («Ganaste el
 * sorteo!» en vez de «Ganaste el sorteo  !»). El slot del layout recibe el nombre CRUDO a propósito:
 * esa defensa es suya y `sanearCabecera` es idempotente.
 */
function textosDelSorteo(sorteo: SorteoResuelto) {
  const nombre = sanearCabecera(sorteo.nombre, "");
  return {
    nombre,
    /** Sufijo « <nombre>» o vacío: para frases que nombran el sorteo sin quedar cojas. */
    sufijo: nombre ? ` ${nombre}` : "",
    /** El nombre, o un genérico cuando la frase necesita un sujeto sí o sí. */
    sujeto: nombre || "el sorteo",
    premio: sanearCabecera(sorteo.premio, ""),
  };
}

/**
 * Bloque de bases del sorteo. Va en los DOS correos cuando la Tienda las cargó: el resultado es
 * justo el momento en que alguien quiere leer las reglas con las que se sorteó (ADR-0008).
 */
function bloqueBases(
  basesUrl: string | null | undefined,
  estilo: ReturnType<typeof estilosDeCuerpo>,
): { texto: string[]; html: string[] } {
  if (!basesUrl) return { texto: [], html: [] };
  return {
    texto: [`Bases del sorteo: ${basesUrl}`, ``],
    html: [
      `<p style="${estilo.nota}margin-bottom:12px;"><a href="${escaparHtml(basesUrl)}" style="${estilo.enlace}">Bases del sorteo</a></p>`,
    ],
  };
}

/** Rótulo mono sobre un grupo de boletos (mismo tratamiento que el de C1). */
function rotulo(texto: string, color: string): string {
  return `<p style="margin:0 0 8px;font-family:${FUENTE_MONO};font-size:11px;letter-spacing:0.08em;color:${color};">${escaparHtml(texto)}</p>`;
}

/**
 * **C4 — al ganador**: felicitación con el sorteo nombrado y el premio, su número ganador como
 * boleto, y qué hacer ahora.
 *
 * El canal de contacto es **responder el correo** y no una dirección impresa: el reply-to lo pone el
 * use case (`Tenant.contactoEmail ?? membresía más antigua`, T6) y la membresía es el correo
 * PERSONAL con el que el Organizador entró con Google — imprimirlo en el cuerpo sería publicarle un
 * dato que nunca eligió publicar. Cuando la Tienda sí tiene un contacto público configurado (el
 * mismo que muestra el footer del storefront), se ofrece además como alternativa.
 */
export function armarCorreoResultadoGanador({
  nombreTienda,
  logoUrl,
  colorPrimario,
  identidadLegal,
  sorteo,
  contactoPublico,
}: MarcaDeLaTienda & {
  sorteo: SorteoResuelto;
  /**
   * `Tenant.contactoEmail` — el correo de contacto PÚBLICO de la Tienda (el del footer del
   * storefront). Ausente ⇒ el correo solo invita a responder, nunca muestra el email personal del
   * Organizador.
   */
  contactoPublico?: string | null;
}): CorreoResultadoArmado {
  // C4/C5 son TRANSACCIONALES (I5/D4): el resultado del sorteo le llega a todo el que
  // participó, sin opt-in y sin cabeceras de baja.
  const from = construirFrom(nombreTienda, remitenteDeCorreo("transaccional"));
  const tienda = sanearNombreTienda(nombreTienda);
  const { sufijo, premio } = textosDelSorteo(sorteo);
  const tema = temaDeCorreo(colorPrimario);
  const ESTILO = estilosDeCuerpo(tema);

  const boleto = ticketsDeNumeros({
    numeros: sorteo.numeroGanador === null ? [] : [sorteo.numeroGanador],
    tema,
    prefijo: sorteo.prefijoTicket,
  });

  const subject = `¡Ganaste el sorteo${sufijo}!`;
  const preheader = boleto.texto
    ? `Tu número ${boleto.texto} ganó ${premio}`
    : `Ganaste ${premio}`;

  const contacto = contactoPublico?.trim();
  const instruccion =
    `Responde este correo para coordinar la entrega con ${tienda}.` +
    (contacto ? ` También puedes escribir a ${contacto}.` : "");
  // En HTML el contacto va como `mailto:`, igual que el footer del storefront
  // (`storefront-layout.tsx`): es un canal, no un dato para copiar a mano.
  const instruccionHtml = contacto
    ? `${escaparHtml(`Responde este correo para coordinar la entrega con ${tienda}. También puedes escribir a `)}` +
      `<a href="mailto:${escaparHtml(contacto)}" style="${ESTILO.enlace}">${escaparHtml(contacto)}</a>.`
    : escaparHtml(instruccion);
  const bases = bloqueBases(sorteo.basesUrl, ESTILO);

  const { text, html } = envolverEnLayout({
    nombreTienda,
    logoUrl,
    colorPrimario,
    identidadLegal,
    nombreSorteo: sorteo.nombre, // slot del layout (I10)
    preheader,
    texto: [
      `Hola,`,
      ``,
      `Ganaste el sorteo${sufijo} de ${tienda}. El premio es ${premio}.`,
      ``,
      ...(boleto.texto ? [`Tu número ganador:`, ``, `  ${boleto.texto}`, ``] : []),
      instruccion,
      ``,
      ...bases.texto,
    ],
    html: [
      `<p style="${ESTILO.parrafo}">Hola,</p>`,
      `<p style="${ESTILO.parrafo}">Ganaste el sorteo${sufijo ? ` <strong>${escaparHtml(sufijo.trim())}</strong>` : ""} de ${escaparHtml(tienda)}. El premio es ${escaparHtml(premio)}.</p>`,
      ...(boleto.html
        ? [rotulo(ROTULO_GANADOR, tema.acento), boleto.html]
        : []),
      `<p style="${ESTILO.parrafo}padding-top:8px;">${instruccionHtml}</p>`,
      ...bases.html,
    ],
  });

  return { from, subject, text, html };
}

/**
 * **C5 — a quien no ganó**: el resultado, sin promo y sin identidad ajena (D4).
 *
 * Muestra DOS grupos de boletos con rótulos distintos —el número que ganó y los suyos— porque son
 * dos datos distintos y un solo grupo se leería como «estos ganaron». El de arriba es el hecho
 * público del sorteo; el de abajo, lo que esta persona jugó.
 */
export function armarCorreoResultadoNoGanador({
  nombreTienda,
  logoUrl,
  colorPrimario,
  identidadLegal,
  sorteo,
  numeros,
}: MarcaDeLaTienda & {
  sorteo: SorteoResuelto;
  /** Los Números del sorteo de ESTA persona (todos sus tickets del sorteo). */
  numeros: number[];
}): CorreoResultadoArmado {
  // C4/C5 son TRANSACCIONALES (I5/D4): el resultado del sorteo le llega a todo el que
  // participó, sin opt-in y sin cabeceras de baja.
  const from = construirFrom(nombreTienda, remitenteDeCorreo("transaccional"));
  const tienda = sanearNombreTienda(nombreTienda);
  const { nombre, sufijo, sujeto } = textosDelSorteo(sorteo);
  const tema = temaDeCorreo(colorPrimario);
  const ESTILO = estilosDeCuerpo(tema);

  const ganador = ticketsDeNumeros({
    numeros: sorteo.numeroGanador === null ? [] : [sorteo.numeroGanador],
    tema,
    prefijo: sorteo.prefijoTicket,
  });
  const propios = ticketsDeNumeros({
    numeros,
    tema,
    prefijo: sorteo.prefijoTicket,
    // Los propios en tinta y el ganador en el acento: con los dos grupos en el mismo color se leen
    // como UNA lista y el destinatario puede creer que sus números salieron.
    variante: "neutro",
  });

  const subject = `Resultado del sorteo${sufijo}`;
  const preheader = ganador.texto
    ? `El número ganador fue ${ganador.texto}`
    : `Ya se sorteó ${sujeto}`;

  const bases = bloqueBases(sorteo.basesUrl, ESTILO);
  const cierre = `Esta vez no salió. Gracias por participar en ${tienda}.`;

  const { text, html } = envolverEnLayout({
    nombreTienda,
    logoUrl,
    colorPrimario,
    identidadLegal,
    nombreSorteo: sorteo.nombre, // slot del layout (I10)
    preheader,
    texto: [
      `Hola,`,
      ``,
      `Ya se sorteó ${sujeto} de ${tienda}.`,
      ``,
      ...(ganador.texto
        ? [`El número ganador fue:`, ``, `  ${ganador.texto}`, ``]
        : []),
      ...(propios.texto
        ? [`Tus números eran:`, ``, `  ${propios.texto}`, ``]
        : []),
      cierre,
      ``,
      ...bases.texto,
    ],
    html: [
      `<p style="${ESTILO.parrafo}">Hola,</p>`,
      `<p style="${ESTILO.parrafo}">Ya se sorteó <strong>${escaparHtml(nombre || sujeto)}</strong> de ${escaparHtml(tienda)}.</p>`,
      ...(ganador.html
        ? [rotulo(ROTULO_GANADOR, tema.acento), ganador.html]
        : []),
      ...(propios.html
        ? [
            rotulo(ROTULO_PROPIOS, ESTILO.colorSecundario),
            propios.html,
          ]
        : []),
      `<p style="${ESTILO.parrafo}padding-top:8px;">${escaparHtml(cierre)}</p>`,
      ...bases.html,
    ],
  });

  return { from, subject, text, html };
}
