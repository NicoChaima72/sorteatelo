import { Prisma, type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { type BorrarArchivoDeProductoInput } from "~/server/domain/panel/schemas";
import {
  datosEntregableDeFila,
  esProductoEntregable,
  SELECCION_PRODUCTO_ENTREGABLE,
  seVendeDirecto,
} from "~/server/productos/productoEntregable";
import { type StorageService } from "~/server/services/storage";

/**
 * Use case del panel (productos-tipos-digitales F06, D4/I7): saca un archivo del producto — una
 * lámina del pool de un SOBRE, o el archivo de un producto ESTANDAR.
 *
 * Borra la fila (tenant-scoped) y, **best-effort**, el objeto de R2: mismo patrón que
 * `eliminarPageAsset`. Si R2 falla, el objeto queda huérfano y no pasa nada grave; lo que importa es
 * que la fila —la única puerta a una URL prefirmada (ADR-0002)— ya no está.
 *
 * **Dos guards, y ninguno es opcional:**
 *
 * 1. **Archivo con asignaciones ⇒ `CONFLICT`** (D4/I7). Si a alguien que pagó ya le tocó este
 *    archivo, su descarga es una promesa hecha: no se borra. La DB lo sostiene igual con el
 *    `onDelete: Restrict` de `PackAssignment.productFile`, así que este chequeo no es lo que hace
 *    cumplir el invariante — es lo que convierte un P2003 crudo (500) en un mensaje que el
 *    Organizador entiende. Se consulta con un `_count` de la relación: no hace falta traer las
 *    asignaciones para saber si hay alguna.
 * 2. **Un producto A LA VENTA no puede quedar sin nada que entregar** (fail-closed, I7). Se evalúa
 *    `esProductoEntregable` como si el archivo ya no estuviera: una sola regla cubre las dos
 *    modalidades, así que también atrapa el caso del SOBRE cuyo pool caería por debajo de su pack
 *    ACTIVO más grande. Sin este guard, el producto seguiría listado en el storefront y la compra
 *    fallaría DESPUÉS del pago. Un producto inactivo se puede vaciar libremente: no hay nada
 *    prometido.
 *
 * `tenantId` sale del `acceso` resuelto server-side, NUNCA del input (I1/ADR-0005): un `fileId` de
 * otra Tienda ⇒ `NOT_FOUND` indistinguible de inexistente, y sin tocar el storage.
 */
export async function borrarArchivoDeProducto({
  db,
  acceso,
  input,
  storage,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: BorrarArchivoDeProductoInput;
  storage: Pick<StorageService, "deleteObject">;
}): Promise<{ borrado: true }> {
  const tenantId = resolverTenantDelPanel(acceso);

  const archivo = await db.productFile.findFirst({
    where: { id: input.fileId, tenantId },
    select: {
      id: true,
      key: true,
      productId: true,
      // Hace falta para saber si su borrado cambia el conteo de ENTREGABLES: una fila pendiente
      // (subida a medio camino) no cuenta para el gate, así que sacarla no puede romperlo.
      confirmadoAt: true,
      _count: { select: { assignments: true } },
    },
  });
  if (!archivo) {
    throw new DomainError("NOT_FOUND", "Ese archivo no existe en tu Tienda.");
  }

  // Guard 1 (D4/I7): lo que ya le tocó a un Comprador no se borra.
  if (archivo._count.assignments > 0) {
    throw new DomainError(
      "CONFLICT",
      `Este archivo ya le tocó a ${archivo._count.assignments === 1 ? "una compra" : `${archivo._count.assignments} compras`}, ` +
        `así que no se puede borrar: quien lo compró tiene que poder seguir descargándolo. ` +
        `Si no quieres que salga en las próximas compras, saca el sobre de la venta o súbele más archivos.`,
    );
  }

  const producto = await db.product.findFirst({
    where: { id: archivo.productId, tenantId },
    select: {
      activo: true,
      ...SELECCION_PRODUCTO_ENTREGABLE,
      // Los PACKS que entregan el contenido de ESTE producto y están a la venta (E17). Son la razón
      // por la que el guard ya no puede mirar solo al dueño del archivo: bajo v2 lo que está en el
      // catálogo suele ser el pack, no la colección.
      packs: {
        where: { activo: true },
        select: { titulo: true, unidadesPorPack: true },
        // El más exigente primero: si el pack más grande sobrevive al borrado, todos sobreviven.
        orderBy: { unidadesPorPack: "desc" },
      },
    },
  });
  if (!producto) {
    // La FK lo hace imposible; si pasa es una violación de integridad, no una condición esperada.
    throw new DomainError(
      "NOT_FOUND",
      "El producto de ese archivo no existe en tu Tienda.",
    );
  }

  // ¿Cómo queda el producto SIN este archivo? Una fila PENDIENTE (subida a medio camino) no cuenta
  // como entregable, así que sacarla no puede romper nada.
  const antes = datosEntregableDeFila(producto);
  const despues = {
    ...antes,
    archivosConfirmados:
      antes.archivosConfirmados - (archivo.confirmadoAt !== null ? 1 : 0),
  };

  // Guard 2 (fail-closed, I7): nada que esté A LA VENTA puede quedar sin poder entregar. Son DOS
  // preguntas desde la enmienda v2, y la segunda es la que importa en el caso stickers:
  //
  //  (a) el producto MISMO, si se vende directo y está activo (un producto normal con su archivo).
  //      Una COLECCIÓN no entra acá aunque esté activa: no se vende, así que vaciarla no le rompe
  //      la compra a nadie — lo que sí puede romper son sus packs, y eso es (b).
  //  (b) los PACKS ACTIVOS que entregan el contenido de este producto. Sin esta mitad, borrar la
  //      cuarta lámina de una colección dejaría «Pack 4 stickers» a la venta e imposible de armar, y
  //      la asignación fallaría DESPUÉS de que el Comprador pagó.
  if (producto.activo && seVendeDirecto(producto) && !esProductoEntregable(despues)) {
    throw new DomainError("CONFLICT", mensajeQuedariaSinEntregar(despues));
  }

  const packRoto = producto.packs.find(
    (pack) =>
      !esProductoEntregable({
        modalidad: "ESTANDAR", // V-I7: en un pack la modalidad no significa nada; manda la fuente
        archivosConfirmados: 0,
        pdfPathLegacy: null,
        unidadesPorPack: pack.unidadesPorPack,
        fuente: despues,
      }),
  );
  if (packRoto) {
    throw new DomainError(
      "CONFLICT",
      mensajePackQuedariaSinEntregar({ despues, pack: packRoto }),
    );
  }

  let count: number;
  try {
    // Cada ESCRITURA lleva su propio scoping explícito, aunque el `findFirst` de arriba ya haya
    // filtrado por tenant (mismo criterio que los `updateMany where { id, tenantId }` del panel).
    ({ count } = await db.productFile.deleteMany({
      where: { id: archivo.id, tenantId },
    }));
  } catch (e) {
    // CARRERA: entre el `_count` de arriba y este delete, una compra pudo confirmarse y crear un
    // `PackAssignment` sobre este archivo (F08 hace esa ventana alcanzable). El `onDelete: Restrict`
    // la cierra en la DB, y acá se traduce ese P2003 al MISMO CONFLICT que el guard 1 — si no, la
    // carrera se vería como un 500 en vez de como lo que es: alguien le compró justo ahora.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2003"
    ) {
      throw new DomainError(
        "CONFLICT",
        "Alguien compró este sobre mientras lo editabas y le tocó justo este archivo, " +
          "así que ya no se puede borrar. Recarga para ver la colección al día.",
      );
    }
    throw e;
  }
  if (count === 0) {
    // Otra pestaña lo borró entremedio: el resultado deseado ya ocurrió.
    throw new DomainError("NOT_FOUND", "Ese archivo no existe en tu Tienda.");
  }

  try {
    await storage.deleteObject(archivo.key);
  } catch {
    // Objeto huérfano en R2 (GC fuera de alcance, mismo criterio que `eliminarPageAsset`). La fila
    // ya no está, que es lo que gobierna el acceso: sin fila no hay URL prefirmada posible.
  }

  return { borrado: true };
}

