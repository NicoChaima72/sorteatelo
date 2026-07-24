import { type PointerEvent, type ReactNode, useRef } from "react";

/**
 * Marco HOLOGRÁFICO (catálogo-v2 F12): envuelve una imagen/tarjeta con un borde de gradiente ANIMADO
 * (tokens de la escala del tenant — cero hex, I-A) + un tilt 3D suave al mouse. Referencia visual:
 * la holocard de `tienda-libro.html`.
 *
 * Reglas duras del sistema de animación (síntesis §4.6):
 *  - **transform-only** (I-C): el tilt anima solo `transform` (rotateX/rotateY) ⇒ CLS=0.
 *  - **reduced-motion** (I-B): con `prefers-reduced-motion: reduce` el tilt NO se aplica (guard con
 *    `matchMedia` en el handler) y la ANIMACIÓN del gradiente no corre (la clase `.animar-holo` está
 *    gateada por la media query en globals.css) ⇒ marco totalmente estático (gradiente visible fijo).
 *  - **SSR-safe** (I-D): sin `window` en módulo/render; el gradiente se pinta en SSR VISIBLE, el tilt
 *    solo se activa client-side por eventos de puntero. NO importa `motion` (I-E): el tilt es DOM puro.
 */
export function MarcoHolo({
  children,
  radius = "var(--mantine-radius-lg)",
}: {
  children: ReactNode;
  /** Radio del marco (el interior usa el radio menos el grosor del borde). */
  radius?: string;
}) {
  const innerRef = useRef<HTMLDivElement>(null);

  const reducePref = (): boolean =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = innerRef.current;
    if (!el || reducePref()) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    const rotY = px * 10; // grados
    const rotX = -py * 10;
    el.style.transform = `rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
  };

  const onLeave = () => {
    const el = innerRef.current;
    if (el) el.style.transform = "";
  };

  return (
    <div style={{ perspective: 1000 }}>
      <div
        ref={innerRef}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={{ transition: "transform 0.3s ease", transformStyle: "preserve-3d", willChange: "transform" }}
      >
        <div
          className="animar-holo"
          style={{
            padding: 3,
            borderRadius: radius,
            // Gradiente iridiscente desde la escala del tenant (cero hex, I-A). El stop `white` da el
            // reflejo "shine"; `background-size` 300% deja correr la animación de posición.
            background:
              "linear-gradient(115deg, var(--mantine-primary-color-4), var(--mantine-primary-color-7), var(--mantine-color-white), var(--mantine-primary-color-5), var(--mantine-primary-color-8))",
            backgroundSize: "300% 300%",
            boxShadow: "var(--mantine-shadow-lg)",
          }}
        >
          <div
            style={{
              borderRadius: `calc(${radius} - 3px)`,
              overflow: "hidden",
              background: "var(--mantine-color-body)",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
