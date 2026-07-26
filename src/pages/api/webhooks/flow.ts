import { waitUntil } from "@vercel/functions";
import { type NextApiRequest, type NextApiResponse } from "next";

import { baseUrlApp, crearCorreoDeEnv } from "~/server/correo/correoDeEnv";
import { aplicarEfectosPostPago } from "~/server/domain/pago/aplicarEfectosPostPago";
import { enviarConfirmacionDeCompra } from "~/server/domain/correo/enviarConfirmacionDeCompra";
import { confirmarPagoDeOrden } from "~/server/domain/pago/confirmarPagoDeOrden";
import { db } from "~/server/db";
import { conCorreoPostPago } from "~/server/pago/conCorreoPostPago";
import {
  crearEnrutadorFlow,
  crearRepoRuteoFlow,
} from "~/server/pago/enrutarPagoFlow";
import { claveDeCifradoDeEnv } from "~/server/pago/flowDeTenant";
import { manejarWebhookFlow } from "~/server/pago/webhookFlow";

/**
 * Webhook de confirmación de pago de Flow — wrapper Next (borde de cableado, multi-tenant).
 *
 * Es la ÚNICA parte que lee env, cablea los adapters reales (enrutador contra `db` +
 * credenciales cifradas de cada tenant, hook post-pago) y escribe `res`. Toda la política
 * (gate, ruteo, confirmación server-side, idempotencia) vive en el núcleo testeable
 * `manejarWebhookFlow` y en `crearEnrutadorFlow`.
 *
 * Un solo endpoint a nivel plataforma (ADR-0006): el ruteo deriva del `token` el Payment,
 * su Tenant y las credenciales de ESE Tenant para confirmar server-side (ADR-0001).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Fail-fast de la clave de cifrado (sin volcar su valor). Sin ella no se pueden
  // descifrar las credenciales del tenant para confirmar: mejor un 500 explícito que un
  // efecto silenciosamente roto. Mismo helper que usa el checkout (un solo mensaje).
  let clave: Buffer;
  try {
    clave = claveDeCifradoDeEnv();
  } catch {
    res.status(500).json({ error: "server_misconfigured" });
    return;
  }

  const enrutarFlow = crearEnrutadorFlow({
    repo: crearRepoRuteoFlow(db),
    clave,
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PUNTO DE EXTENSIÓN POST-PAGO (contrato F02). Cableado al use case real
  // `aplicarEfectosPostPago` (DownloadGrant por ítem + RaffleEntry en el Raffle ACTIVO
  // de la Tienda de la orden, scopeados por tenant, idempotentes — ADR-0002/0005). El
  // núcleo del webhook (`webhookFlow.ts`) y el contrato (`efectosPostPago.ts`) quedan
  // intactos. Se invoca UNA vez, dentro de la transacción de confirmarPagoDeOrden, y
  // solo en la transición a PAGADO (I2).
  //
  // CONFIRMACIÓN DE COMPRA (F04/D1/D2, extendida en F03/C1): `conCorreoPostPago` decora el
  // confirmarPago para, tras COMMITEAR la transacción (los tokens ya existen y la fila
  // `CONFIRMACION_COMPRA` del ledger también), PROGRAMAR el correo — solo en la transición a
  // PAGADO y una vez. Lleva los números del sorteo, el sorteo nombrado, el cierre en hora de Chile,
  // el resumen de la compra y los enlaces `/entrega/<token>` (la PÁGINA de entrega desde
  // productos-tipos-digitales F09/D5).
  //
  // `waitUntil` (@vercel/functions, T5) es la pieza que materializa I3: el ack a Flow sale ni bien
  // el pago está confirmado, y Vercel mantiene viva la función hasta que el correo termina. Sin
  // esto el webhook quedaba colgado de la latencia de Resend (8 s de timeout del adapter) y Flow
  // reintenta los webhooks lentos — una caída del proveedor de correo se convertía en reintentos de
  // PAGO. Va acá, en el borde, porque es infraestructura de la plataforma: el decorator solo declara
  // el seam y por eso se puede testear.
  //
  // El envío pasa por `enviarConfirmacionDeCompra` (no por el use case del reenvío): reclama la
  // fila del ledger antes de mandar, así que si el cron llega primero uno de los dos suelta y el
  // correo sale UNA vez (I2). Si falla, no lanza y el cron reintenta a la hora siguiente.
  //
  // Esta es la ÚNICA parte que lee env del correo (RESEND_API_KEY vía factory, APP_URL/NEXTAUTH_URL
  // para el baseUrl del enlace).
  // ───────────────────────────────────────────────────────────────────────────

  const correo = crearCorreoDeEnv();
  const baseUrl = baseUrlApp();

  const confirmarPago = conCorreoPostPago(
    (input) => confirmarPagoDeOrden({ db, input, aplicarEfectosPostPago }),
    (orderId) => enviarConfirmacionDeCompra({ db, correo, orderId, baseUrl }),
    waitUntil,
  );

  const { status, body } = await manejarWebhookFlow({
    req,
    enrutarFlow,
    confirmarPago,
  });

  res.status(status).json(body);
}
