import { type NextApiRequest, type NextApiResponse } from "next";

import { manejarBajaDeAvisos } from "~/server/correo/bajaCorreo";
import { db } from "~/server/db";
import {
  suprimirCorreoDeAvisos,
  tiendaYPersonaDelTokenDeBaja,
} from "~/server/domain/correo/preferenciasDeCorreo";

/**
 * Endpoint público de **baja de avisos** (F05, RFC 8058 + ADR-0004) — wrapper Next (borde de
 * cableado). Es la única parte que cablea el `db` real y escribe `res`; toda la política (gate de
 * método, token malformado, GET-pregunta vs POST-ejecuta, neutralidad del token desconocido) vive
 * en el núcleo testeable `server/correo/bajaCorreo.ts`.
 *
 * Su ruta la conocen tres lugares y sale de UNA constante (`RUTA_BAJA` en
 * `domain/correo/bajaDeAvisos.ts`): la cabecera `List-Unsubscribe`, el enlace visible del pie del
 * correo y este archivo. Si el path de acá cambia, el enlace de los correos ya enviados muere.
 *
 * NO exige sesión (ADR-0004: el Comprador no tiene cuenta; el token ES la autoridad) y **no loguea
 * el token ni el correo** — la URL viaja en un correo reenviable y el destinatario es PII de
 * terceros bajo custodia de la Tienda.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { status, headers, body } = await manejarBajaDeAvisos({
    req,
    buscarPorToken: (token) => tiendaYPersonaDelTokenDeBaja({ db, token }),
    suprimir: ({ tenantId, email }) =>
      suprimirCorreoDeAvisos({ db, tenantId, email }),
  });

  if (headers) {
    for (const [clave, valor] of Object.entries(headers)) {
      res.setHeader(clave, valor);
    }
  }
  res.status(status).send(body);
}
