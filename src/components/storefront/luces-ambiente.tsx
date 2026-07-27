import { type CSSProperties } from "react";

import estilos from "~/components/storefront/luces-ambiente.module.css";
import { cn } from "~/lib/utils";
import { type CapaDeLuces } from "~/styles/estiloSeccion";

/**
 * Capa de LUCES DE AMBIENTE (storefront-focos-ambiente-animados F01/F02, D3). Decoración pura: un div
 * por luz, cada uno con su `radial-gradient` de la escala del tenant, moviéndose por CSS.
 *
 * La usan las DOS superficies del plan con el mismo componente y los mismos keyframes: el shell del
 * storefront (`TemaPagina.ambiente` + `ambienteAnimado`) y el hero `imagen_fondo` (`luces` +
 * `lucesAnimadas`), donde se pinta SOBRE la imagen y su overlay pero DEBAJO del texto.
 *
 * Contrato con quien la monta: el contenedor debe traer `isolation: isolate` y `position: relative` (o
 * ser ya un contenedor posicionado). Sin `isolation`, el `z-index:-1` de la capa la mandaría detrás del
 * fondo del contenedor y no se vería nada.
 *
 * NO lleva estado, efecto ni hook: la animación es 100% CSS (I5). Es un componente porque el markup y el
 * mapeo capa→clase tienen que vivir en algún lado, no porque haya lógica de cliente.
 */

/** Clase por índice de capa. Hoy ningún ambiente pasa de 3 luces; una 4ª quedaría sin animar (no rota). */
const CLASE_POR_LUZ = [estilos.luz1, estilos.luz2, estilos.luz3];

const CLASE_POR_MOVIMIENTO = { drift: estilos.drift, pulso: estilos.pulso } as const;

export function LucesAmbiente({ capa }: { capa: CapaDeLuces }) {
  // Orden INVERTIDO a propósito: en el shorthand `background: g1, g2, g3` la PRIMERA capa es la de
  // arriba; en divs apilados es la ÚLTIMA. Pintar al revés es lo que hace que esta capa, cuando
  // `prefers-reduced-motion` la deja quieta, se vea idéntica al ambiente estático de siempre (I4).
  const indices = Array.from({ length: capa.total }, (_, i) => i).reverse();

  return (
    <div
      aria-hidden
      className={cn(estilos.capa, capa.movimiento && CLASE_POR_MOVIMIENTO[capa.movimiento])}
      style={capa.vars as CSSProperties}
    >
      {indices.map((i) =>
        CLASE_POR_LUZ[i] ? <div key={i} className={cn(estilos.luz, CLASE_POR_LUZ[i])} /> : null,
      )}
    </div>
  );
}
