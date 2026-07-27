import { DomainError } from "~/server/domain/errors";
import { ErrorConfiguracionFlow } from "~/server/services/flowPlataforma";

/**
 * Traductor de fallos del proveedor a frases del dominio (F03/F06/F10).
 *
 * El service nombra la ruta y el status HTTP de Flow en sus errores — buenísimo para el log,
 * ilegible en la pantalla de alguien que solo quiso activar su plan o guardar su tarjeta. Y esos
 * mensajes SÍ llegan a la pantalla: tRPC no redacta el `message` y las páginas del panel imprimen
 * `e.message` tal cual. «Flow (plataforma) /api/customer/getRegisterStatus respondió 401» es copy
 * interno en la cara del Organizador, en un flujo de plata.
 *
 * La regla: **el detalle queda en el log del servidor, a la superficie sale una frase del dominio.**
 *
 * ── La única excepción, y es deliberada ─────────────────────────────────────────────────────────
 * `ErrorConfiguracionFlow` (falta una env var `FLOW_PLATAFORMA_*`) pasa intacto. Ahí no falló Flow:
 * falló el despliegue, y el nombre de la variable es lo único accionable que existe. Traducirlo a
 * «intenta de nuevo en unos minutos» mandaría a reintentar para siempre algo que ningún reintento
 * puede arreglar, y le quitaría a quien opera la plataforma su mejor pista.
 *
 * ── Restricción de uso ──────────────────────────────────────────────────────────────────────────
 * El closure tiene que envolver **una sola llamada al proveedor y nada más**. Cualquier otra cosa
 * adentro —una query de Prisma, por ejemplo— se traduciría a «reintenta en unos minutos», que es
 * mentira y además esconde el problema real. Dos lugares se dejaron A PROPÓSITO fuera de este
 * traductor: la `$transaction` de `activarPlanTrasRegistro` (D16-A necesita relanzar el error
 * ORIGINAL) y el `changePlan` de `cancelarPlan` (necesita leer el `codigoFlow === 1001`, que un
 * `DomainError` no lleva).
 */
export async function traduciendoErroresDeFlow<T>(
  mensaje: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ErrorConfiguracionFlow) throw error;
    if (error instanceof DomainError) throw error;

    console.error("[facturacion] la API de Flow falló", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new DomainError("INVALID", mensaje);
  }
}
