import { type ReactNode } from "react";

import { cn } from "~/lib/utils";

import s from "./landing.module.css";

/** Tonos de banda disponibles (regla del usuario: dos blancas nunca adyacentes). */
export type TonoBanda = "blanca" | "azul" | "amarilla" | "gris" | "tinta";

const CLASE_TONO: Record<TonoBanda, string | undefined> = {
  blanca: undefined,
  azul: s.bandaAzul,
  amarilla: s.bandaAmarilla,
  gris: s.bandaGris,
  tinta: s.bandaTinta,
};

/**
 * Banda — sección full-bleed de un color del talonario. Las bandas oscuras (`azul`/`tinta`)
 * voltean la tinta a blanco para su texto DIRECTO (las cards internas re-anclan la suya sola, vía
 * el CSS module). Por defecto envuelve el contenido en el contenedor centrado de la landing
 * (`max-w-6xl` + gutters mobile-first); con `contenedor={false}` el hijo maneja su propio layout.
 * Cero hex: todos los fondos salen de tokens del theme.
 */
export function Banda({
  tono = "blanca",
  children,
  contenedor = true,
  contenedorClassName,
  className,
  id,
}: {
  tono?: TonoBanda;
  children: ReactNode;
  contenedor?: boolean;
  contenedorClassName?: string;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn(s.banda, CLASE_TONO[tono], className)}>
      {contenedor ? (
        <div
          className={cn(
            "mx-auto w-full max-w-6xl px-4 lg:px-8",
            contenedorClassName,
          )}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}
