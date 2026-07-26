import { CheckoutFieldType } from "@prisma/client";
import { z } from "zod";

/**
 * Inputs del CRUD de Campos de checkout (F02, tasks/26-07-25-checkout-campos-configurables).
 * NINGUNO lleva `tenantId`: la Tienda sale de `resolverTenantDelPanel(ctx.acceso)` server-side —
 * el subdominio del host cruzado contra la membresía (I1/ADR-0005/0022). Ver CONTEXT.md § Campo de
 * checkout.
 */

/**
 * `z.nativeEnum` sobre el enum de Prisma en vez de un `z.enum([...])` con los 5 literales a mano
 * (que es el precedente del repo, p. ej. `contentTypeImagen`): acá el enum NO es un vocabulario del
 * borde sino EXACTAMENTE la columna `CheckoutField.tipo`, y `tipo` es INMUTABLE tras crear (D5) —
 * un literal olvidado al agregar un tipo nuevo dejaría campos imposibles de crear y snapshots
 * imposibles de escribir. Atarlo al enum generado hace el drift estructuralmente imposible.
 */
export const tipoCampoCheckout = z.nativeEnum(CheckoutFieldType);

/**
 * Texto OPCIONAL de UX: ausente o vacío ⇒ `null` (nunca string vacío en la columna). La
 * normalización va en el BORDE Zod y no en el use case, así los use cases reciben ya
 * `string | null` y no repiten el ternario que `prefer-nullish-coalescing` marca.
 */
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === undefined || v.length === 0 ? null : v));

/** Topes de cordura (no decisiones de producto): el plan delega el dimensionado (D3, "rango de cordura"). */
const MAX_OPCIONES = 50;

const opcionesSelect = z
  .array(z.string().trim().min(1, "Una opción no puede quedar vacía").max(80))
  .max(MAX_OPCIONES, `Máximo ${MAX_OPCIONES} opciones`)
  .default([]);

/**
 * Reglas que dependen del `tipo` y que son RECHAZO (no normalización): un SELECT sin opciones es un
 * campo imposible de responder, y dos opciones idénticas hacen ambigua la elección. Las
 * NORMALIZACIONES por tipo (CHECKBOX ⇒ `obligatorio: false` D4, no-SELECT ⇒ `opciones: []`,
 * no-CHECKBOX ⇒ `defaultMarcado: false`) NO van acá: viven en `_normalizar.ts`, compartidas por
 * crear y editar, porque son la forma canónica de la fila y no una validación del transporte.
 */
function validarPorTipo(
  datos: { tipo: CheckoutFieldType; opciones: string[] },
  ctx: z.RefinementCtx,
) {
  if (datos.tipo !== CheckoutFieldType.SELECT) return;

  if (datos.opciones.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["opciones"],
      message: "Un campo de lista necesita al menos una opción",
    });
    return;
  }
  if (new Set(datos.opciones).size !== datos.opciones.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["opciones"],
      message: "Las opciones no pueden repetirse",
    });
  }
}

/**
 * Alta de un Campo de checkout (D7). La `clave` NO viene del input: se DERIVA de la etiqueta
 * server-side (`_clave.ts`) y queda inmutable — que el cliente no la elija cierra de raíz el
 * vector de una clave que pise la del dato fijo (`email`/`correo`, I2) o la de otro campo.
 */
export const crearCampoCheckoutInput = z
  .object({
    etiqueta: z.string().trim().min(1, "La etiqueta es obligatoria").max(80),
    tipo: tipoCampoCheckout,
    obligatorio: z.boolean(),
    placeholder: textoOpcional(120),
    textoAyuda: textoOpcional(200),
    opciones: opcionesSelect,
    defaultMarcado: z.boolean(),
  })
  .superRefine(validarPorTipo);
export type CrearCampoCheckoutInput = z.infer<typeof crearCampoCheckoutInput>;

/**
 * Edición COSMÉTICA (D5): `clave` y `tipo` son inmutables tras crear y por eso NO están en este
 * input — no hay guard que escribir, son estructuralmente inalcanzables (mismo criterio con el que
 * `guardarConfiguracionTiendaInput` mató `logoUrl`/`basesSorteo` como campos de texto). Un cliente
 * que igual los mande los ve DESCARTADOS por Zod, y la fila conserva los suyos.
 */
export const editarCampoCheckoutInput = z
  .object({
    campoId: z.string().cuid(),
    etiqueta: z.string().trim().min(1, "La etiqueta es obligatoria").max(80),
    obligatorio: z.boolean(),
    placeholder: textoOpcional(120),
    textoAyuda: textoOpcional(200),
    opciones: opcionesSelect,
    defaultMarcado: z.boolean(),
  })
  .superRefine((datos, ctx) => {
    // El `tipo` no viaja en el input: la validación por tipo se completa en el use case, que lee el
    // tipo VIGENTE de la fila. Acá solo lo que no depende del tipo.
    if (new Set(datos.opciones).size !== datos.opciones.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["opciones"],
        message: "Las opciones no pueden repetirse",
      });
    }
  });
export type EditarCampoCheckoutInput = z.infer<typeof editarCampoCheckoutInput>;

/** Desactivar (reversible, D5) o reactivar — reactivar recuenta el límite de 10 activos (D6/I6). */
export const cambiarActivoCampoCheckoutInput = z.object({
  campoId: z.string().cuid(),
  activo: z.boolean(),
});
export type CambiarActivoCampoCheckoutInput = z.infer<
  typeof cambiarActivoCampoCheckoutInput
>;

/** Hard delete (D5): las respuestas ya guardadas le sobreviven autocontenidas (`fieldId` SetNull). */
export const borrarCampoCheckoutInput = z.object({
  campoId: z.string().cuid(),
});
export type BorrarCampoCheckoutInput = z.infer<typeof borrarCampoCheckoutInput>;

/**
 * Reordenamiento: el cliente manda la lista COMPLETA de ids en el orden deseado y el server les
 * asigna `posicion = índice`. Mandar el orden entero (en vez de un "mové el campo X al puesto N")
 * hace la operación idempotente y sin estados intermedios raros — y permite validar de una que el
 * conjunto es exactamente el del tenant (I1).
 */
export const reordenarCamposCheckoutInput = z.object({
  idsEnOrden: z.array(z.string().cuid()).min(1),
});
export type ReordenarCamposCheckoutInput = z.infer<
  typeof reordenarCamposCheckoutInput
>;
