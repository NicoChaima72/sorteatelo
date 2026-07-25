import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { ChromeSchema } from "~/lib/pagebuilder/chrome";
import { getChrome, setChrome } from "~/server/domain/pagebuilder/chromeTienda";

/**
 * Tests de los use cases del chrome (Tanda 3 F07/D12, ADR-0021). `setChrome` RE-VALIDA con `ChromeSchema`
 * (I3) y escribe `Tenant.chromeJson` (o `Prisma.DbNull` para restablecer); `getChrome` lee y cae al default.
 * La membresía se exige en el router (`exigirEditor.test.ts`). Mock de Prisma con spies.
 */

const chromeValido = () =>
  ChromeSchema.parse({
    header: { menu: [{ etiqueta: "Sobre mí", destino: { tipo: "pagina", slug: "sobre-mi" } }] },
    footer: { texto: "Con cariño." },
  });

type UpdateArg = { where: { id: string }; data: { chromeJson: unknown } };

function mockDb(chromeJson: unknown = null) {
  const update = vi.fn(async (_arg: UpdateArg) => ({ id: "t1" }));
  return {
    db: {
      tenant: {
        findUnique: vi.fn(async () => ({ chromeJson })),
        update,
      },
    } as never,
    update,
  };
}

describe("pagebuilder/chromeTienda — setChrome (F07/D12)", () => {
  // page.chrome.set.001 — un chrome válido se escribe en Tenant.chromeJson
  it("escribe el chrome válido en la columna", async () => {
    const { db, update } = mockDb();
    await setChrome({ db, tenantId: "t1", chrome: chromeValido() });
    expect(update).toHaveBeenCalledOnce();
    const arg = update.mock.calls[0]![0];
    expect(arg.where.id).toBe("t1");
    expect((arg.data.chromeJson as { header: { menu: unknown[] } }).header.menu).toHaveLength(1);
  });

  // page.chrome.set.002 — chrome null ⇒ restablece (columna a Prisma.DbNull)
  it("chrome null restablece la columna a DbNull (chrome default)", async () => {
    const { db, update } = mockDb();
    await setChrome({ db, tenantId: "t1", chrome: null });
    const arg = update.mock.calls[0]![0];
    expect(arg.data.chromeJson).toBe(Prisma.DbNull);
  });

  // page.chrome.set.003 — getChrome devuelve el chrome guardado, o el default si la columna es null
  it("getChrome lee el chrome guardado y cae al default si null", async () => {
    const guardado = chromeValido();
    const conChrome = mockDb(guardado);
    const leido = await getChrome({ db: conChrome.db, tenantId: "t1" });
    expect(leido.header.menu).toHaveLength(1);

    const sinChrome = mockDb(null);
    const def = await getChrome({ db: sinChrome.db, tenantId: "t1" });
    expect(def.header.fondo).toBe("vidrio"); // default = header actual
    expect(def.header.menu).toEqual([]);
  });
});
