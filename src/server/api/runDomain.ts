import { TRPCError } from "@trpc/server";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server/rpc";

import { DomainError, type DomainErrorCode } from "~/server/domain/errors";

/**
 * Seam entre el transporte (routers tRPC) y el dominio: ejecuta un use case y
 * mapea `DomainError` → `TRPCError` por código; deja pasar cualquier otro
 * `Error` (que tRPC convierte en INTERNAL_SERVER_ERROR). Ver
 * `docs/agents/backend-conventions.md` § Layering.
 *
 * Patrón de uso en un procedure:
 *   .mutation(({ ctx, input }) =>
 *     runDomain(() => crearOrden({ db: ctx.db, session: ctx.session, input })))
 */
const MAPA: Record<DomainErrorCode, TRPC_ERROR_CODE_KEY> = {
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  INVALID: "BAD_REQUEST",
  CONFLICT: "CONFLICT",
  INACTIVE: "BAD_REQUEST",
};

export async function runDomain<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DomainError) {
      throw new TRPCError({ code: MAPA[e.code], message: e.message, cause: e });
    }
    throw e;
  }
}
