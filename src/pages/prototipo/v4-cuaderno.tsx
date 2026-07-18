import { Caveat } from "next/font/google";
import Head from "next/head";
import Link from "next/link";
import { type CSSProperties } from "react";

import {
  CONFIANZA,
  CONFIANZA_INTRO,
  CTA_FINAL,
  FOOTER,
  HERO,
  PASOS,
} from "~/components/prototipo/copy";
import { IconoGoogle, fuentes } from "~/components/prototipo/proto";

import estilos from "./v4.module.css";

/**
 * PROTOTIPO — landing VARIANTE 4: "El Cuaderno". La historia del organizador:
 * antes anotaba números en un cuaderno; ahora la tienda los ordena sola. Papel
 * cuadriculado, UI limpia (Instrument Sans) y anotaciones a lápiz azul (Caveat)
 * encima. La más narrativa y "hecha a mano" de las cinco.
 */

const mano = Caveat({ subsets: ["latin"], weight: ["600"] });
const texto = fuentes.texto; // Instrument Sans (compartida con v1)

function TituloSeccion({ children }: { children: string }) {
  return (
    <h2
      style={{
        fontSize: "clamp(27px, 3.3vw, 38px)",
        fontWeight: 700,
        lineHeight: 1.15,
        letterSpacing: "-0.015em",
        margin: "12px 0 0",
        maxWidth: "22em",
        textWrap: "balance",
      }}
    >
      {children}
    </h2>
  );
}

const VENTAS_MINI = [
  { quien: "ma***@gmail.com", numero: "Nº 312" },
  { quien: "jo***@hotmail.com", numero: "Nº 310–311" },
  { quien: "fr***@gmail.com", numero: "Nº 309" },
];

