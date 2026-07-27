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
  | "INACTIVE"
  // Cuota de intentos agotada (verificador-tickets F01/D5). Es una condición de negocio y no solo
  // de transporte: el use case decide que NO va a trabajar, y el mensaje que acompaña al código lo
  // lee una persona esperando ver sus tickets. Va acá y no como `TRPCError` suelto en el router
  // para que el corte quede testeable sin levantar tRPC (que la DB no se toque es la mitad del
  // valor del gate).
  | "TOO_MANY_REQUESTS";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "DomainError";
  }
}
