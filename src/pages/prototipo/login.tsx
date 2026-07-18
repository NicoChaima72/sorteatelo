import Link from "next/link";

import {
  IconoGoogle,
  ProtoShell,
  TalonarioVivo,
  Wordmark,
  estilos,
  fuentes,
} from "~/components/prototipo/proto";

/**
 * PROTOTIPO CONSOLIDADO — login del panel, veredicto ronda 4 (skill
 * prototype/UI.md, 2026-07-17): ganó la variante B "split COBALTO" — mitad
 * azul con wordmark + talonario vivo + testimonio, mitad blanca con el
 * acceso. (Se probó la mitad amarilla a pedido del usuario y la descartó
 * él mismo: queda azul.) Gramática suave, sombras rebajadas. Sin OAuth real.
 */
export default function PrototipoLogin() {
  return (
    <ProtoShell titulo="Entrar">
      <main className="flex min-h-screen flex-col lg:flex-row">
        {/* mitad de marca */}
        <div
          className={`${estilos.heroBandaAzul} ${estilos.heroTextoClaro} flex flex-col justify-between gap-10 p-8 lg:w-1/2 lg:p-12`}
        >
          <Wordmark tamano={24} />
          <div className="hidden max-w-sm self-center lg:block">
            <TalonarioVivo />
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.6, maxWidth: "26em", color: "rgba(255,255,255,0.85)" }}>
            «Antes anotaba los números en un cuaderno y rezaba para no
            equivocarme. Ahora cada compra queda con su número al tiro.»
            <span
              className={estilos.etiqueta}
              style={{ display: "block", marginTop: 10, color: "rgba(255,255,255,0.6)" }}
            >
              Organizadora del piloto
            </span>
          </p>
        </div>

        {/* mitad de acceso */}
        <div className="flex flex-1 items-center justify-center px-6 py-14">
          <div style={{ width: "100%", maxWidth: 360 }}>
            <p className={estilos.etiqueta}>Panel del organizador</p>
            <h1
              className={fuentes.display.className}
              style={{ fontSize: 30, fontWeight: 800, margin: "12px 0 8px", letterSpacing: "-0.02em" }}
            >
              Hola de nuevo
            </h1>
            <p style={{ fontSize: 15.5, color: "var(--tinta-suave)", margin: "0 0 28px", lineHeight: 1.55 }}>
              Entra a tu tienda y mira cómo va tu sorteo.
            </p>
            <button type="button" className={estilos.btn} style={{ width: "100%" }}>
              <span
                style={{
                  background: "#fff",
                  borderRadius: 6,
                  padding: 3,
                  display: "inline-flex",
                  flex: "none",
                }}
              >
                <IconoGoogle tamano={18} />
              </span>
              Continuar con Google
            </button>
            <p className={estilos.etiqueta} style={{ marginTop: 24, textTransform: "none", letterSpacing: "0.02em" }}>
              ¿Todavía no tienes tienda?{" "}
              <Link href="/prototipo/v1-talonario" style={{ color: "var(--tinta)", fontWeight: 600 }}>
                Crea la tuya gratis
              </Link>
            </p>
          </div>
        </div>
      </main>
    </ProtoShell>
  );
}
