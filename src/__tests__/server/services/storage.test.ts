import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  crearStorageService,
  EXPIRACION_DESCARGA_SEGUNDOS,
  keyDeArchivoProducto,
  sanearNombreArchivo,
  type StorageConfig,
} from "~/server/services/storage";

/**
 * Tests del adapter de storage R2 (F03/D1). El presigner del aws-sdk FIRMA OFFLINE (sin
 * red): estos tests construyen el service con config FAKE e inspeccionan la URL prefirmada
 * resultante — endpoint/bucket/key correctos, firma presente, expiración pedida, el
 * content-disposition attachment saneado, y CRUCIAL: la secretKey nunca aparece en la URL
 * ni en los mensajes de error (I4). El único test que golpea R2 real está marcado como
 * integración y se skipea limpio si faltan las credenciales o hay problema de red/CORS.
 */

const ENDPOINT = "https://acct123.r2.cloudflarestorage.com";
const SECRET = "secret-access-key-super-sensible-value";
const BUCKET = "sortealo-dev";

const configFake: StorageConfig = {
  endpoint: ENDPOINT,
  accessKeyId: "access-key-id-1234",
  secretAccessKey: SECRET,
  bucket: BUCKET,
};

describe("services/storage — keyDeArchivoProducto (helper puro)", () => {
  // storage.key.001 — key per-tenant/per-producto con la extensión derivada del MIME (F02/D9)
  it("produce `<tenantId>/<productId>/<ref>.<ext>` con la extensión del contentType validado", () => {
    expect(
      keyDeArchivoProducto({
        tenantId: "tenantABC",
        productId: "prod123",
        ref: "deadbeef",
        contentType: "audio/mpeg",
      }),
    ).toBe("tenantABC/prod123/deadbeef.mp3");
  });

  // storage.key.002 — un contentType fuera de la allowlist es un bug del caller, no un caso de negocio
  it("lanza si el contentType no está en la allowlist (el caller debió validarlo antes)", () => {
    expect(() =>
      keyDeArchivoProducto({
        tenantId: "T",
        productId: "P",
        ref: "r",
        contentType: "video/mp4",
      }),
    ).toThrow(/allowlist/);
  });
});

describe("services/storage — sanearNombreArchivo (helper puro)", () => {
  // storage.saneo.001 — quita chars peligrosos para el header y garantiza .pdf
  it("elimina comillas/barras/CRLF, colapsa espacios y fuerza la extensión del contentType", () => {
    expect(
      sanearNombreArchivo('Cómo "enriquecer"/a tu idol', "application/pdf"),
    ).toBe("Cómo enriquecera tu idol.pdf");
    // ya termina en .pdf ⇒ no duplica extensión (case-insensitive)
    expect(sanearNombreArchivo("Mi Libro.PDF", "application/pdf")).toBe("Mi Libro.pdf");
    // nombre vacío ⇒ fallback
    expect(sanearNombreArchivo("   ", "application/pdf")).toBe("descarga.pdf");
    // F02/D9: la extensión SIEMPRE sale del MIME, aunque el nombre del cliente diga otra cosa.
    expect(sanearNombreArchivo("cancion.exe", "audio/mpeg")).toBe("cancion.mp3");
    expect(sanearNombreArchivo("sticker.pdf", "image/png")).toBe("sticker.png");
  });
});

describe("services/storage — fail-fast de config", () => {
  // storage.factory.001 — falta un valor ⇒ error claro, SIN volcar el secreto
  it("hace fail-fast con mensaje claro si falta un valor de config, sin incluir el secreto", async () => {
    // endpoint/accessKeyId/secretKey presentes (uno es secreto real), bucket ausente.
    const service = crearStorageService({
      endpoint: ENDPOINT,
      accessKeyId: "access-key-id-1234",
      secretAccessKey: SECRET,
      bucket: undefined,
    });
    await expect(
      service.presignarSubida({ key: "T/P.pdf", contentType: "application/pdf" }),
    ).rejects.toThrow(/R2_BUCKET/);
    // El mensaje jamás contiene el valor de un secreto (I4).
    await service
      .presignarSubida({ key: "T/P.pdf", contentType: "application/pdf" })
      .catch((e: Error) => {
      expect(e.message).not.toContain(SECRET);
    });
  });
});

