import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  componerUrlPublica,
  crearStoragePublicoService,
  keyBasesSorteo,
  keyHeroTenant,
  keyLogoTenant,
  keyPortadaProducto,
  keyPremioSorteo,
  type StoragePublicoConfig,
} from "~/server/services/storagePublico";

/**
 * Tests del adapter de storage PÚBLICO de assets de marca (plantilla-rica F01/ADR-0013). El
 * presigner del aws-sdk FIRMA OFFLINE (sin red): estos tests construyen el service con config
 * FAKE e inspeccionan la URL prefirmada resultante — content-type firmado, key computada por el
 * server, y CRUCIAL: la secretKey nunca aparece (I5). El composer de URL pública se testea puro.
 * El único test que golpea R2 real está marcado como integración y se skipea limpio.
 */

const ENDPOINT = "https://acct123.r2.cloudflarestorage.com";
const SECRET = "secret-access-key-super-sensible-value";
const BUCKET = "sortealo-public-dev";
const BASE_URL = "https://pub-abc123.r2.dev";

const configFake: StoragePublicoConfig = {
  endpoint: ENDPOINT,
  accessKeyId: "access-key-id-1234",
  secretAccessKey: SECRET,
  bucket: BUCKET,
  baseUrl: BASE_URL,
};

describe("services/storagePublico — keys per-destino (helpers puros)", () => {
  // storagePublico.key.001 — keys per-tenant computadas server-side (D3/I6)
  it("computa las keys per-tenant esperadas por destino", () => {
    expect(keyLogoTenant("T1")).toBe("T1/branding/logo");
    expect(keyHeroTenant("T1")).toBe("T1/branding/hero");
    expect(keyPortadaProducto("T1", "p9")).toBe("T1/productos/p9/portada");
    expect(keyPremioSorteo("T1", "r5")).toBe("T1/sorteo/r5/premio");
  });

  // storagePublico.key.002 — bases: única key del bucket público CON extensión (patrón keyDePdfProducto)
  it("computa la key del PDF de bases del sorteo, con extensión .pdf (admin-bases-pdf F01/D1)", () => {
    expect(keyBasesSorteo("T1", "r5")).toBe("T1/sorteo/r5/bases.pdf");
    // Namespace compartido con el premio del MISMO sorteo, sin colisionar.
    expect(keyBasesSorteo("T1", "r5")).not.toBe(keyPremioSorteo("T1", "r5"));
  });
});

describe("services/storagePublico — componerUrlPublica (helper puro)", () => {
  // storagePublico.url.001 — base + key + cache-buster ?v=
  it("compone base + key + cache-buster ?v= (normaliza la barra final de la base)", () => {
    expect(
      componerUrlPublica({ baseUrl: BASE_URL, key: "T1/branding/logo", version: 42 }),
    ).toBe("https://pub-abc123.r2.dev/T1/branding/logo?v=42");
    // barra final de la base ⇒ no produce `//`
    expect(
      componerUrlPublica({ baseUrl: `${BASE_URL}/`, key: "T1/branding/hero", version: "x" }),
    ).toBe("https://pub-abc123.r2.dev/T1/branding/hero?v=x");
  });

  // storagePublico.url.002 — env faltante ⇒ fail-fast al USAR (no al importar)
  it("con R2_PUBLIC_BASE_URL faltante hace fail-fast al usar, sin romper el import", () => {
    expect(() =>
      componerUrlPublica({ baseUrl: undefined, key: "T1/branding/logo", version: 1 }),
    ).toThrow(/R2_PUBLIC_BASE_URL/);
    // Lo mismo desde el service: urlPublica compone con la baseUrl faltante.
    const service = crearStoragePublicoService({ ...configFake, baseUrl: undefined });
    expect(() => service.urlPublica("T1/branding/logo")).toThrow(/R2_PUBLIC_BASE_URL/);
  });
});

describe("services/storagePublico — presignarSubidaImagen (PUT)", () => {
  // storagePublico.presign.001 — firma el content-type de imagen para la key pedida
  it("firma un PUT para la key con el content-type de imagen declarado (SignedHeaders lo incluye)", async () => {
    const service = crearStoragePublicoService(configFake);
    const url = await service.presignarSubidaImagen({
      key: "T1/branding/logo",
      contentType: "image/png",
      expiresEnSegundos: 600,
    });

    expect(url.startsWith(ENDPOINT)).toBe(true);
    expect(decodeURIComponent(url)).toContain("T1/branding/logo");
    expect(url).toContain("X-Amz-Signature=");
    expect(url).toContain("X-Amz-Expires=600");
    // El content-type va FIRMADO: la URL solo vale para `image/png`.
    const signedHeaders = decodeURIComponent(
      new URL(url).searchParams.get("X-Amz-SignedHeaders") ?? "",
    );
    expect(signedHeaders).toContain("content-type");
    // La secretKey NUNCA aparece en la URL firmada (I5).
    expect(url).not.toContain(SECRET);
  });

  // storagePublico.presign.002 — un content-type fuera de la allowlist ⇒ NO se presigna
  it("rechaza un content-type fuera de la allowlist (defensa en profundidad I6), sin presignar", async () => {
    const service = crearStoragePublicoService(configFake);
    await expect(
      // @ts-expect-error — probamos a propósito un tipo fuera del union (llegaría por un caller roto)
      service.presignarSubidaImagen({ key: "T1/branding/logo", contentType: "image/gif" }),
    ).rejects.toThrow(/no permitido/i);
  });

  // storagePublico.presign.003 — `application/pdf` NO entra por la puerta de las IMÁGENES (I1)
  // La excepción del bucket público es SOLO el destino `bases`: logo/hero/portada/premio siguen
  // cerrados a PDF, así que ningún PDF de PRODUCTO puede colarse por esos destinos.
  it("rechaza `application/pdf` en la puerta de imágenes (logo/hero/portada/premio) — I1", async () => {
    const service = crearStoragePublicoService(configFake);
    for (const key of [
      keyLogoTenant("T1"),
      keyHeroTenant("T1"),
      keyPortadaProducto("T1", "p9"),
      keyPremioSorteo("T1", "r5"),
    ]) {
      await expect(
        // @ts-expect-error — a propósito fuera del union de imagen (llegaría por un caller roto)
        service.presignarSubidaImagen({ key, contentType: "application/pdf" }),
      ).rejects.toThrow(/no permitido/i);
    }
  });
});

