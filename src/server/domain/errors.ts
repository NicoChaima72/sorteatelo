/**
 * Errores de negocio del dominio. Un use case que quiere señalar una condición
 * de negocio conocida lanza un `DomainError` con un código acotado; el seam
 * `runDomain()` los mapea a `TRPCError`. Cualquier otro `Error` cae a
 * INTERNAL_SERVER_ERROR. Ver `docs/agents/backend-conventions.md` § Layering.
 */
export type DomainErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID"
  | "CONFLICT"
  | "INACTIVE";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "DomainError";
  }
}
