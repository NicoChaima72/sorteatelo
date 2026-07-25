#!/usr/bin/env node
/**
 * new-tour.mjs — scaffolder de cápsulas Tour de Sortéatelo (HyperFrames).
 *
 *   node new-tour.mjs <slug> "<título>" --beats 4.5,5,6.8,7,8,4.5 [--module tienda] [--date 2026-07-25]
 *
 * Qué hace (lo que a mano cuesta tiempo + errores):
 *   1. Copia _template-tour/ → <slug>/ (esqueleto de los 6 beats del Tour).
 *   2. Materializa los assets compartidos FRESCOS en <slug>/assets/ (tour-kit.css/js,
 *      gsap, brand.tokens.css) — son efímeros/gitignored, ver _lib/materializar.mjs.
 *   3. El esqueleto ya trae los @font-face PELADOS (token `url("assets/fonts/<Familia>.woff2")`,
 *      root-relative lint-safe; los bytes salen de `_brand/fonts/` en render-time). El base64 lo
 *      embebe render.mjs, NO el HTML versionado. Sin eso el render cae a fuente del sistema
 *      (gotcha 12).
 *   4. Calcula los clips BORDE A BORDE (data-start/data-duration en segundos, 4 decimales,
 *      derivados de frames enteros @30fps) + la duración del root + las constantes en frames
 *      del timeline. Cero aritmética manual: el lint bloquea cualquier overlap y era la fuente
 *      típica de reintentos.
 *   5. Registra el video en videos.json.
 *
 * Los 6 beats del Tour: poster · concepto · paso 1 · paso 2 · paso 3 · outro.
 * (Otro número de beats no está soportado — el Tour es el estándar de cápsula.)
 *
 * NO usar `npx hyperframes init` (crashea en Windows — gotcha 1).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { materializar } from "./_lib/materializar.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const BEAT_NAMES = ["poster", "concepto", "paso 1", "paso 2", "paso 3", "outro"];

// Copia recursiva a mano: fs.cpSync tira EIO en Windows cuando el path del usuario
// tiene acento (se resuelve a \\?\C:\Users\Nicolás… y el binding falla).
const copyDir = (src, dst) => {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry), d = join(dst, entry);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
};

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i];
  else positional.push(argv[i]);
}
const [slug, titulo] = positional;

if (!slug || !titulo) {
  console.error(`Uso: node new-tour.mjs <slug> "<título>" --beats 4.5,5,6.8,7,8,4.5 [--module tienda] [--date YYYY-MM-DD]`);
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error(`✗ El slug debe ser kebab-case: "${slug}"`);
  process.exit(1);
}

const dest = join(HERE, slug);
if (existsSync(dest)) {
  console.error(`✗ Ya existe ${slug}/ — elegí otro slug o borralo.`);
  process.exit(1);
}

const beats = (flags.beats ?? "4.5,5,6.8,7,8,4.5").split(",").map((s) => Number(s.trim()));
if (beats.length !== 6 || beats.some((b) => !(b > 0))) {
  console.error(`✗ --beats requiere 6 duraciones en segundos (${BEAT_NAMES.join(" / ")}). Recibí: ${flags.beats}`);
  process.exit(1);
}
const modulo = flags.module ?? "general";
const date = flags.date ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`✗ --date debe ser YYYY-MM-DD. Recibí: ${date}`);
  process.exit(1);
}

// ── timeline: todo derivado de FRAMES enteros → clips borde a borde, sin overlap ──
const durF = beats.map((d) => Math.round(d * FPS));          // duración de cada beat en frames
const startF = durF.reduce((acc, d, i) => (acc.push(i === 0 ? 0 : acc[i - 1] + durF[i - 1]), acc), []);
const totalF = durF.reduce((a, b) => a + b, 0);
const sec = (frames) => (frames / FPS).toFixed(4);           // 4 decimales, exacto

// ── scaffold ────────────────────────────────────────────────────────────────
copyDir(join(HERE, "_template-tour"), dest);
materializar(dest);   // tour-kit.{css,js} + gsap + brand.tokens.css frescos (efímeros)

const repl = {
  __SLUG__: slug,
  __TITULO__: titulo,
  __MODULO__: modulo.charAt(0).toUpperCase() + modulo.slice(1),
  __DURATION__: sec(totalF),
  __F_INTRO_OUT__: durF[0] - 16,
  __F_CONCEPT__: startF[1],
  __F_CONCEPT_OUT__: startF[1] + durF[1] - 16,
  __F_S0__: startF[2], __D_S0__: durF[2],
  __F_S1__: startF[3], __D_S1__: durF[3],
  __F_S2__: startF[4], __D_S2__: durF[4],
  __F_OUTRO__: startF[5],
};
for (let i = 0; i < 6; i++) {
  repl[`__ST${i}__`] = sec(startF[i]);
  repl[`__DU${i}__`] = sec(durF[i]);
}

for (const file of ["index.html", "app.js"]) {
  const p = join(dest, file);
  let src = readFileSync(p, "utf8");
  for (const [k, v] of Object.entries(repl)) src = src.split(k).join(String(v));
  writeFileSync(p, src);
}

// ── videos.json ─────────────────────────────────────────────────────────────
const vpath = join(HERE, "videos.json");
const vjson = JSON.parse(readFileSync(vpath, "utf8"));
vjson.videos.push({
  id: slug,
  folder: slug,
  module: modulo,
  title: titulo,
  description: `Formato Tour: concepto + 3 pasos guiados sobre el panel.`,
  format: "tour",
  durationSeconds: Number(sec(totalF)),
  fps: FPS,
  aspect: "16:9",
  locale: "es-CL",
  status: "nuevo",
  output: `out/${date}-${slug}.mp4`,
});
writeFileSync(vpath, JSON.stringify(vjson, null, 2) + "\n");

// ── next steps ──────────────────────────────────────────────────────────────
const pend = readFileSync(join(dest, "index.html"), "utf8").match(/__[A-Z_]+__/g) ?? [];
const pendApp = readFileSync(join(dest, "app.js"), "utf8").match(/__[A-Z_]+__/g) ?? [];
const marks = [...new Set([...pend, ...pendApp])];

console.log(`\n✓ ${slug}/ creado — ${sec(totalF)}s (${totalF} frames @${FPS}fps)\n`);
console.log("  Clips (borde a borde):");
beats.forEach((_, i) => console.log(`    ${String(BEAT_NAMES[i]).padEnd(9)} start=${sec(startF[i]).padStart(8)}  dur=${sec(durF[i]).padStart(8)}`));
console.log(`\n  Registrado en videos.json → out/${date}-${slug}.mp4`);
if (marks.length) console.log(`\n  Placeholders por completar: ${marks.join(" ")}`);
console.log(`
  Siguiente:
    1. index.html  → copy de los beats + clases del mock de esta pantalla
    2. app.js      → geometría (P.p0/p1/p2), mock, spotlights y tooltips
    3. node check-classes.mjs ${slug}                    ← gate estático (1 s)
    4. npx hyperframes@0.7.56 lint ${slug}               ← 0 errores
    5. node render.mjs ${slug} -o out/${date}-${slug}.mp4
    6. verificar 3 frames del MP4 real (poster / paso medio / cierre)
`);
