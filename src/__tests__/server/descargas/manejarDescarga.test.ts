import { describe, expect, it, vi } from "vitest";

import {
  type BuscarGrantPorToken,
  type GrantParaDescarga,
  manejarDescarga,
  type PresignarDescargaFn,
} from "~/server/descargas/manejarDescarga";

/**
 * Núcleo del endpoint público de descarga por token (F03/D5). El repo de grants y el presigner
 * se inyectan como fakes (sin DB ni R2). Verifican la POLÍTICA: gate de método, 302 con la URL
 * prefirmada, y —CRÍTICO— la respuesta 404 NEUTRAL IDÉNTICA ante token inexistente / expirado /
 * archivo pendiente (I3), la defensa de prefijo I9, y que el núcleo no loguea nada sensible (I4).
 *
 * Generalizado por productos-tipos-digitales F03: el grant ya no trae `{ pdfPath, titulo }` sino el
 * ARCHIVO ya resuelto (key + contentType + nombre), así que el núcleo sirve cualquier tipo de la
 * allowlist con el content-type correcto y la defensa I9 intacta.
 */

const AHORA = new Date("2026-07-17T12:00:00Z");

function grant(over: Partial<GrantParaDescarga> = {}): GrantParaDescarga {
  return {
    tenantId: "tenantA",
    archivo: {
      key: "tenantA/prod1.pdf",
      contentType: "application/pdf",
      nombreArchivo: "Cómo enriquecer a tu idol.pdf",
    },
    expiresAt: new Date("2026-08-01T00:00:00Z"), // futuro respecto de AHORA
    ...over,
  };
}

function reqGet(token?: string): { method: string; query: Record<string, string> } {
  return { method: "GET", query: token === undefined ? {} : { token } };
}

const presignOk: PresignarDescargaFn = vi
  .fn<PresignarDescargaFn>()
  .mockResolvedValue("https://r2.example/signed-get-url");

