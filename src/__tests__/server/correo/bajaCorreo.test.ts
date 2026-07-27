import { describe, expect, it } from "vitest";

import {
  manejarBajaDeAvisos,
  type ReqBaja,
} from "~/server/correo/bajaCorreo";

/**
 * Tests del NÚCLEO del endpoint público de baja (F05, RFC 8058 + ADR-0004). Puro: recibe un `req`
 * acotado y las dependencias inyectadas, devuelve `{status, headers, body}`. No toca `env`, no
 * escribe `res`, no instancia nada (patrón `manejarDescarga`/`manejarCronCorreos`).
 *
 * El endpoint es PÚBLICO y SIN LOGIN a propósito: el Comprador no tiene cuenta (ADR-0004) y el
 * botón «darse de baja» de Gmail hace un POST anónimo. La autoridad es el token.
 */

const TOKEN = "tok3n-de-baja";

function deps(overrides: Partial<Parameters<typeof manejarBajaDeAvisos>[0]> = {}) {
  const suprimidos: { tenantId: string; email: string }[] = [];
  return {
    suprimidos,
    args: {
      buscarPorToken: async (token: string) =>
        token === TOKEN
          ? {
              tenantId: "ten-1",
              nombreTienda: "ARMY Chile",
              emailNormalizado: "fan@example.cl",
            }
          : null,
      suprimir: async (input: { tenantId: string; email: string }) => {
        const nueva = !suprimidos.some(
          (s) => s.tenantId === input.tenantId && s.email === input.email,
        );
        if (nueva) suprimidos.push(input);
        return { nueva };
      },
      ...overrides,
    },
  };
}

const post = (token: unknown = TOKEN): ReqBaja => ({
  method: "POST",
  query: { token },
});

describe("server/correo/bajaCorreo — baja one-click (F05, RFC 8058)", () => {
  // correo.baja.010 — el camino que ejerce el botón nativo de Gmail: POST anónimo con el token de
  // la cabecera `List-Unsubscribe`. Suprime y responde 200; nada de login, nada de sesión.
  it("un POST con token válido suprime al Comprador en ESA Tienda", async () => {
    const { args, suprimidos } = deps();

    const res = await manejarBajaDeAvisos({ req: post(), ...args });

    expect(res.status).toBe(200);
    expect(suprimidos).toEqual([{ tenantId: "ten-1", email: "fan@example.cl" }]);
  });

  // correo.baja.011 — IDEMPOTENTE: el segundo click (o el reintento del proveedor, que reintenta
  // el one-click si no le responden rápido) no es un error. La persona quiso lo mismo dos veces y
  // las dos veces está dada de baja; decírselo distinto la haría dudar de si funcionó.
  it("es idempotente: el segundo POST responde igual y no rompe", async () => {
    const { args, suprimidos } = deps();

    const primera = await manejarBajaDeAvisos({ req: post(), ...args });
    const segunda = await manejarBajaDeAvisos({ req: post(), ...args });

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(segunda.body).toBe(primera.body);
    expect(suprimidos).toHaveLength(1);
  });

  // correo.baja.012 — un token que no existe responde EXACTAMENTE lo mismo que uno válido. Si
  // distinguiera, el endpoint sería un oráculo para enumerar tokens ajenos — el mismo criterio del
  // 404 neutral de `/api/descargas/<token>`. Y no escribe nada.
  it("un token desconocido responde igual que uno válido y no suprime nada", async () => {
    const { args, suprimidos } = deps();

    const conocido = await manejarBajaDeAvisos({ req: post(), ...args });
    const desconocido = await manejarBajaDeAvisos({
      req: post("no-existe"),
      ...args,
    });

    expect(desconocido.status).toBe(conocido.status);
    expect(suprimidos).toHaveLength(1); // solo la del token bueno
  });

  // correo.baja.013 — un GET NO suprime: muestra una confirmación con un botón que hace el POST.
  // No es ceremonia: los escáneres de seguridad corporativos SIGUEN los enlaces de un correo, y un
  // GET que diera de baja dejaría a gente fuera de la lista sin que nadie hiciera click. Es la
  // razón por la que RFC 8058 exige POST para el one-click.
  it("un GET muestra la confirmación y NO suprime", async () => {
    const { args, suprimidos } = deps();

    const res = await manejarBajaDeAvisos({
      req: { method: "GET", query: { token: TOKEN } },
      ...args,
    });

    expect(res.status).toBe(200);
    expect(suprimidos).toEqual([]);
    // La página trae el formulario que hace el POST a esta misma URL.
    expect(res.body).toContain("<form");
    expect(res.body).toContain('method="post"');
  });

  // correo.baja.014 — la confirmación nombra la TIENDA de la que se da de baja: la supresión es POR
  // Tienda (CONTEXT § Supresión de correo) y quien compró en tres tiendas tiene que saber de cuál
  // se está yendo. El nombre lo escribe el Organizador ⇒ se escapa.
  it("nombra la Tienda en la confirmación, escapando el nombre", async () => {
    const { args } = deps({
      buscarPorToken: async () => ({
        tenantId: "ten-1",
        nombreTienda: 'ARMY <script>alert(1)</script>',
        emailNormalizado: "fan@example.cl",
      }),
    });

    const res = await manejarBajaDeAvisos({
      req: { method: "GET", query: { token: TOKEN } },
      ...args,
    });

    expect(res.body).toContain("&lt;script&gt;");
    expect(res.body).not.toContain("<script>alert(1)</script>");
  });

  // correo.baja.015 — la respuesta NUNCA muestra el correo de la persona. La URL de baja viaja en
  // un correo que puede reenviarse, y el token es la única credencial: imprimir la dirección
  // convertiría el enlace en una fuga de PII de terceros a quien lo abra (ADR-0004).
  it("no filtra el correo del Comprador en ninguna respuesta", async () => {
    const { args } = deps();

    for (const req of [post(), { method: "GET", query: { token: TOKEN } }]) {
      const res = await manejarBajaDeAvisos({ req: req as ReqBaja, ...args });
      expect(res.body).not.toContain("fan@example.cl");
    }
  });

  // correo.baja.016 — métodos que no son GET ni POST no disparan nada (gate antes de cualquier
  // efecto), y un token ausente o repetido en la query no se interpreta con imaginación.
  it("rechaza otros métodos y no acepta un token malformado", async () => {
    const { args, suprimidos } = deps();

    const borrar = await manejarBajaDeAvisos({
      req: { method: "DELETE", query: { token: TOKEN } },
      ...args,
    });
    expect(borrar.status).toBe(405);

    // Ojo: la clave AUSENTE va como `query: {}` y no como `post(undefined)` — el default del
    // helper taparía justo el caso que interesa.
    for (const query of [{}, { token: ["a", "b"] }, { token: "" }]) {
      const res = await manejarBajaDeAvisos({
        req: { method: "POST", query },
        ...args,
      });
      expect(res.status).toBe(400);
    }
    expect(suprimidos).toEqual([]);
  });

  // correo.baja.017 — la página es HTML y se declara como tal: sin el Content-Type, un buzón que
  // abra el enlace muestra el markup crudo.
  it("responde HTML declarado y sin indexar", async () => {
    const { args } = deps();

    const res = await manejarBajaDeAvisos({ req: post(), ...args });

    expect(res.headers?.["Content-Type"]).toContain("text/html");
    // Una URL con un token de un tercero no tiene por qué terminar en un buscador.
    expect(res.headers?.["X-Robots-Tag"]).toContain("noindex");
  });
});
