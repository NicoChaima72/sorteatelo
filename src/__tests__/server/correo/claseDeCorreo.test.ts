import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CORREO_CONFIG,
  remitenteDeCorreo,
} from "~/config/correo";
import { cabecerasDeAvisos } from "~/server/domain/correo/bajaDeAvisos";
import { construirFrom } from "~/server/domain/correo/layoutCorreo";

/**
 * Tests del **remitente como DATO de config** (F05, seam de D2) y de la separación
 * transaccional ≠ avisos (I5).
 *
 * D2 quedó CERRADA-Y-DIFERIDA: con Resend Free (1 dominio) todo sale de `sorteatelo.cl`, pero el
 * dominio deja de ser una constante escondida en una plantilla y pasa a ser config con una
 * `ClaseDeCorreo` que lo elige. Cuando se contrate Pro, separar `notificaciones.` de `avisos.` es
 * editar `src/config/correo.ts` — no tocar una sola plantilla.
 */

const DOMINIO_CORREO = resolve(process.cwd(), "src/server/domain/correo");

describe("config/correo — el remitente es dato, no constante (D2)", () => {
  // correo.remitente.001 — el `from` que ve el Comprador sale del dominio de config.
  it("construye el From con el remitente que le pasan, no con uno propio", () => {
    const from = construirFrom(
      "Tienda ARMY",
      remitenteDeCorreo("transaccional"),
    );

    expect(from).toBe("Tienda ARMY · vía Sortéatelo <no-reply@sorteatelo.cl>");
    expect(from).toContain(CORREO_CONFIG.dominioEnvio);
  });

  // correo.remitente.002 — hoy las DOS clases salen del mismo dominio (Free = 1 dominio), y eso es
  // una decisión de CONFIG, no del código: el test fija que el seam existe y que hoy coinciden.
  it("hoy transaccional y avisos comparten dominio (D2 diferida), pero por config", () => {
    expect(remitenteDeCorreo("transaccional")).toContain(
      `@${CORREO_CONFIG.dominioEnvio}`,
    );
    expect(remitenteDeCorreo("avisos")).toContain(
      `@${CORREO_CONFIG.dominioEnvio}`,
    );
  });

  // correo.remitente.003 — el guard que hace que el seam no envejezca solo: NINGUNA plantilla del
  // dominio de correo puede escribir el dominio de envío como literal. Sin esto, la próxima
  // plantilla lo vuelve a hardcodear y el switch de D2 deja de ser "editar la config".
  it("ninguna plantilla del dominio de correo escribe el dominio de envío como literal", () => {
    const infractores = readdirSync(DOMINIO_CORREO)
      .filter((f) => f.endsWith(".ts"))
      // `layoutCorreo` es el ÚNICO autorizado: es quien compone el From, y ni siquiera él escribe
      // el dominio (lo importa de la config). Se excluye del barrido igual, para que el guard siga
      // valiendo si mañana el chrome necesita nombrar el dominio en el pie.
      .filter((f) => f !== "layoutCorreo.ts")
      .filter((f) =>
        readFileSync(resolve(DOMINIO_CORREO, f), "utf8").includes(
          CORREO_CONFIG.dominioEnvio,
        ),
      );

    expect(infractores).toEqual([]);
  });
});

describe("domain/correo/bajaDeAvisos — cabeceras RFC 8058 (I5)", () => {
  // correo.baja.001 — un correo de AVISOS lleva el par de cabeceras del one-click.
  it("arma List-Unsubscribe + List-Unsubscribe-Post apuntando a la URL de baja", () => {
    const cabeceras = cabecerasDeAvisos({
      urlBaja: "https://sorteatelo.cl/api/correo/baja/tok3n",
    });

    expect(cabeceras).toEqual({
      "List-Unsubscribe": "<https://sorteatelo.cl/api/correo/baja/tok3n>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
});
