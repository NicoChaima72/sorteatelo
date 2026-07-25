#!/usr/bin/env node
/**
 * check-classes.mjs — gate estático contra el bug #1 de la fábrica de videos.
 *
 *   node check-classes.mjs <folder>        # un video
 *   node check-classes.mjs --all           # todos los videos de videos.json
 *
 * QUÉ ATRAPA: una clase que el JS emite (`class="cfg-fila"`) pero que NO está definida
 * en ningún CSS (ni en el <style> del index.html, ni en tour-kit.css, ni en
 * brand.tokens.css). Por el gotcha 9 el motor descarta el styling inline del DOM que
 * inyecta app.js, así que una clase inexistente = elemento SIN estilo: se cae de su
 * fila, pierde el flex, se ve en fuente del sistema. Y es SILENCIOSO — el lint pasa,
 * el snapshot puede pasar, y sólo se ve mirando frames del MP4 final.
 *
 * Bugs reales que esto atrapó en el kit origen (en 1 segundo, en vez de 2 min de render
 * + inspección de frames):
 *   · chip "1h" desalineado          → .tp-chip-stack / .tp-chip-abs sin definir
 *   · avatares apilados en vertical  → .ava-stack sin definir
 *
 * Corre esto ANTES del render. Es la mitad barata del gate; la otra mitad (mirar
 * frames del MP4 real) sigue siendo obligatoria para lo que el estático no ve.
 *
 * Materializa los assets compartidos antes de leer (son efímeros/gitignored), así el
 * gate anda sobre un clon limpio sin haber renderizado todavía.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { materializar } from "./_lib/materializar.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// Clases que NO vienen de una hoja de estilos del proyecto (las pone el motor o son
// estructurales del HTML estático) — no se reportan como faltantes.
const IGNORE = new Set(["clip"]);

// Artefactos, no clases reales:
//  · prefijos de clase dinámica: `class="lb lb-${hue}"` deja el token "lb-"
//  · comodines de los comentarios de doc: "app-*"
const isArtifact = (c) => c.endsWith("-") || c.includes("*") || c.length < 2;

// Comentarios (JS y HTML): sus ejemplos de código no son uso real.
const stripComments = (s) => s
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

const definedIn = (css) => {
  const out = new Set();
  // Todo `.foo` en posición de selector (superset de lo definido — alcanza para "existe?")
  for (const m of css.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)) out.add(m[1]);
  return out;
};

/** Clases usadas en `class="..."` de HTML y de template literals de JS.
 *  Soporta interpolación: class="btn ${on ? "btn-on" : "btn-off"} ${sm ? " btn-sm" : ""}" */
const usedIn = (src) => {
  const out = new Set();
  const re = /class="((?:[^"$]|\$\{[^}]*\})*)"/g;
  for (const m of src.matchAll(re)) {
    const attr = m[1];
    // 1) tokens literales (fuera de las interpolaciones)
    for (const tok of attr.replace(/\$\{[^}]*\}/g, " ").split(/\s+/)) if (tok) out.add(tok);
    // 2) tokens dentro de los strings de cada interpolación
    for (const interp of attr.match(/\$\{[^}]*\}/g) ?? []) {
      for (const str of interp.match(/["'`]([^"'`]*)["'`]/g) ?? []) {
        for (const tok of str.slice(1, -1).split(/\s+/)) if (tok && /^[a-zA-Z_-]/.test(tok)) out.add(tok);
      }
    }
  }
  return out;
};

const checkFolder = (folder) => {
  const dir = join(HERE, folder);
  if (!existsSync(join(dir, "index.html"))) return { folder, error: "no existe" };

  materializar(dir);   // tour-kit.css / brand.tokens.css frescos (efímeros)

  let css = "", js = "";
  const html = readFileSync(join(dir, "index.html"), "utf8");
  css += html;                                            // <style> inline del video
  const assets = join(dir, "assets");
  if (existsSync(assets)) {
    for (const f of readdirSync(assets)) {
      if (f.endsWith(".css")) css += readFileSync(join(assets, f), "utf8");
      if (f.endsWith(".js") && f !== "gsap.min.js") js += readFileSync(join(assets, f), "utf8");
    }
  }
  if (existsSync(join(dir, "app.js"))) js += readFileSync(join(dir, "app.js"), "utf8");

  const have = definedIn(css);
  const missing = [...usedIn(stripComments(html) + stripComments(js))]
    .filter((c) => !have.has(c) && !IGNORE.has(c) && !isArtifact(c))
    .sort();
  return { folder, missing };
};

const targets = process.argv[2] === "--all"
  ? JSON.parse(readFileSync(join(HERE, "videos.json"), "utf8")).videos.map((v) => v.folder)
  : [process.argv[2]];

if (!targets[0]) {
  console.error("Uso: node check-classes.mjs <folder> | --all");
  process.exit(1);
}

let bad = 0;
for (const t of targets) {
  const r = checkFolder(t);
  if (r.error) { console.log(`  ? ${t}: ${r.error}`); continue; }
  if (r.missing.length) {
    bad++;
    console.log(`  ✗ ${t}: ${r.missing.length} clase(s) usadas y NO definidas en CSS:`);
    for (const c of r.missing) console.log(`      .${c}`);
  } else {
    console.log(`  ✓ ${t}`);
  }
}
process.exit(bad ? 1 : 0);
