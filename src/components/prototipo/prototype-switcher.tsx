import { useRouter } from "next/router";
import { useEffect } from "react";

/**
 * PROTOTIPO (skill prototype/UI.md) — barra flotante inferior para alternar
 * variantes de UI vía `?variant=`. Flechas + teclado (← →), URL compartible,
 * oculta en producción. Estilo alto-contraste a propósito: NO es parte del
 * diseño que se está evaluando.
 */

export interface VarianteUI {
  clave: string;
  nombre: string;
}

export function PrototypeSwitcher({
  variantes,
  actual,
}: {
  variantes: VarianteUI[];
  actual: string;
}) {
  const router = useRouter();

  const indice = Math.max(
    0,
    variantes.findIndex((v) => v.clave === actual),
  );

  const irA = (delta: number) => {
    const destino =
      variantes[(indice + delta + variantes.length) % variantes.length];
    if (!destino) return;
    void router.replace(
      { query: { ...router.query, variant: destino.clave } },
      undefined,
      { shallow: true, scroll: false },
    );
  };

  useEffect(() => {
    const onTecla = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const objetivo = e.target as HTMLElement | null;
      if (objetivo?.closest("input, textarea, [contenteditable='true']")) return;
      irA(e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onTecla);
    return () => window.removeEventListener("keydown", onTecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice, variantes.length, router.query]);

  if (process.env.NODE_ENV === "production") return null;

  const flecha: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: "#fff",
    fontSize: 16,
    lineHeight: 1,
    padding: "6px 10px",
    cursor: "pointer",
    borderRadius: 999,
  };

  return (
    <div
      role="group"
      aria-label="Cambiar variante del prototipo"
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: "#111318",
        color: "#fff",
        borderRadius: 999,
        padding: "4px 6px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        fontFamily: "ui-monospace, monospace",
        fontSize: 12.5,
      }}
    >
      <button type="button" style={flecha} aria-label="Variante anterior" onClick={() => irA(-1)}>
        ←
      </button>
      <span style={{ padding: "0 6px", whiteSpace: "nowrap", letterSpacing: "0.04em" }}>
        {variantes[indice]?.clave.toUpperCase()} — {variantes[indice]?.nombre}
      </span>
      <button type="button" style={flecha} aria-label="Variante siguiente" onClick={() => irA(1)}>
        →
      </button>
    </div>
  );
}
