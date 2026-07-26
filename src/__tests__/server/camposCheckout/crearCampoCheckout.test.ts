import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { crearCampoCheckout } from "~/server/domain/camposCheckout/crearCampoCheckout";
import { type CrearCampoCheckoutInput } from "~/server/domain/camposCheckout/schemas";

/**
 * Tests del use case `crearCampoCheckout` (F02) con `db` FAKE STATEFUL (patrón de `crearSorteo`/
 * `crearTienda`). Las CONSTRAINTS reales de Postgres ya están fijadas DB-backed en
 * `server/schema/checkoutFields.test.ts` (F01); acá se testea la DECISIÓN del use case: derivar la
 * clave, ubicar el campo al final, normalizar por tipo (D4) y hacer cumplir los guards (D6/D7)
 * dentro de la $tx — con el `tenantId` SIEMPRE del acceso, jamás del input (I1).
 */

const acceso = (
  tenantIds: string[],
  /** Tienda del HOST del request (ADR-0022): es la que el panel administra. */
  tenantIdDelHost: string | null = tenantIds[0] ?? "t1",
): AccesoPanel => ({
  userId: "u1",
  email: "org@x.cl",
  esOperador: false,
  tenantIds,
  tenantIdDelHost,
});

interface CampoExistente {
  id: string;
  tenantId: string;
  clave: string;
  posicion: number;
  activo: boolean;
}

/**
 * Fake stateful: guarda los campos ya existentes (por tenant) y captura el create. Emula
 * `$transaction(fn)` ejecutando el callback con el mismo objeto.
 */
function fakeDb(existentes: CampoExistente[] = []) {
  let creado: Record<string, unknown> | null = null;

  const tx = {
    checkoutField: {
      findMany: async ({ where }: { where: { tenantId: string } }) =>
        existentes
          .filter((c) => c.tenantId === where.tenantId)
          .map((c) => ({ clave: c.clave, posicion: c.posicion, activo: c.activo })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        creado = data;
        return { id: "campo-nuevo" };
      },
    },
  };

  const db = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(tx),
  } as unknown as PrismaClient;

  return { db, getCreado: () => creado };
}

const base: CrearCampoCheckoutInput = {
  etiqueta: "Teléfono de contacto",
  tipo: "TELEFONO",
  obligatorio: true,
  placeholder: "+56 9 1234 5678",
  textoAyuda: "Para coordinar la entrega del premio",
  opciones: [],
  defaultMarcado: false,
};

