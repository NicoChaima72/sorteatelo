import { type NextApiRequest, type NextApiResponse } from "next";

import { crearCorreoDeEnv } from "~/server/correo/correoDeEnv";
import { db } from "~/server/db";
import { procesarNotificacionSuscripcion } from "~/server/domain/facturacion/procesarNotificacionSuscripcion";
import { enviarCorreosFacturacion } from "~/server/facturacion/enviarCorreosFacturacion";
import { crearFlowPlataformaDeEnv } from "~/server/facturacion/flowPlataformaDeEnv";
import { manejarWebhookSuscripciones } from "~/server/facturacion/webhookSuscripciones";

/**
 * Webhook de SUSCRIPCIONES de plataforma — wrapper Next (borde de cableado, F04/ADR-0026).
 *
 * Es el `urlCallback` que el bootstrap (F02) registra en los dos planes de Flow. Un solo endpoint
 * para toda la plataforma: acá no hay ruteo por tenant como en el webhook de ventas, porque la cuenta
 * Flow es UNA —la propia (I1)— y la Tienda se alcanza por la suscripción notificada.
 *
 * ── I1, mundos separados ─────────────────────────────────────────────────────────────────────────
 * Este endpoint **no toca `FlowCredential` ni nada de `server/pago/`**: el service se construye con
 * `crearFlowPlataformaDeEnv()`, el único productor de la app, que lee las credenciales de plataforma
 * desde env (I7). El webhook de ventas de los tenants (`/api/webhooks/flow`) sigue siendo otro
 * endpoint, con otras credenciales y otro dominio de negocio; que sean dos rutas distintas es parte
 * de la separación, no una casualidad.
 *
 * Toda la política (gate de método, extracción del identificador, semántica de reintento, envío
 * post-commit) vive en el núcleo testeable `manejarWebhookSuscripciones`; la verificación server-side
 * y las transiciones, en el use case. Esta es la única parte que lee `env` y escribe `res`.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Fail-fast del cableado: sin credenciales de plataforma no se puede VERIFICAR nada contra Flow, y
  // procesar sin verificar está prohibido (I3). Mejor un 500 explícito —que además hace que Flow
  // reintente— que un efecto silenciosamente roto. El mensaje no incluye ningún valor de env (I7).
  let flow;
  try {
    flow = crearFlowPlataformaDeEnv();
  } catch {
    res.status(500).json({ error: "server_misconfigured" });
    return;
  }

  const correo = crearCorreoDeEnv();

  const { status, body } = await manejarWebhookSuscripciones({
    req,
    procesarNotificacion: (input) =>
      procesarNotificacionSuscripcion({ db, flow, input }),
    enviarCorreos: async (correos) => {
      await enviarCorreosFacturacion({ correo, correos });
    },
  });

  res.status(status).json(body);
}
