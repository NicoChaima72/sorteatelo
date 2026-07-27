import { z } from "zod";

import { actualizarProducto } from "~/server/domain/panel/actualizarProducto";
import { crearProducto } from "~/server/domain/panel/crearProducto";
import { crearSorteo } from "~/server/domain/panel/crearSorteo";
import { editarSorteo } from "~/server/domain/panel/editarSorteo";
import { getSorteoDelPanel } from "~/server/domain/panel/getSorteoDelPanel";
import { listarProductosDelPanel } from "~/server/domain/panel/listarProductosDelPanel";
import {
  actualizarProductoInput,
  crearProductoInput,
  crearSorteoInput,
  editarSorteoInput,
} from "~/server/domain/panel/schemas";
import { DomainError } from "~/server/domain/errors";
import {
  definirToolDeTienda,
  type ToolMcp,
} from "~/server/mcp/tools/definirTool";

/**
 * Tools de PRODUCTOS y SORTEO (F06).
 *
 * Dos límites que este archivo materializa por ausencia (I3):
 * - **No hay tool para subir el PDF ni la portada.** Los binarios van por URL prefirmada desde el
 *   panel (ADR-0002/0009): el agente puede crear el producto y describirlo, pero el archivo lo
 *   sube la persona. Un producto sin PDF no es publicable, y el checklist de `estado_tienda` lo
 *   dice — así que el agente puede guiar sin poder saltarse el paso.
 * - **No hay tool para ejecutar el sorteo.** Es irreversible, elige un ganador real y la
 *   responsabilidad legal es del Organizador (ADR-0008). Crear y editar sí; apretar el botón, no.
 *
 * Sobre los ids: los productos SÍ exponen su id porque no tienen clave humana (dos productos
 * pueden llamarse igual) y `actualizar_producto` lo necesita. El SORTEO no: cada Tienda tiene uno
 * vigente, así que `editar_sorteo` resuelve solo cuál es y el cuid nunca sale al contexto del LLM.
 */

const listarProductos = definirToolDeTienda({
  nombre: "listar_productos",
  titulo: "Productos de la tienda",
  descripcion:
    "Lista los productos de la tienda con su id, título, precio, si está activo, si participa en el sorteo y si ya tiene el archivo subido. El id lo necesitas para editar. Los precios vienen como texto para no perder precisión: no los conviertas a número.",
  entrada: {},
  manejar: async (_args, ctx, acceso) =>
    listarProductosDelPanel({ db: ctx.db, acceso }),
});

/**
 * El precio entra como STRING a propósito. Es la regla de oro del dominio: un `number` en JSON
 * pasa por el double de JavaScript, y acá además el número lo genera un LLM. Como string llega
 * literal al validador de pesos del panel (`precioClp`), que es el mismo que usa el formulario.
 */
const ARG_PRECIO = z
  .string()
  .describe(
    'Precio en pesos chilenos, como texto y sin puntos ni símbolo, ej. "19990". Entero.',
  );

const crearProductoTool = definirToolDeTienda({
  nombre: "crear_producto",
  titulo: "Crear un producto",
  descripcion:
    "Crea un producto digital en la tienda. El producto nace SIN su archivo: para que se pueda vender y entregar, el PDF y la portada se suben después desde el panel (no hay forma de subir archivos por acá). Recién con el archivo cargado cuenta para poder publicar la tienda.",
  entrada: {
    titulo: z.string().describe("Nombre del producto tal como lo verá el comprador."),
    descripcion: z.string().describe("De qué se trata el producto."),
    precio: ARG_PRECIO,
    participaEnSorteo: z
      .boolean()
      .describe("Si comprarlo entrega tickets para el sorteo de la tienda."),
  },
  manejar: async (args, ctx, acceso) =>
    crearProducto({
      db: ctx.db,
      acceso,
      // Validado con el MISMO esquema del panel: el precio pasa por `precioClp` (entero de pesos,
      // mayor que 0) antes de tocar la DB. Sin esto, un "diecinueve mil" del modelo llegaría hasta
      // Prisma y reventaría como error interno en vez de decirle al agente qué corregir.
      input: crearProductoInput.parse({
        titulo: args.titulo,
        descripcion: args.descripcion,
        precio: args.precio,
        participaEnSorteo: args.participaEnSorteo,
        // El agente solo crea productos ESTANDAR: la modalidad SOBRE (carril productos-tipos-
        // digitales) es una mecánica de venta propia que exponer por MCP requiere su propia
        // decisión de producto — no colarse por un default.
        modalidad: "ESTANDAR",
      }),
    }),
});

