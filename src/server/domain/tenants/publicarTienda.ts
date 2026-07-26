import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import {
  evaluarPublicacion,
  mensajeRequisitoFaltante,
} from "~/server/domain/tenants/_publicacion";
import { TOS_VERSION } from "~/server/tos/tos";

/**
 * Use case del panel (F08/F03, D5/D6, ADR-0008): publica la Tienda del Organizador. RECOMPUTA el
 * gate de publicación server-side DENTRO de la $transaction (I2: la transición a PUBLICADA jamás
 * confía en un `puedePublicar` del cliente) reusando el MISMO núcleo puro que el checklist
 * (`evaluarPublicacion`) — no hay dos definiciones del gate. Transiciona {ALTA|CONFIGURACION}→
 * PUBLICADA solo si el gate pasa; si falta un requisito, no publica y devuelve cuál (`INVALID`).
 *
 * Máquina de estados (D6): ya PUBLICADA ⇒ idempotente; SUSPENDIDA ⇒ `CONFLICT` (solo el Operador
 * reactiva, no el Organizador). Scopeado por el `tenantId` server-side (I1); sin membresía ⇒
 * `FORBIDDEN`. La recarga del gate + la transición van en la MISMA tx: el gate no puede quedar
 * obsoleto entre el chequeo y el update.
 */
export async function publicarTienda({
  db,
  acceso,
  tosVersionVigente = TOS_VERSION,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  tosVersionVigente?: string;
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
    // Solo el Operador reactiva una Tienda suspendida (D6/D9); el Organizador no se auto-publica.
    if (tenant.estado === "SUSPENDIDA") {
      throw new DomainError(
        "CONFLICT",
        "Tu tienda está suspendida. Contacta al Operador para reactivarla.",
      );
    }

    const [flow, productoPublicable, raffleActivo] = await Promise.all([
      tx.flowCredential.findUnique({
        where: { tenantId },
        select: { tenantId: true },
      }),
      tx.product.findFirst({
        where: { tenantId, activo: true, pdfPath: { not: null } },
        select: { id: true },
      }),
      // Bases del gate = `basesPdfUrl` del Raffle ACTIVO (admin-bases-pdf F03/D2/D3), leído DENTRO
      // de la tx como el resto: el gate no puede quedar obsoleto entre el chequeo y el update (I3).
      tx.raffle.findFirst({
        where: { tenantId, estado: "ACTIVO" },
        select: { id: true, basesPdfUrl: true },
      }),
    ]);

    const { requisitos, puedePublicar } = evaluarPublicacion({
      estado: tenant.estado,
      tosVersion: tenant.tosVersion,
      tosVersionVigente,
      flowConfigurada: flow !== null,
      tieneProductoPublicable: productoPublicable !== null,
      hayRaffleActivo: raffleActivo !== null,
      basesPdfDelRaffleActivo: raffleActivo?.basesPdfUrl ?? null,
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