describe("descargas/manejarDescarga — núcleo del endpoint de descarga", () => {
  // descargas.302 — grant vigente + PDF subido ⇒ 302 a la URL prefirmada
  it("con un grant vigente y PDF subido devuelve 302 con Location = URL prefirmada", async () => {
    const presignarDescarga = vi
      .fn<PresignarDescargaFn>()
      .mockResolvedValue("https://r2.example/firmada-10min");
    const buscarGrant = vi
      .fn<BuscarGrantPorToken>()
      .mockResolvedValue(grant());

    const res = await manejarDescarga({
      req: reqGet("tok-valido"),
      buscarGrant,
      presignarDescarga,
      ahora: AHORA,
    });

    expect(res.status).toBe(302);
    expect(res.headers?.Location).toBe("https://r2.example/firmada-10min");
    expect(res.headers?.["Cache-Control"]).toContain("no-store");
    // presigna la key del grant, con el filename derivado del título (saneado, S8)
    expect(presignarDescarga).toHaveBeenCalledWith({
      key: "tenantA/prod1.pdf",
      nombreArchivo: "Cómo enriquecer a tu idol.pdf",
      contentType: "application/pdf",
    });
  });

  // descargas.tipos.001 — F03: un tipo NUEVO se sirve con SU content-type y SU nombre, no como PDF
  it("sirve un archivo de tipo nuevo (MP3, imagen, ZIP) con el content-type y el nombre correctos", async () => {
    const casos = [
      { key: "tenantA/p1/aa.mp3", contentType: "audio/mpeg", nombreArchivo: "cancion.mp3" },
      { key: "tenantA/p1/bb.png", contentType: "image/png", nombreArchivo: "sticker.png" },
      { key: "tenantA/p1/cc.zip", contentType: "application/zip", nombreArchivo: "pack.zip" },
      { key: "tenantA/p1/dd.epub", contentType: "application/epub+zip", nombreArchivo: "libro.epub" },
    ];

    for (const archivo of casos) {
      const presignarDescarga = vi
        .fn<PresignarDescargaFn>()
        .mockResolvedValue("https://r2.example/firmada");
      const buscarGrant = vi
        .fn<BuscarGrantPorToken>()
        .mockResolvedValue(grant({ archivo }));

      const res = await manejarDescarga({
        req: reqGet("tok-valido"),
        buscarGrant,
        presignarDescarga,
        ahora: AHORA,
      });

      expect(res.status, archivo.contentType).toBe(302);
      // El tipo REAL viaja al presigner (⇒ `ResponseContentType`): nada se sirve como PDF.
      expect(presignarDescarga, archivo.contentType).toHaveBeenCalledWith(archivo);
    }
  });

  // descargas.tipos.002 — F03: la defensa I9 no se debilita al generalizar el tipo
  it("defensa I9 intacta para los tipos nuevos: key de otro tenant ⇒ 404 neutral sin presignar", async () => {
    const presignarDescarga = vi.fn<PresignarDescargaFn>();
    const buscarGrant = vi.fn<BuscarGrantPorToken>().mockResolvedValue(
      grant({
        tenantId: "tenantA",
        archivo: {
          key: "tenantB/p9/robado.mp3",
          contentType: "audio/mpeg",
          nombreArchivo: "robado.mp3",
        },
      }),
    );

    const res = await manejarDescarga({
      req: reqGet("tok-valido"),
      buscarGrant,
      presignarDescarga,
      ahora: AHORA,
    });

    expect(res.status).toBe(404);
    expect(res.body).toBe("No encontrado."); // idéntico al resto de los fallos (I3)
    expect(presignarDescarga).not.toHaveBeenCalled();
  });

  // descargas.404.neutral — token inexistente, expirado y PDF pendiente ⇒ MISMA respuesta 404
  it("token inexistente, grant expirado y PDF pendiente devuelven la MISMA respuesta 404 neutral", async () => {
    const inexistente = await manejarDescarga({
      req: reqGet("no-existe"),
      buscarGrant: vi.fn<BuscarGrantPorToken>().mockResolvedValue(null),
      presignarDescarga: presignOk,
      ahora: AHORA,
    });
    const expirado = await manejarDescarga({
      req: reqGet("tok-expirado"),
      buscarGrant: vi
        .fn<BuscarGrantPorToken>()
        .mockResolvedValue(grant({ expiresAt: new Date("2026-07-01T00:00:00Z") })),
      presignarDescarga: presignOk,
      ahora: AHORA,
    });
    const pendiente = await manejarDescarga({
      req: reqGet("tok-sin-pdf"),
      buscarGrant: vi
        .fn<BuscarGrantPorToken>()
        .mockResolvedValue(grant({ archivo: null })),
      presignarDescarga: presignOk,
      ahora: AHORA,
    });

    // Los tres son EXACTAMENTE iguales (status + body): indistinguibles (I3).
    expect(inexistente).toEqual({ status: 404, body: "No encontrado." });
    expect(expirado).toEqual(inexistente);
    expect(pendiente).toEqual(inexistente);
  });

  // descargas.405 — método ≠ GET ⇒ 405 sin efecto
  it("responde 405 sin presignar ni buscar el grant si el método no es GET", async () => {
    const buscarGrant = vi.fn<BuscarGrantPorToken>().mockResolvedValue(grant());
    const presignarDescarga = vi
      .fn<PresignarDescargaFn>()
      .mockResolvedValue("no-deberia");

    const res = await manejarDescarga({
      req: { method: "POST", query: { token: "t" } },
      buscarGrant,
      presignarDescarga,
      ahora: AHORA,
    });

    expect(res.status).toBe(405);
    expect(buscarGrant).not.toHaveBeenCalled();
    expect(presignarDescarga).not.toHaveBeenCalled();
  });

  // descargas.i9 — key fuera del prefijo del tenant ⇒ 404 neutral, jamás presigna
  it("defensa I9: un grant cuya key no empieza con `<tenantId>/` ⇒ 404 neutral, sin presignar", async () => {
    const presignarDescarga = vi
      .fn<PresignarDescargaFn>()
      .mockResolvedValue("no-deberia");
    // La key apunta a OTRO tenant: jamás debe presignarse (aunque la FK lo impida).
    const buscarGrant = vi
      .fn<BuscarGrantPorToken>()
      .mockResolvedValue(
        grant({
          tenantId: "tenantA",
          archivo: {
            key: "tenantB/prod9.pdf",
            contentType: "application/pdf",
            nombreArchivo: "ajeno.pdf",
          },
        }),
      );

    const res = await manejarDescarga({
      req: reqGet("tok-cruzado"),
      buscarGrant,
      presignarDescarga,
      ahora: AHORA,
    });

    expect(res).toEqual({ status: 404, body: "No encontrado." });
    expect(presignarDescarga).not.toHaveBeenCalled();
  });

  // descargas.no-log — el núcleo no loguea token, path ni email en ningún camino
  it("no loguea nada (ni token ni path) en el camino feliz ni en el 404", async () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];

    await manejarDescarga({
      req: reqGet("tok-secreto-123"),
      buscarGrant: vi.fn<BuscarGrantPorToken>().mockResolvedValue(grant()),
      presignarDescarga: presignOk,
      ahora: AHORA,
    });
    await manejarDescarga({
      req: reqGet("otro-token"),
      buscarGrant: vi.fn<BuscarGrantPorToken>().mockResolvedValue(null),
      presignarDescarga: presignOk,
      ahora: AHORA,
    });

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  // descargas.sobre.001 — F09: `?archivo=<fileId>` SELECCIONA dentro de lo ya autorizado por el
  // token. Es el mecanismo con el que la página de entrega baja cada archivo de un sobre.
  it("con ?archivo=<fileId> sirve ESE archivo de los que el grant autoriza", async () => {
    const presignarDescarga = vi
      .fn<PresignarDescargaFn>()
      .mockResolvedValue("https://r2.example/firmada");
    const buscarGrant = vi.fn<BuscarGrantPorToken>().mockResolvedValue(
      grant({
        archivo: {
          key: "tenantA/prod1/aaa.png",
          contentType: "image/png",
          nombreArchivo: "sticker-1.png",
        },
        archivosPorId: {
          "file-1": {
            key: "tenantA/prod1/aaa.png",
            contentType: "image/png",
            nombreArchivo: "sticker-1.png",
          },
          "file-2": {
            key: "tenantA/prod1/bbb.mp3",
            contentType: "audio/mpeg",
            nombreArchivo: "audio-2.mp3",
          },
        },
      }),
    );

    const res = await manejarDescarga({
      req: { method: "GET", query: { token: "t", archivo: "file-2" } },
      buscarGrant,
      presignarDescarga,
      ahora: AHORA,
    });

    expect(res.status).toBe(302);
    // Se firmó el SEGUNDO, con SU content-type y SU nombre — no el primero por defecto.
    expect(presignarDescarga).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "tenantA/prod1/bbb.mp3",
        contentType: "audio/mpeg",
      }),
    );
  });

  // descargas.sobre.002 — el id SELECCIONA, NO autoriza: un archivo del pool que no le tocó a esta
  // orden (o de otra orden/Tienda) no está en el conjunto del grant ⇒ 404 neutral, sin presignar.
  // Es la defensa que impide que el comprador de UN sticker se baje la colección entera cambiando
  // un id en la URL.
  it("con un ?archivo= que el grant NO autoriza devuelve 404 neutral y no presigna nada", async () => {
    const presignarDescarga = vi.fn<PresignarDescargaFn>();
    const buscarGrant = vi.fn<BuscarGrantPorToken>().mockResolvedValue(
      grant({
        archivo: {
          key: "tenantA/prod1/aaa.png",
          contentType: "image/png",
          nombreArchivo: "sticker-1.png",
        },
        archivosPorId: {
          "file-1": {
            key: "tenantA/prod1/aaa.png",
            contentType: "image/png",
            nombreArchivo: "sticker-1.png",
          },
        },
      }),
    );

    const res = await manejarDescarga({
      req: { method: "GET", query: { token: "t", archivo: "file-del-pool-que-no-toco" } },
      buscarGrant,
      presignarDescarga,
      ahora: AHORA,
    });

    // El MISMO 404 que un token inexistente o vencido (I3): no se puede sondear qué existe.
    expect(res.status).toBe(404);
    expect(res.body).toBe("No encontrado.");
    expect(presignarDescarga).not.toHaveBeenCalled();
  });

  // descargas.sobre.003 — CERO REGRESIÓN: sin `?archivo=` se sirve el primero, como siempre
  it("sin ?archivo= sigue sirviendo el primer archivo autorizado (comportamiento de siempre)", async () => {
    const presignarDescarga = vi
      .fn<PresignarDescargaFn>()
      .mockResolvedValue("https://r2.example/firmada");

    const res = await manejarDescarga({
      req: reqGet("t"),
      buscarGrant: vi.fn<BuscarGrantPorToken>().mockResolvedValue(grant()),
      presignarDescarga,
      ahora: AHORA,
    });

    expect(res.status).toBe(302);
    expect(presignarDescarga).toHaveBeenCalledWith(
      expect.objectContaining({ key: "tenantA/prod1.pdf" }),
    );
  });
});
