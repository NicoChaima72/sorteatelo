import { useReducedMotion } from "@mantine/hooks";
import { useEffect, useState } from "react";

import { cn } from "~/lib/utils";

import { Etiqueta } from "./etiqueta";
import s from "./landing.module.css";

/**
 * Talonario vivo — la firma animada del talonario: una grilla de números vendidos (con iniciales),
 * libres (tenues) y el «TÚ» en amarillo. Cada ~3s "sale" un número vendido con un sello ¡SALE!
 * rotando. **Respeta `prefers-reduced-motion`** (`useReducedMotion` de `@mantine/hooks`, I5): con
 * movimiento reducido queda un ganador fijo, sin interval. Datos de EJEMPLO (no hay tenant real).
 */

interface Celda {
  numero: string;
  iniciales?: string;
}

/** 20 números del talonario de ejemplo: vendidos con iniciales, libres sin nada. */
const CELDAS: Celda[] = [
  { numero: "301", iniciales: "M.P." },
  { numero: "302", iniciales: "CATA" },
  { numero: "303" },
  { numero: "304", iniciales: "J.R." },
  { numero: "305", iniciales: "FRAN" },
  { numero: "306" },
  { numero: "307", iniciales: "V.S." },
  { numero: "308", iniciales: "NIKO" },
  { numero: "309", iniciales: "PAU" },
  { numero: "310" },
  { numero: "311", iniciales: "R.M." },
  { numero: "312" }, // ← TÚ
  { numero: "313", iniciales: "DANI" },
  { numero: "314" },
  { numero: "315", iniciales: "T.A." },
  { numero: "316", iniciales: "SOFI" },
  { numero: "317" },
  { numero: "318", iniciales: "L.C." },
  { numero: "319", iniciales: "MAXI" },
  { numero: "320" },
];

const INDICE_TUYO = 11;
const INDICES_VENDIDOS = CELDAS.map((c, i) => (c.iniciales ? i : -1)).filter(
  (i) => i >= 0,
);

export function TalonarioVivo() {
  const sinMovimiento = useReducedMotion();
  const [ganador, setGanador] = useState(INDICES_VENDIDOS[4] ?? 0);

  useEffect(() => {
    if (sinMovimiento) return;
    const id = setInterval(() => {
      setGanador((prev) => {
        const pos = INDICES_VENDIDOS.indexOf(prev);
        return INDICES_VENDIDOS[(pos + 1) % INDICES_VENDIDOS.length] ?? prev;
      });
    }, 3000);
    return () => clearInterval(id);
  }, [sinMovimiento]);

  return (
    <div
      className={s.talonario}
      role="img"
      aria-label="Ejemplo de talonario de sorteo"
    >
      <div className={s.talonarioCabecera}>
        <Etiqueta>Sorteo · Tienda de Luna</Etiqueta>
        <Etiqueta>Serie A</Etiqueta>
      </div>
      <div className={s.talonarioGrilla}>
        {CELDAS.map((celda, i) => {
          if (i === INDICE_TUYO) {
            return (
              <div key={celda.numero} className={s.numeroTuyo}>
                <span>Nº {celda.numero}</span>
                <small>TÚ</small>
              </div>
            );
          }
          if (celda.iniciales) {
            return (
              <div
                key={celda.numero}
                className={cn(
                  s.numeroVendido,
                  i === ganador && s.numeroGanador,
                )}
              >
                <span>Nº {celda.numero}</span>
                <small>{celda.iniciales}</small>
              </div>
            );
          }
          return (
            <div key={celda.numero} className={s.numeroLibre}>
              <span>Nº {celda.numero}</span>
            </div>
          );
        })}
      </div>
      <div className={s.talonarioPie}>
        <Etiqueta>312 números vendidos</Etiqueta>
        <Etiqueta>Cierra en 3 días</Etiqueta>
      </div>
    </div>
  );
}
