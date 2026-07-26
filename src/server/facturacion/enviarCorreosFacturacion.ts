import { armarCorreoFacturacion } from "~/server/domain/correo/plantillasFacturacion";
import { type CorreoAEnviar } from "~/server/domain/correo/plantillasFacturacion";
import { type CorreoService } from "~/server/services/correo";

/**
 * Borde de envío de los correos de facturación (F04, D10, I9): toma los correos que el use case
 * DECIDIÓ y los redacta con la plantilla pura + los manda por el `CorreoService`.
 *
 * Vive en el borde y no en el use case a propósito: el dominio no conoce el proveedor de correo (el
 * use case devuelve intenciones, no envía). Espeja `enviarCorreoDescargaDeOrden` del mundo Comprador.
 *
 * **Resiliente por correo**: si un envío falla, los demás igual salen. Importa en el caso real de dos
 * correos juntos —comprobante + «tu tienda volvió a vender»— donde perder el segundo por un hipo en el
 * primero sería justo perder la buena noticia. Ningún fallo se propaga: el caller ya commiteó la
 * transición y el correo es secundario a ella (I9).
 *
 * No se loguea el destinatario: es el correo del Pagador, un dato personal que no tiene por qué
 * quedar en los logs (mismo criterio que el webhook de ventas con el email del Comprador).
 */
export async function enviarCorreosFacturacion({
  correo,
  correos,
}: {
  correo: CorreoService;
  correos: CorreoAEnviar[];
}): Promise<{ enviados: number; fallidos: number }> {
  let enviados = 0;
  let fallidos = 0;

  for (const item of correos) {
    const armado = armarCorreoFacturacion(item.datos);
    try {
      await correo.enviarCorreo({
        from: armado.from,
        to: item.destinatario,
        subject: armado.subject,
        text: armado.text,
        html: armado.html,
      });
      enviados++;
    } catch (e) {
      fallidos++;
      console.error(
        "[facturacion] no se pudo enviar un correo de facturación (la transición ya quedó registrada)",
        {
          tipo: item.datos.tipo,
          error: e instanceof Error ? e.message : String(e),
        },
      );
    }
  }

  return { enviados, fallidos };
}
