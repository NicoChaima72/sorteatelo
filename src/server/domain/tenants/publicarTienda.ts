import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { esActiva } from "~/server/domain/facturacion/_estadoSuscripcion";
import { exencionVigente } from "~/server/domain/facturacion/_gateVenta";
import {
  evaluarPublicacion,
  mensajeRequisitoFaltante,
} from "~/server/domain/tenants/_publicacion";
import { hayProductoEntregable } from "~/server/productos/productoEntregable";
import { TOS_VERSION } from "~/server/tos/tos";

/**
 * Use case del panel (F08/F03, D5/D6, ADR-0008): publica la Tienda del Organizador. RECOMPUTA el
 * gate de publicación server-side DENTRO de la $transaction (I2: la transición a PUBLICADA jamás
 * confía en un `puedePublicar` del cliente) reusando el MISMO núcleo puro que el checklist
 * (`evaluarPublicacion`) — no hay dos definiciones del gate. Transiciona {ALTA|CONFIGURACION}→
 * PUBLICADA solo si el gate pasa; si falta un requisito, no publica y devuelve cuál (`INVALID`).
 *
 * Máquina de estados (D6): ya PUBLICADA ⇒ idempotente; SUSPENDIDA ⇒ `CONFLICT` (solo el soporte
 * reactiva, no el Organizador). Scopeado por el `tenantId` server-side (I1); sin membresía ⇒
 * `FORBIDDEN`. La recarga del gate + la transición van en la MISMA tx: el gate no puede quedar
 * obsoleto entre el chequeo y el update.
 */
export async function publicarTienda({
  db,
  acceso,
  tosVersionVigente = TOS_VERSION,
  ahora = new Date(),
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  tosVersionVigente?: string;
  /** Inyectable: la vigencia de la Exención se evalúa LAZY contra este instante (D8). */
  ahora?: Date;
}): Promise<{ estado: "PUBLICADA"; publicada: true; yaPublicada: boolean }> {
  const tenantId = resolverTenantDelPanel(acceso);

  return db.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { estado: true, tosVersion: true },
    });

    // Idempotente: ya publicada ⇒ no re-evalúa el gate ni rompe.
    if (tenant.estado === "PUBLICADA") {
      return { estado: "PUBLICADA", publicada: true, yaPublicada: true };
    }
    // Una Tienda suspendida la reactiva el soporte de la plataforma (hoy por DB directa); el
    // Organizador no se auto-publica.
    if (tenant.estado === "SUSPENDIDA") {
      throw new DomainError(
        "CONFLICT",
        "Tu tienda está suspendida. Escríbele al soporte de la plataforma para reactivarla.",
      );
    }

    const [flow, tieneProductoPublicable, raffleActivo, suscripcion, exencion] =
      await Promise.all([
        tx.flowCredential.findUnique({
          where: { tenantId },
          select: { tenantId: true },
        }),
        // MISMA función que el checklist (I2: no hay dos definiciones del gate), leída con la `tx`
        // para que el gate no pueda quedar obsoleto entre el chequeo y el update. Desde F06 incluye
        // el pool ≥ pack más grande de los SOBRE (D4/I7).
        hayProductoEntregable({ db: tx, tenantId }),
        // Bases del gate = `basesPdfUrl` del Raffle ACTIVO (admin-bases-pdf F03/D2/D3), leído DENTRO
        // de la tx como el resto: el gate no puede quedar obsoleto entre el chequeo y el update (I3).
        tx.raffle.findFirst({
          where: { tenantId, estado: "ACTIVO" },
          select: { id: true, basesPdfUrl: true },
        }),
        // Facturación (ADR-0026, F03/D2): plan activo o Exención vigente, leídos DENTRO de la tx
        // por la misma razón que el resto — entre el chequeo y el update nadie puede cancelar.
        tx.platformSubscription.findUnique({
          where: { tenantId },
          select: { estado: true },
        }),
        tx.platformExemption.findUnique({
          where: { tenantId },
          select: { exentaHasta: true },
        }),
      ]);

    const { requisitos, puedePublicar } = evaluarPublicacion({
      estado: tenant.estado,
      tosVersion: tenant.tosVersion,
      tosVersionVigente,
      flowConfigurada: flow !== null,
      tieneProductoPublicable,
      hayRaffleActivo: raffleActivo !== null,
      basesPdfDelRaffleActivo: raffleActivo?.basesPdfUrl ?? null,
      suscripcionActiva: suscripcion !== null && esActiva(suscripcion.estado),
      exentaVigente: exencionVigente(exencion, ahora),
    });

    if (!puedePublicar) {
      // El requisito faltante (mensaje humano); el checklist ya lo muestra, esto es el backstop (I2).
      throw new DomainError(
        "INVALID",
        mensajeRequisitoFaltante(requisitos) ??
          "Tu tienda todavía no cumple los requisitos para publicarse.",
      );
    }

    await tx.tenant.update({
      where: { id: tenantId },
      data: { estado: "PUBLICADA" },
      select: { id: true },
    });

    return { estado: "PUBLICADA", publicada: true, yaPublicada: false };
  });
}
