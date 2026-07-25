#!/usr/bin/env node
/**
 * fetch-fonts.mjs — baja las 4 familias de marca (Google Fonts, licencia OFL) a `_brand/fonts/`.
 *
 *   node videos/hyperframes/fetch-fonts.mjs [--force]
 *
 * POR QUÉ EXISTE: el repo NO commitea binarios (I8/D9). Las woff2 son la fuente ÚNICA que
 * `embed-fonts.mjs` convierte a base64 en render-time (gotcha 12) y viven en `_brand/fonts/`,
 * que está gitignoreado. Este script las materializa de forma reproducible: `render.mjs` lo
 * llama solo si falta alguna, así el pipeline sigue siendo un comando.
 *
 * Qué baja: el subconjunto **latin** de cada familia declarada en `_brand/tokens.local.json →
 * fuentes` (alcanza para el español: á é í ó ú ñ ¿ ¡ están en U+0000-00FF). Las tres familias
 * variables (Fraunces, Bricolage, Instrument Sans) van en UN archivo cada una — un solo blob
 * base64 cubre todos los pesos.
 *
 * Idempotente: no re-baja lo que ya está (salvo `--force`). Requiere red la primera vez.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BRAND = join(HERE, "_brand");
const FONTS = join(BRAND, "fonts");

// La API css2 devuelve woff2 modernos SOLO con un UA de navegador; con el UA de node devuelve TTF.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const force = process.argv.includes("--force");
const local = JSON.parse(readFileSync(join(BRAND, "tokens.local.json"), "utf8"));

/**
 * Extrae del CSS de Google el `src: url(...)` del bloque marcado `/* latin *​/`, indexado por el
 * `font-weight` declarado. Devuelve `Map<peso, url>`; el peso es el string tal cual ("400" o
 * "400 900" en las variables).
 */
function urlsLatin(css) {
  const out = new Map();
  // Los bloques vienen precedidos por un comentario con el nombre del subset.
  const bloques = css.split("/*").slice(1);
  for (const b of bloques) {
    const subset = b.slice(0, b.indexOf("*/")).trim();
    if (subset !== "latin") continue;
    const peso = b.match(/font-weight:\s*([^;]+);/)?.[1]?.trim();
    const url = b.match(/src:\s*url\(([^)]+)\)/)?.[1]?.trim();
    if (peso && url) out.set(peso, url);
  }
  return out;
}

const traer = async (url, extra = {}) => {
  const r = await fetch(url, { headers: { "User-Agent": UA, ...extra } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url}`);
  return r;
};

mkdirSync(FONTS, { recursive: true });

let bajados = 0;
let saltados = 0;

for (const [rol, f] of Object.entries(local.fuentes)) {
  if (rol.startsWith("_")) continue;

  const faltantes = f.faces.filter((face) => force || !existsSync(join(FONTS, face.archivo)));
  if (faltantes.length === 0) {
    saltados += f.faces.length;
    continue;
  }

  const css = await (
    await traer(`https://fonts.googleapis.com/css2?family=${f.google}&display=block`)
  ).text();
  const urls = urlsLatin(css);

  for (const face of faltantes) {
    const url = urls.get(face.peso);
    if (!url) {
      console.error(
        `✗ ${f.familia}: Google no devolvió un face latin con font-weight "${face.peso}".\n` +
          `  Pesos disponibles: ${[...urls.keys()].join(" | ")}\n` +
          `  Ajustá _brand/tokens.local.json → fuentes.${rol}.faces[].peso`,
      );
      process.exit(1);
    }
    const bytes = Buffer.from(await (await traer(url)).arrayBuffer());
    writeFileSync(join(FONTS, face.archivo), bytes);
    console.log(`  ↓ ${face.archivo.padEnd(34)} ${(bytes.length / 1024).toFixed(0)} KB  (${f.familia} ${face.peso})`);
    bajados++;
  }
}

console.log(
  bajados
    ? `✓ _brand/fonts/ — ${bajados} face(s) nuevos${saltados ? `, ${saltados} ya estaban` : ""}`
    : `✓ _brand/fonts/ ya completo (${saltados} faces)`,
);
