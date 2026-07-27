import { type NextApiRequest, type NextApiResponse } from "next";

import { env } from "~/env";
import { crearCorreoDeEnv } from "~/server/correo/correoDeEnv";
import { db } from "~/server/db";
import { barrerAvisosDeFacturacion } from "~/server/facturacion/avisosProgramados";
import { manejarCronFacturacion } from "~/server/facturacion/cronFacturacion";
import { enviarCorreosFacturacion } from "~/server/facturacion/enviarCorreosFacturacion";
import { crearFlowPlataformaDeEnv } from "~/server/facturacion/flowPlataformaDeEnv";
import { ejecutarPromocionesDePlan } from "~/server/facturacion/promocionesDePlan";

/**
 * Cron DIARIO de facturación (F09/D11, ADR-0026) — wrapper Next (borde de cableado).
 *
 * Lo invoca Vercel Cron según `vercel.json` con `Authorization: Bearer $CRON_SECRET`. Es la única
 * parte que lee `env`, cablea los adapters reales y escribe `res`; la política del gate vive en
 * `server/facturacion/cronFacturacion.ts` y la decisión de a quién avisarle, en el barrido
 * `server/facturacion/avisosProgramados.ts`.
 *
 * Hace dos cosas. (1) Manda los DOS correos que Flow no dispara: el previo a cada renovación (7) y el
 * de la cortesía que se termina (6). (2) Aplica las **promociones de plan** que la cancelación dejó
 * anotadas (F06/D7), que es la única parte que habla con Flow — y solo cuando el período que se está
 * cobrando ya corresponde al plan nuevo, porque pedirlo antes le factura al Organizador la diferencia
 * de un mes que ya pagó (blocker 6 de la 4ª pasada del E2E).
 *
 * Lo que sigue sin hacer: NO cobra y NO cambia estados de suscripción — eso lo flipea el webhook
 * (F04) con verificación server-side, nunca una corrida programada nuestra.
 *
 * Es **reconciliation-based** (backend-conventions § Jobs): pregunta «¿qué cobro se viene y no está
 * avisado?». Una corrida perdida se recupera al día siguiente —por eso la ventana de aviso es de 2
 * días y no de 1— y una duplicada no manda nada dos veces, porque cada aviso se sella con un
 * `updateMany` condicional antes de despacharse.
 */

// El schedule vive en `vercel.json` y es **UTC puro** (backend-conventions § Jobs): `0 13 * * *`
// cae entre las 09:00 y las 10:00 de Santiago según el horario de verano. Se eligió la mañana para
// que un aviso de cobro no llegue de madrugada; que el DST lo corra una hora es irrelevante para un
// correo cuya ventana es de días, y meter la hora local en la expresión cron sería peor.
//
// 60 s: el barrido son dos `findMany` acotados (los cobros de los próximos 2 días y las cortesías
// que vencen en 7) más un envío por aviso. Sobra, y el tope evita una corrida colgada indefinida.
export const config = { maxDuration: 60 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { status, body } = await manejarCronFacturacion({
    req,
    secret: env.CRON_SECRET,
    // Todo se compone DENTRO del callback, o sea después del gate: nada se instancia ni se consulta
    // hasta que el método y el secreto están validados (backend-conventions § Gate antes de
    // cualquier efecto).
    ejecutar: async () => {
      // PRIMERO las promociones de plan (F06/D7): aplican el cambio que la cancelación dejó anotado,
      // recién cuando el período nuevo ya se está cobrando. Va antes del barrido a propósito — así
      // el aviso previo de renovación que salga en la misma corrida anuncia el plan que de verdad va
      // a regir, y no el que acaba de quedar viejo.
      //
      // Aislado en su propio `try`: es la única mitad de la corrida que habla con Flow, y una
      // credencial mal seteada no puede llevarse puestos los correos de aviso, que no la necesitan.
      let promociones = 0;
      try {
        promociones = (
          await ejecutarPromocionesDePlan({ db, flow: crearFlowPlataformaDeEnv() })
        ).ejecutadas;
      } catch (e) {
        console.error(
          "[cron/facturacion] no se pudieron ejecutar las promociones de plan; los avisos siguen",
          e,
        );
      }

      const avisos = await barrerAvisosDeFacturacion({ db });
      // Los correos salen DESPUÉS del claim y su fallo no deshace nada (I9): el aviso ya quedó
      // marcado como dado. `enviarCorreosFacturacion` es resiliente por correo, así que un envío
      // caído no se lleva puestos a los demás.
      const { enviados, fallidos } = await enviarCorreosFacturacion({
        correo: crearCorreoDeEnv(),
        correos: avisos.correos,
      });
      return {
        renovaciones: avisos.renovaciones,
        exenciones: avisos.exenciones,
        promociones,
        enviados,
        fallidos,
      };
    },
  });

  res.status(status).json(body);
}