export default function PrototipoLandingV4() {
  return (
    <>
      <Head>
        <title>V4 El Cuaderno · Prototipo Sortéatelo</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div
        className={`${estilos.root} ${texto.className}`}
        style={
          {
            "--fuente-mano": mano.style.fontFamily,
            "--fuente-mono": fuentes.mono.style.fontFamily,
          } as CSSProperties
        }
      >
        {/* header */}
        <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 lg:px-8">
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Sortéatelo
            <span className={`${estilos.mano} ${mano.className}`} style={{ fontSize: 19, marginLeft: 8 }}>
              ← tu tienda con sorteo
            </span>
          </span>
          <Link href="#" className={estilos.btn} style={{ padding: "9px 18px", fontSize: 15 }}>
            {HERO.cta}
          </Link>
        </header>

        {/* hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-14 lg:grid-cols-[7fr_5fr] lg:gap-16 lg:px-8 lg:py-20">
          <div>
            <p className={estilos.etiqueta}>{HERO.eyebrow}</p>
            <h1
              style={{
                fontSize: "clamp(36px, 4.8vw, 54px)",
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: "-0.025em",
                margin: "16px 0 18px",
                textWrap: "balance",
              }}
            >
              <span className={estilos.tachado} style={{ opacity: 0.45 }}>
                Anota en el cuaderno.
              </span>{" "}
              Vende lo que hiciste y{" "}
              <span className={estilos.resaltado}>sortea</span> entre quienes te
              compraron.
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.6, color: "var(--tinta-suave)", maxWidth: "30em", margin: 0 }}>
              {HERO.bajada}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="#" className={estilos.btn}>
                {HERO.cta}
              </Link>
              <Link href="#" className={estilos.btnSecundario}>
                <IconoGoogle />
                {HERO.ctaGoogle}
              </Link>
            </div>
            <p className={estilos.etiqueta} style={{ marginTop: 18 }}>
              {HERO.nota}
            </p>
          </div>

          {/* la tienda ordenada, anotada a mano */}
          <div style={{ position: "relative", paddingTop: 12 }}>
            <div className={estilos.tarjeta} style={{ paddingBottom: 6 }}>
              <span className={estilos.cinta} aria-hidden="true" />
              <div style={{ padding: "18px 16px 10px" }}>
                <p className={estilos.etiqueta} style={{ margin: 0 }}>
                  Ventas de hoy · Tienda de Luna
                </p>
              </div>
              {VENTAS_MINI.map((venta) => (
                <div key={venta.numero} className={estilos.filaVenta}>
                  <span style={{ color: "var(--tinta-suave)" }}>{venta.quien}</span>
                  <span className="flex items-center gap-2">
                    <span className={estilos.numeroChip}>{venta.numero}</span>
                    <span className={estilos.pagadoChip}>Pagado</span>
                  </span>
                </div>
              ))}
            </div>
            <p
              className={`${estilos.anotacion} ${mano.className}`}
              style={{ position: "absolute", right: -6, bottom: -46, margin: 0, maxWidth: 220 }}
            >
              ¡cada número queda al tiro,
              <br />
              sin cuaderno! ↑
            </p>
          </div>
        </section>

        {/* cómo funciona */}
        <section className="mx-auto max-w-6xl px-4 py-16 lg:px-8" style={{ marginTop: 24 }}>
          <p className={estilos.etiqueta}>Cómo funciona</p>
          <TituloSeccion>De cero a tu primer sorteo, sin planillas ni cuadernos</TituloSeccion>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PASOS.map((paso, i) => (
              <div key={paso.numero} className={estilos.tarjeta} style={{ padding: "22px 20px" }}>
                <span
                  className={`${estilos.mano} ${mano.className}`}
                  style={{ fontSize: 30, lineHeight: 1 }}
                >
                  {i + 1}.
                </span>
                <h3 style={{ fontSize: 17, fontWeight: 600, margin: "12px 0 6px" }}>{paso.titulo}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--tinta-suave)", margin: 0 }}>
                  {paso.texto}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* confianza */}
        <section className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
          <p className={estilos.etiqueta}>{CONFIANZA_INTRO.eyebrow}</p>
          <TituloSeccion>{CONFIANZA_INTRO.titulo}</TituloSeccion>
          <p style={{ fontSize: 16.5, color: "var(--tinta-suave)", maxWidth: "40em", margin: "14px 0 0", lineHeight: 1.6 }}>
            {CONFIANZA_INTRO.bajada}
          </p>
          <div className="mt-9 grid gap-4 lg:grid-cols-3">
            {CONFIANZA.map((item) => (
              <div key={item.titulo} className={estilos.tarjeta} style={{ padding: "24px 22px" }}>
                <span className={`${estilos.mano} ${mano.className}`} style={{ fontSize: 21 }}>
                  prometido ✓
                </span>
                <h3 style={{ fontSize: 17.5, fontWeight: 600, margin: "10px 0 8px", lineHeight: 1.3 }}>
                  {item.titulo}
                </h3>
                <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--tinta-suave)", margin: 0 }}>
                  {item.texto}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA final */}
        <section className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
          <div
            className={estilos.tarjeta}
            style={{ padding: "44px 40px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 28 }}
          >
            <span className={estilos.cinta} aria-hidden="true" />
            <div style={{ maxWidth: "26em" }}>
              <h2 style={{ fontSize: "clamp(25px, 3vw, 34px)", fontWeight: 700, lineHeight: 1.15, margin: 0, textWrap: "balance" }}>
                {CTA_FINAL.titulo}
              </h2>
              <p style={{ fontSize: 16, color: "var(--tinta-suave)", margin: "12px 0 0", lineHeight: 1.55 }}>
                {CTA_FINAL.bajada}
              </p>
            </div>
            <Link href="#" className={estilos.btn}>
              {CTA_FINAL.cta}
            </Link>
          </div>
        </section>

        {/* footer */}
        <footer style={{ borderTop: "1.5px solid var(--linea)", background: "var(--tarjeta)" }}>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 lg:px-8">
            <span style={{ fontSize: 16, fontWeight: 700 }}>Sortéatelo</span>
            <p className={estilos.etiqueta} style={{ margin: 0, textTransform: "none", letterSpacing: "0.03em" }}>
              {FOOTER}
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
