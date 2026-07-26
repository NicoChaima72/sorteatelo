import { type PrismaClient } from "@prisma/client";

import { armarConfirmacionesDeCompra } from "~/server/domain/correo/confirmacionDeCompra";
import { DomainError } from "~/server/domain/errors";
import { type CorreoService } from "~/server/services/correo";

/**
 * Use case de dominio: envía UN correo de **confirmación de compra** con todo lo de una orden.
 *
 * Nació en F04 mandando solo los enlaces de descarga; F03 lo hizo crecer a C1 (números del sorteo,
 * sorteo nombrado, cierre en hora de Chile, resumen de la compra) sin cambiar su firma ni su rol.
 * El nombre se conserva a propósito: sus dos callers —el reenvío del panel y los tests del
 * circuito— lo conocen así, y renombrarlo no agregaba nada. El CONTENIDO vive en
 * `confirmacionDeCompra.ts`, compartido con el resolvedor del cron.
 *
 * ── Quién lo usa, y quién NO ───────────────────────────────────────────────────────────────────
 * Lo usa el **reenvío del panel** (`reenviarCorreoDescargaDeOrden`), que es un «mandalo de nuevo»
 * explícito del Organizador: por eso NO pasa por el ledger. La fila de esa orden ya está `ENVIADO`
 * y hacerlo pasar por el claim significaría que el reenvío no manda nada, que es exactamente lo
 * contrario de lo que el Organizador pidió.
 *
 * El envío **post-pago** NO usa este use case: usa `enviarConfirmacionDeCompra`, que reclama la
 * fila del ledger antes de enviar (I2 — el correo automático jamás sale dos veces).
 *
 * Reglas duras:
 * - **I4 (tenancy / datos server-side)**: TODO el contenido se deriva de la ORDEN cargada por `db`
 *   a partir del `orderId` — jamás de un parámetro externo. El caller ya resolvió QUÉ orden es.
 * - **D7 (reply-to)**: `User.email` de la `TenantMembership` MÁS ANTIGUA del tenant. Sin membresía
 *   ⇒ correo sin reply-to (válido).
 * - **D8 (enlace)**: `<baseUrl>/entrega/<token>` — la PÁGINA de entrega (productos-tipos-digitales
 *   F09/D5). `baseUrl` entra como argumento (el borde lee env).
 * - **I3 (secretos/tokens)**: los tokens solo viajan en el correo al Comprador; este use case no los
 *   loguea. El `pdfPath`/keys del bucket NUNCA se cargan ni exponen — solo el token del grant.
 *
 * Corre FUERA de cualquier `$transaction` (post-commit, D1): los tokens ya existen en DB.
 */
export async function enviarCorreoDescargaDeOrden({
  db,
  correo,
  orderId,
  baseUrl,
}: {
  db: PrismaClient;
  // Solo el envío individual: este use case manda UN correo. Declarar la dependencia estrecha
  // (y no el `CorreoService` entero) documenta que el batch no le compete y mantiene los fakes
  // de sus tests mínimos.
  correo: Pick<CorreoService, "enviarCorreo">;
  orderId: string;
  baseUrl: string;
}): Promise<{ enviado: true; id: string; items: number }> {
  const armadas = await armarConfirmacionesDeCompra({
    db,
    orderIds: [orderId],
    baseUrl,
    // Reenvío deliberado ⇒ SIN `Idempotency-Key`. Con la clave del envío automático, Resend
    // trataría el reenvío como reintento del original dentro de sus 24 h de ventana y devolvería
    // la respuesta cacheada: este use case devolvería `{ enviado: true }`, el panel diría
    // «reenviado» y el buzón del Comprador seguiría vacío. Es la misma razón por la que este
    // camino tampoco pasa por el claim del ledger.
    idempotencia: "reenvio-manual",
  });
  const armada = armadas.get(orderId);

  if (!armada) {
    // No debería ocurrir: el caller confirma/valida la orden antes de invocar. Si pasa, es una
    // violación de integridad, no una condición esperada del correo.
    throw new DomainError(
      "NOT_FOUND",
      `Orden ${orderId} inexistente al enviar el correo de confirmación`,
    );
  }

  const { id } = await correo.enviarCorreo(armada.correo);

  return { enviado: true, id, items: armada.items };
}
