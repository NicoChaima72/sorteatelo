import { clp, fecha } from "~/lib/formato";
import {
  escaparHtml,
  sanearCabecera,
} from "~/server/domain/correo/_correoBase";
import {
  MARCA_PLATAFORMA,
  REMITENTE_CORREO,
} from "~/server/domain/correo/layoutCorreo";
import { type TipoCorreoFacturacion } from "~/server/domain/facturacion/_correosFacturacion";

/**
 * Plantillas PURAS de los 4 correos de facturación del webhook (F04, D10 1-4). Sin `db`, sin red,
 * sin `env`: reciben los datos ya derivados y devuelven el `{ from, subject, text, html }` listo para
 * el `CorreoService`.
 *
 * ── Quién le escribe a quién ──────────────────────────────────────────────────────────────────
 * Estos correos son el OTRO eje del correo del producto y por eso NO comparten plantilla con
 * `plantillaDescarga.ts`: allá la Plataforma escribe **en nombre de la Tienda** a un Comprador
 * («Tienda X · vía Sortéatelo», con el disclaimer de ADR-0008 porque la venta es del Organizador).
 * Acá escribe **Sortéatelo en nombre propio** a su cliente, el Pagador (D10): es la plataforma
 * cobrándole su mensualidad. El `from` es de plataforma, sin nombre de tienda, y no lleva disclaimer
 * de responsabilidad de venta — no hay venta de terceros de la que hablar.
 *
 * El receptor lo resuelve el use case (`PlatformBillingCustomer.email`, el snapshot con el que se
 * creó el customer en Flow) y NUNCA se interpola en el cuerpo: nada de repetirle su propio correo.
 *
 * Texto plano SIEMPRE (entregabilidad) + HTML mínimo inline, igual que la plantilla de descarga.
 * Voz: español neutro, sobrio, sin posesivos empalagosos ni «usted».
 */

/**
 * Los correos que esta plantilla sabe redactar. Es un SUPERSET de `TipoCorreoFacturacion` (los 4 que
 * decide el webhook de F04): los otros de D10 tienen su propio disparador — la cancelación la pide el
 * Organizador (F06) y los dos avisos preventivos los manda el cron (F09).
 *
 * La distinción es la que ya documenta `_correosFacturacion.ts`: ese módulo decide QUÉ amerita una
 * notificación de Flow, y su union tiene que quedarse chico para que el compilador no deje colar acá
 * un correo que ninguna transición produce. Este módulo, en cambio, es el redactor de todos.
 */
export type TipoCorreoPlataforma =
  | TipoCorreoFacturacion
  /** (5) El Organizador canceló: se confirma hasta cuándo sigue vendiendo (D6/F06). */
  | "CANCELACION_CONFIRMADA"
  /** (7) Se acerca el cobro automático del mes: lo avisa el cron diario (D11/F09). */
  | "RENOVACION_PROXIMA"
  /** (6) La cortesía tiene fecha de término y se acerca (D8/D11/F09). */
  | "EXENCION_POR_VENCER";

export interface DatosCorreoFacturacion {
  tipo: TipoCorreoPlataforma;
  /** Nombre de la Tienda a la que corresponde el cobro (una suscripción = una Tienda, D1). */
  nombreTienda: string;
  /** Monto bruto del invoice como string `Decimal` (IVA incluido). Se formatea, no se opera (I2). */
  montoBruto?: string;
  /** Link de pago manual que da Flow para regularizar (D4). */
  paymentLink?: string | null;
  /** `next_attemp_date` de Flow: cuándo va el próximo reintento del cobro. */
  proximoIntentoAt?: Date | null;
  /** Hasta cuándo sigue vendiendo la Tienda cancelada (D6). `null` = Flow no reportó el período. */
  cancelacionEfectivaAt?: Date | null;
  /** Cuándo se hace el cobro automático que se está anunciando (`next_invoice_date`, F09/D11). */
  proximoCobroAt?: Date;
  /** Cuándo se termina la cortesía que se está avisando (F09/D8). */
  exentaHasta?: Date;
}

/**
 * Un correo de plataforma listo para despacharse: a quién y con qué datos. Vive acá —y no en el use
 * case que lo produjo— porque es el par natural de `DatosCorreoFacturacion`: lo producen varios
 * (webhook F04, cancelación F06, cron F09) y lo consume uno solo, el borde de envío.
 */
