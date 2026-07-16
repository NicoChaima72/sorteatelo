import { describe, expect, it } from "vitest";

import { resolverConfigPlataforma } from "~/server/tenancy/configPlataforma";

describe("resolverConfigPlataforma", () => {
  it("usa el dominio configurado, normalizado", () => {
    expect(
      resolverConfigPlataforma({
        dominioPlataforma: "  Plataforma.TEST ",
        nodeEnv: "production",
      }),
    ).toEqual({ dominioRaiz: "plataforma.test" });
  });

  it("en dev cae a `localhost` sin configuración, para el multi-tenant local (S1)", () => {
    expect(
      resolverConfigPlataforma({
        dominioPlataforma: undefined,
        nodeEnv: "development",
      }),
    ).toEqual({ dominioRaiz: "localhost" });
  });

  it("en test cae a `localhost` (mismo criterio que dev)", () => {
    expect(
      resolverConfigPlataforma({ dominioPlataforma: "", nodeEnv: "test" }),
    ).toEqual({ dominioRaiz: "localhost" });
  });

  it("en producción SIN dominio configurado hace fail-fast con un error claro", () => {
    // Nunca adivinar el dominio en prod: sin él, `a.dominio` no se distingue del
    // apex y el aislamiento por subdominio deja de significar algo (I1).
    expect(() =>
      resolverConfigPlataforma({
        dominioPlataforma: undefined,
        nodeEnv: "production",
      }),
    ).toThrow(/NEXT_PUBLIC_PLATFORM_DOMAIN/);
  });

  it("acepta el dominio con protocolo o puerto pegados y se queda con el host", () => {
    expect(
      resolverConfigPlataforma({
        dominioPlataforma: "https://plataforma.test:3000/",
        nodeEnv: "production",
      }),
    ).toEqual({ dominioRaiz: "plataforma.test" });
  });
});
