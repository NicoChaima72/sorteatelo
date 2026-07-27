import { type NextApiRequest, type NextApiResponse } from "next";

import {
  manejarRetornoDeRegistro,
  PATH_RETORNO_TARJETA,
} from "~/server/facturacion/retornoDeRegistro";

/**
 * Puente de retorno del **cambio de tarjeta** (F10/D12, ADR-0026) — wrapper Next.
 *
 * Hermano de `retorno-plan.ts` y con el mismo núcleo: lo único que cambia es a qué página del panel
 * aterriza (`PATH_RETORNO_TARJETA`), porque cada retorno hace UN solo trabajo. Es la `url_return`
 * que se le pasa a `customer/register` desde «Cambiar tarjeta» (`PATH_API_RETORNO_TARJETA`).
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { status, location, body } = manejarRetornoDeRegistro({
    req,
    destino: PATH_RETORNO_TARJETA,
  });

  if (location) {
    res.redirect(status, location);
    return;
  }
  res.status(status).json(body);
}
