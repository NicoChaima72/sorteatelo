import { type NextApiRequest, type NextApiResponse } from "next";

import { env } from "~/env";
import { manejarCronCorreos } from "~/server/correo/cronCorreos";
import { baseUrlApp, crearCorreoDeEnv } from "~/server/correo/correoDeEnv";
import { db } from "~/server/db";
import { drenarCorreosPendientes } from "~/server/domain/correo/drenarCorreosPendientes";
import { planificarRecordatorios } from "~/server/domain/correo/planificarRecordatorios";
import { resolvedorDeCorreos } from "~/server/domain/correo/resolvedorDeCorreos";

/**
 * Cron horario de la máquina de correos — wrapper Next (borde de cableado, ADR-0027 §4).
 *
 * Lo invoca Vercel Cron según `vercel.json` con `Authorization: Bearer $CRON_SECRET`. Es la única
 * parte que lee `env`, cablea los adapters reales y escribe `res`; toda la política (gate
 * fail-closed, método, manejo de fallo) vive en el núcleo testeable `server/correo/cronCorreos.ts`,
 * el protocolo claim→send→confirm en `domain/correo/drenarCorreosPendientes.ts` y el contenido en
 * `domain/correo/resolvedorDeCorreos.ts` — que hasta F03 vivía ACÁ y por eso no se podía testear.
 *
 * Es **reconciliation-based**: no pregunta "¿qué toca ahora?" sino "¿qué está vencido y sin
 * enviar?" — una corrida perdida se recupera sola a la hora siguiente, y una duplicada (o solapada)
 * no manda nada dos veces porque el claim combina el CAS sobre `intentos` con un lease por edad.
 * El CAS solo NO alcanza: ver el header de `drenarCorreosPendientes.ts`.
 */

// 300 s (decisión del usuario 2026-07-26): con ~660 ms por operación contra el pooler de Supabase
// y lotes de 100, una corrida completa cabe con margen; el tope evita una corrida colgada infinita.
export const config = { maxDuration: 300 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { status, body } = await manejarCronCorreos({
    req,
    secret: env.CRON_SECRET,
    // Productor (F06): encola los recordatorios vencidos y retira los obsoletos. Igual que el
    // drenado, se compone DENTRO del callback ⇒ después del gate.
    planificar: () => planificarRecordatorios({ db }),
    // La factory se compone DENTRO del callback, o sea después del gate: nada se instancia hasta
    // que el método y el secreto están validados (backend-conventions § Gate antes de cualquier
    // efecto). Hoy `crearCorreoDeEnv` es inocua, pero el orden no puede depender de eso.
    drenar: () =>
      drenarCorreosPendientes({
        db,
        correo: crearCorreoDeEnv(),
        resolvedor: resolvedorDeCorreos({ db, baseUrl: baseUrlApp() }),
      }),
  });

  res.status(status).json(body);
}
