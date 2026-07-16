import { type NextApiRequest, type NextApiResponse } from "next";

import { confirmarPagoDeOrden } from "~/server/domain/pago/confirmarPagoDeOrden";
import { noopEfectosPostPago } from "~/server/domain/pago/efectosPostPago";
import { db } from "~/server/db";
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
  // PUNTO DE EXTENSIÓN POST-PAGO (contrato F02, `tasks/26-07-08-efectos-post-pago.md`).
  // En F01 es no-op. F02 reemplaza SOLO esta línea por el use case real
  // `aplicarEfectosPostPago` (DownloadGrant + RaffleEntry scopeados por tenant), sin
  // tocar el núcleo del webhook. Se invoca una vez, dentro de la transacción de
  // confirmarPagoDeOrden, y solo en la transición a PAGADO.
  const aplicarEfectosPostPago = noopEfectosPostPago;
  // ───────────────────────────────────────────────────────────────────────────

  const { status, body } = await manejarWebhookFlow({
    req,
    enrutarFlow,
    confirmarPago: (input) =>
      confirmarPagoDeOrden({ db, input, aplicarEfectosPostPago }),
  });

  res.status(status).json(body);
}
