import {
  COLUMNAS_POR_REPARTO,
  NodoHojaSchema,
  WIDGET_REGISTRY,
  type FilaProps,
  type HojaFilaTipo,
  type NodoHoja,
  type RepartoFila,
} from "~/lib/pagebuilder/widgets";

/**
 * Manipulación PURA de las columnas de una `fila` (Tanda 3 F09/D15). Cada helper recibe los `props` de
 * la fila y devuelve `props` NUEVOS (inmutable — jamás muta la entrada), que el editor manda tal cual
 * como `update_section_props` del nodo fila (el documento completo se re-valida server-side, I3/D15).
 * Sin DB, sin React, client+server safe. NO genera ids (el caller pasa el id — determinismo/testeo).
 */

/** Clona una columna (array de hojas) superficialmente (las hojas son inmutables por convención). */
function clonarColumnas(columnas: NodoHoja[][]): NodoHoja[][] {
  return columnas.map((col) => [...col]);
}

/**
 * Crea un nodo-HOJA nuevo del `tipo` (de la whitelist) con los `defaultProps` del registro y un `id`
 * estable provisto por el caller. Devuelve el nodo YA parseado (defaults rellenados, validado contra
 * `NodoHojaSchema`) ⇒ un tipo fuera de la whitelist lanzaría (imposible: `HojaFilaTipo` lo cierra en TS).
 */
export function crearHojaFila(tipo: HojaFilaTipo, id: string): NodoHoja {
  const def = WIDGET_REGISTRY[tipo];
  return NodoHojaSchema.parse({ id, tipo, v: def.v, props: def.defaultProps });
}

/** Agrega una hoja al final de la columna `columna` (clamp de índice). */
export function agregarHoja(props: FilaProps, columna: number, hoja: NodoHoja): FilaProps {
  const columnas = clonarColumnas(props.columnas);
  const col = columnas[columna];
  if (!col) return props; // índice de columna inexistente ⇒ no-op
  col.push(hoja);
  return { ...props, columnas };
}

/**
 * Reemplaza las `props` de la hoja `indice` de la columna `columna` (D15): el editor de la hoja produce
 * un objeto de props LAXO (el form-generator no es el borde, I3) ⇒ el server revalida el documento entero.
 * Índice fuera de rango ⇒ no-op.
 */
export function actualizarHojaProps(
  props: FilaProps,
  columna: number,
  indice: number,
  nuevaProps: Record<string, unknown>,
): FilaProps {
  const columnas = clonarColumnas(props.columnas);
  const col = columnas[columna];
  if (!col || indice < 0 || indice >= col.length) return props;
  const hoja = col[indice]!;
  col[indice] = { ...hoja, props: nuevaProps } as NodoHoja;
  return { ...props, columnas };
}

/** Quita la hoja `indice` de la columna `columna` (índice fuera de rango ⇒ no-op). */
export function quitarHoja(props: FilaProps, columna: number, indice: number): FilaProps {
  const columnas = clonarColumnas(props.columnas);
  const col = columnas[columna];
  if (!col || indice < 0 || indice >= col.length) return props;
  col.splice(indice, 1);
  return { ...props, columnas };
}

/**
 * Reordena la hoja `indice` de la columna `columna` en `delta` posiciones (−1 = subir, +1 = bajar).
 * Clampa en los bordes (mover el primero hacia arriba / el último hacia abajo ⇒ no-op).
 */
export function moverHoja(
  props: FilaProps,
  columna: number,
  indice: number,
  delta: -1 | 1,
): FilaProps {
  const columnas = clonarColumnas(props.columnas);
  const col = columnas[columna];
  if (!col) return props;
  const destino = indice + delta;
  if (indice < 0 || indice >= col.length || destino < 0 || destino >= col.length) return props;
  const [hoja] = col.splice(indice, 1);
  col.splice(destino, 0, hoja!);
  return { ...props, columnas };
}

/**
 * Cambia el `reparto` ajustando el nº de columnas SIN perder hojas (D15): al REDUCIR columnas (3→2) las
 * hojas de las columnas sobrantes se MERGEAN a la última que queda; al AGREGAR (2→3) se añaden columnas
 * vacías. El reparto solo cambia los spans (mismo nº de columnas) ⇒ intacto salvo el marcador `reparto`.
 */
export function cambiarReparto(props: FilaProps, reparto: RepartoFila): FilaProps {
  const objetivo = COLUMNAS_POR_REPARTO[reparto];
  const columnas = clonarColumnas(props.columnas);
  if (columnas.length > objetivo) {
    // Reducir: las hojas de las columnas sobrantes caen a la última que queda (sin pérdida).
    const sobrantes = columnas.splice(objetivo);
    const ultima = columnas[objetivo - 1];
    if (ultima) for (const col of sobrantes) ultima.push(...col);
  } else {
    // Ampliar: columnas vacías al final.
    while (columnas.length < objetivo) columnas.push([]);
  }
  return { ...props, reparto, columnas };
}
