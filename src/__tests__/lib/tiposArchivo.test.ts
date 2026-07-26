import { describe, expect, it } from "vitest";

import {
  EXTENSIONES_ARCHIVO_PRODUCTO,
  extensionDeContentType,
  LIMITE_BYTES_ARCHIVO_PRODUCTO,
  MIMES_ARCHIVO_PRODUCTO,
  resolverTipoArchivo,
  validarArchivoDeProducto,
} from "~/lib/archivos/tiposArchivo";

/**
 * Tests del módulo PURO de tipos de archivo de producto (productos-tipos-digitales F02, D1/D7/D9).
 * Es la allowlist MIME CERRADA y la derivación tipo/extensión que usan el presign, la confirmación
 * y —por ser puro y sin dependencias de servidor— también el form del panel (F04).
 */

describe("lib/archivos/tiposArchivo — allowlist cerrada (D1)", () => {
  // productos.tipos.001 — el set exacto que aprobó el usuario en el grill, ni uno más
  it("acepta exactamente PDF/EPUB/PNG/JPEG/WebP/MP3/M4A/WAV/ZIP y rechaza todo lo demás", () => {
    const aceptados = [
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
    for (const mime of aceptados) {
      expect(resolverTipoArchivo(mime), mime).not.toBeNull();
    }
    expect([...MIMES_ARCHIVO_PRODUCTO].sort()).toEqual([...aceptados].sort());

    // Rechazos explícitos que pide el plan: video (out of scope) y el comodín binario.
    for (const mime of [
      "video/mp4",
      "video/quicktime",
      "application/octet-stream",
      "text/html",
      "image/svg+xml", // vector con scripts embebidos: fuera a propósito
      "",
    ]) {
      expect(resolverTipoArchivo(mime), mime).toBeNull();
    }
  });

  // productos.tipos.002 — cada MIME cae en su bucket grueso y su extensión canónica
  it("deriva el tipo y la extensión canónica del MIME, no del nombre del archivo", () => {
    expect(resolverTipoArchivo("application/pdf")).toEqual({
      contentType: "application/pdf",
      tipo: "PDF",
      extension: "pdf",
    });
    expect(resolverTipoArchivo("image/jpeg")?.tipo).toBe("IMAGEN");
    expect(resolverTipoArchivo("image/jpeg")?.extension).toBe("jpg");
    expect(resolverTipoArchivo("audio/mpeg")?.tipo).toBe("AUDIO");
    expect(resolverTipoArchivo("audio/mpeg")?.extension).toBe("mp3");
    expect(resolverTipoArchivo("audio/mp4")?.extension).toBe("m4a");
    expect(resolverTipoArchivo("application/epub+zip")?.tipo).toBe("EPUB");
    expect(resolverTipoArchivo("application/zip")?.tipo).toBe("ZIP");

    // La extensión sale del MIME aunque el nombre del cliente diga otra cosa (D9/I4).
    expect(extensionDeContentType("image/png")).toBe("png");
  });

  // productos.tipos.003 — alias que mandan los navegadores reales (Windows/Safari)
  it("normaliza los alias de MIME de los navegadores al canónico de la allowlist", () => {
    // Chrome en Windows manda esto para un .zip.
    expect(resolverTipoArchivo("application/x-zip-compressed")).toEqual({
      contentType: "application/zip",
      tipo: "ZIP",
      extension: "zip",
    });
    expect(resolverTipoArchivo("audio/x-m4a")?.contentType).toBe("audio/mp4");
    expect(resolverTipoArchivo("audio/x-wav")?.contentType).toBe("audio/wav");
    expect(resolverTipoArchivo("image/jpg")?.contentType).toBe("image/jpeg");
    // Case y parámetros del header no deberían romper el match.
    expect(resolverTipoArchivo("APPLICATION/PDF")?.contentType).toBe("application/pdf");
    expect(resolverTipoArchivo("application/pdf; charset=binary")?.contentType).toBe(
      "application/pdf",
    );
  });

  // productos.tipos.004 — el límite transversal de D7
  it("expone el límite de 20 MB por archivo, transversal a todos los tipos", () => {
    expect(LIMITE_BYTES_ARCHIVO_PRODUCTO).toBe(20 * 1024 * 1024);
  });

  // productos.tipos.005 — F04/D7: las extensiones humanas del aviso se DERIVAN de la allowlist
  it("deriva la lista de extensiones legibles de la allowlist, sin escribirla a mano", () => {
    // El form del panel imprime esto en su aviso ("PDF, EPUB, PNG…"). Derivarlo es lo que garantiza
    // que agregar un tipo a la allowlist lo haga aparecer en la UI sin tocar dos lugares (I5).
    expect(EXTENSIONES_ARCHIVO_PRODUCTO).toEqual([
      "PDF",
      "EPUB",
      "PNG",
      "JPG",
      "WEBP",
      "MP3",
      "M4A",
      "WAV",
      "ZIP",
    ]);
    expect(EXTENSIONES_ARCHIVO_PRODUCTO).toHaveLength(MIMES_ARCHIVO_PRODUCTO.length);
  });
});

/**
 * `validarArchivoDeProducto` — el rechazo CLIENTE del form del panel (F04/D7).
 *
 * Es una función pura sobre `{name, size, type}` (no sobre `File`) justamente para poder testear el
 * MENSAJE, que es el entregable de D7: "el rechazo (cliente y server) da mensaje claro **con el peso
 * del archivo**". Un mensaje genérico ("archivo no válido") cumpliría el tipo y fallaría el
 * requisito, así que el mensaje se asserta literal.
 *
 * Ojo con el reparto de responsabilidades: esto NO es la validación de seguridad — esa vive
 * server-side (allowlist en el presign + `statObject` en la confirmación, I4). Esto es UX: evitar
 * que el Organizador espere una subida de 40 MB para recién enterarse de que no entraba.
 */
describe("lib/archivos/tiposArchivo — validación cliente del form (F04/D7)", () => {
  const ok = { name: "guia.pdf", size: 5 * 1024 * 1024, type: "application/pdf" };

  // productos.tipos.006 — camino feliz: dentro de la allowlist y bajo el límite
  it("acepta un archivo de la allowlist bajo el límite", () => {
    expect(validarArchivoDeProducto(ok)).toEqual({ ok: true });
  });

  // productos.tipos.007 — D7: el rechazo por peso NOMBRA el peso del archivo y el máximo
  it("rechaza un archivo sobre el límite con un mensaje que incluye su peso real", () => {
    const grande = { ...ok, name: "album.wav", size: 23_500_000, type: "audio/wav" };
    const r = validarArchivoDeProducto(grande);
    expect(r.ok).toBe(false);
    // El peso REAL del archivo (no solo el máximo): es lo que hace accionable el mensaje.
    expect(r.ok === false && r.mensaje).toContain("22,4 MB");
    expect(r.ok === false && r.mensaje).toContain("20 MB");
    expect(r.ok === false && r.mensaje).toContain("album.wav");
  });

  // productos.tipos.008 — el límite es INCLUSIVO: exactamente 20 MB entra
  it("acepta un archivo de exactamente 20 MB y rechaza uno de un byte más", () => {
    expect(validarArchivoDeProducto({ ...ok, size: LIMITE_BYTES_ARCHIVO_PRODUCTO }).ok).toBe(true);
    expect(
      validarArchivoDeProducto({ ...ok, size: LIMITE_BYTES_ARCHIVO_PRODUCTO + 1 }).ok,
    ).toBe(false);
  });

  // productos.tipos.009 — tipo fuera de la allowlist: el mensaje dice QUÉ sí se acepta
  it("rechaza un tipo fuera de la allowlist listando los tipos aceptados", () => {
    const video = { name: "clip.mp4", size: 1000, type: "video/mp4" };
    const r = validarArchivoDeProducto(video);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.mensaje).toContain("PDF");
    expect(r.ok === false && r.mensaje).toContain("ZIP");
  });

  // productos.tipos.010 — el caveat REAL de F02: el navegador manda `type` VACÍO (típico en .epub
  // en Windows). No se adivina desde el nombre (D9 lo prohíbe), pero el mensaje NO puede ser el
  // mismo "ese tipo no se acepta": el tipo puede estar perfectamente permitido y el navegador
  // simplemente no supo nombrarlo. El mensaje distingue los dos casos.
  it("cuando el navegador no reporta el tipo, lo dice en vez de acusar al archivo", () => {
    const sinTipo = { name: "novela.epub", size: 1000, type: "" };
    const r = validarArchivoDeProducto(sinTipo);
    expect(r.ok).toBe(false);
    const mensaje = r.ok === false ? r.mensaje : "";
    expect(mensaje).toContain("novela.epub");
    // Habla del RECONOCIMIENTO, no de que el tipo esté prohibido.
    expect(mensaje).toMatch(/no pudimos reconocer/i);
  });

  // productos.tipos.011 — el peso se chequea ANTES del tipo: un video de 40 MB tiene dos problemas
  // y el que importa arreglar primero es el que el Organizador puede resolver.
  it("prioriza el rechazo por tipo sobre el de peso (el tipo no tiene arreglo, el peso sí)", () => {
    const r = validarArchivoDeProducto({ name: "peli.mp4", size: 99_000_000, type: "video/mp4" });
    expect(r.ok).toBe(false);
    // No tiene sentido pedirle que comprima un MP4 que igual nunca vamos a aceptar.
    expect(r.ok === false && r.mensaje).not.toMatch(/94,4 MB/);
  });
});
