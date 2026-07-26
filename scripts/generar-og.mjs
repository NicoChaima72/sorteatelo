/**
 * Rasteriza `public/og.svg` → `public/og.png` (1200×630, la tarjeta social del apex).
 *
 *     npm run og:png
 *
 * Existe porque `og:image` **tiene que ser un PNG**: la mayoría de los crawlers sociales no
 * rasteriza SVG. El SVG sigue siendo la fuente editable; este script es el único camino para
 * regenerar el PNG, y hay que correrlo **cada vez que se edite `og.svg`** (no hay gate automático
 * que los mantenga en sync — ver `docs/design.md` § Decisiones pendientes → OG raster).
 *
 * Por qué Chrome headless y no una librería: el repo NO tiene `sharp`/`resvg` y sumar una
 * dependencia solo para esto no se justifica. Además Chrome es lo único que rasteriza el SVG con
 * las **fuentes de marca reales** — se embeben las woff2 en base64 como `@font-face` (las mismas
 * que usa la fábrica de videos). Sin ese paso el PNG sale en la serif por defecto del sistema, que
 * fue exactamente el estado en que nadie había visto nunca este asset renderizado de verdad.
 */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const TRABAJO = join(tmpdir(), "sorteatelo-og");

const ANCHO = 1200;
const ALTO = 630;

/** Candidatos de Chrome, en orden. `CHROME_PATH` (env) gana sobre todos. */
const CHROMES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

/**
 * Fuentes de marca (`docs/design.md` §3). Los binarios woff2 viven fuera de git en
 * `videos/hyperframes/_brand/fonts/`; si faltan, se bajan con
 * `node videos/hyperframes/fetch-fonts.mjs`.
 */
const FUENTES = [
  {
    familia: "Bricolage Grotesque",
    archivo: "BricolageGrotesque-Variable.woff2",
    pesos: "200 800",
  },
  {
    familia: "Instrument Sans",
    archivo: "InstrumentSans-Variable.woff2",
    pesos: "400 700",
  },
  { familia: "IBM Plex Mono", archivo: "IBMPlexMono-SemiBold.woff2", pesos: "600" },
];

const chrome = CHROMES.find((ruta) => existsSync(ruta));
if (!chrome) {
  throw new Error(
    `No encontré Chrome. Probé: ${CHROMES.join(", ")}. Setea CHROME_PATH con la ruta al binario.`,
  );
}

const caras = FUENTES.map(({ familia, archivo, pesos }) => {
  const ruta = join(RAIZ, "videos/hyperframes/_brand/fonts", archivo);
  if (!existsSync(ruta)) {
    throw new Error(
      `Falta la fuente ${archivo}. Bájala con: node videos/hyperframes/fetch-fonts.mjs`,
    );
  }
  const b64 = readFileSync(ruta).toString("base64");
  return (
    `@font-face{font-family:"${familia}";` +
    `src:url(data:font/woff2;base64,${b64}) format("woff2");` +
    `font-weight:${pesos};font-style:normal;font-display:block;}`
  );
}).join("\n");

const svg = readFileSync(join(RAIZ, "public/og.svg"), "utf8");

mkdirSync(TRABAJO, { recursive: true });
const html = join(TRABAJO, "og.html");
const png = join(TRABAJO, "og.png");

writeFileSync(
  html,
  `<!doctype html><html><head><meta charset="utf-8"><style>
${caras}
html,body{margin:0;padding:0;width:${ANCHO}px;height:${ALTO}px;overflow:hidden;}
svg{display:block;}
</style></head><body>${svg}</body></html>`,
  "utf8",
);

execFileSync(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${ANCHO},${ALTO}`,
    `--screenshot=${png}`,
    `file:///${html.replace(/\\/g, "/")}`,
  ],
  { stdio: "inherit", timeout: 120_000 },
);

if (!existsSync(png)) throw new Error("Chrome no generó el PNG");

// Verificación de dimensiones leyendo la cabecera IHDR (ancho en los bytes 16-19, alto en 20-23).
const bytes = readFileSync(png);
const ancho = bytes.readUInt32BE(16);
const alto = bytes.readUInt32BE(20);
if (ancho !== ANCHO || alto !== ALTO) {
  throw new Error(`Dimensiones inesperadas: ${ancho}×${alto} (esperado ${ANCHO}×${ALTO})`);
}

copyFileSync(png, join(RAIZ, "public/og.png"));
console.log(
  `public/og.png regenerado — ${ancho}×${alto}, ${(bytes.length / 1024).toFixed(1)} KB.\n` +
    `Míralo antes de commitear: el gate de este asset son tus ojos, no un test.`,
);
