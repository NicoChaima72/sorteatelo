import { CheckoutFieldType } from "@prisma/client";
import { z } from "zod";

import { cambiarActivoCampoCheckout } from "~/server/domain/camposCheckout/cambiarActivoCampoCheckout";
import {
  cambiarActivoCampoCheckoutInput,
  crearCampoCheckoutInput,
  editarCampoCheckoutInput,
  reordenarCamposCheckoutInput,
} from "~/server/domain/camposCheckout/schemas";
import { crearCampoCheckout } from "~/server/domain/camposCheckout/crearCampoCheckout";
import { editarCampoCheckout } from "~/server/domain/camposCheckout/editarCampoCheckout";
import { listarCamposCheckout } from "~/server/domain/camposCheckout/listarCamposCheckout";
import { reordenarCamposCheckout } from "~/server/domain/camposCheckout/reordenarCamposCheckout";
import { getConfiguracionTienda } from "~/server/domain/panel/getConfiguracionTienda";
import { guardarConfiguracionTienda } from "~/server/domain/panel/guardarConfiguracionTienda";
import { guardarConfiguracionTiendaInput } from "~/server/domain/panel/schemas";
import {
  definirToolDeTienda,
  type ToolMcp,
} from "~/server/mcp/tools/definirTool";

/**
 * Tools de CONFIGURACIÓN de la Tienda (F05): identidad visual/contacto + los Campos de checkout.
 *
 * ⚠️ La decisión de diseño del archivo: **`configurar_tienda` hace merge, no reemplazo.**
 * `guardarConfiguracionTienda` es un save de FORMULARIO — escribe las 8 columnas y las que no
 * vengan quedan en `null`. En el panel eso es correcto (el form siempre manda todo). Con un agente
 * de por medio sería una trampa: "cámbiame el color a azul" mandaría solo `colorPrimario` y borraría
 * de paso la descripción, el Instagram, el TikTok, el WhatsApp, el correo de contacto y el prefijo
 * de ticket — pérdida de datos silenciosa, confirmada con un "listo, cambié el color".
 *
 * Corolario para quien agregue una columna al formulario: **sumarla también a `CAMPOS_CONFIG`**. Si
 * no, el merge no la re-manda y cada llamada de esta tool la borra (F08/D12 llegó justo así).
 *
 * Así que la tool lee la config actual, superpone SOLO los campos presentes y guarda el conjunto
 * completo. Para el agente la semántica es la que espera (parcial); para el dominio, el mismo save
 * de siempre. No es lógica de negocio nueva (I4): son dos use cases existentes compuestos.
 *
 * Para BORRAR un valor hay que mandarlo explícitamente vacío (`""`) — decisión consciente, no un
 * olvido.
 */

/** Los 9 campos editables, todos opcionales: ausente = no tocar, `""` = borrar. */
const CAMPOS_CONFIG = {
  descripcion: z
    .string()
    .max(2000)
    .optional()
    .describe("Descripción breve de la tienda. Manda \"\" para borrarla."),
  colorPrimario: z
    .string()
    .optional()
    .describe('Color de marca en hex, ej. "#2b3fbf". Manda "" para volver al color por defecto.'),
  colorAcento: z
    .string()
    .optional()
    .describe('Segundo color de marca en hex. Manda "" para quitarlo.'),
  instagramUrl: z
    .string()
    .optional()
    .describe('URL completa del perfil de Instagram. Manda "" para ocultar el ícono.'),
  tiktokUrl: z
    .string()
    .optional()
    .describe('URL completa del perfil de TikTok. Manda "" para ocultar el ícono.'),
  whatsappUrl: z
    .string()
    .optional()
    .describe('Enlace de WhatsApp. Manda "" para ocultarlo.'),
  contactoEmail: z
    .string()
    .optional()
    .describe('Correo de contacto público del footer. Manda "" para ocultarlo.'),
  identidadLegal: z
    .string()
    .optional()
    .describe(
      'Nombre o razón social de quien responde por la venta y el sorteo (ej. "Comercializadora Ana Pérez EIRL"). Aparece en el pie de los correos al comprador. Manda "" para quitarlo.',
    ),
  prefijoTicket: z
    .string()
    .optional()
    .describe(
      'Prefijo de los números del sorteo, 1 a 8 letras o números sin espacios (ej. "ARMY" hace que los números se muestren como ARMY-1043 en el panel y en los correos). No incluyas el guion. Manda "" para quitarlo.',
    ),
};

