import { type Prisma } from "@prisma/client";

/**
 * Reglas de negocio de los Campos de checkout que NO son código: los números y las listas que el
 * plan cerró (D6/D7). Viven en un módulo propio —no `_`-privado— porque los comparten varios use
 * cases del módulo (crear, cambiar-activo, listar) y, más adelante, el checkout público (F04).
 *
 * `MAX_CAMPOS_ACTIVOS` además se ESPEJA en el panel (`~/components/admin/campos-checkout`, F03)
 * para el cartel "N de 10": el cliente no importa código del server (frontend-conventions, misma
 * regla que `MAX_CANTIDAD_POR_ITEM`), así que el número está duplicado a propósito y documentado en
 * ambas puntas. **La verdad es esta**: el cartel informa, el guard de la `$tx` es el que decide.
 */

/**
 * Máximo de Campos de checkout ACTIVOS por Tienda (D6/I6). Los desactivados y los borrados NO
 * cuentan: el tope protege el CHECKOUT (mobile-first, donde cada campo extra cuesta conversión),
 * no el catálogo de definiciones.
 *
 * Es un invariante de USE CASE, recontado dentro de la `$transaction` — NO una constraint de DB:
 * Postgres no expresa "≤ N filas con activo = true por tenant" sin un trigger, y Prisma tampoco
 * (mismo criterio que "1 Raffle ACTIVO por tenant", S5).
 */
export const MAX_CAMPOS_ACTIVOS = 10;

/**
 * Claves que ninguna Tienda puede tomar porque colisionarían con el dato FIJO del checkout (D7/I2):
 * el correo del Comprador es su identidad (ADR-0004), vive en `Order.email` y se pide SIEMPRE — no
 * es configurable ni duplicable. Se comparan contra la clave ya DERIVADA y normalizada.
 */
export const CLAVES_RESERVADAS: ReadonlySet<string> = new Set([
  "email",
  "correo",
]);

/**
 * Orden TOTAL y determinista de los Campos de checkout. `posicion` NO es única a propósito (schema
 * F01: reordenar contra un unique exigiría swaps temporales), así que sin el desempate por
 * `createdAt` dos campos empatados saldrían en un orden que puede cambiar entre requests — y el
 * Comprador vería el form barajado. Se comparte entre el panel (F02) y el checkout (F04) para que
 * el Organizador ordene EXACTAMENTE lo que el Comprador va a ver.
 */
export const ordenDeCamposCheckout: Prisma.CheckoutFieldOrderByWithRelationInput[] =
  [{ posicion: "asc" }, { createdAt: "asc" }];