/**
 * Por qué no se puede borrar sin sacar el producto de la venta primero. Dice qué HACER (design.md §8)
 * y con los números concretos: "el pool queda corto" no es accionable.
 */
function mensajeQuedariaSinEntregar(_despues: {
  archivosConfirmados: number;
}): string {
  return (
    "Este es el único archivo del producto y está a la venta. " +
    "Sácalo de la venta primero, o sube el archivo nuevo directamente (la subida reemplaza al anterior)."
  );
}

/**
 * Por qué no se puede borrar cuando lo que quedaría sin entregar es un PACK que apunta a este
 * producto (E17). El mensaje NOMBRA el pack: una colección puede tener varios, y "un pack tuyo se
 * rompe" obligaría al Organizador a adivinar cuál.
 */
function mensajePackQuedariaSinEntregar({
  despues,
  pack,
}: {
  despues: { modalidad: "ESTANDAR" | "SOBRE"; archivosConfirmados: number };
  pack: { titulo: string; unidadesPorPack: number };
}): string {
  if (despues.modalidad === "SOBRE") {
    return (
      `Si borras este archivo tu colección queda en ${despues.archivosConfirmados} y «${pack.titulo}» ` +
      `entrega ${pack.unidadesPorPack} al azar, así que ya no se podría armar sin repetir. ` +
      `Sube otro archivo o saca ese pack de la venta antes de borrar.`
    );
  }
  return (
    `Este es el único archivo del producto y «${pack.titulo}» lo está vendiendo. ` +
    `Saca ese pack de la venta primero, o sube el archivo nuevo directamente (la subida reemplaza al anterior).`
  );
}