export interface CorreoAEnviar {
  /** El Pagador y solo el Pagador (D10). */
  destinatario: string;
  datos: DatosCorreoFacturacion;
}

export interface CorreoFacturacionArmado {
  from: string;
  subject: string;
  text: string;
  html: string;
}

/** Remitente de PLATAFORMA: acá Sortéatelo no vende en nombre de nadie, cobra lo suyo. */
function fromPlataforma(): string {
  return `${MARCA_PLATAFORMA} <${REMITENTE_CORREO}>`;
}

/** Pie común: recuerda de qué se trata el correo sin sonar a boletín. */
const PIE = `Este correo es sobre el plan de ${MARCA_PLATAFORMA} de tu tienda. Puedes revisar el estado y el historial de cobros en el panel, en «Plan».`;

/** Línea del link de pago, o nada si Flow no lo dio (jamás un enlace vacío ni un "null"). */
function lineaPago(paymentLink: string | null | undefined): string[] {
  if (!paymentLink) {
    return [
      "Para regularizar el pago, entra al panel de tu tienda, a la sección «Plan».",
    ];
  }
  return [`Puedes pagarlo acá: ${paymentLink}`];
}

function lineaPagoHtml(paymentLink: string | null | undefined): string {
  if (!paymentLink) {
    return `<p>Para regularizar el pago, entra al panel de tu tienda, a la sección «Plan».</p>`;
  }
  const url = escaparHtml(paymentLink);
  return `<p><a href="${url}">Pagar el cobro pendiente</a></p>`;
}

