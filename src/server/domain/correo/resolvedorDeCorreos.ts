import { type PrismaClient } from "@prisma/client";

import { armarConfirmacionesDeCompra } from "~/server/domain/correo/confirmacionDeCompra";
import {
  type FilaPendiente,
  type ResolvedorDeCorreos,
} from "~/server/domain/correo/drenarCorreosPendientes";
import { armarRecordatoriosDeSorteo } from "~/server/domain/correo/recordatorioDelSorteo";
import { armarCorreosDeResultado } from "~/server/domain/correo/resultadoDelSorteo";
import { type CorreoInput } from "~/server/services/correo";

/**
 * **Registro de resolvedores de contenido del ledger** (ADR-0027 §3). Traduce las filas que el cron
 * reclamó a los correos concretos que hay que mandar, una sección por tipo.
 *
 * ── Por qué vive en `domain/` y no en el wrapper del cron ──────────────────────────────────────
 * Hasta F03 esto era una función dentro de `pages/api/cron/correos.ts`, y ahí no se puede testear:
 * el wrapper es borde de cableado (lee `env`, arma adapters, escribe `res`) y no se testea
 * unitariamente — backend-conventions § «núcleo testeable + wrapper Next». La consecuencia práctica
 * ya había aparecido: el `feature-tester` de F03 tuvo que escribir un «resolvedor espejo del
 * wrapper» para ejercer el camino del cron, o sea una copia que nada obliga a mantener sincronizada.
 * Con el registro acá, lo que corre en el test y lo que corre en Vercel son el MISMO objeto.
 *
 * ── Los tipos viajan con el resolvedor ─────────────────────────────────────────────────────────
 * `tipos` es lo que el drenado usa para filtrar ANTES del `take` (head-of-line blocking, ver
 * `ResolvedorDeCorreos`). Agregar una sección obliga a tocar la lista de al lado, en el mismo
 * objeto: F06 suma `RECORDATORIO_SORTEO` en los dos lugares o su tipo queda mudo.
 *
 * ── Tenancy (I1) ───────────────────────────────────────────────────────────────────────────────
 * Cada resolvedor contrasta el `tenantId` que trae la fila contra el del dato que cargó, y descarta
 * lo que no calza: antes que mandarle a alguien el correo de otra Tienda, no se manda nada. La fila
 * descartada queda PENDIENTE, intacta y visible en `sinResolver`.
 */
export function resolvedorDeCorreos({
  db,
  baseUrl,
}: {
  db: PrismaClient;
  /** Base absoluta de los enlaces de entrega. La lee el borde de `env`, nunca este módulo. */
  baseUrl: string;
}): ResolvedorDeCorreos {
  return {
    tipos: [
      "CONFIRMACION_COMPRA", // F03/C1
      "RESULTADO_GANADOR", // F04/C4
      "RESULTADO_NO_GANADOR", // F04/C5
      "RECORDATORIO_SORTEO", // F06/C2-C3
    ],
    armar: async (filas: FilaPendiente[]) => {
      const mensajes = new Map<string, CorreoInput>();

      // ── CONFIRMACION_COMPRA (F03/C1) ─────────────────────────────────────
      // Su `clave` ES el `orderId` (`claveConfirmacionCompra`). El contenido lo arma el MISMO módulo
      // que usa el envío post-commit del webhook, así que el correo que manda el cron cuando el
      // `waitUntil` falló es idéntico al que habría salido en el momento.
      const confirmaciones = filas.filter(
        (f) => f.tipo === "CONFIRMACION_COMPRA",
      );
      if (confirmaciones.length > 0) {
        const armadas = await armarConfirmacionesDeCompra({
          db,
          orderIds: confirmaciones.map((f) => f.clave),
          baseUrl,
          // Camino automático: CON clave, la misma que habría usado el `waitUntil` post-pago.
          idempotencia: "automatica",
        });
        for (const fila of confirmaciones) {
          const armada = armadas.get(fila.clave);
          // Tenancy (I1): el tenant de la orden tiene que ser el de la fila.
          if (armada && armada.tenantId === fila.tenantId) {
            mensajes.set(fila.id, armada.correo);
          }
        }
      }

      // ── RESULTADO_GANADOR / RESULTADO_NO_GANADOR (F04/C4-C5) ─────────────
      // Los dos tipos se resuelven JUNTOS a propósito: salen del mismo sorteo, así que separarlos
      // duplicaría las queries del lote. El guard de tenancy y la elección de plantilla viven
      // adentro (`armarCorreosDeResultado`), que es quien conoce el `Raffle`.
      const resultados = filas.filter(
        (f) =>
          f.tipo === "RESULTADO_GANADOR" || f.tipo === "RESULTADO_NO_GANADOR",
      );
      if (resultados.length > 0) {
        for (const [filaId, correo] of await armarCorreosDeResultado({
          db,
          filas: resultados,
        })) {
          mensajes.set(filaId, correo);
        }
      }

      // ── RECORDATORIO_SORTEO (F06/C2-C3) ──────────────────────────────────
      // El ÚNICO tipo de la clase `avisos`: sale solo con consentimiento y sin supresión, y lleva
      // las cabeceras RFC 8058 (I5). El filtro se re-pregunta adentro y no acá porque el momento
      // que vale es el del ENVÍO: bajo la cuota de Resend Free una fila puede esperar días, y quien
      // se dio de baja el martes no puede recibir el correo encolado el lunes.
      const recordatorios = filas.filter(
        (f) => f.tipo === "RECORDATORIO_SORTEO",
      );
      if (recordatorios.length > 0) {
        for (const [filaId, correo] of await armarRecordatoriosDeSorteo({
          db,
          filas: recordatorios,
          baseUrl,
        })) {
          mensajes.set(filaId, correo);
        }
      }

      return mensajes;
    },
  };
}
