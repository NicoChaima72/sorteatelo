import { type ReactNode } from "react";

import { cn } from "~/lib/utils";

import s from "./landing.module.css";

/**
 * Chip de ticket — el número de boleto en mono amarillo, con **muescas** troqueladas a los lados
 * (círculos que "perforan" el chip, del color de la carta que lo contiene). `tabular-nums` para que
 * los números no bailen. Cero hex: amarillo y muescas salen de tokens del theme.
 */
export function TicketChip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn(s.ticketChip, className)}>{children}</span>;
}

/**
 * Ticket toast — la tarjeta flotante "compra confirmada" del hero: chip + etiqueta + título. Con
 * `flotante` se posiciona absolute sobre su contenedor relativo (el teléfono); sin él es una card
 * suelta. Gramática suave (card sin borde, sombra difusa).
 */
export function TicketToast({
  numero,
  etiqueta,
  titulo,
  flotante = false,
}: {
  numero: string;
  etiqueta: string;
  titulo: string;
  flotante?: boolean;
}) {
  return (
    <div
      className={cn(s.ticketToast, flotante && s.ticketToastFlotante)}
      role="img"
      aria-label={`${etiqueta}: ${titulo}, número ${numero}`}
    >
      <TicketChip>{numero}</TicketChip>
      <span className={s.ticketToastTexto}>
        <span className={s.ticketToastEtiqueta}>{etiqueta}</span>
        <span className={s.ticketToastTitulo}>{titulo}</span>
      </span>
    </div>
  );
}
