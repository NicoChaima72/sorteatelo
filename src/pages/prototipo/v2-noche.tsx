import { Anton, Archivo } from "next/font/google";
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

import estilos from "./v2.module.css";

/**
 * PROTOTIPO — landing VARIANTE 2: "La Noche del Live". El momento exacto del
 * sorteo: transmisión a medianoche, bombo con bolitas, ámbar de foco de
 * estudio sobre café negro. Display Anton (afiche condensado), body Archivo.
 */

const display = Anton({ subsets: ["latin"], weight: "400" });
const texto = Archivo({ subsets: ["latin"] });

const BOLAS: { numero: string; estado: "crema" | "apagada" | "ganadora" }[] = [
  { numero: "047", estado: "crema" },
  { numero: "112", estado: "apagada" },
  { numero: "089", estado: "crema" },
  { numero: "203", estado: "crema" },
  { numero: "156", estado: "apagada" },
  { numero: "312", estado: "ganadora" },
  { numero: "278", estado: "crema" },
  { numero: "091", estado: "apagada" },
];

const CLASE_BOLA = {
  crema: estilos.bola,
  apagada: estilos.bolaApagada,
  ganadora: estilos.bolaGanadora,
} as const;

function TituloSeccion({ children }: { children: string }) {
  return (
    <h2
      className={display.className}
      style={{
        fontSize: "clamp(30px, 3.8vw, 44px)",
        textTransform: "uppercase",
        letterSpacing: "0.01em",
        lineHeight: 1.05,
        margin: "12px 0 0",
        maxWidth: "20em",
        textWrap: "balance",
      }}
    >
      {children}
    </h2>
  );
}

export default function PrototipoLandingV2() {
  return (
    <>
      <Head>
        <title>V2 La Noche del Live · Prototipo Sortéatelo</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div
        className={`${estilos.root} ${texto.className}`}
        style={
          {
            "--fuente-display": display.style.fontFamily,
            "--fuente-mono": fuentes.mono.style.fontFamily,
          } as CSSProperties
        }
      >
        {/* header */}
        <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 lg:px-8">
          <span
            className={display.className}
            style={{ fontSize: 22, textTransform: "uppercase", letterSpacing: "0.03em" }}
          >
            Sortéatelo
          </span>
          <Link href="#" className={estilos.btn} style={{ padding: "9px 18px", fontSize: 15 }}>
            {HERO.cta}
          </Link>
        </header>

        {/* hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 lg:grid-cols-[7fr_5fr] lg:gap-16 lg:px-8 lg:py-20">
          <div>
            <span className={estilos.chipVivo}>En vivo · Chile</span>
            <h1
              className={display.className}
              style={{
                fontSize: "clamp(44px, 6.2vw, 76px)",
                textTransform: "uppercase",
                lineHeight: 0.98,
                letterSpacing: "0.005em",
                margin: "22px 0 20px",
                textWrap: "balance",
              }}
            >
              Vende lo que hiciste.{" "}
              <span style={{ color: "var(--ambar)" }}>Sortea</span> entre
              quienes te compraron.
            </h1>
            <p
              style={{
                fontSize: 18,
                lineHeight: 1.6,
                color: "var(--texto-suave)",
                maxWidth: "32em",
                margin: 0,
              }}
            >
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

          {/* el bombo */}
          <div className={estilos.bombo}>
            <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: 22 }}>
              <span className={estilos.etiqueta} style={{ color: "var(--texto-suave)" }}>
                Sorteo · Tienda de Luna
              </span>
              <span className={estilos.etiqueta} style={{ color: "var(--ambar)" }}>
                21:47
              </span>
            </div>
            <div className={estilos.bolas}>
              {BOLAS.map((bola) => (
                <span key={bola.numero} className={CLASE_BOLA[bola.estado]}>
                  {bola.numero}
                </span>
              ))}
            </div>
            <div className={estilos.marquesina}>
              <span
                className={display.className}
                style={{ fontSize: 22, textTransform: "uppercase", color: "var(--ambar)" }}
              >
                ¡Salió el Nº 312!
              </span>
              <span className={estilos.etiqueta}>312 vendidos</span>
            </div>
          </div>
        </section>

        {/* cómo funciona */}
        <section style={{ borderTop: "1.5px solid var(--linea-suave)" }}>
          <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
            <p className={estilos.etiqueta}>Cómo funciona</p>
            <TituloSeccion>De cero a tu primer sorteo, sin planillas ni cuadernos</TituloSeccion>
            <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PASOS.map((paso) => (
                <div key={paso.numero} className={estilos.carta}>
                  <span className={estilos.numeroPaso}>{paso.numero}</span>
                  <h3 style={{ fontSize: 17.5, fontWeight: 600, margin: "14px 0 6px" }}>
                    {paso.titulo}
                  </h3>
                  <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--texto-suave)", margin: 0 }}>
                    {paso.texto}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* confianza */}
        <section style={{ borderTop: "1.5px solid var(--linea-suave)" }}>
          <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
            <p className={estilos.etiqueta}>{CONFIANZA_INTRO.eyebrow}</p>
            <TituloSeccion>{CONFIANZA_INTRO.titulo}</TituloSeccion>
            <p style={{ fontSize: 16.5, color: "var(--texto-suave)", maxWidth: "40em", margin: "14px 0 0", lineHeight: 1.6 }}>
              {CONFIANZA_INTRO.bajada}
            </p>
            <div className="mt-9 grid gap-4 lg:grid-cols-3">
              {CONFIANZA.map((item, i) => (
                <div key={item.titulo} className={estilos.carta} style={{ borderColor: "var(--linea)" }}>
                  <span
                    className={fuentes.mono.className}
                    style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.14em", color: "var(--teal)" }}
                  >
                    GARANTÍA {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 style={{ fontSize: 18, fontWeight: 600, margin: "12px 0 8px", lineHeight: 1.3 }}>
                    {item.titulo}
                  </h3>
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--texto-suave)", margin: 0 }}>
                    {item.texto}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
          <div className={`${estilos.ctaFinal} flex flex-wrap items-center justify-between gap-8`}>
            <div style={{ maxWidth: "26em" }}>
              <h2
                className={display.className}
                style={{
                  fontSize: "clamp(28px, 3.4vw, 42px)",
                  textTransform: "uppercase",
                  lineHeight: 1.02,
                  margin: 0,
                  textWrap: "balance",
                }}
              >
                {CTA_FINAL.titulo}
              </h2>
              <p style={{ fontSize: 16, margin: "12px 0 0", lineHeight: 1.55 }}>{CTA_FINAL.bajada}</p>
            </div>
            <Link
              href="#"
              className={estilos.btn}
              style={{ background: "var(--fondo)", color: "var(--texto)" }}
            >
              {CTA_FINAL.cta}
            </Link>
          </div>
        </section>

        {/* footer */}
        <footer style={{ borderTop: "1.5px solid var(--linea-suave)" }}>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 lg:px-8">
            <span className={display.className} style={{ fontSize: 15, textTransform: "uppercase" }}>
              Sortéatelo
            </span>
            <p className={estilos.etiqueta} style={{ margin: 0, textTransform: "none", letterSpacing: "0.03em" }}>
              {FOOTER}
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
