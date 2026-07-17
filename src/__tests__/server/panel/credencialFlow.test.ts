import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { getEstadoCredencialFlow } from "~/server/domain/panel/getEstadoCredencialFlow";
import { guardarCredencialFlow } from "~/server/domain/panel/guardarCredencialFlow";
import { descifrar, parsearClave } from "~/server/services/cifrado";

/**
 * Tests de la carga de CredencialFlow desde el panel (F04) con `db` FAKE. Reglas duras
 * (I3/ADR-0006): las keys entran WRITE-ONLY, se cifran con el seam existente, y NINGUNA
 * respuesta/lectura del panel devuelve secretos — ni en claro ni cifrados. El estado leíble
 * expone solo `{ configurada, sandbox, updatedAt }`. Upsert: pisa la credencial previa.
 */

const CLAVE = parsearClave(Buffer.alloc(32, 7).toString("base64"));
const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  esOperador: false,
  tenantIds,
});

function fakeDbUpsert() {
  let upsertArgs: {
    where: { tenantId: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  } | null = null;
  const db = {
    flowCredential: {
      upsert: async (args: {
        where: { tenantId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        upsertArgs = args;
        return { sandbox: args.create.sandbox as boolean, updatedAt: new Date("2026-02-01") };
      },
    },
  } as unknown as PrismaClient;
  return { db, getUpsertArgs: () => upsertArgs };
}

describe("domain/panel/guardarCredencialFlow (fake db)", () => {
  // panel.cred.guardar.001 — cifra ambas keys (roundtrip) y no filtra el plaintext
  it("cifra apiKey y secretKey (roundtrip con descifrar; ciphertext sin plaintext)", async () => {
    const { db, getUpsertArgs } = fakeDbUpsert();
    const res = await guardarCredencialFlow({
      db,
      acceso: acceso(["A"]),
      input: { apiKey: "APIKEY-PLANO", secretKey: "SECRET-PLANO", sandbox: true },
      clave: CLAVE,
    });

    const args = getUpsertArgs()!;
    expect(args.where).toEqual({ tenantId: "A" });
    const apiCif = args.create.apiKeyCifrada as string;
    const secCif = args.create.secretKeyCifrada as string;
    // ciphertext NO contiene el plaintext
    expect(apiCif).not.toContain("APIKEY-PLANO");
    expect(secCif).not.toContain("SECRET-PLANO");
    // roundtrip
    expect(descifrar(apiCif, CLAVE)).toBe("APIKEY-PLANO");
    expect(descifrar(secCif, CLAVE)).toBe("SECRET-PLANO");
    // update (upsert pisa la previa) también trae las cifradas
    expect(args.update.apiKeyCifrada).toBeDefined();

    // la respuesta NO contiene secretos ni ciphertexts
    expect(res).toEqual({
      configurada: true,
      sandbox: true,
      updatedAt: new Date("2026-02-01"),
    });
    expect(JSON.stringify(res)).not.toContain("APIKEY-PLANO");
    expect(JSON.stringify(res)).not.toContain(apiCif);
  });

  // panel.cred.guardar.002 — sin membresía ⇒ FORBIDDEN (no cifra ni escribe)
  it("sin membresía ⇒ FORBIDDEN y no escribe nada", async () => {
    const { db, getUpsertArgs } = fakeDbUpsert();
    await expect(
      guardarCredencialFlow({
        db,
        acceso: acceso([]),
        input: { apiKey: "x", secretKey: "y", sandbox: true },
        clave: CLAVE,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getUpsertArgs()).toBeNull();
  });
});

describe("domain/panel/getEstadoCredencialFlow (fake db)", () => {
  function fakeDbFind(cred: { sandbox: boolean; updatedAt: Date } | null) {
    return {
      flowCredential: {
        findUnique: async ({ where }: { where: { tenantId: string } }) =>
          where.tenantId === "A" ? cred : null,
      },
    } as unknown as PrismaClient;
  }

  // panel.cred.estado.001 — expone solo { configurada, sandbox, updatedAt }, sin secretos
  it("con credencial cargada devuelve configurada:true + sandbox + updatedAt (sin secretos)", async () => {
    const res = await getEstadoCredencialFlow({
      db: fakeDbFind({ sandbox: true, updatedAt: new Date("2026-02-01") }),
      acceso: acceso(["A"]),
    });
    expect(res).toEqual({
      configurada: true,
      sandbox: true,
      updatedAt: new Date("2026-02-01"),
    });
    // no hay ninguna clave 'cifrada' ni 'apiKey' en la respuesta
    expect(Object.keys(res).join(",")).not.toMatch(/cifrada|apiKey|secret/i);
  });

  // panel.cred.estado.002 — sin credencial ⇒ configurada:false
  it("sin credencial devuelve configurada:false", async () => {
    const res = await getEstadoCredencialFlow({
      db: fakeDbFind(null),
      acceso: acceso(["A"]),
    });
    expect(res).toEqual({ configurada: false, sandbox: null, updatedAt: null });
  });
});
