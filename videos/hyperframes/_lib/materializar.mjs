/**
 * materializar.mjs — pone en `<video>/assets/` los assets COMPARTIDOS que el motor necesita.
 *
 * Divergencia deliberada del kit origen (documentada en el README): en terranova cada video
 * committeaba su copia de `tour-kit.{css,js}` + `brand.tokens.css`, así que un fix del kit sólo
 * alcanzaba a los videos NUEVOS. Acá esas copias son EFÍMERAS (gitignored) y se materializan
 * desde la fuente única antes de scaffoldear / chequear / renderizar:
 *
 *   _lib/tour-kit.css       → <video>/assets/tour-kit.css
 *   _lib/tour-kit.js        → <video>/assets/tour-kit.js
 *   _lib/gsap.min.js        → <video>/assets/gsap.min.js      (gotcha 6: local, no CDN)
 *   _brand/brand.tokens.css → <video>/assets/brand.tokens.css (generado desde theme.ts)
 *
 * Consecuencia: un fix en `_lib/` o un cambio de paleta en `theme.ts` llega a TODOS los videos
 * al re-renderizar, y el folder de cada video guarda sólo SU fuente (index.html + app.js).
 *
 * Las fuentes woff2 NO se copian: `embed-fonts.mjs` lee los bytes de `_brand/fonts/` y los mete
 * en base64 en la copia efímera del HTML (gotcha 12). Por eso `assets/fonts/` no existe nunca.
 */
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const LIB = dirname(fileURLToPath(import.meta.url));
const HERE = join(LIB, "..");

/** [origen, nombre en <video>/assets/] */
const COMPARTIDOS = [
  [join(LIB, "tour-kit.css"), "tour-kit.css"],
  [join(LIB, "tour-kit.js"), "tour-kit.js"],
  [join(LIB, "gsap.min.js"), "gsap.min.js"],
  [join(HERE, "_brand", "brand.tokens.css"), "brand.tokens.css"],
];

/**
 * Copia los assets compartidos al folder del video. Devuelve los nombres copiados.
 * Falla ruidoso si falta una fuente (p.ej. brand.tokens.css sin generar).
 */
export function materializar(videoDir) {
  const assets = join(videoDir, "assets");
  mkdirSync(assets, { recursive: true });
  const puestos = [];
  for (const [src, nombre] of COMPARTIDOS) {
    if (!existsSync(src)) {
      console.error(`✗ Falta la fuente compartida ${src}`);
      if (nombre === "brand.tokens.css") {
        console.error("  Corré: node videos/hyperframes/build-tokens.mjs");
      }
      process.exit(1);
    }
    copyFileSync(src, join(assets, nombre));
    puestos.push(nombre);
  }
  return puestos;
}