/** Claves de `CAMPOS_CONFIG`: lo que se puede superponer sobre la config actual. */
type ClaveConfig = keyof typeof CAMPOS_CONFIG;
const CLAVES_CONFIG = Object.keys(CAMPOS_CONFIG) as ClaveConfig[];

const verConfiguracion = definirToolDeTienda({
  nombre: "ver_configuracion",
  titulo: "Configuración de la tienda",
  descripcion:
    "Muestra la configuración actual de la tienda: nombre, dirección, estado, descripción, colores de marca, redes sociales y correo de contacto. Léela antes de cambiar algo para saber qué hay.",
  entrada: {},
  manejar: async (_args, ctx, acceso) =>
    getConfiguracionTienda({ db: ctx.db, acceso }),
});

const configurarTienda = definirToolDeTienda({
  nombre: "configurar_tienda",
  titulo: "Configurar la tienda",
  descripcion:
    'Cambia la configuración de la tienda. Solo se modifica lo que mandes: los campos que omitas quedan como estaban. Para BORRAR un valor, mándalo como texto vacío (""). Los colores van en hex (ej. "#2b3fbf"). El logo y las imágenes no se cambian por acá (se suben desde el panel), y el título del hero se edita en la página, no acá.',
  entrada: CAMPOS_CONFIG,
  manejar: async (args, ctx, acceso) => {
    const actual = await getConfiguracionTienda({ db: ctx.db, acceso });

    // Merge: lo que no vino, se re-manda tal como está hoy. Las columnas son `string | null` y el
    // input espera `string | ""`, así que un null vigente viaja como cadena vacía.
    const input = Object.fromEntries(
      CLAVES_CONFIG.map((clave) => [
        clave,
        args[clave] ?? actual[clave] ?? "",
      ]),
    );

    // Se valida con el MISMO esquema que el formulario del panel (hex de los colores, forma de
    // las URLs, largo de la descripción): las dos puertas a las mismas columnas no pueden
    // discrepar sobre qué es un valor válido. Un rechazo sale como INVALID legible.
    await guardarConfiguracionTienda({
      db: ctx.db,
      acceso,
      input: guardarConfiguracionTiendaInput.parse(input),
    });

    // Se devuelve la config resultante (no un `{ok:true}`): el agente ve qué quedó y puede
    // confirmárselo al Organizador sin inventar.
    return getConfiguracionTienda({ db: ctx.db, acceso });
  },
});

// ── Campos de checkout ───────────────────────────────────────────────────────────
// Existe `borrarCampoCheckout` en el dominio y NO se registra como tool (I3): borrar es
// irreversible y el Organizador tiene "desactivar", que es lo mismo sin perder el campo.

const listarCampos = definirToolDeTienda({
  nombre: "listar_campos_checkout",
  titulo: "Campos del checkout",
  descripcion:
    "Lista los campos que la tienda le pide al comprador al pagar (además del correo, que siempre se pide). Incluye el id de cada campo, que necesitas para editarlo o desactivarlo.",
  entrada: {},
  manejar: async (_args, ctx, acceso) =>
    listarCamposCheckout({ db: ctx.db, acceso }),
});

const crearCampo = definirToolDeTienda({
  nombre: "crear_campo_checkout",
  titulo: "Agregar un campo al checkout",
  descripcion:
    'Agrega un campo al formulario de pago (por ejemplo "Nombre de tu bias" o "Talla"). El tipo no se puede cambiar después. Los campos de lista (SELECT) necesitan al menos una opción. Hay un máximo de campos activos: si te pasas, la tienda te lo dirá.',
  entrada: {
    etiqueta: z
      .string()
      .describe("Lo que el comprador va a leer sobre el campo, ej. \"Talla\"."),
    tipo: z
      .nativeEnum(CheckoutFieldType)
      .describe(
        "Tipo de campo. TEXT: una línea. TEXTAREA: párrafo. SELECT: lista de opciones. CHECKBOX: casilla. NUMBER: número.",
      ),
    obligatorio: z
      .boolean()
      .describe("Si el comprador tiene que responderlo para poder pagar."),
    placeholder: z.string().optional().describe("Texto de ejemplo dentro del campo."),
    textoAyuda: z.string().optional().describe("Aclaración breve bajo el campo."),
    opciones: z
      .array(z.string())
      .optional()
      .describe("Opciones de la lista. Solo para tipo SELECT; no pueden repetirse."),
    defaultMarcado: z
      .boolean()
      .optional()
      .describe("Solo para CHECKBOX: si viene marcada por defecto."),
  },
  manejar: async (args, ctx, acceso) =>
    crearCampoCheckout({
      db: ctx.db,
      acceso,
      // El esquema del panel (no el de la tool) es el que manda: trae las reglas que dependen del
      // tipo —un SELECT sin opciones, opciones repetidas— que un shape suelto se saltearía.
      input: crearCampoCheckoutInput.parse({
        etiqueta: args.etiqueta,
        tipo: args.tipo,
        obligatorio: args.obligatorio,
        placeholder: args.placeholder,
        textoAyuda: args.textoAyuda,
        opciones: args.opciones ?? [],
        defaultMarcado: args.defaultMarcado ?? false,
      }),
    }),
});

