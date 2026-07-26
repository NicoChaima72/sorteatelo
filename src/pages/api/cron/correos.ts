import { type NextApiRequest, type NextApiResponse } from "next";

import { env } from "~/env";
import { manejarCronCorreos } from "~/server/correo/cronCorreos";
import { baseUrlApp, crearCorreoDeEnv } from "~/server/correo/correoDeEnv";
import { db } from "~/server/db";
import { armarConfirmacionesDeCompra } from "~/server/domain/correo/confirmacionDeCompra";
import {
  drenarCorreosPendientes,
  type FilaPendiente,
} from "~/server/domain/correo/drenarCorreosPendientes";
import { type CorreoInput } from "~/server/services/correo";

/**
 * Cron horario de la máquina de correos — wrapper Next (borde de cableado, ADR-0027 §4).
 *
 * Lo invoca Vercel Cron según `vercel.json` con `Authorization: Bearer $CRON_SECRET`. Es la única
 * parte que lee `env`, cablea los adapters reales y escribe `res`; toda la política (gate
 * fail-closed, método, manejo de fallo) vive en el núcleo testeable `server/correo/cronCorreos.ts`
 * y el protocolo claim→send→confirm en `domain/correo/drenarCorreosPendientes.ts`.
 *
 * Es **reconciliation-based**: no pregunta "¿qué toca ahora?" sino "¿qué está vencido y sin
 * enviar?" — una corrida perdida se recupera sola a la hora siguiente, y una duplicada (o solapada)
 * no manda nada dos veces porque el claim combina el CAS sobre `intentos` con un lease por edad.
 * El CAS solo NO alcanza: ver el header de `drenarCorreosPendientes.ts`.
 */

/**
 * Registro de resolvedores de contenido, por tipo de correo. F02 lo dejó vacío a propósito (esa
 * feature construyó la MÁQUINA, no las plantillas) y cada feature siguiente enchufa la suya:
 * **F03 `CONFIRMACION_COMPRA` — ya enchufada**; F04 `RESULTADO_GANADOR`/`RESULTADO_NO_GANADOR` y
 * F06 `RECORDATORIO_SORTEO` todavía no. Las filas de un tipo sin resolvedor se saltan INTACTAS (ni
 * intento consumido ni FALLIDO): la falla segura de ADR-0027 §3.
 *
 * Resolver es **por tipo y en batch**: se agrupan las filas, cada resolvedor hace SUS queries para
 * todas juntas y devuelve lo que supo armar. Una corrida llena son 100 filas y contra el pooler
 * cada roundtrip cuesta ~660 ms — resolverlas de a una no entraría en la función.
 */
async function resolverMensajes(
  filas: FilaPendiente[],
): Promise<Map<string, CorreoInput>> {
  const mensajes = new Map<string, CorreoInput>();

  // ── CONFIRMACION_COMPRA (F03/C1) ───────────────────────────────────────────
  // Su `clave` ES el `orderId` (`claveConfirmacionCompra`). El contenido lo arma el MISMO módulo
  // que usa el envío post-commit del webhook, así que el correo que manda el cron cuando el
  // `waitUntil` falló es idéntico al que habría salido en el momento.
  const confirmaciones = filas.filter((f) => f.tipo === "CONFIRMACION_COMPRA");
  if (confirmaciones.length > 0) {
    const armadas = await armarConfirmacionesDeCompra({
      db,
      orderIds: confirmaciones.map((f) => f.clave),
      baseUrl: baseUrlApp(),
      // Camino automático: CON clave, la misma que habría usado el `waitUntil` post-pago.
      idempotencia: "automatica",
    });
    for (const fila of confirmaciones) {
      const armada = armadas.get(fila.clave);
      // Tenancy (I1, la regla que el header del drenado le impone al resolvedor): el tenant de la
      // orden tiene que ser el de la fila. Si no coincide, la fila se salta INTACTA en vez de
      // mandarle a alguien el correo de otra Tienda — fail-closed, y queda visible en `sinResolver`.
      if (armada && armada.tenantId === fila.tenantId) {
        mensajes.set(fila.id, armada.correo);
      }
    }
  }

  return mensajes;
}

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
    // La factory se compone DENTRO del callback, o sea después del gate: nada se instancia hasta
    // que el método y el secreto están validados (backend-conventions § Gate antes de cualquier
    // efecto). Hoy `crearCorreoDeEnv` es inocua, pero el orden no puede depender de eso.
    drenar: () =>
      drenarCorreosPendientes({
        db,
        correo: crearCorreoDeEnv(),
        resolverMensajes,
      }),
  });

  res.status(status).json(body);
}
