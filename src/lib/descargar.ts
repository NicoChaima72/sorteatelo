/**
 * Descarga de un archivo generado en el navegador (F07 de
 * `tasks/26-07-25-checkout-campos-configurables.md`).
 *
 * El contenido lo arma el SERVER (el CSV de ventas viaja por tRPC ya escapado y con su BOM); acá
 * solo se lo entrega al navegador. Vive en `~/lib` y no dentro de la página porque es plomería de
 * DOM —`createObjectURL`, un `<a>` de mentira, el `revoke`— que no tiene nada que ver con la
 * pantalla de ventas y que estorba entre su render.
 *
 * No hay un endpoint `/api/...` que sirva el archivo con `Content-Disposition` a propósito: ese
 * camino necesitaría su propia autorización por tenant, un segundo lugar donde puede fugarse la PII
 * de los Compradores (I7). Este pasa por el `panelProcedure` que ya existe.
 */
export function descargarArchivo({
  nombre,
  contenido,
  tipo,
}: {
  nombre: string;
  contenido: string;
  /** MIME con charset (ej. `text/csv;charset=utf-8`). */
  tipo: string;
}): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  // Sin esto el Blob queda vivo hasta que se cierre la pestaña: un CSV de ventas puede pesar y
  // lleva PII, no hay razón para dejarlo colgando en memoria.
  URL.revokeObjectURL(url);
}
