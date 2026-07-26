import { CheckoutFieldType } from "@prisma/client";

/**
 * Forma CANÓNICA de las columnas que dependen del `tipo` (F02). Helper PURO e interno del módulo,
 * compartido por `crearCampoCheckout` y `editarCampoCheckout` para que la fila nunca pueda quedar
 * en un estado que contradiga su tipo — da igual por qué puerta entre.
 *
 * Son NORMALIZACIONES, no rechazos: el panel ya oculta los controles que no aplican (D4/D7), así que
 * lo que llega de más es ruido de un form, no un intento de hacer algo raro. Rechazarlo daría un
 * error incomprensible ("¿por qué no puedo guardar si ni veo ese control?"); normalizarlo deja la
 * columna en la única forma con sentido. Los RECHAZOS por tipo (SELECT sin opciones, opciones
 * repetidas) viven en `schemas.ts`, que es donde el Organizador sí necesita el mensaje.
 */
export function normalizarPorTipo({
  tipo,
  obligatorio,
  opciones,
  defaultMarcado,
}: {
  tipo: CheckoutFieldType;
  obligatorio: boolean;
  opciones: string[];
  defaultMarcado: boolean;
}): { obligatorio: boolean; opciones: string[]; defaultMarcado: boolean } {
  const esCheckbox = tipo === CheckoutFieldType.CHECKBOX;
  return {
    // D4/I5: CHECKBOX es DATO PURO — su respuesta siempre existe (parte del default), así que
    // `obligatorio` no significa nada. Normalizarlo acá (en vez de en cada capa de render) es lo que
    // permite que el checkout y el panel traten `obligatorio` sin un caso especial por tipo.
    obligatorio: esCheckbox ? false : obligatorio,
    // Las opciones son el DOMINIO del valor de un SELECT (D3); en cualquier otro tipo no existen.
    opciones: tipo === CheckoutFieldType.SELECT ? opciones : [],
    // El default solo tiene sentido donde hay algo que marcar.
    defaultMarcado: esCheckbox ? defaultMarcado : false,
  };
}
