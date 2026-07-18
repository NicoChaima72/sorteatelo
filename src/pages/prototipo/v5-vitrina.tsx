import { Fraunces } from "next/font/google";
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

import estilos from "./v5.module.css";

/**
 * PROTOTIPO — landing VARIANTE 5: "La Vitrina". La tienda de barrio cálida y
 * ordenada: crema, arcos de vitrina en color plano, serif Fraunces con acento
 * oliva + mantequilla. La más suave y "de confianza" de las cinco — pariente
 * bien ejecutado de la referencia Elera que gustó al inicio.
 */

const display = Fraunces({ subsets: ["latin"], weight: ["600"] });
const texto = fuentes.texto; // Instrument Sans

function TituloSeccion({ children }: { children: string }) {
  return (
    <h2
      className={display.className}
      style={{
        fontSize: "clamp(28px, 3.4vw, 40px)",
        fontWeight: 600,
        lineHeight: 1.12,
        letterSpacing: "-0.01em",
        margin: "12px 0 0",
        maxWidth: "22em",
        textWrap: "balance",
      }}
    >
      {children}
    </h2>
  );
}

export default function PrototipoLandingV5() {
  return (
    <>
      <Head>
        <title>V5 La Vitrina · Prototipo Sortéatelo</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div
        className={`${estilos.root} ${texto.className}`}
        style={{ "--fuente-display": display.style.fontFamily } as CSSProperties}
      >
        {/* header */}
        <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 lg:px-8">
          <span className={display.className} style={{ fontSize: 24, fontWeight: 600 }}>
            Sortéatelo
          </span>
          <Link href="#" className={estilos.btn} style={{ padding: "9px 20px", fontSize: 15 }}>
            {HERO.cta}
          </Link>
        </header>

        {/* hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 lg:grid-cols-[6fr_5fr] lg:gap-16 lg:px-8 lg:py-20">
          <div>
            <p className={estilos.etiqueta}>{HERO.eyebrow}</p>
            <h1
              className={display.className}
              style={{
                fontSize: "clamp(38px, 5vw, 58px)",
                fontWeight: 600,
                lineHeight: 1.08,
                letterSpacing: "-0.015em",
                margin: "16px 0 18px",
                textWrap: "balance",
              }}
            >
              Vende lo que hiciste.{" "}
              <em style={{ color: "var(--oliva)" }}>Sortea</em> entre quienes te
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
            <p
              className={estilos.etiqueta}
              style={{ marginTop: 18, color: "var(--tinta-suave)", letterSpacing: "0.1em" }}
            >
              {HERO.nota}
            </p>
          </div>

          {/* la vitrina: tres arcos */}
          <div className="grid grid-cols-3 items-end gap-3">
            <div className={estilos.arcoArcilla} style={{ minHeight: 210 }}>
              <span className={estilos.arcoDato}>PDF</span>
              <span className={estilos.arcoNota}>Tu creación</span>
            </div>
            <div className={estilos.arcoOliva} style={{ minHeight: 270 }}>
              <span className={estilos.arcoDato}>$3.990</span>
              <span className={estilos.arcoNota}>Directo a tu Flow</span>
            </div>
            <div className={estilos.arcoMantequilla} style={{ minHeight: 232 }}>
              <span className={estilos.arcoDato}>Nº 312</span>
              <span className={estilos.arcoNota}>Tu número del sorteo</span>
            </div>
          </div>
        </section>

        {/* cómo funciona */}
        <section style={{ background: "var(--blanco)", borderTop: "1.5px solid var(--linea)", borderBottom: "1.5px solid var(--linea)" }}>
          <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
            <p className={estilos.etiqueta}>Cómo funciona</p>
            <TituloSeccion>De cero a tu primer sorteo, sin planillas ni cuadernos</TituloSeccion>
            <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PASOS.map((paso, i) => (
                <div key={paso.numero}>
                  <span className={estilos.pasoNumero}>{i + 1}</span>
                  <h3 style={{ fontSize: 17, fontWeight: 600, margin: "14px 0 6px" }}>{paso.titulo}</h3>
                  <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--tinta-suave)", margin: 0 }}>
                    {paso.texto}
                  </p>
                </div>
              ))}
            </div>
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
              <div key={item.titulo} className={estilos.tarjeta}>
                <span
                  className={display.className}
                  style={{ fontSize: 30, lineHeight: 1, color: "var(--oliva)" }}
                >
                  “
                </span>
                <h3 style={{ fontSize: 17.5, fontWeight: 600, margin: "6px 0 8px", lineHeight: 1.3 }}>
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
        <section className="mx-auto max-w-4xl px-4 py-16 lg:px-8">
          <div className={estilos.ctaFinal}>
            <h2
              className={display.className}
              style={{ fontSize: "clamp(27px, 3.4vw, 40px)", fontWeight: 600, lineHeight: 1.1, margin: 0, textWrap: "balance" }}
            >
              {CTA_FINAL.titulo}
            </h2>
            <p style={{ fontSize: 16.5, margin: "14px auto 26px", maxWidth: "30em", lineHeight: 1.55, opacity: 0.9 }}>
              {CTA_FINAL.bajada}
            </p>
            <Link href="#" className={estilos.btn} style={{ background: "var(--mantequilla)", color: "var(--tinta)" }}>
              {CTA_FINAL.cta}
            </Link>
          </div>
        </section>

        {/* footer */}
        <footer style={{ borderTop: "1.5px solid var(--linea)" }}>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 lg:px-8">
            <span className={display.className} style={{ fontSize: 17, fontWeight: 600 }}>
              Sortéatelo
            </span>
            <p style={{ margin: 0, fontSize: 13, color: "var(--tinta-suave)" }}>{FOOTER}</p>
          </div>
        </footer>
      </div>
    </>
  );
}