export function armarCorreoFacturacion(
  d: DatosCorreoFacturacion,
): CorreoFacturacionArmado {
  // El nombre de la Tienda va en el subject (una cabecera): se sanea igual que en la plantilla de
  // descarga. En el cuerpo se escapa aparte para el HTML.
  const tienda = sanearCabecera(d.nombreTienda, "tu tienda");
  const tiendaHtml = escaparHtml(tienda);
  const monto = d.montoBruto ? clp(d.montoBruto) : null;
  const from = fromPlataforma();

  switch (d.tipo) {
    case "COMPROBANTE_PAGO": {
      const subject = `Comprobante del plan de ${tienda}`;
      const lineaMonto = monto
        ? `Monto: ${monto} (IVA incluido).`
        : `Monto: el de tu plan vigente.`;
      const text = [
        `Hola,`,
        ``,
        `Recibimos el pago del plan de ${tienda}. ${lineaMonto}`,
        ``,
        `Tu tienda sigue publicada y vendiendo con normalidad.`,
        `Si necesitas la boleta de este cobro, responde este correo y la emitimos.`,
        ``,
        `—`,
        PIE,
      ].join("\n");
      const html = [
        `<p>Hola,</p>`,
        `<p>Recibimos el pago del plan de <strong>${tiendaHtml}</strong>. ${escaparHtml(lineaMonto)}</p>`,
        `<p>Tu tienda sigue publicada y vendiendo con normalidad.</p>`,
        `<p>Si necesitas la boleta de este cobro, responde este correo y la emitimos.</p>`,
        `<hr />`,
        `<p style="color:#666;font-size:13px">${escaparHtml(PIE)}</p>`,
      ].join("");
      return { from, subject, text, html };
    }

    case "COBRO_FALLIDO": {
      const subject = `No pudimos cobrar el plan de ${tienda}`;
      const reintento = d.proximoIntentoAt
        ? `Vamos a reintentarlo el ${fecha(d.proximoIntentoAt)}.`
        : `Vamos a reintentarlo en los próximos días.`;
      const text = [
        `Hola,`,
        ``,
        `El cobro del plan de ${tienda}${monto ? ` (${monto})` : ""} no se pudo completar. ${reintento}`,
        ``,
        `Mientras tanto tu tienda sigue vendiendo con normalidad.`,
        ...lineaPago(d.paymentLink),
        `Si el problema es la tarjeta, puedes cambiarla en el panel, en «Plan».`,
        ``,
        `—`,
        PIE,
      ].join("\n");
      const html = [
        `<p>Hola,</p>`,
        `<p>El cobro del plan de <strong>${tiendaHtml}</strong>${monto ? ` (${escaparHtml(monto)})` : ""} no se pudo completar. ${escaparHtml(reintento)}</p>`,
        `<p>Mientras tanto tu tienda sigue vendiendo con normalidad.</p>`,
        lineaPagoHtml(d.paymentLink),
        `<p>Si el problema es la tarjeta, puedes cambiarla en el panel, en «Plan».</p>`,
        `<hr />`,
        `<p style="color:#666;font-size:13px">${escaparHtml(PIE)}</p>`,
      ].join("");
      return { from, subject, text, html };
    }

    case "TIENDA_EN_PAUSA": {
      const subject = `${tienda} quedó en pausa por falta de pago`;
      const text = [
        `Hola,`,
        ``,
        `Después de varios intentos no pudimos cobrar el plan de ${tienda}, así que la tienda quedó ` +
          `en pausa: por ahora no puede recibir compras nuevas.`,
        ``,
        `Lo que ya se vendió sigue intacto: quienes compraron mantienen sus enlaces de descarga y ` +
          `sus números del sorteo, y el verificador de tickets sigue funcionando.`,
        ``,
        ...lineaPago(d.paymentLink),
        `La tienda se reactiva sola en cuanto el pago se acredite.`,
        ``,
        `—`,
        PIE,
      ].join("\n");
      const html = [
        `<p>Hola,</p>`,
        `<p>Después de varios intentos no pudimos cobrar el plan de <strong>${tiendaHtml}</strong>, así que la tienda quedó en pausa: por ahora no puede recibir compras nuevas.</p>`,
        `<p>Lo que ya se vendió sigue intacto: quienes compraron mantienen sus enlaces de descarga y sus números del sorteo, y el verificador de tickets sigue funcionando.</p>`,
        lineaPagoHtml(d.paymentLink),
        `<p>La tienda se reactiva sola en cuanto el pago se acredite.</p>`,
        `<hr />`,
        `<p style="color:#666;font-size:13px">${escaparHtml(PIE)}</p>`,
      ].join("");
      return { from, subject, text, html };
    }

    case "TIENDA_REGULARIZADA": {
      const subject = `${tienda} volvió a estar al día`;
      const text = [
        `Hola,`,
        ``,
        `Recibimos el pago pendiente de ${tienda}${monto ? ` (${monto})` : ""}: la tienda ya está ` +
          `al día y vendiendo con normalidad.`,
        ``,
        `Gracias por regularizarlo.`,
        ``,
        `—`,
        PIE,
      ].join("\n");
      const html = [
        `<p>Hola,</p>`,
        `<p>Recibimos el pago pendiente de <strong>${tiendaHtml}</strong>${monto ? ` (${escaparHtml(monto)})` : ""}: la tienda ya está al día y vendiendo con normalidad.</p>`,
        `<p>Gracias por regularizarlo.</p>`,
        `<hr />`,
        `<p style="color:#666;font-size:13px">${escaparHtml(PIE)}</p>`,
      ].join("");
      return { from, subject, text, html };
    }

    case "CANCELACION_CONFIRMADA": {
      const subject = `Cancelamos el plan de ${tienda}`;
      // La fecha es el dato entero del correo: es hasta cuándo la tienda sigue vendiendo. Sin ella
      // (Flow todavía no reportó el período) se dice lo que SÍ se sabe en vez de inventar un día.
      const hasta = d.cancelacionEfectivaAt
        ? `Tu tienda sigue vendiendo hasta el ${fecha(d.cancelacionEfectivaAt)}, que es el fin del período que ya está pagado.`
        : `Tu tienda sigue vendiendo hasta que termine el período que ya está pagado.`;
      const text = [
        `Hola,`,
        ``,
        `Listo: cancelamos el plan de ${tienda}. No vamos a hacer cobros nuevos.`,
        ``,
        hasta,
        `Después de esa fecha deja de recibir compras, pero no se borra nada: los productos, el ` +
          `sorteo y las ventas quedan donde están, y quienes ya compraron conservan sus descargas.`,
        ``,
        `Si cambias de idea, puedes volver a activar el plan cuando quieras desde el panel, en «Plan».`,
        ``,
        `—`,
        PIE,
      ].join("\n");
      const html = [
        `<p>Hola,</p>`,
        `<p>Listo: cancelamos el plan de <strong>${tiendaHtml}</strong>. No vamos a hacer cobros nuevos.</p>`,
        `<p>${escaparHtml(hasta)}</p>`,
        `<p>Después de esa fecha deja de recibir compras, pero no se borra nada: los productos, el sorteo y las ventas quedan donde están, y quienes ya compraron conservan sus descargas.</p>`,
        `<p>Si cambias de idea, puedes volver a activar el plan cuando quieras desde el panel, en «Plan».</p>`,
        `<hr />`,
        `<p style="color:#666;font-size:13px">${escaparHtml(PIE)}</p>`,
      ].join("");
      return { from, subject, text, html };
    }

    case "RENOVACION_PROXIMA": {
      // El correo NOMBRA LA FECHA en vez de decir «mañana»: el cron de Vercel es best-effort y la
      // ventana de aviso es de 2 días (ver `DIAS_AVISO_RENOVACION`), así que el mismo texto tiene que
      // ser verdadero saliendo con 40 horas de anticipación o con 12. Un «mañana» falso en un correo
      // de cobro es peor que un día explícito.
      const dia = d.proximoCobroAt ? fecha(d.proximoCobroAt) : null;
      const subject = `Se acerca el cobro del plan de ${tienda}`;
      // Se arma en tres piezas (antes / nombre de la tienda / después) para que el HTML pueda
      // destacar el nombre sin recortar la frase ya armada.
      const antes = dia
        ? `El ${dia} hacemos el cobro automático del plan de `
        : `En los próximos días hacemos el cobro automático del plan de `;
      const lineaMonto = monto ? `: ${monto} (IVA incluido).` : `.`;
      const text = [
        `Hola,`,
        ``,
        `${antes}${tienda}${lineaMonto}`,
        ``,
        `No tienes que hacer nada: se cobra a la tarjeta que ya tienes registrada, y tu tienda sigue ` +
          `vendiendo con normalidad.`,
        `Si prefieres no seguir, puedes cancelar el plan antes de esa fecha desde el panel, en «Plan».`,
        ``,
        `—`,
        PIE,
      ].join("\n");
      const html = [
        `<p>Hola,</p>`,
        `<p>${escaparHtml(antes)}<strong>${tiendaHtml}</strong>${escaparHtml(lineaMonto)}</p>`,
        `<p>No tienes que hacer nada: se cobra a la tarjeta que ya tienes registrada, y tu tienda sigue vendiendo con normalidad.</p>`,
        `<p>Si prefieres no seguir, puedes cancelar el plan antes de esa fecha desde el panel, en «Plan».</p>`,
        `<hr />`,
        `<p style="color:#666;font-size:13px">${escaparHtml(PIE)}</p>`,
      ].join("");
      return { from, subject, text, html };
    }

    case "EXENCION_POR_VENCER": {
      // El correo NO cotiza el plan. El precio depende del Pagador (mitad de precio desde la 2ª
      // tienda, D1) y esta Tienda puede no tener ninguno todavía: imprimir $25.000 acá le mostraría
      // el número equivocado justo a quien pagaría $12.500. El panel lo calcula server-side y lo
      // dice bien; el correo manda a mirarlo.
      const dia = d.exentaHasta ? fecha(d.exentaHasta) : null;
      const subject = `El plan cortesía de ${tienda} se termina`;
      const antes = dia
        ? `El ${dia} se termina el plan cortesía de `
        : `Se termina el plan cortesía de `;
      const text = [
        `Hola,`,
        ``,
        `${antes}${tienda}.`,
        ``,
        `Hasta esa fecha no cambia nada. Después, la tienda deja de recibir compras nuevas hasta que ` +
          `actives un plan — lo que ya se vendió sigue intacto: quienes compraron mantienen sus ` +
          `enlaces de descarga y sus números del sorteo.`,
        ``,
        `Puedes activar tu plan cuando quieras desde el panel, en «Plan»: ahí está el precio que te ` +
          `corresponde.`,
        ``,
        `—`,
        PIE,
      ].join("\n");
      const html = [
        `<p>Hola,</p>`,
        `<p>${escaparHtml(antes)}<strong>${tiendaHtml}</strong>.</p>`,
        `<p>Hasta esa fecha no cambia nada. Después, la tienda deja de recibir compras nuevas hasta que actives un plan — lo que ya se vendió sigue intacto: quienes compraron mantienen sus enlaces de descarga y sus números del sorteo.</p>`,
        `<p>Puedes activar tu plan cuando quieras desde el panel, en «Plan»: ahí está el precio que te corresponde.</p>`,
        `<hr />`,
        `<p style="color:#666;font-size:13px">${escaparHtml(PIE)}</p>`,
      ].join("");
      return { from, subject, text, html };
    }
  }
}
