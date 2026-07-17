import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantAutorizado } from "~/server/authPolicy";
import { type ListarVentasInput } from "~/server/domain/panel/schemas";

/** Filas por página del listado de ventas (backend-conventions § Paginación por cursor). */
const PAGE_SIZE = 15;

interface VentaDelPanel {
  id: string;
  email: string;
  estado: "PENDIENTE" | "PAGADO" | "FALLIDO";
  /** Montos como string `Decimal` (nunca `number` en el server); UI formatea con Intl. */
  total: string;
  /** Comisión de Flow (cruda, del getStatus). null si la orden no está pagada. */
  comision: string | null;
  /** Neto al vendedor = total − comisión (Decimal). null si no está pagada. */
  neto: string | null;
  productos: string[];
  createdAt: Date;
}

/**
 * Use case del panel (F03): lista las ventas (órdenes) de la Tienda del Organizador,
 * paginadas por cursor. El `tenantId` se resuelve SERVER-SIDE desde `acceso` (I1/ADR-0005);
 * sin membresía ⇒ `FORBIDDEN`.
 *
 * Orden total estable `[createdAt desc, id desc]` (el `id` cuid desempata para que el cursor
 * no repita/saltee en los empates de fecha). El neto = `total − Payment.fee` se calcula con
 * `Decimal` server-side (I4) y viaja como string; nunca aritmética con `number`.
 */
export async function listarVentas({
  db,
  acceso,
  input,
  pageSize = PAGE_SIZE,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: ListarVentasInput;
  pageSize?: number;
}): Promise<{ items: VentaDelPanel[]; nextCursor: string | null }> {
  const tenantId = resolverTenantAutorizado({
    esOperador: acceso.esOperador,
    tenantIdsDeMembresia: acceso.tenantIds,
  });

  const rows = await db.order.findMany({
    where: { tenantId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    ...(input.cursor
      ? { cursor: { id: input.cursor }, skip: 1 }
      : {}),
    select: {
      id: true,
      email: true,
      estado: true,
      total: true,
      createdAt: true,
      items: { select: { product: { select: { titulo: true } } } },
      payment: { select: { fee: true, estado: true } },
    },
  });

  let nextCursor: string | null = null;
  if (rows.length > pageSize) {
    rows.pop(); // descarta la fila extra
    nextCursor = rows[rows.length - 1]!.id;
  }

  const items: VentaDelPanel[] = rows.map((o) => {
    const pagada = o.estado === "PAGADO";
    const fee = pagada ? (o.payment?.fee ?? null) : null;
    return {
      id: o.id,
      email: o.email,
      estado: o.estado,
      total: o.total.toFixed(0),
      comision: fee ? fee.toFixed(0) : null,
      neto: fee ? o.total.minus(fee).toFixed(0) : null,
      productos: o.items.map((it) => it.product.titulo),
      createdAt: o.createdAt,
    };
  });

  return { items, nextCursor };
}
