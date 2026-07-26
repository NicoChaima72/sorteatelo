import {
  type PlatformSubscriptionStatus,
  type PrismaClient,
} from "@prisma/client";

import {
  enPausaPorFacturacion,
  evaluarGateVenta,
  type EstadoGateVenta,
} from "~/server/domain/facturacion/_gateVenta";

/**
 * LECTOR del gate de venta derivado (F05, D4/D5, ADR-0026): carga de la DB los tres hechos que el
 * núcleo puro necesita y devuelve la decisión.
 *
 * Es el ÚNICO lugar de la app que responde «¿esta Tienda puede vender AHORA?» contra la DB, y lo
 * comparten las TRES superficies de F05: el SSR del storefront, el checkout y el guard del panel. Que
 * sea uno solo es el punto — tres lecturas paralelas del mismo hecho derivarían, y el día que
 * divergieran una tienda estaría en pausa para el panel y vendiendo para el Comprador.
 *
 * **Lo que este lector NO alcanza (I5, la regla que protege al Comprador)**: las descargas por
 * Entitlement (`/api/descargas/[token]`) y el verificador de tickets. No es disciplina de quien
 * escriba código nuevo: `src/server/descargas/` no importa este módulo, y hay un test estático que lo
 * exige (`gateVentaEnElBorde.test.ts`). El Comprador ya compró; lo suyo funciona con la tienda en pausa.
 */

/**
 * Lo mínimo del cliente Prisma que este lector toca. Tipado así —y no como `PrismaClient`— para que
 * sirva TAMBIÉN un `Prisma.TransactionClient`: el checkout recomputa el gate DENTRO de su
 * `$transaction`, junto a las lecturas de producto con las que decide (precedente: el gate de
 * publicación recomputado dentro de la `$tx` de `publicarTienda`).
 */
type LectorDeTenants = Pick<PrismaClient, "tenant">;

/** Cómo se identifica la Tienda: por `slug` (storefront, viene del host) o por `id` (panel/checkout). */
export type TenantDelGate = { id: string } | { slug: string };

export interface GateVentaDeTenant extends EstadoGateVenta {
  /**
   * Estado de su `PlatformSubscription` (`null` si no tiene). Viaja junto a la decisión para que el
   * banner del panel derive su aviso sin una segunda consulta — `COBRO_PENDIENTE` es un aviso que
   * NO corta la venta (D4) y por lo tanto no se lee del `motivo`.
   */
  estadoSuscripcion: PlatformSubscriptionStatus | null;
  /**
   * Su `PlatformExemption` (`null` si no tiene). Viaja junto a la decisión porque el hecho YA se leyó
   * para evaluar el gate, y el chrome del panel lo necesita para el preaviso de expiración de la
   * cortesía (F07/D8): pedirlo aparte sería una segunda consulta por un dato que ya está en la mano.
   */
  exencion: { exentaHasta: Date | null } | null;
  /** `true` sii está PUBLICADA y su facturación no sostiene la venta ⇒ storefront neutral + panel restringido. */
  enPausa: boolean;
}

export async function cargarGateVenta({
  db,
  where,
  ahora = new Date(),
}: {
  db: LectorDeTenants;
  where: TenantDelGate;
  /** Inyectable: la expiración de la Exención se evalúa LAZY en el gate (D8), sin cron que corte. */
  ahora?: Date;
}): Promise<GateVentaDeTenant> {
  const tenant = await db.tenant.findUnique({
    where,
    // `select` explícito (backend-conventions § Prisma en el server): tres hechos y nada más. En
    // particular NO arrastra la `FlowCredential` del tenant — este gate es del mundo de la
    // facturación de PLATAFORMA y no tiene nada que hacer con las credenciales BYO (I1).
    select: {
      estado: true,
      platformSubscription: { select: { estado: true } },
      platformExemption: { select: { exentaHasta: true } },
    },
  });

  // Fail-closed, mismo criterio que `resolverTenantDesdeHost`: sin fila no hay venta. El motivo es el
  // OPERATIVO a propósito — un motivo comercial acá mandaría el panel de un tenant que no existe a la
  // página Plan a regularizar una deuda inexistente.
  if (!tenant) {
    return {
      puedeVender: false,
      exenta: false,
      motivo: "NO_PUBLICADA",
      estadoSuscripcion: null,
      exencion: null,
      enPausa: false,
    };
  }

  const estadoSuscripcion = tenant.platformSubscription?.estado ?? null;
  const gate = evaluarGateVenta({
    estadoTienda: tenant.estado,
    estadoSuscripcion,
    exencion: tenant.platformExemption,
    ahora,
  });

  return {
    ...gate,
    estadoSuscripcion,
    exencion: tenant.platformExemption,
    enPausa: enPausaPorFacturacion(gate),
  };
}
