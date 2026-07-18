import { motion, useReducedMotion } from "motion/react";
import { type ReactNode } from "react";

/**
 * Entrada suave de una sección de la LANDING al hacer scroll (F05/D11): fade + translate leve, una
 * sola definición reutilizada. **Acotado a la landing** — `motion` no se importa fuera de acá
 * (I5/frontend-conventions § Motion). Respeta `prefers-reduced-motion`: con movimiento reducido
 * NO anima — renderiza un `div` plano con el contenido COMPLETO y visible (nunca oculto). El
 * `className` se aplica al contenedor, así puede ser también la grilla/flex de la sección.
 */
export function RevelarAlScroll({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const sinMovimiento = useReducedMotion();

  if (sinMovimiento) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