const actualizarProductoTool = definirToolDeTienda({
  nombre: "actualizar_producto",
  titulo: "Editar un producto",
  descripcion:
    "Edita un producto existente: título, descripción, precio, si está activo y si participa en el sorteo. Hay que mandar todos los campos (los valores actuales salen de listar_productos). Desactivar un producto lo saca de la tienda sin borrarlo: no existe una tool para borrar productos. El archivo, la portada y las unidades que entrega un pack no se tocan por acá (las unidades se editan desde el panel).",
  entrada: {
    id: z.string().describe("Id del producto, de listar_productos."),
    titulo: z.string().describe("Nombre del producto."),
    descripcion: z.string().describe("De qué se trata el producto."),
    precio: ARG_PRECIO,
    activo: z
      .boolean()
      .describe("true para que se muestre y se pueda comprar; false para ocultarlo."),
    participaEnSorteo: z
      .boolean()
      .describe("Si comprarlo entrega tickets para el sorteo."),
  },
  manejar: async (args, ctx, acceso) => {
    // `unidadesPorPack` no es argumento de esta tool, pero el input del panel lo trae con
    // `.default(1)` — parsear sin él RESETEARÍA las unidades de un pack a 1 en cada edición
    // (bug real: le pasó al «Pack 4 Libros» de iselk, 2026-07-27). La tool PRESERVA el valor
    // vigente leyéndolo por el MISMO listado tenant-scoped que alimenta a listar_productos:
    // un id ajeno o inexistente no aparece ahí ⇒ NOT_FOUND neutral, sin tocar nada.
    const productos = await listarProductosDelPanel({ db: ctx.db, acceso });
    const actual = productos.find((p) => p.id === args.id);
    if (!actual) {
      throw new DomainError(
        "NOT_FOUND",
        "Ese producto no existe en esta tienda. El id sale de listar_productos.",
      );
    }

    return actualizarProducto({
      db: ctx.db,
      acceso,
      input: actualizarProductoInput.parse({
        id: args.id,
        titulo: args.titulo,
        descripcion: args.descripcion,
        precio: args.precio,
        activo: args.activo,
        participaEnSorteo: args.participaEnSorteo,
        unidadesPorPack: actual.unidadesPorPack,
      }),
    });
  },
});

// ── Sorteo ───────────────────────────────────────────────────────────────────────

const crearSorteoTool = definirToolDeTienda({
  nombre: "crear_sorteo",
  titulo: "Crear el sorteo de la tienda",
  descripcion:
    "Crea el sorteo de la tienda: nombre, premio y fecha de cierre. Solo puede haber UN sorteo activo a la vez; si ya hay uno, esto falla y lo que corresponde es editarlo. Las bases legales (PDF) y la imagen del premio se suben desde el panel. Ejecutar el sorteo y elegir al ganador es un paso irreversible que haces tú desde el panel: no existe una tool para eso.",
  entrada: {
    nombre: z.string().describe("Nombre del sorteo, ej. \"Sorteo de lanzamiento\"."),
    premio: z.string().describe("Qué se sortea, en una línea."),
    fechaFin: z
      .string()
      .describe("Fecha y hora de cierre en formato ISO 8601, ej. \"2026-09-30T23:59:00-03:00\"."),
  },
  manejar: async (args, ctx, acceso) =>
    crearSorteo({
      db: ctx.db,
      acceso,
      // `fechaFin` la coerciona el esquema del panel (`z.coerce.date()`): una fecha inventada por
      // el modelo se rechaza acá con un INVALID legible, no como Invalid Date en la columna.
      input: crearSorteoInput.parse({
        nombre: args.nombre,
        premio: args.premio,
        fechaFin: args.fechaFin,
      }),
    }),
});

const editarSorteoTool = definirToolDeTienda({
  nombre: "editar_sorteo",
  titulo: "Editar el sorteo de la tienda",
  descripcion:
    "Cambia el nombre, el premio o la fecha de cierre del sorteo vigente de la tienda. Hay que mandar los tres (los valores actuales salen de ver_sorteo). Un sorteo ya ejecutado no se puede editar.",
  entrada: {
    nombre: z.string().describe("Nombre del sorteo."),
    premio: z.string().describe("Qué se sortea."),
    fechaFin: z
      .string()
      .describe("Fecha y hora de cierre en formato ISO 8601."),
  },
  manejar: async (args, ctx, acceso) => {
    // El sorteo a editar no se pide por argumento: cada Tienda tiene UNO vigente y el use case ya
    // exige que esté ACTIVO y sin ejecutar. Resolverlo acá evita pasearle un cuid al modelo (y que
    // se lo invente).
    const { sorteo } = await getSorteoDelPanel({ db: ctx.db, acceso });
    if (!sorteo) {
      throw new DomainError(
        "NOT_FOUND",
        "Esta tienda todavía no tiene un sorteo. Créalo con crear_sorteo.",
      );
    }

    return editarSorteo({
      db: ctx.db,
      acceso,
      input: editarSorteoInput.parse({
        raffleId: sorteo.id,
        nombre: args.nombre,
        premio: args.premio,
        fechaFin: args.fechaFin,
      }),
    });
  },
});

export const TOOLS_DE_CATALOGO: ToolMcp[] = [
  listarProductos,
  crearProductoTool,
  actualizarProductoTool,
  crearSorteoTool,
  editarSorteoTool,
];
