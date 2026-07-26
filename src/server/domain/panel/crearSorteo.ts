import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { type CrearSorteoInput } from "~/server/domain/panel/schemas";

/**
 * Use case del panel (F01): crea el sorteo de la Tienda, que nace ACTIVO ya (D3). Es SECUENCIAL —
 * a lo sumo UN Raffle ACTIVO por Tienda a la vez (S5); crear con uno ya activo se RECHAZA (hay que
 * ejecutarlo/cerrarlo primero). El invariante 1-ACTIVO es de use case (NO constraint de DB): la
 * única defensa es el guard ATÓMICO dentro de la $transaction — recontar el ACTIVO y crear en la
 * MISMA tx, para que el chequeo no quede obsoleto entre el check y el insert (mismo criterio que la
 * carrera D8 de `crearTienda` y el guard de `ejecutarSorteo`, D2/I3).
 *
 * Scopeado por el `tenantId` resuelto SERVER-SIDE (I1/I2/ADR-0005); el `tenantId` JAMÁS del input.
 * `fechaInicio = ahora` (inyectable para testear sin reloj, D3); `fechaFin` se valida futura con un
 * mensaje humano (no solo Zod). Los ASSETS del sorteo NO van acá y este use case NO escribe sus
 * columnas: la imagen del premio y el **PDF de bases** (admin-bases-pdf F02/D2) se suben TRAS crear,
 * porque su key es per-raffle y necesita el id — y sus columnas las escribe solo la confirmación
 * server-side tras `headObject` (I2/I6). El sorteo nace VÁLIDO sin bases: el gate de publicación las
 * exige recién al publicar con un sorteo ACTIVO (F03/ADR-0008).
 *
 * ARRASTRE de participantes (D13): si `importarDesdeRaffleId` viene, DENTRO de la $tx se verifica
 * que el raffle origen sea del MISMO tenant (fail-closed ⇒ NOT_FOUND), se leen sus `RaffleEntry` y
 * se replican en el raffle NUEVO reagrupando por `orderId` y re-ordinalando `0..K-1` por orden (el
 * `@@unique([raffleId, orderId, ordinal])` es per-raffle ⇒ copiar los mismos `orderId` al raffle
 * nuevo es válido). Preserva el conteo de tickets por comprador. Las compras nuevas siguen sumando
 * al ACTIVO por `aplicarEfectosPostPago` (no se toca).
 *
 * Este use case es el SEGUNDO writer de Números del sorteo (ADR-0024; el otro es
 * `aplicarEfectosPostPago`): los tickets arrastrados se **renumeran 1..N** en el raffle nuevo —el
 * Número es un namespace por Raffle— y el contador `ultimoNumero` del raffle nuevo nace sembrado en
 * N, en el mismo `create`, para que la primera compra siga el correlativo en N+1.
 */
export async function crearSorteo({
  db,
  acceso,
  input,
  ahora = new Date(),
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: CrearSorteoInput;
  ahora?: Date;
}): Promise<{ id: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  // Validación de fecha (pura, previa a la tx): fechaFin > ahora, con mensaje humano.
  if (input.fechaFin.getTime() <= ahora.getTime()) {
    throw new DomainError(
      "INVALID",
      "La fecha de cierre debe ser posterior a ahora.",
    );
  }

  return db.$transaction(async (tx) => {
    // Guard atómico 1-ACTIVO (D2/I3): recontar el ACTIVO del tenant DENTRO de la tx.
    const activo = await tx.raffle.findFirst({
      where: { tenantId, estado: "ACTIVO" },
      select: { id: true },
    });
    if (activo) {
      throw new DomainError(
        "CONFLICT",
        "Ya tienes un sorteo activo. Ejecútalo o ciérralo antes de crear otro.",
      );
    }

    // Arrastre (D13): validar el raffle origen (mismo tenant) ANTES de crear + leer sus entries.
    let entriesOrigen: Array<{ orderId: string; email: string }> = [];
    if (input.importarDesdeRaffleId) {
      const origen = await tx.raffle.findFirst({
        where: { id: input.importarDesdeRaffleId, tenantId },
        select: { id: true },
      });
      if (!origen) {
        throw new DomainError(
          "NOT_FOUND",
          "El sorteo del que quieres importar participantes no existe en tu Tienda.",
        );
      }
      // ORDEN EXPLÍCITO y total (ADR-0024): de él sale la numeración del sorteo nuevo, así que no
      // puede depender del orden en que Postgres devuelva las filas. `createdAt` EMPATA entre las K
      // entries de una misma orden (nacen del mismo createMany en la misma $tx) ⇒ `ordinal` es el
      // desempate que mantiene contiguo el bloque de cada orden; `orderId` desempata entre órdenes
      // creadas en el mismo instante.
      entriesOrigen = await tx.raffleEntry.findMany({
        where: { raffleId: input.importarDesdeRaffleId, tenantId },
        select: { orderId: true, email: true },
        orderBy: [{ createdAt: "asc" }, { orderId: "asc" }, { ordinal: "asc" }],
      });
    }

    const raffle = await tx.raffle.create({
      data: {
        tenantId,
        nombre: input.nombre,
        premio: input.premio,
        estado: "ACTIVO",
        fechaInicio: ahora,
        fechaFin: input.fechaFin,
        // Contador de Números del sorteo (ADR-0024 §2) SEMBRADO con los tickets arrastrados: las
        // compras nuevas siguen el correlativo desde N+1. Sin arrastre no se toca (queda en el
        // @default(0) del schema).
        ...(entriesOrigen.length > 0
          ? { ultimoNumero: entriesOrigen.length }
          : {}),
      },
      select: { id: true },
    });

    // Copia de tickets: reagrupa por `orderId` y re-ordinala 0..K-1 por orden (unique per-raffle).
    // Los Números del sorteo se RENUMERAN 1..N en el raffle nuevo en vez de copiarse: el Número es
    // un namespace POR RAFFLE (ADR-0024 §1) — copiarlos heredaría los huecos del origen y chocaría
    // con el correlativo de las compras nuevas. Los grupos se numeran en el orden determinista de
    // la lectura de arriba, así que cada orden conserva un BLOQUE CONTIGUO (lo que hace legible el
    // rango de D8), igual que si la orden se hubiera confirmado en este sorteo.
    if (entriesOrigen.length > 0) {
      const porOrden = new Map<string, Array<{ orderId: string; email: string }>>();
      for (const e of entriesOrigen) {
        const acc = porOrden.get(e.orderId);
        if (acc) acc.push(e);
        else porOrden.set(e.orderId, [e]);
      }
      let numero = 0;
      const nuevas = [...porOrden.values()].flatMap((grupo) =>
        grupo.map((e, i) => ({
          tenantId,
          raffleId: raffle.id,
          orderId: e.orderId,
          email: e.email,
          ordinal: i,
          numero: ++numero,
        })),
      );
      // SIN `skipDuplicates` a propósito (a diferencia de `aplicarEfectosPostPago`): el raffle
      // acaba de nacer dentro de esta misma $tx, así que no hay nada con qué colisionar. Si
      // colisionara igual, saltar la fila en silencio PERDERÍA un ticket y dejaría `ultimoNumero`
      // por encima de los números realmente emitidos — acá fallar ruidoso y revertir es lo correcto.
      await tx.raffleEntry.createMany({ data: nuevas });
    }

    return { id: raffle.id };
  });
}
