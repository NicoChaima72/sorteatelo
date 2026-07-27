import { useDebouncedValue } from "@mantine/hooks";
import { useMemo } from "react";

import { useCarrito, type ItemCarrito } from "~/components/storefront/carrito";
import { api, type RouterOutputs } from "~/utils/api";

/**
 * **Cotización del carrito, para PINTAR** (F01 de `storefront-carrito-total-y-drawer`).
 *
 * El único lugar del cliente que sabe pedirle al server cuánto suma el carrito. Lo comparten el
 * drawer y el resumen del checkout a propósito (D6): las dos superficies tienen que mostrar EL MISMO
 * total, y dos llamadas escritas por separado se desincronizan en la primera edición.
 *
 * **I2 — el cliente no hace aritmética de plata.** Acá no se suma ni se multiplica nada: se manda
 * `{productId, cantidad}` y se recibe el total ya calculado en `Decimal` server-side sobre los
 * precios VIGENTES. El `precio` que el carrito guarda en `localStorage` es un rótulo para pintar al
 * instante; en cuanto llega la cotización, manda la del server (también para el `portadaUrl`).
 *
 * Los cuatro estados que expone existen porque la cotización va y vuelve mientras el Comprador toca
 * el stepper, y decir «$0» o parpadear a vacío en el medio sería mentir:
 *
 * - `cargando` — todavía no hay ningún total que mostrar (primera apertura).
 * - `recalculando` — hay un total, pero es del carrito ANTERIOR (debounce en curso o request en
 *   vuelo). La UI lo muestra atenuado en vez de esconderlo.
 * - `error` — no se pudo cotizar; la UI cae al copy honesto («lo confirmas al pagar») + Reintentar.
 *   La compra NO se bloquea: el total real lo calcula el server igual al iniciar el checkout.
 * - `sincronizada` — la cotización corresponde EXACTAMENTE al carrito de ahora. Es la única
 *   condición bajo la cual se puede afirmar que un ítem sin línea «ya no está disponible» (D3):
 *   sin este guard, un ítem perfectamente vivo se marcaría muerto durante cada refetch.
 */

export type LineaCotizada =
  RouterOutputs["checkout"]["cotizarCarrito"]["lineas"][number];

/**
 * Cuánto se espera antes de re-cotizar tras un cambio de cantidad. Un burst de «+ + +» en el stepper
 * dispara UNA request y no tres. Corto a propósito: el total es lo que el Comprador está mirando.
 */
const MS_DEBOUNCE = 350;

/** Identidad del carrito para comparar dos estados sin comparar objetos. */
function firmaDe(items: ItemCarrito[]): string {
  return items.map((i) => `${i.id}:${i.cantidad}`).join("|");
}

export interface CotizacionDelCarrito {
  /** La línea cotizada de un ítem, o `undefined` si el server no la devolvió. */
  lineaDe: (productId: string) => LineaCotizada | undefined;
  /** Total ya formateable (string de `Decimal`), o `null` si todavía no hay ninguno. */
  total: string | null;
  cargando: boolean;
  recalculando: boolean;
  error: boolean;
  /** `true` sii lo que hay en mano corresponde al carrito actual (ver docstring). */
  sincronizada: boolean;
  /**
   * `true` sii la cotización está sincronizada y **ninguno** de los ítems del carrito se puede
   * comprar hoy. Es el caso límite de D3: sin esto la UI mostraría «Total $0» con el botón de pagar
   * encendido, y el Comprador se iría a estrellar contra el rechazo del checkout.
   */
  sinNadaQueCobrar: boolean;
  reintentar: () => void;
}

export function useCotizacionCarrito({
  activo = true,
}: { activo?: boolean } = {}): CotizacionDelCarrito {
  const { items } = useCarrito();
  const [itemsEstables] = useDebouncedValue(items, MS_DEBOUNCE);

  const payload = useMemo(
    () => ({
      items: itemsEstables.map((i) => ({ productId: i.id, cantidad: i.cantidad })),
    }),
    [itemsEstables],
  );

  const habilitada = activo && payload.items.length > 0;
  const query = api.checkout.cotizarCarrito.useQuery(payload, {
    enabled: habilitada,
    // El precio vigente es un dato del Organizador que puede cambiar entre dos aperturas del
    // carrito: al reabrir el drawer se vuelve a preguntar en vez de servir un total viejo.
    staleTime: 0,
    // Conserva el total anterior mientras llega el nuevo (D7): sin esto, cada «+» del stepper vacía
    // el número y el footer del drawer salta de alto.
    placeholderData: (previo) => previo,
    // Reintentar una cotización es barato pero no gratis; y el fallback ya es honesto.
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const enVuelo = query.isFetching || firmaDe(items) !== firmaDe(itemsEstables);
  const lineas = query.data?.lineas;
  const sincronizada = habilitada && query.data !== undefined && !enVuelo;

  return {
    lineaDe: (productId) => lineas?.find((l) => l.productId === productId),
    total: query.data?.total ?? null,
    cargando: habilitada && query.data === undefined && !query.isError,
    recalculando: habilitada && query.data !== undefined && enVuelo,
    error: query.isError,
    sincronizada,
    sinNadaQueCobrar: sincronizada && lineas?.length === 0,
    reintentar: () => void query.refetch(),
  };
}
