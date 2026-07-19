import { api } from "~/utils/api";

/**
 * Query pública del sorteo ACTIVO de la Tienda del subdominio (plantilla-rica F04/D9). La consumen
 * el chip de countdown del header, el enlace a bases del footer y la vitrina del sorteo — react-query
 * DEDUPE las tres en una sola request por la misma query key. `retry: false`: es una sección
 * opcional/decorativa; si falla o no hay sorteo, el chrome degrada limpio (no rompe la home).
 */
export function useSorteoActivo() {
  return api.checkout.getSorteoActivoStorefront.useQuery(undefined, {
    retry: false,
  });
}

/**
 * Query pública del RESUMEN de sorteos CERRADOS (catálogo-v2 F06): ganadores ENMASCARADOS + agregados,
 * sin PII (ADR-0004, todo server-side). La consume `ganadores` en modo `automatico`. `retry:false`:
 * sección opcional; sin cerrados ⇒ `[]` ⇒ el widget se auto-oculta.
 */
export function useSorteoResumen(max?: number) {
  return api.checkout.getSorteoResumenStorefront.useQuery(
    max === undefined ? undefined : { max },
    { retry: false },
  );
}
