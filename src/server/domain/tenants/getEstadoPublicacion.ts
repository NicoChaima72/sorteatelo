import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { esActiva } from "~/server/domain/facturacion/_estadoSuscripcion";
import { exencionVigente } from "~/server/domain/facturacion/_gateVenta";
import {
  type EstadoPublicacion,
  evaluarPublicacion,
} from "~/server/domain/tenants/_publicacion";
import { hayProductoEntregable } from "~/server/productos/productoEntregable";
import { TOS_VERSION } from "~/server/tos/tos";

/**
 * Use case del panel (F08/F03, D4): estado de publicación de la Tienda. Carga los datos que el
 * gate necesita (ToS aceptado, FlowCredential, ≥1 producto publicable, sorteo activo + bases) y
 * los evalúa con el núcleo puro `evaluarPublicacion` — la MISMA lógica que recomputa
 * `publicarTienda` server-side (I2). Es la única fuente de verdad del checklist del panel.
 *
 * Scopeado por el `tenantId` resuelto SERVER-SIDE (I1/ADR-0005); sin membresía ⇒ `FORBIDDEN`.
 * `tosVersionVigente` se inyecta (default `TOS_VERSION`) para testear sin acoplar a la constante.
 */
export async function getEstadoPublicacion({
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
}): Promise<EstadoPublicacion & { slug: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  const [tenant, flow, tieneProductoPublicable, raffleActivo, suscripcion, exencion] =
    await Promise.all([
      db.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { slug: true, estado: true, tosVersion: true },
      }),
      // Solo si existe: NUNCA se traen las columnas cifradas (I6/ADR-0006).
      db.flowCredential.findUnique({
        where: { tenantId },
        select: { tenantId: true },
      }),
      // Publicable = ENTREGABLE: activo Y con algo que entregar. Desde productos-tipos-digitales
      // F03 el criterio ya no es `pdfPath != null` (el código nuevo no escribe esa columna), y desde
      // F06 tampoco es un `where`: para un SOBRE hay que comparar el pool contra el pack ACTIVO más
      // grande (D4/I7), que es una comparación de AGREGADOS. La misma función la recomputa
      // `publicarTienda` dentro de su `$tx` — una sola definición del gate (I2).
      hayProductoEntregable({ db, tenantId }),
      // Las BASES del gate salen del Raffle ACTIVO (admin-bases-pdf F03/D2/D3): se trae su
      // `basesPdfUrl` en la MISMA query que ya resolvía "hay sorteo activo".
      db.raffle.findFirst({
        where: { tenantId, estado: "ACTIVO" },
        select: { id: true, basesPdfUrl: true },
      }),
      // Facturación de la plataforma (ADR-0026, F03/D2): plan activo o Exención vigente. Son
      // entidades de PLATAFORMA 1-1 con el Tenant (D14) — se leen por `tenantId` como identidad,
      // no como scoping de dominio.
      db.platformSubscription.findUnique({
        where: { tenantId },
        select: { estado: true },
      }),
      db.platformExemption.findUnique({
        where: { tenantId },
        select: { exentaHasta: true },
      }),
    ]);

  const evaluado = evaluarPublicacion({
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

  return { slug: tenant.slug, ...evaluado };
}
