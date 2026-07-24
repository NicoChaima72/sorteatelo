import { createContext, useContext, type ReactNode } from "react";

import { type RouterOutputs } from "~/utils/api";

/**
 * Contexto de PREVIEW del catálogo de widgets (catálogo-v2 F11). Cuando el `WidgetGallery` del editor
 * renderiza los componentes REALES del storefront en miniatura, algunos dependen de datos server-side
 * (`useSorteoActivo`/`useSorteoResumen`: contador/meta/vitrina/ganadores). En preview NO queremos
 * disparar esas queries (ni ver estados vacíos): este contexto le indica a esos hooks que usen DATOS DE
 * MUESTRA estáticos (abajo) con `enabled:false` — CERO llamada a los use cases (jamás se tocan). Fuera
 * del editor (storefront real) el contexto es `false` por defecto ⇒ comportamiento intacto.
 *
 * NO importa `motion` (I-E). Los datos de muestra se tipan contra `RouterOutputs` (client-safe): si el
 * shape del use case cambia, el compilador obliga a actualizar la muestra (no hay drift silencioso).
 */

const PreviewMuestraContext = createContext(false);

/** Marca el subárbol como "preview" ⇒ los hooks de sorteo devuelven muestra sin llamar al server. */
export function PreviewMuestraProvider({ children }: { children: ReactNode }) {
  return <PreviewMuestraContext.Provider value={true}>{children}</PreviewMuestraContext.Provider>;
}

/** `true` sii el componente se renderiza dentro de una preview del editor (F11). */
export function useEnPreview(): boolean {
  return useContext(PreviewMuestraContext);
}

/** Sorteo ACTIVO de muestra (shape de `getSorteoActivoStorefront`) — solo para las previews del editor. */
export const MUESTRA_SORTEO_ACTIVO: NonNullable<
  RouterOutputs["checkout"]["getSorteoActivoStorefront"]
> = {
  id: "preview-raffle",
  nombre: "Sorteo de ejemplo",
  premio: "Un premio de ejemplo",
  fechaInicio: new Date("2026-01-01T00:00:00.000Z"),
  fechaFin: new Date("2026-12-31T23:59:59.000Z"),
  basesUrl: null,
  basesTexto: "Bases de ejemplo para la vista previa del widget.",
  premioImageUrl: null,
  totalParticipaciones: 348,
};

/** Resumen de sorteos CERRADOS de muestra (shape de `getSorteoResumenStorefront`) — ganador enmascarado. */
export const MUESTRA_SORTEO_RESUMEN: RouterOutputs["checkout"]["getSorteoResumenStorefront"] = [
  {
    id: "preview-cerrado-1",
    nombre: "Sorteo de ejemplo (marzo)",
    premio: "Set de premios",
    fechaFin: new Date("2026-03-31T00:00:00.000Z"),
    ganadorEnmascarado: "ma***@gmail.com",
    totalParticipaciones: 512,
  },
  {
    id: "preview-cerrado-2",
    nombre: "Sorteo de ejemplo (junio)",
    premio: "Vale de regalo",
    fechaFin: new Date("2026-06-30T00:00:00.000Z"),
    ganadorEnmascarado: "jo***@hotmail.com",
    totalParticipaciones: 287,
  },
];
