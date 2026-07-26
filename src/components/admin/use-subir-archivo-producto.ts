import { useState } from "react";

import {
  EXTENSIONES_ARCHIVO_PRODUCTO,
  formatearPeso,
  LIMITE_BYTES_ARCHIVO_PRODUCTO,
  MIMES_ARCHIVO_PRODUCTO,
} from "~/lib/archivos/tiposArchivo";
import { api } from "~/utils/api";

/**
 * Hook cliente para subir un **archivo de producto** al bucket PRIVADO por presigned PUT
 * (productos-tipos-digitales F02/F06, ADR-0002/0009). Hermano de `useSubirImagenMarca`
 * (`use-subir-imagen.ts`) y `useSubirBasesSorteo` (`use-subir-bases.ts`), que hacen lo mismo contra el
 * bucket público.
 *
 * Existe UNO solo para los DOS consumidores del flujo, que necesitan exactamente la misma secuencia:
 * el campo de archivo único del form de producto (`admin/productos.tsx`, modalidad ESTANDAR) y el
 * subidor múltiple de la colección del sobre (`pool-del-sobre.tsx`, modalidad SOBRE). Lo que cambia
 * entre los dos NO es el pipeline sino la semántica de lo que pasa server-side —reemplazar el archivo
 * anterior vs. sumar al pool—, y eso lo decide `confirmarArchivoProducto` mirando la `modalidad`
 * (F06), no el cliente. Tenerlo dos veces sería el pipeline paralelo que la invariante I5 del plan
 * prohíbe: si el contrato de `crearUrlSubidaArchivo` cambia, hay UN call site que tocar.
 *
 * Lo que el hook NO hace y es a propósito:
 * - **No valida** el archivo. Eso es `validarArchivoDeProducto` (`~/lib/archivos/tiposArchivo`), y los
 *   dos call sites la llaman ANTES, con mensajes distintos: el form rechaza uno y limpia el input, el
 *   pool descarta los inválidos de la tanda y sube el resto.
 * - **No muestra notificaciones**. Lanza; cada call site decide cómo se lee el error (el pool agrega
 *   que los archivos anteriores de la tanda sí quedaron).
 */

/**
 * `accept` del input, DERIVADO de la allowlist compartida (F04/D1).
 *
 * No es un espejo escrito a mano como `ACCEPT_IMAGEN`: `~/lib/archivos/tiposArchivo` es un módulo
 * PURO de `src/lib/` (no server), así que cliente y server consumen la MISMA definición y no pueden
 * divergir. Es UNA sola fuente de verdad para el `accept`, el aviso de tipos, los mensajes de rechazo,
 * el Zod del input y la allowlist del service.
 *
 * Ojo: `accept` es una SUGERENCIA del diálogo de archivos —el usuario puede forzar "todos los
 * archivos" y arrastrar cualquier cosa—, así que no reemplaza a `validarArchivoDeProducto` (cliente)
 * ni a la allowlist del server (I4).
 */
export const ACCEPT_ARCHIVO_PRODUCTO = MIMES_ARCHIVO_PRODUCTO.join(",");

/** Aviso que se muestra ANTES de elegir archivo (D7): qué entra y cuánto puede pesar. */
export const AVISO_ARCHIVO = `${EXTENSIONES_ARCHIVO_PRODUCTO.join(
  ", ",
)} · máximo ${formatearPeso(LIMITE_BYTES_ARCHIVO_PRODUCTO)} por archivo.`;

export function useSubirArchivoDeProducto() {
  const crearUrl = api.panel.crearUrlSubidaArchivo.useMutation();
  const confirmar = api.panel.confirmarArchivoProducto.useMutation();
  const [subiendoLocal, setSubiendoLocal] = useState(false);

  /**
   * Sube `file` al producto y lo deja CONFIRMADO (entregable). Lanza si el PUT falla — nombrando el
   * archivo, que es lo que el subidor múltiple necesita para decir cuál de la tanda se cayó.
   */
  const subir = async (
    productId: string,
    file: File,
  ): Promise<{ fileId: string }> => {
    setSubiendoLocal(true);
    try {
      // El server valida el MIME contra la allowlist, computa la key (server-authored, con el
      // prefijo del tenant — D9/I1) y devuelve el content-type CANÓNICO, que es el que va FIRMADO en
      // la URL. El PUT debe mandar exactamente ese header: mandar el `file.type` crudo rompería la
      // firma cuando el navegador reporta un alias (`application/x-zip-compressed` para un .zip).
      const { url, fileId, contentType } = await crearUrl.mutateAsync({
        productId,
        contentType: file.type,
        nombreArchivo: file.name,
      });
      // Los bytes van DIRECTO a R2: no pasan por nuestro server.
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!res.ok) {
        throw new Error(`No se pudo subir ${file.name} (HTTP ${res.status}).`);
      }
      // Recién acá el archivo es entregable: la confirmación re-valida tipo y peso REALES contra el
      // objeto ya subido (`statObject`), porque el navegador no es fuente confiable de ninguno (I4).
      await confirmar.mutateAsync({ fileId });
      return { fileId };
    } finally {
      setSubiendoLocal(false);
    }
  };

  return {
    subir,
    subiendo: subiendoLocal || crearUrl.isPending || confirmar.isPending,
  };
}
