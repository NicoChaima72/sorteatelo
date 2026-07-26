import { useState } from "react";

import { api } from "~/utils/api";

/**
 * Hook cliente para subir un asset de marca al bucket PÚBLICO por presigned PUT (plantilla-rica
 * F03/ADR-0013). Espeja el flujo del PDF (`productos.tsx`): pide la URL prefirmada, hace el PUT
 * directo (los bytes NO pasan por nuestro server) y confirma server-side (headObject → persiste
 * la URL pública en la columna del destino). El `Content-Type` del PUT debe coincidir con el que
 * el server firmó — se toma de `file.type` (validado contra la allowlist antes de subir).
 *
 * Reusado por Configuración (logo), el form de producto (portada) y el panel del sorteo (premio). El
 * destino `hero` MURIÓ en admin-bases-pdf F06/D7: la imagen de portada es del Documento de Página y
 * se sube desde el EDITOR, no desde el panel.
 */

/**
 * Allowlist de Content-Type de imagen. ESPEJO del `CONTENT_TYPES_IMAGEN` del server
 * (`src/server/services/storagePublico.ts`) — el cliente no puede importar código server; el
 * server re-valida (Zod + service, I6). Se duplica a propósito, como `MAX_CANTIDAD_POR_ITEM`.
 */
export const CONTENT_TYPES_IMAGEN = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
type ContentTypeImagen = (typeof CONTENT_TYPES_IMAGEN)[number];

/** Valor de `accept` para el `<FileInput>` (restringe el selector nativo a imágenes). */
export const ACCEPT_IMAGEN = CONTENT_TYPES_IMAGEN.join(",");

/** Destino del asset (discriminado). Espeja el input server `crearUrlSubidaImagen`/`confirmar`. */
export type DestinoImagen =
  | { destino: "logo" }
  | { destino: "portada"; productId: string }
  | { destino: "premio"; raffleId: string };

function esImagenValida(file: File): file is File & { type: ContentTypeImagen } {
  return (CONTENT_TYPES_IMAGEN as readonly string[]).includes(file.type);
}

export function useSubirImagenMarca() {
  const crearUrl = api.panel.crearUrlSubidaImagen.useMutation();
  const confirmar = api.panel.confirmarImagenSubida.useMutation();
  const [subiendoLocal, setSubiendoLocal] = useState(false);

  /**
   * Sube `file` al `destino` y devuelve la URL pública persistida. Lanza si el formato no está en
   * la allowlist (el server también lo rechaza) o si el PUT falla.
   */
  const subir = async (
    destino: DestinoImagen,
    file: File,
  ): Promise<{ url: string }> => {
    if (!esImagenValida(file)) {
      throw new Error("Formato no permitido. Usa PNG, JPG o WebP.");
    }
    setSubiendoLocal(true);
    try {
      const { url } = await crearUrl.mutateAsync({
        ...destino,
        contentType: file.type,
      });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) {
        throw new Error(`No se pudo subir la imagen (HTTP ${res.status}).`);
      }
      const confirmado = await confirmar.mutateAsync(destino);
      return { url: confirmado.url };
    } finally {
      setSubiendoLocal(false);
    }
  };

  return {
    subir,
    subiendo: subiendoLocal || crearUrl.isPending || confirmar.isPending,
  };
}
