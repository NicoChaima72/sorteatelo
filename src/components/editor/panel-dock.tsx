import { ActionIcon, ScrollArea } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import { AnimatePresence, domAnimation, LazyMotion, m, useReducedMotion } from "motion/react";
import { useRef, useState, type ReactNode } from "react";

/**
 * Sistema de paneles laterales del editor (catálogo-v2 F11) — porta el patrón PanelDock de la UI v2 de
 * grillos-ai. Paneles HERMANOS e independientes, lado a lado (no dock apilado): cada panel abierto es
 * una carta full-height sobre la zona gris con gap; ancho resizable por panel (handle en el borde
 * izquierdo, clamp `PANEL_MIN..PANEL_MAX`). Colapsado ⇒ etiqueta vertical en el rail del borde derecho,
 * que lo re-expande al click.
 *
 * El dock es GENÉRICO: opera sobre `DockPanel[]` (descriptor con key/título/render). El estado (cuáles
 * abiertos + ancho) vive en el editor (`editor-pagebuilder.tsx`); este componente solo renderiza y emite
 * resize/collapse/expand por key. Chrome de PLATAFORMA: cero hex, todo sale de tokens Mantine.
 *
 * Animación (Motion): abrir = width animando desde 0 + fade (spring); cerrar = inverso (AnimatePresence).
 * El resize por drag NO se anima (ancho directo). `useReducedMotion` degrada todo. Vive en `editor/` ⇒
 * puede importar `motion` directo (I-E acota `motion` a `storefront/animar.tsx`, no al editor).
 */

export const PANEL_MIN = 280;
export const PANEL_MAX = 480;

const OPEN_SPRING = { type: "spring", stiffness: 420, damping: 44, mass: 0.7 } as const;

/** Descriptor genérico de un panel del dock. Cada panel trae su propio inset en su `render`. */
export interface DockPanel {
  key: string;
  /** Encabezado del panel. */
  title: string;
  /** Etiqueta vertical cuando colapsa al rail. */
  railLabel: string;
  width: number;
  render: () => ReactNode;
}

function PanelColumna({
  panel,
  onResize,
  onCollapse,
}: {
  panel: DockPanel;
  onResize: (key: string, width: number) => void;
  onCollapse: (key: string) => void;
}) {
  const reduce = useReducedMotion();
  const width = panel.width;
  const drag = useRef<{ startX: number; startW: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startW: width };
    setDragging(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d === null) return;
    // Arrastrar a la IZQUIERDA agranda el panel (el handle está en el borde izquierdo).
    const next = d.startW + (d.startX - e.clientX);
    onResize(panel.key, Math.min(PANEL_MAX, Math.max(PANEL_MIN, next)));
  };
  const onUp = (e: React.PointerEvent) => {
    drag.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // El ancho es directo durante el drag (sin spring); el spring queda para mount/unmount.
  const widthTransition = reduce || dragging ? { duration: 0 } : OPEN_SPRING;

  return (
    <m.section
      initial={reduce ? false : { width: 0, opacity: 0 }}
      animate={{ width, opacity: 1 }}
      exit={reduce ? { opacity: 0 } : { width: 0, opacity: 0 }}
      transition={{ width: widthTransition, opacity: { duration: reduce ? 0 : 0.15 } }}
      style={{
        position: "relative",
        display: "flex",
        height: "100%",
        flexShrink: 0,
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: "var(--mantine-radius-md)",
        border: "1px solid var(--mantine-color-default-border)",
        background: "var(--mantine-color-body)",
        boxShadow: "var(--mantine-shadow-sm)",
      }}
    >
      {/* Handle de resize (borde izquierdo). */}
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        aria-hidden
        style={{
          position: "absolute",
          insetBlock: 0,
          left: 0,
          zIndex: 10,
          width: 6,
          cursor: "col-resize",
        }}
      />
      <div
        style={{
          display: "flex",
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--mantine-color-default-border)",
          padding: "8px 12px",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--mantine-color-dimmed)",
          }}
        >
          {panel.title}
        </span>
        <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Colapsar ${panel.title}`} onClick={() => onCollapse(panel.key)}>
          <IconChevronRight className="size-4" />
        </ActionIcon>
      </div>
      {/* El cuerpo scrollea; cada panel (Secciones/Galería/…) trae su propio inset. */}
      <ScrollArea style={{ flex: 1, minHeight: 0 }} type="scroll">
        {panel.render()}
      </ScrollArea>
    </m.section>
  );
}

export function PanelDock({
  open,
  collapsed,
  onResize,
  onCollapse,
  onExpand,
}: {
  open: DockPanel[];
  collapsed: { key: string; railLabel: string }[];
  onResize: (key: string, width: number) => void;
  onCollapse: (key: string) => void;
  onExpand: (key: string) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <LazyMotion features={domAnimation}>
      {/* La zona gris se mantiene montada (aunque vacía) para que el último panel corra su salida. */}
      <div
        style={{
          display: "flex",
          height: "100%",
          flexShrink: 0,
          ...(open.length > 0
            ? { gap: 8, background: "var(--mantine-color-gray-1)", padding: 8 }
            : {}),
        }}
      >
        <AnimatePresence initial={false}>
          {open.map((panel) => (
            <PanelColumna key={panel.key} panel={panel} onResize={onResize} onCollapse={onCollapse} />
          ))}
        </AnimatePresence>
      </div>

      {collapsed.length > 0 && (
        <div
          style={{
            display: "flex",
            width: 32,
            flexShrink: 0,
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            borderLeft: "1px solid var(--mantine-color-default-border)",
            background: "var(--mantine-color-gray-0)",
            paddingBlock: 8,
          }}
        >
          <AnimatePresence initial={false}>
            {collapsed.map((c) => (
              <m.button
                type="button"
                key={c.key}
                onClick={() => onExpand(c.key)}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.15 }}
                style={{
                  writingMode: "vertical-rl",
                  cursor: "pointer",
                  borderRadius: "var(--mantine-radius-sm)",
                  border: "1px solid var(--mantine-color-default-border)",
                  background: "var(--mantine-color-body)",
                  padding: "10px 2px",
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--mantine-color-dimmed)",
                }}
              >
                {c.railLabel}
              </m.button>
            ))}
          </AnimatePresence>
        </div>
      )}
    </LazyMotion>
  );
}
