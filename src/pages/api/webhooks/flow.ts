import { type NextApiRequest, type NextApiResponse } from "next";

import { aplicarEfectosPostPago } from "~/server/domain/pago/aplicarEfectosPostPago";
import { confirmarPagoDeOrden } from "~/server/domain/pago/confirmarPagoDeOrden";
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
  // PUNTO DE EXTENSIÓN POST-PAGO (contrato F02). Cableado por F02 al use case real
  // `aplicarEfectosPostPago` (DownloadGrant por ítem + RaffleEntry en el Raffle ACTIVO
  // de la Tienda de la orden, scopeados por tenant, idempotentes — ADR-0002/0005). El
  // núcleo del webhook (`webhookFlow.ts`) y el contrato (`efectosPostPago.ts`) quedan
  // intactos. Se invoca UNA vez, dentro de la transacción de confirmarPagoDeOrden, y
  // solo en la transición a PAGADO (I2).
  // ───────────────────────────────────────────────────────────────────────────

  const { status, body } = await manejarWebhookFlow({
    req,
    enrutarFlow,
    confirmarPago: (input) =>
      confirmarPagoDeOrden({ db, input, aplicarEfectosPostPago }),
  });

  res.status(status).json(body);
}
