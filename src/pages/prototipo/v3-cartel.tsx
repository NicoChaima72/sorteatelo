import { Archivo, Archivo_Black } from "next/font/google";
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

import estilos from "./v3.module.css";

/**
 * PROTOTIPO — landing VARIANTE 3: "El Cartel de Feria". Afiche popular chileno:
 * titular en bloques de color plano (tinta/cobalto/amarillo), bordes gruesos,
 * etiqueta de precio colgante, tira de boletos como separador. Display
 * Archivo Black, body Archivo.
 */

const display = Archivo_Black({ subsets: ["latin"], weight: "400" });
const texto = Archivo({ subsets: ["latin"] });

function TituloSeccion({ children }: { children: string }) {
  return (
    <h2
      className={display.className}
      style={{
        fontSize: "clamp(28px, 3.6vw, 42px)",
        textTransform: "uppercase",
        lineHeight: 1.05,
        letterSpacing: "-0.01em",
        margin: "12px 0 0",
        maxWidth: "20em",
        textWrap: "balance",
      }}
    >
      {children}
    </h2>
  );
}

const TIRA = Array.from({ length: 14 }, (_, i) => `Nº ${300 + i}`);

export default function PrototipoLandingV3() {
  return (
    <>
      <Head>
        <title>V3 El Cartel de Feria · Prototipo Sortéatelo</title>
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
        <header style={{ borderBottom: "3px solid var(--tinta)" }}>
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 lg:px-8">
            <span
              className={display.className}
              style={{ fontSize: 21, textTransform: "uppercase", letterSpacing: "-0.01em" }}
            >
              Sortéa<span style={{ color: "var(--cobalto)" }}>telo</span>
            </span>
            <Link href="#" className={estilos.btn} style={{ padding: "8px 16px", fontSize: 14 }}>
              {HERO.cta}
            </Link>
          </div>
        </header>

        {/* hero: el cartel */}
        <section className="mx-auto max-w-6xl px-4 py-14 lg:px-8 lg:py-20">
          <p className={estilos.etiqueta} style={{ color: "var(--cobalto)" }}>
            {HERO.eyebrow}
          </p>
          <h1
            className={display.className}
            style={{
              fontSize: "clamp(40px, 7vw, 84px)",
              textTransform: "uppercase",
              lineHeight: 1.04,
              letterSpacing: "-0.015em",
              margin: "18px 0 0",
              maxWidth: "13em",
            }}
          >
            <span className={estilos.bloqueTinta}>Vende</span>{" "}
            <span style={{ whiteSpace: "nowrap" }}>lo que hiciste.</span>
            <br />
            <span className={estilos.bloqueAmarillo}>Sortea</span>{" "}
            <span className={estilos.bloqueCobalto}>entre quienes</span>{" "}
            te compraron.
          </h1>
          <div className="mt-8 flex flex-wrap items-end gap-8">
            <p style={{ fontSize: 18, lineHeight: 1.6, maxWidth: "30em", margin: 0 }}>
              {HERO.bajada}
            </p>
            <span className={estilos.precio}>PDF · $3.990 · Nº 312 INCLUIDO</span>
          </div>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="#" className={estilos.btn}>
              {HERO.cta}
            </Link>
            <Link href="#" className={estilos.btnSecundario}>
              <IconoGoogle />
              {HERO.ctaGoogle}
            </Link>
          </div>
          <p className={estilos.etiqueta} style={{ marginTop: 18, color: "var(--tinta)", opacity: 0.55 }}>
            {HERO.nota}
          </p>
        </section>

        {/* tira de boletos decorativa */}
        <div className={estilos.tiraBoletos} aria-hidden="true">
          {TIRA.map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>

        {/* cómo funciona */}
        <section className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
          <p className={estilos.etiqueta} style={{ color: "var(--cobalto)" }}>
            Cómo funciona
          </p>
          <TituloSeccion>De cero a tu primer sorteo, sin planillas ni cuadernos</TituloSeccion>
          <div className="mt-9 grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
            {PASOS.map((paso, i) => (
              <div
                key={paso.numero}
                className={estilos.marco}
                style={{ padding: "22px 20px", marginLeft: i === 0 ? 0 : -3, marginTop: -3 }}
              >
                <span className={estilos.numeroPasoCaja}>{i + 1}</span>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: "14px 0 6px", textTransform: "uppercase" }}>
                  {paso.titulo}
                </h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: 0, opacity: 0.75 }}>
                  {paso.texto}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* confianza */}
        <section className={estilos.franja} style={{ background: "var(--cobalto)", color: "var(--hueso)" }}>
          <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
            <p className={estilos.etiqueta} style={{ color: "var(--amarillo)" }}>
              {CONFIANZA_INTRO.eyebrow}
            </p>
            <TituloSeccion>{CONFIANZA_INTRO.titulo}</TituloSeccion>
            <p style={{ fontSize: 16.5, maxWidth: "40em", margin: "14px 0 0", lineHeight: 1.6, opacity: 0.85 }}>
              {CONFIANZA_INTRO.bajada}
            </p>
            <div className="mt-9 grid gap-4 lg:grid-cols-3">
              {CONFIANZA.map((item, i) => (
                <div
                  key={item.titulo}
                  style={{ border: "3px solid var(--hueso)", padding: "24px 22px" }}
                >
                  <span className={estilos.etiqueta} style={{ color: "var(--amarillo)" }}>
                    Garantía {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 style={{ fontSize: 18, fontWeight: 700, margin: "12px 0 8px", lineHeight: 1.3 }}>
                    {item.titulo}
                  </h3>
                  <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0, opacity: 0.85 }}>
                    {item.texto}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className={estilos.franja}>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-8 px-4 py-16 lg:px-8">
            <div style={{ maxWidth: "24em" }}>
              <h2
                className={display.className}
                style={{
                  fontSize: "clamp(26px, 3.2vw, 38px)",
                  textTransform: "uppercase",
                  lineHeight: 1.05,
                  margin: 0,
                  textWrap: "balance",
                }}
              >
                {CTA_FINAL.titulo}
              </h2>
              <p style={{ fontSize: 16, margin: "12px 0 0", lineHeight: 1.55, opacity: 0.75 }}>
                {CTA_FINAL.bajada}
              </p>
            </div>
            <Link href="#" className={estilos.btn} style={{ background: "var(--amarillo)", color: "var(--tinta)" }}>
              {CTA_FINAL.cta}
            </Link>
          </div>
        </section>

        {/* footer */}
        <footer className={estilos.franja} style={{ background: "var(--tinta)", color: "var(--hueso)" }}>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 lg:px-8">
            <span className={display.className} style={{ fontSize: 15, textTransform: "uppercase" }}>
              Sortéatelo
            </span>
            <p className={estilos.etiqueta} style={{ margin: 0, textTransform: "none", letterSpacing: "0.03em", opacity: 0.7 }}>
              {FOOTER}
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