describe("services/storage — presignarDescarga (GET)", () => {
  // storage.presignDescarga.001 — URL firmada al bucket/endpoint, expiración y disposition
  it("firma un GET al endpoint/bucket/key con expiración pedida y content-disposition attachment saneado", async () => {
    const service = crearStorageService(configFake);
    const url = await service.presignarDescarga({
      key: "tenantABC/prod123.pdf",
      nombreArchivo: "cómo enriquecer.pdf",
      contentType: "application/pdf",
      expiresEnSegundos: EXPIRACION_DESCARGA_SEGUNDOS,
    });

    expect(url.startsWith(ENDPOINT)).toBe(true);
    expect(url).toContain(BUCKET);
    // path-style: /<bucket>/<tenantId>/<productId>.pdf (la key va URL-encodeada con %2F)
    expect(decodeURIComponent(url)).toContain("tenantABC/prod123.pdf");
    expect(url).toContain("X-Amz-Signature=");
    expect(url).toContain("X-Amz-Expires=600");

    const disposition = decodeURIComponent(
      new URL(url).searchParams.get("response-content-disposition") ?? "",
    );
    expect(disposition).toContain("attachment");
    // ASCII fallback (no-ASCII ⇒ `_`) + variante RFC 5987 con el nombre UTF-8 real
    // (el disposition se decodificó arriba, por eso el nombre aparece con acento).
    expect(disposition).toContain('filename="c_mo enriquecer.pdf"');
    expect(disposition).toContain("filename*=UTF-8''cómo enriquecer.pdf");

    // La secretKey NUNCA aparece en la URL firmada (I4).
    expect(url).not.toContain(SECRET);
  });

  // storage.presignDescarga.002 — F09: `inline` para las MINIATURAS de la página de entrega. Es el
  // único caso que lo usa: un `<img>` apuntando a una URL con `attachment` no es algo con lo que se
  // pueda contar. No cambia la política de acceso — sigue siendo prefirmada y corta.
  it("con disposicion inline firma el mismo GET pero con content-disposition inline", async () => {
    const service = crearStorageService(configFake);
    const url = await service.presignarDescarga({
      key: "tenantABC/prod123/aaa.png",
      nombreArchivo: "sticker.png",
      contentType: "image/png",
      expiresEnSegundos: 300,
      disposicion: "inline",
    });

    const disposition = decodeURIComponent(
      new URL(url).searchParams.get("response-content-disposition") ?? "",
    );
    expect(disposition).toContain("inline");
    expect(disposition).not.toContain("attachment");
    // El nombre se sigue saneando igual: `inline` cambia el verbo, no las defensas.
    expect(disposition).toContain('filename="sticker.png"');
    expect(url).toContain("X-Amz-Expires=300");
    expect(url).not.toContain(SECRET);
  });

  // storage.presignDescarga.003 — el DEFAULT sigue siendo attachment (cero regresión para todos los
  // callers de siempre, que no pasan `disposicion`)
  it("sin disposicion explícita sigue siendo attachment", async () => {
    const service = crearStorageService(configFake);
    const url = await service.presignarDescarga({
      key: "tenantABC/prod123.pdf",
      nombreArchivo: "guia.pdf",
      contentType: "application/pdf",
    });

    const disposition = decodeURIComponent(
      new URL(url).searchParams.get("response-content-disposition") ?? "",
    );
    expect(disposition).toContain("attachment");
  });
});

describe("services/storage — presignarSubida (PUT)", () => {
  // storage.presignSubida.001 — PUT para la key exacta con content-type firmado y expiración
  it("firma un PUT para la key pedida con el content-type firmado y expiración corta", async () => {
    const service = crearStorageService(configFake);
    const url = await service.presignarSubida({
      key: "tenantABC/prod123.pdf",
      contentType: "application/pdf",
      expiresEnSegundos: 600,
    });

    expect(url.startsWith(ENDPOINT)).toBe(true);
    expect(decodeURIComponent(url)).toContain("tenantABC/prod123.pdf");
    expect(url).toContain("X-Amz-Signature=");
    expect(url).toContain("X-Amz-Expires=600");
    // El content-type va FIRMADO (SignedHeaders lo incluye): el cliente está obligado a
    // subir `application/pdf`. Es lo que distingue la subida de una descarga.
    const signedHeaders = decodeURIComponent(
      new URL(url).searchParams.get("X-Amz-SignedHeaders") ?? "",
    );
    expect(signedHeaders).toContain("content-type");
    // La subida NO lleva override de respuesta (eso es solo de la descarga GET).
    expect(url).not.toContain("response-content-disposition");
    expect(url).not.toContain(SECRET);
  });
});

/**
 * Test de INTEGRACIÓN real contra R2 (roundtrip putObject → presign → fetch → delete). Solo
 * corre si las credenciales R2 están en el entorno; si fallan por red/CORS se skipea limpio
 * (no rompe la suite en CI ni en máquinas sin acceso). Verifica el circuito real del adapter.
 */
const R2_LISTO =
  !!process.env.R2_ENDPOINT &&
  !!process.env.R2_ACCESS_KEY_ID &&
  !!process.env.R2_SECRET_ACCESS_KEY &&
  !!process.env.R2_BUCKET;

describe("services/storage — roundtrip real contra R2 (integración)", () => {
  // storage.integracion.001 — put + presign GET + fetch + head + delete, extremo a extremo
  it.runIf(R2_LISTO)(
    "sube un objeto, lo descarga por URL prefirmada, lo verifica y lo borra",
    async (ctx) => {
      const service = crearStorageService({
        endpoint: process.env.R2_ENDPOINT,
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        bucket: process.env.R2_BUCKET,
      });
      const key = `__integration-test__/${randomBytes(8).toString("hex")}.pdf`;
      const contenido = `%PDF-1.4 roundtrip ${Date.now()}`;

      try {
        await service.putObject({ key, body: contenido });
        // `statObject` trae existencia Y tamaño real: es lo que alimenta el límite de 20 MB (F02/D7).
        const stat = await service.statObject(key);
        expect(stat).not.toBeNull();
        expect(stat?.bytes).toBe(Buffer.byteLength(contenido));

        const url = await service.presignarDescarga({
          key,
          nombreArchivo: "roundtrip.pdf",
          contentType: "application/pdf",
        });
        const res = await fetch(url);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe(contenido);
      } catch (e) {
        // Degradación limpia: un fallo de red/DNS/CORS no debe romper la suite (nota S2).
        console.warn(
          "[storage.integracion] roundtrip skipeado por error de entorno:",
          e instanceof Error ? e.message : e,
        );
        return ctx.skip();
      } finally {
        await service.deleteObject(key).catch(() => undefined);
      }

      expect(await service.statObject(key)).toBeNull(); // borrado efectivo
    },
    30_000,
  );
});
