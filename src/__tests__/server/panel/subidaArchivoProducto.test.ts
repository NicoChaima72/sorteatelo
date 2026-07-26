import { type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { confirmarArchivoProducto } from "~/server/domain/panel/confirmarArchivoProducto";
import { crearUrlSubidaArchivo } from "~/server/domain/panel/crearUrlSubidaArchivo";

/**
 * Tests de la subida GENERALIZADA del archivo de producto (productos-tipos-digitales F02,
 * D1/D7/D9, I4) con `db` FAKE + storage FAKE. Lo que se verifica:
 *
 * - El presign acepta cada MIME de la allowlist y rechaza cualquier otro (incl. `video/*` y
 *   `application/octet-stream`) ANTES de firmar nada.
 * - Tipo y extensión de la key salen del MIME VALIDADO server-side, jamás del nombre que mandó el
 *   cliente; la key siempre bajo el prefijo `<tenantId>/`.
 * - La confirmación exige que el objeto exista Y pese ≤20 MB (`statObject`), y si excede NO
 *   confirma la fila.
 */

interface FilaArchivo {
  id: string;
  tenantId: string;
  productId: string;
  key: string;
  contentType: string;
  tipo: string;
  bytes: number | null;
  nombreArchivo: string;
  confirmadoAt: Date | null;
}

function fakeDb({
  productos,
  archivos = [],
}: {
  productos: {
    id: string;
    tenantId: string;
    modalidad?: "ESTANDAR" | "SOBRE";
    /** No-null ⇒ es un PACK: entrega los archivos de otro y no lleva propios (V-I1d). */
    fuenteId?: string | null;
  }[];
  archivos?: FilaArchivo[];
}) {
  const filas: FilaArchivo[] = [...archivos];
  let seq = 0;
  const borrados: string[] = [];

  const productFile = {
    create: async (args: { data: Record<string, unknown> }) => {
      const fila = {
        id: `f${++seq}`,
        bytes: null,
        confirmadoAt: null,
        ...args.data,
      } as FilaArchivo;
      filas.push(fila);
      return fila;
    },
    findFirst: async (args: {
      where: { id?: string; tenantId?: string; productId?: string };
    }) =>
      filas.find(
        (f) =>
          (args.where.id === undefined || f.id === args.where.id) &&
          (args.where.tenantId === undefined || f.tenantId === args.where.tenantId) &&
          (args.where.productId === undefined || f.productId === args.where.productId),
      ) ?? null,
    // El `where` del fake honra `confirmadoAt: { not: null }` e `id: { not }` porque son
    // EXACTAMENTE las condiciones que el test tiene que poder falsar: sin ellas, el use case
    // borraría la fila que está confirmando (y el bug pasaría desapercibido).
    findMany: async (args: {
      where: {
        productId?: string;
        tenantId?: string;
        confirmadoAt?: { not: null };
        id?: { not: string };
      };
    }) =>
      filas.filter(
        (f) =>
          (args.where.productId === undefined || f.productId === args.where.productId) &&
          (args.where.tenantId === undefined || f.tenantId === args.where.tenantId) &&
          (args.where.confirmadoAt === undefined || f.confirmadoAt !== null) &&
          (args.where.id === undefined || f.id !== args.where.id.not),
      ),
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const fila = filas.find((f) => f.id === args.where.id)!;
      Object.assign(fila, args.data);
      return fila;
    },
    deleteMany: async (args: { where: { id?: { in: string[] } } }) => {
      const ids = args.where.id?.in ?? [];
      for (const id of ids) {
        borrados.push(id);
        const i = filas.findIndex((f) => f.id === id);
        if (i >= 0) filas.splice(i, 1);
      }
      return { count: ids.length };
    },
  };

  const db = {
    product: {
      findFirst: async (args: { where: { id: string; tenantId: string } }) => {
        const p = productos.find(
          (x) => x.id === args.where.id && x.tenantId === args.where.tenantId,
        );
        return p
          ? {
              id: p.id,
              modalidad: p.modalidad ?? "ESTANDAR",
              fuenteId: p.fuenteId ?? null,
            }
          : null;
      },
    },
    productFile,
    // La $tx del fake ejecuta el callback con el mismo cliente (sin aislamiento real: acá lo que
    // se testea es QUÉ escribe el use case, no la atomicidad de Postgres).
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  } as unknown as PrismaClient;

  return { db, filas, borrados };
}

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  tenantIds,
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

function fakeStorage(stat?: { bytes: number; contentType: string } | null) {
  return {
    presignarSubida: vi
      .fn<
        (i: { key: string; contentType: string }) => Promise<string>
      >()
      .mockImplementation(async (i) => `https://r2.example/${i.key}?firma`),
    statObject: vi
      .fn<(key: string) => Promise<{ bytes: number; contentType: string } | null>>()
      .mockResolvedValue(stat === undefined ? { bytes: 1024, contentType: "application/pdf" } : stat),
  };
}

