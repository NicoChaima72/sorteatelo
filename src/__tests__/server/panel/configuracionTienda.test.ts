import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { getConfiguracionTienda } from "~/server/domain/panel/getConfiguracionTienda";
import { guardarConfiguracionTienda } from "~/server/domain/panel/guardarConfiguracionTienda";
import { guardarConfiguracionTiendaInput } from "~/server/domain/panel/schemas";

/**
 * Tests de la configuración de Tienda (F04, D8): config básica de plantilla
 * (descripcion/logoUrl/colorPrimario) + redes/contacto del footer. Las BASES del sorteo SALIERON de
 * este contrato (admin-bases-pdf F03/D2/D3): son un PDF del Sorteo, no un texto de la Tienda. Solo se escribe sobre el tenant autorizado
 * (resuelto server-side); sin membresía ⇒ FORBIDDEN. Un email/tenant ajeno no puede llegar
 * acá porque el input NO lleva tenantId (I1).
 */

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  tenantIds,
  // ADR-0022: el panel opera la tienda del HOST. Por defecto, el subdominio es el de la
  // tienda del usuario; sin membresía, un host AJENO (el escenario real del fail-closed).
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

describe("domain/panel/guardarConfiguracionTienda (fake db)", () => {
  function fakeDb() {
    let updateArgs: {
      where: { id: string };
      data: Record<string, unknown>;
    } | null = null;
    const db = {
      tenant: {
        update: async (args: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          updateArgs = args;
          return { id: args.where.id };
        },
      },
    } as unknown as PrismaClient;
    return { db, getUpdateArgs: () => updateArgs };
  }

  // panel.config.guardar.001 — persiste plantilla + redes SOLO en el tenant autorizado
  // Las BASES salieron de este contrato (admin-bases-pdf F03/D2/D3): son el PDF del Sorteo, no un
  // texto de la Tienda. Ver `panel.config.guardar.004` para el assertion de que ya no se acepta.
  it("guarda los campos de plantilla + redes/contacto en el tenant resuelto (no del input)", async () => {
    const { db, getUpdateArgs } = fakeDb();
    await guardarConfiguracionTienda({
      db,
      acceso: acceso(["A"]),
      input: {
        descripcion: "Mi tienda",
        colorPrimario: "#4f46e5",
        instagramUrl: "https://instagram.com/mitienda",
        tiktokUrl: "https://tiktok.com/@mitienda",
        whatsappUrl: "https://wa.me/56900000000",
        contactoEmail: "hola@mitienda.cl",
      },
    });
    const args = getUpdateArgs()!;
    expect(args.where).toEqual({ id: "A" }); // tenant del acceso
    expect(args.data.descripcion).toBe("Mi tienda");
    expect(args.data.colorPrimario).toBe("#4f46e5");
    // plantilla-rica F02/D2: redes + contacto del footer se persisten.
    expect(args.data.instagramUrl).toBe("https://instagram.com/mitienda");
    expect(args.data.tiktokUrl).toBe("https://tiktok.com/@mitienda");
    expect(args.data.whatsappUrl).toBe("https://wa.me/56900000000");
    expect(args.data.contactoEmail).toBe("hola@mitienda.cl");
    // D4/I6: `logoUrl` NO se escribe por este use case (lo persiste el flujo de subida).
    expect(args.data).not.toHaveProperty("logoUrl");
  });

  // panel.config.guardar.002 — campos vacíos ⇒ null (limpia el valor)
  it("los campos vacíos se guardan como null (no string vacío)", async () => {
    const { db, getUpdateArgs } = fakeDb();
    await guardarConfiguracionTienda({
      db,
      acceso: acceso(["A"]),
      input: {
        descripcion: "",
        colorPrimario: "",
        instagramUrl: "",
        tiktokUrl: "",
        whatsappUrl: "",
        contactoEmail: "",
      },
    });
    const args = getUpdateArgs()!;
    expect(args.data.descripcion).toBeNull();
    expect(args.data.colorPrimario).toBeNull();
    expect(args.data.instagramUrl).toBeNull();
    expect(args.data.tiktokUrl).toBeNull();
    expect(args.data.whatsappUrl).toBeNull();
    expect(args.data.contactoEmail).toBeNull();
  });

  // panel.config.guardar.003 — sin membresía ⇒ FORBIDDEN, no escribe
  it("sin membresía ⇒ FORBIDDEN y no escribe", async () => {
    const { db, getUpdateArgs } = fakeDb();
    await expect(
      guardarConfiguracionTienda({
        db,
        acceso: acceso([]),
        input: {
          descripcion: "x",
          colorPrimario: "",
            instagramUrl: "",
          tiktokUrl: "",
          whatsappUrl: "",
          contactoEmail: "",
        },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getUpdateArgs()).toBeNull();
  });

  // panel.config.guardar.004 — `basesSorteo` YA NO es parte del contrato (admin-bases-pdf F03/D2/D3)
  // Simula un cliente VIEJO (pestaña con el bundle anterior) que sigue mandando el textarea: el
  // campo NO sobrevive al parseo del input (Zod lo descarta por no estar en el schema) y el use case
  // NO escribe la columna. Así el texto legacy no puede resucitar por la puerta de atrás mientras
  // `Tenant.basesSorteo` sigue existiendo en el schema (muere recién en F07).
  it("ya no acepta `basesSorteo`: el input lo descarta y el use case no escribe la columna", async () => {
    const conBases = {
      descripcion: "x",
      colorPrimario: "",
      instagramUrl: "",
      tiktokUrl: "",
      whatsappUrl: "",
      contactoEmail: "",
      basesSorteo: "Bases viejas que ya no van acá",
    };
    const parseado = guardarConfiguracionTiendaInput.parse(conBases);
    expect(parseado).not.toHaveProperty("basesSorteo");

    const { db, getUpdateArgs } = fakeDb();
    await guardarConfiguracionTienda({
      db,
      acceso: acceso(["A"]),
      // `conBases` es una variable (no un literal), así que TS no aplica excess property check:
      // pasa estructuralmente y ejercita exactamente el caso real — un payload con un campo de más.
      input: conBases,
    });
    expect(getUpdateArgs()!.data).not.toHaveProperty("basesSorteo");
  });

  // panel.config.guardar.006 — `colorAcento` se edita en Configuración junto a `colorPrimario` (D12)
  // Decisión del usuario: en el admin los DOS colores de marca se comportan IGUAL — aplican al
  // instante, con el mismo botón Guardar. `Tenant.colorAcento` es una columna (vive FUERA del
  // Documento, I-T1), así que escribirla ES aplicar: el storefront la lee por request. Vacío ⇒ null
  // (degrada a la escala de marca, I-T2); un NO-hex ni siquiera entra (lo frena el borde Zod, misma
  // regex que `colorPrimario` y que `setColorAcentoInput` del editor — las dos puertas a la MISMA
  // columna no pueden discrepar sobre qué es un color válido).
  it("guarda `colorAcento` junto a `colorPrimario`; vacío ⇒ null y un no-hex lo rechaza el borde", async () => {
    const base = {
      descripcion: "",
      instagramUrl: "",
      tiktokUrl: "",
      whatsappUrl: "",
      contactoEmail: "",
    };
    const ok = fakeDb();
    await guardarConfiguracionTienda({
      db: ok.db,
      acceso: acceso(["A"]),
      input: { ...base, colorPrimario: "#4f46e5", colorAcento: "#ffc530" },
    });
    expect(ok.getUpdateArgs()!.data.colorPrimario).toBe("#4f46e5");
    expect(ok.getUpdateArgs()!.data.colorAcento).toBe("#ffc530");

    // Vacío ⇒ null (limpia el acento y vuelve a derivar de la marca).
    const vacio = fakeDb();
    await guardarConfiguracionTienda({
      db: vacio.db,
      acceso: acceso(["A"]),
      input: { ...base, colorPrimario: "", colorAcento: "" },
    });
    expect(vacio.getUpdateArgs()!.data.colorAcento).toBeNull();

    // Basura ⇒ el input NO parsea (nunca llega al use case), igual que `colorPrimario`.
    expect(
      guardarConfiguracionTiendaInput.safeParse({ ...base, colorAcento: "rojo" }).success,
    ).toBe(false);
    expect(
      guardarConfiguracionTiendaInput.safeParse({ ...base, colorAcento: "#ffc530" }).success,
    ).toBe(true);
  });

  // panel.config.guardar.005 — los 4 campos MUERTOS salieron del contrato (admin-bases-pdf F06/D7)
  // `heroTitulo`/`heroSubtitulo`/`heroImageUrl`/`avisoTexto` se editaban en la card «Tu tienda» y NO
  // hacían nada: el storefront lee todo del Documento de Página. Guardaban con toast de éxito y la
  // tienda no cambiaba. Ahora el contrato ni los acepta ni los escribe (mueren como columna en F07).
  it("ya no acepta los 4 campos muertos de «Tu tienda» ni escribe sus columnas", async () => {
    const conMuertos = {
      descripcion: "x",
      colorPrimario: "",
      instagramUrl: "",
      tiktokUrl: "",
      whatsappUrl: "",
      contactoEmail: "",
      heroTitulo: "Título que no hacía nada",
      heroSubtitulo: "Subtítulo que no hacía nada",
      heroImageUrl: "https://pub.r2.dev/A/branding/hero?v=1",
      avisoTexto: "Aviso que no hacía nada",
    };
    const parseado = guardarConfiguracionTiendaInput.parse(conMuertos);
    for (const muerto of ["heroTitulo", "heroSubtitulo", "heroImageUrl", "avisoTexto"]) {
      expect(parseado, muerto).not.toHaveProperty(muerto);
    }

    const { db, getUpdateArgs } = fakeDb();
    await guardarConfiguracionTienda({
      db,
      acceso: acceso(["A"]),
      input: conMuertos,
    });
    const data = getUpdateArgs()!.data;
    for (const muerto of ["heroTitulo", "heroSubtitulo", "heroImageUrl", "avisoTexto"]) {
      expect(data, muerto).not.toHaveProperty(muerto);
    }
  });
});

describe("domain/panel/getConfiguracionTienda (fake db)", () => {
  function fakeDb(tenant: Record<string, unknown> | null) {
    return {
      tenant: {
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
          if (where.id === "A" && tenant) return tenant;
          throw new Error("no encontrado");
        },
      },
    } as unknown as PrismaClient;
  }

  // panel.config.get.001 — devuelve la config del tenant autorizado
  it("devuelve nombre/slug/estado + config de plantilla + redes/contacto del tenant (ya sin bases)", async () => {
    const res = await getConfiguracionTienda({
      db: fakeDb({
        nombre: "Tienda A",
        slug: "a",
        estado: "PUBLICADA",
        descripcion: "desc",
        logoUrl: "https://pub.r2.dev/A/branding/logo?v=1",
        colorPrimario: "#4f46e5",
        colorAcento: "#ffc530",
        instagramUrl: "https://instagram.com/a",
        tiktokUrl: null,
        whatsappUrl: null,
        contactoEmail: "hola@a.cl",
      }),
      acceso: acceso(["A"]),
    });
    expect(res).toMatchObject({
      nombre: "Tienda A",
      slug: "a",
      colorPrimario: "#4f46e5",
      // El form tiene que poder rehidratar el acento, si no «Guardar» lo pisaría con "" ⇒ null (D12).
      colorAcento: "#ffc530",
      instagramUrl: "https://instagram.com/a",
      contactoEmail: "hola@a.cl",
    });
  });

  // panel.config.get.002 — sin membresía ⇒ FORBIDDEN
  it("sin membresía ⇒ FORBIDDEN", async () => {
    await expect(
      getConfiguracionTienda({ db: fakeDb(null), acceso: acceso([]) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
