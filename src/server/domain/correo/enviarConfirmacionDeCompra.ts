import { type PrismaClient } from "@prisma/client";

import { armarConfirmacionesDeCompra } from "~/server/domain/correo/confirmacionDeCompra";
import { GRACIA_RECLAMO_MS } from "~/server/domain/correo/drenarCorreosPendientes";
import { MAX_INTENTOS } from "~/server/domain/correo/ledgerCorreos";
import { CorreoError, type CorreoService } from "~/server/services/correo";

/**
 * Envío POST-COMMIT de la confirmación de compra (F03/C1). Es el camino rápido: la `$transaction`
 * post-pago ya dejó la fila `CONFIRMACION_COMPRA` PENDIENTE, y esto la manda EN EL ACTO en vez de
 * esperar hasta una hora al cron. El webhook lo dispara con `waitUntil`, así que nunca lo espera
 * (I3).
 *
 * ── Por qué NO es `drenarCorreosPendientes` ────────────────────────────────────────────────────
 * Tentador, y sería una implementación menos del protocolo. No sirve por tres razones concretas:
 *
 * 1. **La `Idempotency-Key`**. El plan la fija por MENSAJE (`confirmacion-compra/<orderId>`), y esa
 *    clave solo viaja por `enviarCorreo` — `enviarLote` manda una clave por LOTE, derivada de qué
 *    filas cayeron juntas. Una clave por mensaje es estrictamente más fuerte acá: cubre la ventana
 *    «Resend aceptó y el proceso murió antes del confirm» aunque el reintento venga del cron en un
 *    lote distinto, que es justo cuando la clave del lote deja de coincidir.
 * 2. **El sweeper**. El drenado termina degradando a FALLIDO toda fila agotada de TODA la
 *    plataforma. Que un webhook de venta de una Tienda escriba filas de otras es un efecto que
 *    nadie pidió.
 * 3. **El alcance**. Un webhook tiene que mandar SU correo, no drenar hasta 100 de la cola.
 *
 * Lo que sí se comparte es todo lo que importa: el **contenido** (`armarConfirmacionesDeCompra`, el
 * mismo que usa el resolvedor del cron) y las **constantes del protocolo** (`MAX_INTENTOS`,
 * `GRACIA_RECLAMO_MS`). El riesgo real de duplicar era que los dos caminos mandaran correos
 * distintos; eso queda cerrado por construcción.
 *
 * ── Protocolo (ADR-0027 §2), igual que el drenado y en el mismo orden ──────────────────────────
 * resolver → CLAIM (CAS sobre `intentos` + lease por edad) → SEND → CONFIRM. Si algo falla entre
 * medio, la fila queda PENDIENTE con su intento gastado y el **cron la recoge**: falla segura, el
 * correo llega tarde pero nunca dos veces (I2).
 *
 * **Nunca lanza.** Un fallo de correo no puede comprometer una venta ya confirmada (I1 de F04): se
 * loguea sin secretos (I3 — orderId sí, email y tokens no) y se devuelve `{ enviado: false }`.
 */
export async function enviarConfirmacionDeCompra({
  db,
  correo,
  orderId,
  baseUrl,
  ahora = new Date(),
}: {
  db: PrismaClient;
  /** Dependencia estrecha: este camino manda UN correo, nunca un lote. */
  correo: Pick<CorreoService, "enviarCorreo">;
  orderId: string;
  baseUrl: string;
  ahora?: Date;
}): Promise<{ enviado: boolean }> {
  const fila = await db.correoEnviado.findUnique({
    where: { tipo_clave: { tipo: "CONFIRMACION_COMPRA", clave: orderId } },
    select: {
      id: true,
      tenantId: true,
      estado: true,
      intentos: true,
      updatedAt: true,
    },
  });

  // Sin fila no hay nada que mandar. No es un error recuperable acá: la fila la escribe la MISMA
  // `$transaction` que confirma el pago, así que si falta es porque la venta no ocurrió.
  if (!fila) return { enviado: false };

  // Ya salió (ENVIADO) o agotó su presupuesto (FALLIDO). En los dos casos, mandar sería duplicar o
  // resucitar algo que el sweeper dio por muerto.
  if (fila.estado !== "PENDIENTE") return { enviado: false };
  if (fila.intentos >= MAX_INTENTOS) return { enviado: false };

  // Lease por edad: si el cron la reclamó hace poco, probablemente la esté enviando AHORA. El CAS
  // de más abajo no alcanza para verlo —entre claim y confirm la fila sigue PENDIENTE— y ganarle el
  // CAS sería mandar el correo dos veces (la lección del blocker de F02).
  const enVuelo =
    fila.intentos > 0 &&
    fila.updatedAt.getTime() > ahora.getTime() - GRACIA_RECLAMO_MS;
  if (enVuelo) return { enviado: false };

  // RESOLVER antes de reclamar (mismo orden que el drenado): reclamar una fila que después no se
  // puede armar gastaría un intento sin que hubiera envío.
  const armadas = await armarConfirmacionesDeCompra({
    db,
    orderIds: [orderId],
    baseUrl,
    // Camino automático: CON clave. Es la última red contra el duplicado si este envío y el del
    // cron llegan los dos a Resend (el claim los separa antes, pero la clave no cuesta nada).
    idempotencia: "automatica",
  });
  const armada = armadas.get(orderId);
  // Tenancy (I1): el correo se arma desde la orden, y el tenant de la orden tiene que ser el mismo
  // que escribió la fila. Si no coincide hay un bug de scoping en algún productor — se deja la fila
  // intacta y sin correo (fail-closed) en vez de mandarle a alguien el correo de otra Tienda.
  if (!armada || armada.tenantId !== fila.tenantId) {
    console.error(
      `[correo-confirmacion] No se pudo armar la confirmación de la orden ${orderId}; ` +
        `la fila del ledger queda PENDIENTE para el cron.`,
    );
    return { enviado: false };
  }

  // CLAIM — compare-and-swap sobre `intentos`: si el cron ganó la carrera, `count` vuelve 0.
  const { count } = await db.correoEnviado.updateMany({
    where: { id: fila.id, estado: "PENDIENTE", intentos: fila.intentos },
    data: { intentos: { increment: 1 } },
  });
  if (count !== 1) return { enviado: false };

  try {
    const { id } = await correo.enviarCorreo(armada.correo);
    await db.correoEnviado.update({
      where: { id: fila.id },
      data: { estado: "ENVIADO", proveedorId: id, enviadoAt: ahora },
    });
    return { enviado: true };
  } catch (e) {
    const error =
      e instanceof CorreoError
        ? e
        : new CorreoError(
            e instanceof Error ? e.message : "Error desconocido al enviar.",
          );

    // I9: la CUOTA devuelve el intento — el proveedor dijo «hoy no», el correo no tiene nada malo.
    // Cualquier otro error sí lo consume. `estado: PENDIENTE` en el `where` para no pisar una fila
    // que otra corrida ya confirmó o que el sweeper degradó mientras esto enviaba.
    await db.correoEnviado.updateMany({
      where: { id: fila.id, estado: "PENDIENTE" },
      data: {
        ...(error.esCuota ? { intentos: { decrement: 1 } } : {}),
        ultimoError: error.message.slice(0, 500),
      },
    });

    // Log sin secretos (I3): el orderId no lo es; el email del Comprador y los tokens sí.
    console.error(
      `[correo-confirmacion] No se pudo enviar la confirmación de la orden ${orderId}: ` +
        `${error.message} La venta quedó confirmada; el cron reintenta.`,
    );
    return { enviado: false };
  }
}
