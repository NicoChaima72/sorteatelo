#!/usr/bin/env node
/**
 * embed-fonts.mjs <in> <out> — embebe las 4 familias de marca en base64 en un index.html.
 *
 * Contrato: lee un index.html "PELADO" (@font-face con
 *   src: url("assets/fonts/<Familia>.woff2")   ← token root-relative, lint-safe; NO existe en disco
 * y escribe <out> con esos url() reemplazados por `data:font/woff2;base64,…` — SIN tocar <in>.
 * Los bytes salen de la fuente ÚNICA `_brand/fonts/` (que puebla `fetch-fonts.mjs`). El match del
 * url() es por NOMBRE de archivo, así que funciona con cualquier path relativo declarado.
 *
 * Reason (gotcha 12): el motor de captura de HyperFrames serializa el DOM y NO resuelve @font-face
 * con url() a woff2 externo → el texto cae EN SILENCIO a una fuente del sistema (se ve distinto de
 * la app, que usa Fraunces/Bricolage/Instrument/Plex Mono). El base64 carga desde memoria, sin
 * fetch/serving. Por eso el `index.html` versionado queda pelado (chico, sin base64 repetido en
 * git) y el embebido se hace en render-time sobre una copia efímera (`index.embed.html`,
 * gitignored) — lo orquesta render.mjs.
 *
 * La lista de faces sale de `_brand/tokens.local.json → fuentes` (misma fuente que fetch-fonts.mjs
 * y que build-tokens.mjs), así no hay una tercera copia del inventario tipográfico.
 *
 * FALLA RUIDOSO si un face declarado en tokens.local.json no aparece en el HTML: eso significa que
 * el `<style>` del video quedó desincronizado de la marca y el texto caería a fuente de sistema.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));               // videos/hyperframes
const BRAND_FONTS = join(HERE, "_brand", "fonts");

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath || !outPath) {
  console.error("uso: embed-fonts.mjs <in.html> <out.html>");
  process.exit(1);
}

const local = JSON.parse(readFileSync(join(HERE, "_brand", "tokens.local.json"), "utf8"));
const faces = Object.entries(local.fuentes)
  .filter(([rol]) => !rol.startsWith("_"))
  .flatMap(([, f]) => f.faces.map((face) => face.archivo));

let html = readFileSync(inPath, "utf8");

let embebidos = 0;
let yaInline = 0;
const faltantes = [];

for (const archivo of faces) {
  // Matchea el url() del pelado por NOMBRE de archivo (robusto al path relativo):
  //   url("<cualquier-path>/<Familia>.woff2")  ->  url("data:…")
  const re = new RegExp(`url\\("[^"]*${archivo.replace(/\./g, "\\.")}"\\)`);
  if (!re.test(html)) {
    // ¿Ya está inline (idempotente) o directamente falta la declaración?
    if (html.includes("data:font/woff2;base64,")) yaInline++;
    else faltantes.push(archivo);
    continue;
  }
  const woff2 = resolve(BRAND_FONTS, archivo);
  if (!existsSync(woff2)) {
    console.error(`✗ Falta ${archivo} en _brand/fonts/. Corré: node videos/hyperframes/fetch-fonts.mjs`);
    process.exit(1);
  }
  const b64 = readFileSync(woff2).toString("base64");
  html = html.replace(re, `url("data:font/woff2;base64,${b64}")`);
  embebidos++;
}

if (faltantes.length) {
  console.error(`✗ El HTML no declara @font-face para: ${faltantes.join(", ")}`);
  console.error("  El texto caería a fuente del sistema (gotcha 12). Sincronizá el <style> del video");
  console.error("  con _brand/tokens.local.json → fuentes (ver _template-tour/index.html).");
  process.exit(1);
}

writeFileSync(outPath, html);
console.log(`embed-fonts: ${embebidos} face(s) embebido(s)${yaInline ? `, ${yaInline} ya inline` : ""} → ${outPath}`);