describe("domain/panel/crearUrlSubidaArchivo (allowlist + key derivada del MIME)", () => {
  // productos.subida.001 — cada MIME de la allowlist presigna; el resto se rechaza sin firmar
  it("presigna cada MIME de la allowlist y rechaza el resto ANTES de firmar", async () => {
    const permitidos = [
      "application/pdf",
      "application/epub+zip",
      "image/png",
      "image/jpeg",
      "image/webp",
      "audio/mpeg",
      "audio/mp4",
      "audio/wav",
      "application/zip",
    ];
    for (const contentType of permitidos) {
      const { db } = fakeDb({ productos: [{ id: "p1", tenantId: "A" }] });
      const storage = fakeStorage();
      const res = await crearUrlSubidaArchivo({
        db,
        acceso: acceso(["A"]),
        input: { productId: "p1", contentType, nombreArchivo: "cosa.bin" },
        storage,
      });
      expect(res.url, contentType).toContain("https://r2.example/");
      expect(res.contentType, contentType).toBe(contentType);
    }

    for (const contentType of ["video/mp4", "application/octet-stream", "text/html"]) {
      const { db, filas } = fakeDb({ productos: [{ id: "p1", tenantId: "A" }] });
      const storage = fakeStorage();
      await expect(
        crearUrlSubidaArchivo({
          db,
          acceso: acceso(["A"]),
          input: { productId: "p1", contentType, nombreArchivo: "cosa.bin" },
          storage,
        }),
        contentType,
      ).rejects.toMatchObject({ code: "INVALID" });
      expect(storage.presignarSubida, contentType).not.toHaveBeenCalled();
      expect(filas, contentType).toHaveLength(0); // no persiste una fila fantasma
    }
  });

  // panel.productos.subida.pack.001 — V-I1d (ENMIENDA v2): un PACK no lleva archivos propios,
  // entrega los de su fuente. El rechazo va en el PRESIGN y con eso alcanza: la fila `ProductFile`
  // nace acá (F01), así que sin URL prefirmada no hay después nada que confirmar. Sin este guard un
  // pack acumularía archivos que nadie entrega nunca (la entrega se resuelve por la fuente) y que
  // encima contarían en la cuota de storage del tenant.
  it("subir un archivo a un PACK ⇒ INVALID, sin presignar ni crear la fila", async () => {
    const { db, filas } = fakeDb({
      productos: [{ id: "pack-1", tenantId: "A", fuenteId: "coleccion-1" }],
    });
    const storage = fakeStorage();

    await expect(
      crearUrlSubidaArchivo({
        db,
        acceso: acceso(["A"]),
        input: {
          productId: "pack-1",
          contentType: "application/pdf",
          nombreArchivo: "libro.pdf",
        },
        storage,
      }),
    ).rejects.toMatchObject({ code: "INVALID" });

    expect(storage.presignarSubida).not.toHaveBeenCalled();
    expect(filas).toHaveLength(0);
  });

  // productos.subida.002 — la extensión sale del MIME, NO del nombre del cliente (D9/I4)
  it("deriva la extensión de la key del MIME validado y NUNCA del nombre del cliente, bajo el prefijo del tenant", async () => {
    const { db, filas } = fakeDb({ productos: [{ id: "p1", tenantId: "A" }] });
    const storage = fakeStorage();

    await crearUrlSubidaArchivo({
      db,
      acceso: acceso(["A"]),
      // El cliente miente descaradamente: dice `.exe` y mete un path traversal en el nombre.
      input: {
        productId: "p1",
        contentType: "image/png",
        nombreArchivo: "../../../etc/passwd.exe",
      },
      storage,
    });

    const fila = filas[0]!;
    expect(fila.key).toMatch(/^A\/p1\/[0-9a-f]+\.png$/); // prefijo del tenant + ext del MIME
    expect(fila.key).not.toContain(".exe");
    expect(fila.key).not.toContain("..");
    expect(fila.contentType).toBe("image/png");
    expect(fila.tipo).toBe("IMAGEN");
    expect(fila.confirmadoAt).toBeNull(); // nace PENDIENTE: no es entregable hasta confirmar
    // El nombre visible queda saneado y con la extensión del MIME, no la del cliente.
    expect(fila.nombreArchivo).not.toContain("/");
    expect(fila.nombreArchivo.endsWith(".png")).toBe(true);
    // Se firma exactamente esa key con ese content-type.
    expect(storage.presignarSubida).toHaveBeenCalledWith({
      key: fila.key,
      contentType: "image/png",
    });
  });

  // productos.subida.003 — producto ajeno ⇒ NOT_FOUND sin presignar ni persistir (I1)
  it("un producto de OTRA Tienda ⇒ NOT_FOUND, sin presignar ni persistir", async () => {
    const { db, filas } = fakeDb({ productos: [{ id: "pB", tenantId: "B" }] });
    const storage = fakeStorage();
    await expect(
      crearUrlSubidaArchivo({
        db,
        acceso: acceso(["A"]),
        input: { productId: "pB", contentType: "application/pdf", nombreArchivo: "x.pdf" },
        storage,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.presignarSubida).not.toHaveBeenCalled();
    expect(filas).toHaveLength(0);
  });
});

describe("domain/panel/confirmarArchivoProducto (headObject + límite de 20 MB)", () => {
  const filaPendiente = (over?: Partial<FilaArchivo>): FilaArchivo => ({
    id: "f1",
    tenantId: "A",
    productId: "p1",
    key: "A/p1/abc123.pdf",
    contentType: "application/pdf",
    tipo: "PDF",
    bytes: null,
    nombreArchivo: "guia.pdf",
    confirmadoAt: null,
    ...over,
  });

  // productos.subida.004 — objeto presente y dentro del límite ⇒ confirma y persiste el peso
  it("con el objeto presente y ≤20 MB confirma la fila y persiste el peso real", async () => {
    const { db, filas } = fakeDb({
      productos: [{ id: "p1", tenantId: "A" }],
      archivos: [filaPendiente()],
    });
    const storage = fakeStorage({ bytes: 5 * 1024 * 1024, contentType: "application/pdf" });

    const res = await confirmarArchivoProducto({
      db,
      acceso: acceso(["A"]),
      input: { fileId: "f1" },
      storage,
    });

    expect(storage.statObject).toHaveBeenCalledWith("A/p1/abc123.pdf");
    expect(res.confirmado).toBe(true);
    expect(filas[0]?.confirmadoAt).not.toBeNull();
    expect(filas[0]?.bytes).toBe(5 * 1024 * 1024);
  });

  // productos.subida.005 — >20 MB ⇒ rechazo con el peso en el mensaje y la fila NO queda confirmada
  it("rechaza un objeto de más de 20 MB, no confirma la fila y dice cuánto pesa", async () => {
    const { db, filas } = fakeDb({
      productos: [{ id: "p1", tenantId: "A" }],
      archivos: [filaPendiente()],
    });
    // 23,4 MB y no 23 exactos a propósito: así el mensaje ejerce el decimal, que es la parte
    // informativa del peso. El caso redondo lo cubre `productos.tipos.007`/`.008` en el módulo puro.
    const storage = fakeStorage({ bytes: 24_500_000, contentType: "application/pdf" });

    await expect(
      confirmarArchivoProducto({
        db,
        acceso: acceso(["A"]),
        input: { fileId: "f1" },
        storage,
      }),
    ).rejects.toMatchObject({
      code: "INVALID",
      message: expect.stringContaining("23,4 MB") as string,
    });

    expect(filas[0]?.confirmadoAt).toBeNull(); // sigue NO entregable
    expect(filas[0]?.bytes).toBeNull();
  });

  // productos.subida.006 — objeto ausente ⇒ INVALID y NO confirma
  it("con el objeto ausente en R2 ⇒ INVALID y la fila NO queda confirmada", async () => {
    const { db, filas } = fakeDb({
      productos: [{ id: "p1", tenantId: "A" }],
      archivos: [filaPendiente()],
    });
    const storage = fakeStorage(null);

    await expect(
      confirmarArchivoProducto({
        db,
        acceso: acceso(["A"]),
        input: { fileId: "f1" },
        storage,
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(filas[0]?.confirmadoAt).toBeNull();
  });

  // productos.subida.007 — ESTANDAR conserva UN solo archivo confirmado (invariante de use case)
  it("en un producto ESTANDAR, confirmar un archivo nuevo reemplaza al anterior (queda 1 solo)", async () => {
    const anterior: FilaArchivo = {
      id: "f0",
      tenantId: "A",
      productId: "p1",
      key: "A/p1/viejo.pdf",
      contentType: "application/pdf",
      tipo: "PDF",
      bytes: 100,
      nombreArchivo: "viejo.pdf",
      confirmadoAt: new Date("2026-01-01"),
    };
    const { db, filas, borrados } = fakeDb({
      productos: [{ id: "p1", tenantId: "A", modalidad: "ESTANDAR" }],
      archivos: [anterior, filaPendiente()],
    });
    const storage = fakeStorage({ bytes: 2048, contentType: "application/pdf" });

    await confirmarArchivoProducto({
      db,
      acceso: acceso(["A"]),
      input: { fileId: "f1" },
      storage,
    });

    expect(borrados).toEqual(["f0"]);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.id).toBe("f1");
  });

  // productos.subida.008 — un archivo de OTRA Tienda ⇒ NOT_FOUND sin tocar el storage (I1)
  it("un archivo de OTRA Tienda ⇒ NOT_FOUND y no consulta el storage", async () => {
    const { db } = fakeDb({
      productos: [{ id: "pB", tenantId: "B" }],
      archivos: [filaPendiente({ id: "fB", tenantId: "B", productId: "pB" })],
    });
    const storage = fakeStorage();
    await expect(
      confirmarArchivoProducto({
        db,
        acceso: acceso(["A"]),
        input: { fileId: "fB" },
        storage,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.statObject).not.toHaveBeenCalled();
  });
});
