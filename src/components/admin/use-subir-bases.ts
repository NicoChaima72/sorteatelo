import { useState } from "react";

import { api } from "~/utils/api";

/**
 * Hook cliente para subir el **PDF de bases** de un sorteo al bucket PÚBLICO por presigned PUT
 * (admin-bases-pdf F01/F02, D1/D2, ADR-0008/0013). Espeja `useSubirImagenMarca` con dos diferencias:
 * el Content-Type es `application/pdf` (la única excepción de la allowlist de ese bucket) y el
 * recurso es un Sorteo (`raffleId`), no un destino discriminado.
 *
 * El flujo es el mismo de siempre: se pide la URL prefirmada, se hace el PUT directo (los bytes NO
 * pasan por nuestro server) y se confirma server-side (headObject → persiste `Raffle.basesPdfUrl`).
 * El `Content-Type` del PUT DEBE coincidir con el que el server firmó, si no R2 rechaza el objeto.
 *
 * El sorteo debe EXISTIR antes de subir (la key es per-raffle): al crear un sorteo, la subida se
 * difiere a después del `crearSorteo` — mismo modo "diferido" que la portada de un producto nuevo.
 */

/**
 * Content-Type del PDF de bases. ESPEJO del `CONTENT_TYPE_PDF` del server
 * (`src/server/services/storage.ts`) — el cliente no puede importar código server; el server
 * re-valida en el input Zod Y en el service (I6). Se duplica a propósito, como `CONTENT_TYPES_IMAGEN`.
 */
export const CONTENT_TYPE_BASES = "application/pdf";

/** Valor de `accept` para el `<FileInput>` (restringe el selector nativo a PDFs). */
export const ACCEPT_BASES = CONTENT_TYPE_BASES;

export function useSubirBasesSorteo() {
  const crearUrl = api.panel.crearUrlSubidaBases.useMutation();
  const confirmar = api.panel.confirmarBasesSubidas.useMutation();
  const [subiendoLocal, setSubiendoLocal] = useState(false);

  /**
   * Sube `file` como bases del sorteo `raffleId` y devuelve la URL pública persistida. Lanza si el
   * archivo no es un PDF (el server también lo rechaza) o si el PUT falla.
   */
  const subir = async (
    raffleId: string,
    file: File,
  ): Promise<{ url: string }> => {
    if (file.type !== CONTENT_TYPE_BASES) {
      throw new Error("Las bases deben ser un archivo PDF.");
    }
    setSubiendoLocal(true);
    try {
      const { url } = await crearUrl.mutateAsync({
        raffleId,
        contentType: CONTENT_TYPE_BASES,
      });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": CONTENT_TYPE_BASES },
        body: file,
      });
      if (!res.ok) {
        throw new Error(`No se pudo subir el PDF de bases (HTTP ${res.status}).`);
      }
      const confirmado = await confirmar.mutateAsync({ raffleId });
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
