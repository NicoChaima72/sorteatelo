import { type NextApiRequest, type NextApiResponse } from "next";

import {
  manejarRetornoDeRegistro,
  PATH_RETORNO_PLAN,
} from "~/server/facturacion/retornoDeRegistro";

/**
 * Puente de retorno del **registro de tarjeta** (F03/D12, ADR-0026) — wrapper Next.
 *
 * Es la `url_return` que se le pasa a `customer/register` (`PATH_API_RETORNO_PLAN`). Flow
 * devuelve el navegador acá con un **POST cross-site**; este endpoint lo traduce a un `303` GET hacia
 * la página del panel, que es donde vive el trabajo real. El porqué completo —cookie `SameSite=Lax`,
 * `router.query` inexistente en un POST— está en `server/facturacion/retornoDeRegistro.ts`.
 *
 * **Público a propósito y sin efectos**: la cookie de sesión es justamente lo que no llegó, así que
 * no puede exigirla. No escribe nada; el token se verifica server-side en la mutation del panel (I3).
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { status, location, body } = manejarRetornoDeRegistro({
    req,
    destino: PATH_RETORNO_PLAN,
  });

  if (location) {
    res.redirect(status, location);
    return;
  }
  res.status(status).json(body);
}
