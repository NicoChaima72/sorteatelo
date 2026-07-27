import { type EstadoOrden } from "~/styles/theme";

/**
 * Qué está diciendo la pantalla de retorno del checkout (`src/pages/checkout/retorno.tsx`).
 *
 * Función PURA de lo único que esa página observa —el `?token=` de Flow, lo que respondió la query
 * pública `estadoOrden` y su propio reloj— separada del componente porque su riesgo NO es el render
 * sino el **orden de las ramas**: `detenido` se enciende por dos motivos distintos (la orden se
 * resolvió / se acabó el cap de 2 min) y el token puede faltar, así que una precedencia mal puesta
 * manda a alguien a un final que no es el suyo. Acá esa precedencia es testeable
 * (`src/__tests__/lib/faseRetornoCheckout.test.ts`); dentro de un ternario anidado no lo era.
 *
 * El COPY de cada fase NO vive acá: vive en `COPY_FASE`, junto al render que lo pinta
 * (frontend-conventions § «Avisos y tablas de copy por estado»). Este módulo decide CUÁL, no QUÉ.
 */

/** Las cosas que la pantalla de retorno del checkout puede estar diciendo. */
export type FaseRetorno = "pagado" | "fallido" | "timeout" | "esperando" | "sin_token";

/** Lo único que la página observa: la URL, la query pública y su propio reloj. */
export interface ObservacionRetorno {
  /** `?token=` de Flow. Ausente ⇒ no hay compra que consultar (la query ni corre). */
  token: string | undefined;
  /** Lo que respondió `checkout.estadoOrden`; `null` = todavía no sabe (o token ajeno). */
  estado: EstadoOrden | null;
  /** El polling ya se detuvo (por resolución de la orden o por el cap de 2 min). */
  detenido: boolean;
}

export function faseDelRetorno({ token, estado, detenido }: ObservacionRetorno): FaseRetorno {
  if (!token) return "sin_token";
  if (estado === "PAGADO") return "pagado";
  if (estado === "FALLIDO") return "fallido";
  if (detenido) return "timeout";
  return "esperando";
}