describe("camposCheckout/crearCampoCheckout", () => {
  // campos.crear.001 — la clave se DERIVA de la etiqueta server-side; el campo nace activo y último
  it("crea el campo con la clave derivada de la etiqueta, activo y al final del orden", async () => {
    const { db, getCreado } = fakeDb();

    const { id } = await crearCampoCheckout({
      db,
      acceso: acceso(["t1"]),
      input: base,
    });

    expect(id).toBe("campo-nuevo");
    expect(getCreado()).toMatchObject({
      tenantId: "t1", // del acceso, NUNCA del input (I1)
      clave: "telefono_de_contacto",
      etiqueta: "Teléfono de contacto",
      tipo: "TELEFONO",
      obligatorio: true,
      placeholder: "+56 9 1234 5678",
      textoAyuda: "Para coordinar la entrega del premio",
      posicion: 0,
      activo: true,
      opciones: [],
      defaultMarcado: false,
    });
  });

  // campos.crear.002 — el campo nuevo va ÚLTIMO y su clave desambigua contra TODAS las del tenant,
  //                    incluidas las de campos INACTIVOS (el unique los alcanza, checkout.schema.001)
  it("ubica el campo al final del orden y desambigua la clave contra los campos inactivos", async () => {
    const { db, getCreado } = fakeDb([
      { id: "c1", tenantId: "t1", clave: "telefono_de_contacto", posicion: 0, activo: false },
      { id: "c2", tenantId: "t1", clave: "talla", posicion: 3, activo: true },
    ]);

    await crearCampoCheckout({ db, acceso: acceso(["t1"]), input: base });

    expect(getCreado()).toMatchObject({
      clave: "telefono_de_contacto_2", // la del campo DESACTIVADO también estaba tomada
      posicion: 4, // detrás del último (posicion 3), no del último ACTIVO ni del count
    });
  });

  // campos.crear.003 — límite D6/I6 recontado en la $tx: el activo #11 se rechaza…
  it("rechaza el campo activo número 11 y no cuenta los desactivados para el límite", async () => {
    const diezActivos = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      tenantId: "t1",
      clave: `campo_${i}`,
      posicion: i,
      activo: true,
    }));

    const lleno = fakeDb(diezActivos);
    await expect(
      crearCampoCheckout({ db: lleno.db, acceso: acceso(["t1"]), input: base }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(lleno.getCreado()).toBeNull(); // no se creó nada

    // …pero 10 campos de los cuales 2 están DESACTIVADOS dejan lugar: solo cuentan los activos.
    const conDesactivados = fakeDb(
      diezActivos.map((c, i) => (i < 2 ? { ...c, activo: false } : c)),
    );
    await expect(
      crearCampoCheckout({
        db: conDesactivados.db,
        acceso: acceso(["t1"]),
        input: base,
      }),
    ).resolves.toEqual({ id: "campo-nuevo" });
  });

  // campos.crear.004 — claves RESERVADAS (D7/I2): el correo ya se pide siempre (ADR-0004)
  it("rechaza un campo cuya clave derivada colisiona con el correo fijo del checkout", async () => {
    for (const etiqueta of ["Email", "Correo", "  ¡EMAIL!  "]) {
      const { db, getCreado } = fakeDb();
      await expect(
        crearCampoCheckout({
          db,
          acceso: acceso(["t1"]),
          input: { ...base, etiqueta, tipo: "TEXTO" },
        }),
      ).rejects.toMatchObject({ code: "INVALID" });
      expect(getCreado()).toBeNull();
    }
  });

  // campos.crear.005 — D4/I5: CHECKBOX es dato puro ⇒ `obligatorio` se NORMALIZA a false
  it("normaliza por tipo: CHECKBOX nunca queda obligatorio y solo SELECT conserva opciones", async () => {
    const checkbox = fakeDb();
    await crearCampoCheckout({
      db: checkbox.db,
      acceso: acceso(["t1"]),
      input: {
        ...base,
        etiqueta: "Quiero novedades",
        tipo: "CHECKBOX",
        obligatorio: true, // lo que mande el cliente da igual…
        defaultMarcado: true,
        opciones: ["ruido"], // …y las opciones no existen fuera de SELECT
      },
    });
    expect(checkbox.getCreado()).toMatchObject({
      tipo: "CHECKBOX",
      obligatorio: false, // …normalizado (D4)
      defaultMarcado: true,
      opciones: [],
    });

    // Un SELECT sí conserva sus opciones, y su `defaultMarcado` se apaga (no hay nada que marcar).
    const select = fakeDb();
    await crearCampoCheckout({
      db: select.db,
      acceso: acceso(["t1"]),
      input: {
        ...base,
        etiqueta: "Sucursal",
        tipo: "SELECT",
        opciones: ["Providencia", "Ñuñoa"],
        defaultMarcado: true,
      },
    });
    expect(select.getCreado()).toMatchObject({
      opciones: ["Providencia", "Ñuñoa"],
      defaultMarcado: false,
    });
  });

  // campos.crear.006 — I1: sin membresía no hay Tienda sobre la que operar (fail-closed)
  it("rechaza a un usuario sin membresía (el tenantId sale del acceso, nunca del input)", async () => {
    const { db, getCreado } = fakeDb();
    await expect(
      crearCampoCheckout({ db, acceso: acceso([]), input: base }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getCreado()).toBeNull();
  });
});
