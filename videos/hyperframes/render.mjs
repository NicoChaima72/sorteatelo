#!/usr/bin/env node
/**
 * render.mjs <video> [-o out/YYYY-MM-DD-<video>.mp4] — wrapper de render de HyperFrames.
 *
 * El `index.html` versionado es PELADO (@font-face con `url("assets/fonts/<Familia>.woff2")` —
 * token root-relative lint-safe que NO existe en disco; sin base64) y el folder del video NO
 * committea `assets/` (kit, tokens y gsap son efímeros). Este wrapper arma todo lo que el render
 * necesita y limpia al terminar:
 *
 *   1. `fetch-fonts.mjs` si falta alguna woff2 en `_brand/fonts/` (binarios fuera de git, I8).
 *   2. `materializar()` → `<video>/assets/{tour-kit.css,tour-kit.js,gsap.min.js,brand.tokens.css}`
 *      desde la fuente única (gotcha 6: gsap local, no CDN — render determinista sin red).
 *   3. `embed-fonts.mjs <video>/index.html → <video>/index.embed.html` (base64; gotcha 12).
 *   4. `hyperframes@0.7.56 render <video> -c index.embed.html -o <out>`, con los overrides
 *      FFmpeg de gotcha 11 (el `á` de `NicolásChaima` rompe el existence-check del binario en
 *      Git Bash → HYPERFRAMES_FFMPEG_PATH / HYPERFRAMES_FFPROBE_PATH a `C:\Users\Public\hf\`).
 *   5. finally: borra `<video>/index.embed.html` — NUNCA queda base64 en el árbol (I8).
 *
 * Versión pinneada: hyperframes@0.7.56. NO usar `hyperframes init` (gotcha 1, crashea en Windows).
 * Éste es el ÚNICO camino de render: `npx hyperframes render` a mano sobre un folder pelado sale
 * con fuentes del sistema y sin gsap.
 */
import { existsSync, mkdirSync, copyFileSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";

import { materializar } from "./_lib/materializar.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)); // videos/hyperframes
const HF_VERSION = "0.7.56";

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let video = null;
let out = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "-o" || argv[i] === "--output") out = argv[++i];
  else if (!video) video = argv[i];
}
if (!video) {
  console.error("uso: render.mjs <video> [-o out/YYYY-MM-DD-<video>.mp4]");
  process.exit(1);
}

const videoDir = join(HERE, video);
if (!existsSync(join(videoDir, "index.html"))) {
  console.error(`✗ No encuentro ${video}/index.html`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
if (!out) out = `out/${today}-${video}.mp4`;

// ── fuentes de marca (binarios fuera de git): bajarlas si faltan ───────────────
function asegurarFuentes() {
  const local = JSON.parse(readFileSync(join(HERE, "_brand", "tokens.local.json"), "utf8"));
  const faces = Object.entries(local.fuentes)
    .filter(([rol]) => !rol.startsWith("_"))
    .flatMap(([, f]) => f.faces.map((x) => x.archivo));
  const dir = join(HERE, "_brand", "fonts");
  const presentes = existsSync(dir) ? new Set(readdirSync(dir)) : new Set();
  if (faces.every((f) => presentes.has(f))) return;
  console.log("· faltan fuentes de marca → node fetch-fonts.mjs");
  const r = spawnSync(process.execPath, [join(HERE, "fetch-fonts.mjs")], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("fetch-fonts falló");
}

// ── FFmpeg overrides (gotcha 11): path sin acento en Windows ────────────────────
function ensureFfmpegEnv() {
  if (process.platform !== "win32") return;
  const PUB = "C:\\Users\\Public\\hf";
  const ff = join(PUB, "ffmpeg.exe");
  const fp = join(PUB, "ffprobe.exe");
  if (!existsSync(ff) || !existsSync(fp)) {
    mkdirSync(PUB, { recursive: true });
    const locate = (bin) => {
      for (const cmd of [`where ${bin}`, `which ${bin}`]) {
        try {
          const found = execSync(cmd, { encoding: "utf8" }).split(/\r?\n/).find(Boolean);
          if (found && existsSync(found.trim())) return found.trim();
        } catch { /* probar el siguiente */ }
      }
      return null;
    };
    for (const [dst, bin] of [[ff, "ffmpeg"], [fp, "ffprobe"]]) {
      if (!existsSync(dst)) {
        const src = locate(bin);
        if (!src) { console.error(`✗ No encuentro ${bin} en el PATH para copiar a ${dst} (gotcha 11).`); process.exit(1); }
        copyFileSync(src, dst);
      }
    }
  }
  process.env.HYPERFRAMES_FFMPEG_PATH = ff;
  process.env.HYPERFRAMES_FFPROBE_PATH = fp;
}

// ── flujo atómico ───────────────────────────────────────────────────────────────
const embedPath = join(videoDir, "index.embed.html");
let status = 1;
try {
  // 1-2. assets que el render necesita (todos efímeros/gitignored).
  asegurarFuentes();
  materializar(videoDir);

  // 3. embed base64 en un sibling gitignored (paths relativos idénticos al index.html).
  const embed = spawnSync(process.execPath, [
    join(HERE, "embed-fonts.mjs"), join(videoDir, "index.html"), embedPath,
  ], { stdio: "inherit" });
  if (embed.status !== 0) throw new Error("embed-fonts falló");

  // 4. render sobre la copia embebida.
  ensureFfmpegEnv();
  const outParent = dirname(isAbsolute(out) ? out : join(HERE, out));
  mkdirSync(outParent, { recursive: true });
  const r = spawnSync("npx", [
    `hyperframes@${HF_VERSION}`, "render", video, "-c", "index.embed.html", "-o", out,
  ], { cwd: HERE, stdio: "inherit", shell: true, env: process.env });
  status = r.status ?? 1;
} catch (e) {
  console.error(`✗ ${e.message}`);
  status = 1;
} finally {
  // 5. el base64 NUNCA queda en el árbol (I8).
  rmSync(embedPath, { force: true });
}
process.exit(status);
