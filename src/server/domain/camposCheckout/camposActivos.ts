import { type CheckoutFieldType, type PrismaClient } from "@prisma/client";

import { ordenDeCamposCheckout } from "~/server/domain/camposCheckout/reglas";

/**
 * Los Campos de checkout tal como los ve el COMPRADOR (F04). Subconjunto SERIALIZABLE de
 * `CheckoutField` que viaja en `pageProps` del checkout — mismo criterio que `TenantBranding`:
 * al cliente va lo que necesita para renderizar el form, nada más.
 *
 * Deliberadamente SIN `id`, `posicion` ni `activo`: el orden es el del array (lo fija el server),
 * `activo` es siempre `true` acá (la lista ya viene filtrada), y el `id` no lo necesita nadie —
 * la respuesta se identifica por `clave` (D2/D7), que es la llave del snapshot. Enviar el `id`
 * sería sugerir que el cliente puede seleccionar por él, y no puede (I1/I3).
 */
export interface CampoDelCheckout {
  clave: string;
  etiqueta: string;
  tipo: CheckoutFieldType;
  obligatorio: boolean;
  placeholder: string | null;
  textoAyuda: string | null;
  opciones: string[];
  defaultMarcado: boolean;
}

/**
 * El `select` que produce un `CampoDelCheckout`. Exportado —y no inline en la query— porque el
 * checkout lo lee DOS veces por compra desde puertas distintas: acá para RENDERIZAR el form (F04) y
 * dentro de la `$tx` de `iniciarCheckout` para VALIDAR y congelar el snapshot (F05). Si las dos
 * lecturas divergieran, el Comprador podría ver un campo que el validador no conoce.
 */
export const SELECCION_CAMPO_DEL_CHECKOUT = {
  clave: true,
  etiqueta: true,
  tipo: true,
  obligatorio: true,
  placeholder: true,
  textoAyuda: true,
  opciones: true,
  defaultMarcado: true,
} as const;

/**
 * Los Campos ACTIVOS que el checkout de una Tienda le muestra al Comprador (F04), en el orden
 * exacto en que el Organizador los dejó (`ordenDeCamposCheckout`, compartido con el panel).
 *
 * El tenant se selecciona por el `slug` que el SSR ya resolvió DEL HOST (subdominio, I1/ADR-0007):
 * nada del input del cliente llega hasta acá. Los INACTIVOS quedan fuera —desactivar es sacar el
 * campo del checkout (D5)— y una Tienda sin campos devuelve `[]`, que es lo que hace que el
 * checkout quede idéntico al de hoy (I9).
 *
 * SIN `try/catch` a propósito, a diferencia de `resolverNavPaginas`/`resolverChrome`: el nav y el
 * chrome son adorno y degradan a vacío, pero estos campos son DATOS que la Tienda necesita para
 * operar. Degradar a `[]` serviría un checkout que se ve completo y que el server (que lee las
 * mismas definiciones en la `$tx`, I3) va a rechazar por obligatorio faltante — o peor, perdería en
 * silencio un dato opcional. Fallar la página es la respuesta honesta.
 */
export async function listarCamposActivosDelStorefront({
  db,
  tenantSlug,
}: {
  db: PrismaClient;
  tenantSlug: string;
}): Promise<CampoDelCheckout[]> {
  return db.checkoutField.findMany({
    where: { tenant: { slug: tenantSlug }, activo: true },
    orderBy: ordenDeCamposCheckout,
    select: SELECCION_CAMPO_DEL_CHECKOUT,
  });
}
