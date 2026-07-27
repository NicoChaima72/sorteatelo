import { type CSSProperties } from "react";

import estilos from "~/components/storefront/corazones-flotantes.module.css";

/**
 * Capa de CORAZONES FLOTANTES del hero `imagen_fondo` (focos-animados, iteración de diseño 2026-07-27).
 * Decoración pura: corazones que suben lento con vaivén y fade, en tokens de marca/acento del tenant.
 *
 * Mismo contrato que `LucesAmbiente` (el contenedor trae `isolation: isolate`) y mismas reglas: cero
 * JS de animación (I5), `aria-hidden` + `pointer-events: none` (I6), reduced-motion ⇒ invisible (I4 —
 * nacen con `opacity: 0` y solo la animación los enciende).
 *
 * El SET es CURADO y determinista (nunca Math.random — SSR y cliente pintan lo mismo): 8 corazones con
 * posición/tamaño/ritmo/delay/opacidad fijos, colores alternando marca y acento (fallback a marca sin
 * acento, I-T2). Curado sobre la maqueta aprobada por el usuario (`tmp/test-corazones.html`).
 */

const ACENTO_4 = "var(--mantine-color-acento-4, var(--mantine-primary-color-4))";
const ACENTO_5 = "var(--mantine-color-acento-5, var(--mantine-primary-color-5))";
const MARCA_4 = "var(--mantine-primary-color-4)";
const MARCA_5 = "var(--mantine-primary-color-5)";

/** x/tam/dur en unidades CSS; delays NEGATIVOS ⇒ la escena arranca ya poblada (sin oleada inicial). */
const CORAZONES: ReadonlyArray<{
  x: string;
  tam: number;
  dur: number;
  delay: number;
  col: string;
  op: number;
}> = [
  { x: "8%", tam: 26, dur: 13, delay: 0, col: ACENTO_5, op: 0.85 },
  { x: "16%", tam: 16, dur: 17, delay: -6, col: MARCA_4, op: 0.6 },
  { x: "26%", tam: 34, dur: 15, delay: -11, col: MARCA_5, op: 0.8 },
  { x: "38%", tam: 14, dur: 19, delay: -3, col: ACENTO_5, op: 0.5 },
  { x: "62%", tam: 18, dur: 16, delay: -9, col: ACENTO_4, op: 0.6 },
  { x: "74%", tam: 30, dur: 14, delay: -5, col: ACENTO_5, op: 0.85 },
  { x: "84%", tam: 16, dur: 18, delay: -13, col: MARCA_4, op: 0.55 },
  { x: "92%", tam: 24, dur: 15, delay: -2, col: MARCA_5, op: 0.75 },
];

export function CorazonesFlotantes() {
  return (
    <div aria-hidden className={estilos.capa}>
      {CORAZONES.map((c, i) => (
        <span
          key={i}
          className={estilos.corazon}
          style={
            {
              "--cz-x": c.x,
              "--cz-tam": `${c.tam}px`,
              "--cz-dur": `${c.dur}s`,
              "--cz-delay": `${c.delay}s`,
              "--cz-col": c.col,
              "--cz-op": c.op,
            } as CSSProperties
          }
        >
          ♥
        </span>
      ))}
    </div>
  );
}