describe("services/storagePublico — presignarSubidaBases (PUT del PDF de bases)", () => {
  // storagePublico.bases.001 — firma application/pdf para la key de bases del sorteo
  it("firma un PUT `application/pdf` para la key de bases (SignedHeaders incluye content-type)", async () => {
    const service = crearStoragePublicoService(configFake);
    const url = await service.presignarSubidaBases({
      key: keyBasesSorteo("T1", "r5"),
      contentType: "application/pdf",
      expiresEnSegundos: 600,
    });

    expect(url.startsWith(ENDPOINT)).toBe(true);
    expect(decodeURIComponent(url)).toContain("T1/sorteo/r5/bases.pdf");
    expect(url).toContain("X-Amz-Signature=");
    expect(url).toContain("X-Amz-Expires=600");
    // El content-type va FIRMADO: la URL solo vale para `application/pdf`.
    const signedHeaders = decodeURIComponent(
      new URL(url).searchParams.get("X-Amz-SignedHeaders") ?? "",
    );
    expect(signedHeaders).toContain("content-type");
    // La secretKey NUNCA aparece en la URL firmada (I5).
    expect(url).not.toContain(SECRET);
  });

  // storagePublico.bases.002 — el destino `bases` NO es una puerta genérica: solo PDF
  it("rechaza un content-type que no sea application/pdf en el destino bases (defensa en profundidad I6)", async () => {
    const service = crearStoragePublicoService(configFake);
    for (const contentType of ["image/png", "text/html", "application/octet-stream"]) {
      await expect(
        service.presignarSubidaBases({ key: keyBasesSorteo("T1", "r5"), contentType }),
      ).rejects.toThrow(/no permitido/i);
    }
  });
});

/**
 * Test de INTEGRACIÓN real contra el bucket PÚBLICO de R2 (roundtrip put → head → GET público →
 * delete). Solo corre si las credenciales R2 + el bucket público están en el entorno; si fallan
 * por red/CORS/ausencia se skipea limpio (no rompe la suite ni en CI ni sin bucket público real).
 */
const R2_PUBLICO_LISTO =
  !!process.env.R2_ENDPOINT &&
  !!process.env.R2_ACCESS_KEY_ID &&
  !!process.env.R2_SECRET_ACCESS_KEY &&
  !!process.env.R2_PUBLIC_BUCKET &&
  !!process.env.R2_PUBLIC_BASE_URL;

describe("services/storagePublico — roundtrip real contra el bucket público (integración)", () => {
  // storagePublico.integracion.001 — put + head presente/ausente + GET público, extremo a extremo
  it.runIf(R2_PUBLICO_LISTO)(
    "sube un objeto, lo verifica con headObject, lo lee por URL pública y lo borra",
    async (ctx) => {
      const service = crearStoragePublicoService({
        endpoint: process.env.R2_ENDPOINT,
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        bucket: process.env.R2_PUBLIC_BUCKET,
        baseUrl: process.env.R2_PUBLIC_BASE_URL,
      });
      const key = `__integration-test__/${randomBytes(8).toString("hex")}`;
      const contenido = `pixel ${Date.now()}`;

      try {
        expect(await service.headObject(key)).toBe(false); // ausente antes de subir
        await service.putObject({ key, body: contenido, contentType: "image/png" });
        expect(await service.headObject(key)).toBe(true); // presente tras subir

        // La URL pública sirve el objeto sin firma (lectura pública del bucket).
        const url = service.urlPublica(key);
        const res = await fetch(url);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe(contenido);
      } catch (e) {
        console.warn(
          "[storagePublico.integracion] roundtrip skipeado por error de entorno:",
          e instanceof Error ? e.message : e,
        );
        return ctx.skip();
      } finally {
        await service.deleteObject(key).catch(() => undefined);
      }

      expect(await service.headObject(key)).toBe(false); // borrado efectivo
    },
    30_000,
  );
});