const editarCampo = definirToolDeTienda({
  nombre: "editar_campo_checkout",
  titulo: "Editar un campo del checkout",
  descripcion:
    "Cambia la etiqueta, la ayuda, si es obligatorio o las opciones de un campo del checkout. El TIPO no se puede cambiar (habría que crear otro campo). Necesitas el id: sale de listar_campos_checkout.",
  entrada: {
    campoId: z.string().describe("Id del campo, de listar_campos_checkout."),
    etiqueta: z.string().describe("Nueva etiqueta visible."),
    obligatorio: z.boolean().describe("Si hay que responderlo para pagar."),
    placeholder: z.string().optional().describe("Texto de ejemplo dentro del campo."),
    textoAyuda: z.string().optional().describe("Aclaración breve bajo el campo."),
    opciones: z
      .array(z.string())
      .optional()
      .describe("Opciones de la lista, solo si el campo es de tipo SELECT."),
    defaultMarcado: z
      .boolean()
      .optional()
      .describe("Solo para CHECKBOX: si viene marcada por defecto."),
  },
  manejar: async (args, ctx, acceso) =>
    editarCampoCheckout({
      db: ctx.db,
      acceso,
      input: editarCampoCheckoutInput.parse({
        campoId: args.campoId,
        etiqueta: args.etiqueta,
        obligatorio: args.obligatorio,
        placeholder: args.placeholder,
        textoAyuda: args.textoAyuda,
        opciones: args.opciones ?? [],
        defaultMarcado: args.defaultMarcado ?? false,
      }),
    }),
});

const activarCampo = definirToolDeTienda({
  nombre: "activar_campo_checkout",
  titulo: "Activar o desactivar un campo del checkout",
  descripcion:
    "Activa o desactiva un campo del checkout. Desactivar es la forma segura de dejar de pedir algo: el campo deja de aparecer pero no se pierde, y las respuestas que ya te dieron los compradores siguen intactas. No existe una tool para borrar campos.",
  entrada: {
    campoId: z.string().describe("Id del campo, de listar_campos_checkout."),
    activo: z.boolean().describe("true para mostrarlo en el checkout, false para ocultarlo."),
  },
  manejar: async (args, ctx, acceso) =>
    cambiarActivoCampoCheckout({
      db: ctx.db,
      acceso,
      input: cambiarActivoCampoCheckoutInput.parse({
        campoId: args.campoId,
        activo: args.activo,
      }),
    }),
});

const reordenarCampos = definirToolDeTienda({
  nombre: "reordenar_campos_checkout",
  titulo: "Reordenar los campos del checkout",
  descripcion:
    "Cambia el orden en que aparecen los campos en el formulario de pago. Manda la lista COMPLETA de ids en el orden que quieres; si falta o sobra alguno, no se aplica nada.",
  entrada: {
    idsEnOrden: z
      .array(z.string())
      .describe("Todos los ids de los campos de la tienda, en el orden deseado."),
  },
  manejar: async (args, ctx, acceso) =>
    reordenarCamposCheckout({
      db: ctx.db,
      acceso,
      input: reordenarCamposCheckoutInput.parse({ idsEnOrden: args.idsEnOrden }),
    }),
});

export const TOOLS_DE_CONFIGURACION: ToolMcp[] = [
  verConfiguracion,
  configurarTienda,
  listarCampos,
  crearCampo,
  editarCampo,
  activarCampo,
  reordenarCampos,
];
