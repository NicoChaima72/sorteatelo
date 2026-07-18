import Head from "next/head";
import Link from "next/link";

/**
 * PROTOTIPO — índice de las 5 variantes de landing (sesión frontend-design
 * 2026-07-17). Página utilitaria neutra: solo navega; la dirección de arte
 * vive en cada variante.
 */

const VARIANTES = [
  {
    href: "/prototipo/v1-talonario",
    nombre: "V1 · El Talonario",
    concepto:
      "Impreso popular: papel manila, tinta, amarillo lotería, bordes duros, perforaciones y el talonario vivo en el hero.",
    swatches: ["#F6EFE3", "#2A231B", "#FFC530", "#1D7A70"],
  },
  {
    href: "/prototipo/v2-noche",
    nombre: "V2 · La Noche del Live",
    concepto:
      "El momento del sorteo a medianoche: café negro cálido, ámbar de foco de estudio, bolitas de tómbola y titular de afiche condensado.",
    swatches: ["#201812", "#F5ECDF", "#FFB53C", "#52C7B8"],
  },
  {
    href: "/prototipo/v3-cartel",
    nombre: "V3 · El Cartel de Feria",
    concepto:
      "Afiche popular chileno: titular en bloques planos de tinta/cobalto/amarillo, bordes gruesos, etiqueta de precio colgante y tira de boletos.",
    swatches: ["#FCF8EF", "#191714", "#2B3FBF", "#FFC530"],
  },
  {
    href: "/prototipo/v4-cuaderno",
    nombre: "V4 · El Cuaderno",
    concepto:
      "La historia del organizador: papel cuadriculado, UI limpia y anotaciones a lápiz azul encima («antes anotaba en un cuaderno…»).",
    swatches: ["#FDFCF6", "#26221C", "#2F4BA0", "#FFE24A"],
  },
  {
    href: "/prototipo/v5-vitrina",
    nombre: "V5 · La Vitrina",
    concepto:
      "Tienda de barrio cálida: crema, arcos de vitrina en color plano, serif Fraunces, oliva + mantequilla. La más suave de las cinco.",
    swatches: ["#F6F0E6", "#2E2921", "#5A7A4E", "#F2C94C"],
  },
];

const SISTEMA = [
  { href: "/prototipo/login", nombre: "Login (sistema V1)" },
  { href: "/prototipo/panel", nombre: "Panel del organizador (sistema V1)" },
];

export default function PrototipoIndice() {
  return (
    <>
      <Head>
        <title>Prototipos · Sortéatelo</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="mx-auto max-w-3xl px-6 py-14 font-sans">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Prototipos de identidad · sesión frontend-design
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          5 variantes de landing
        </h1>
        <p className="mt-3 max-w-xl text-neutral-600">
          Mismo copy en todas — la comparación es solo de dirección de arte.
          Ninguna toca el theme de plataforma.
        </p>

        <ul className="mt-10 grid gap-3">
          {VARIANTES.map((variante) => (
            <li key={variante.href}>
              <Link
                href={variante.href}
                className="flex items-center justify-between gap-6 rounded-xl border border-neutral-300 bg-white p-5 no-underline hover:border-neutral-500"
              >
                <span>
                  <span className="block text-lg font-semibold text-neutral-900">
                    {variante.nombre}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-neutral-600">
                    {variante.concepto}
                  </span>
                </span>
                <span className="flex flex-none gap-1.5">
                  {variante.swatches.map((color) => (
                    <span
                      key={color}
                      className="size-5 rounded-full border border-neutral-300"
                      style={{ background: color }}
                    />
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Otras pantallas
        </p>
        <ul className="mt-3 flex flex-wrap gap-3">
          {SISTEMA.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 no-underline hover:border-neutral-500"
              >
                {item.nombre}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
