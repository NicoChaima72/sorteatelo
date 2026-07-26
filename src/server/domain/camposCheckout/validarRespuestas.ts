import { type CheckoutFieldType } from "@prisma/client";

import { DomainError } from "~/server/domain/errors";

/**
 * Definición de un Campo de checkout tal como la necesita el VALIDADOR (F05): solo las columnas con
 * las que se decide si una respuesta vale y cuál es su valor canónico, más el `id` para poblar
 * `fieldId` en el snapshot.
 *
 * NO extiende `CampoDelCheckout` (el shape público que viaja al Comprador) a propósito: `placeholder`
 * y `textoAyuda` son cosas del render y acá no pintan nada. Que el tipo declare exactamente lo que
 * usa es lo que deja al validador probable con un objeto de 7 campos y sin fixtures de más.
 */
export interface CampoParaValidar {
  id: string;
  clave: string;
  etiqueta: string;
  tipo: CheckoutFieldType;
  obligatorio: boolean;
  opciones: string[];
  defaultMarcado: boolean;
}

/**
 * Lo que manda el cliente: `{clave, valor}` y nada más. Shape LAXO a propósito (Plan paso 5) — el
 * `valor` llega como lo emite el input de Mantine que le tocó (`string`, `number` del NumberInput,
 * `boolean` del Checkbox, `null` de un Select deseleccionado). Ni el tipo, ni la etiqueta, ni la
 * obligatoriedad viajan: los pone el server contra la definición vigente (I3).
 */
export interface RespuestaCruda {
  clave: string;
  valor: string | number | boolean | null;
}

/**
 * Topes de CORDURA de los valores, no decisiones de producto (D3 delega el dimensionado, igual que
 * los topes de `camposCheckout/schemas.ts`). Acotan el abuso y el overflow; si alguna Tienda
 * necesitara un rango propio, eso es "min/max por campo" y está fuera de scope.
 */
const MAX_LARGO_TEXTO = 200;
const MIN_DIGITOS_TELEFONO = 7;
const MAX_DIGITOS_TELEFONO = 15; // máximo de E.164
/**
 * NUMERO no admite negativos: todo lo que una Tienda pide de verdad en un checkout (cantidad,
 * talla, edad, número de casa, año) es no-negativo, así que un `-5` es un typo, no un dato.
 *
 * El techo se mide en DÍGITOS y no en magnitud, y es deliberadamente alto: un tope "razonable" tipo
 * 1.000.000 no es cordura sino una decisión de producto encubierta — vetaría un código postal
 * chileno (`8320000`), un RUT sin dígito verificador (`12345678`, que es justo donde va a caer quien
 * pida RUT, porque el tipo RUT quedó fuera de scope) o un folio. 15 dígitos protege del overflow
 * (queda bajo `Number.MAX_SAFE_INTEGER`) sin vetar ningún dato real.
 */
const MAX_DIGITOS_NUMERO = 15;
const MAX_NUMERO = 10 ** MAX_DIGITOS_NUMERO - 1;

/**
 * Lo que se le dice al Comprador cuando la definición vigente y lo que él tiene en pantalla NO
 * coinciden — porque el Organizador tocó sus campos con el checkout abierto. No nombra la clave ni
 * enumera campos: no distinguir entre "inventada", "desactivada" y "de otra Tienda" es lo que
 * mantiene el aislamiento indistinguible (I1).
 */
const MENSAJE_FORM_DESACTUALIZADO =
  "El formulario de esta tienda cambió mientras completabas la compra. Recarga la página e inténtalo de nuevo.";

/** Fila lista para congelar. El `tenantId` lo agrega el use case, que es quien lo resolvió (I1). */
export interface RespuestaCongelada {
  fieldId: string;
  clave: string;
  etiqueta: string;
  tipo: CheckoutFieldType;
  valor: string;
}

/**
 * Valida las respuestas del Comprador contra las definiciones VIGENTES de la Tienda y devuelve las
 * filas a congelar (D2/I3).
 *
 * Recorre las DEFINICIONES, no las respuestas: es lo que hace que una clave que el cliente inventó
 * simplemente no tenga dónde entrar.
 */
export function validarRespuestasDeCheckout({
  definiciones,
  respuestas,
}: {
  definiciones: CampoParaValidar[];
  respuestas: RespuestaCruda[];
}): RespuestaCongelada[] {
  // Una sola respuesta por clave: las repetidas ya las rechazó el transporte (`iniciarCheckoutInput`),
  // que es donde el cliente tiene un mensaje que puede entender.
  const porClave = new Map(respuestas.map((r) => [r.clave, r.valor]));

  // Una clave que no corresponde a ningún campo ACTIVO no se ignora en silencio: o el Organizador
  // cambió sus campos con el form abierto, o el cliente inventó la clave. En los dos casos lo que
  // el Comprador cree estar respondiendo NO es lo que la Tienda pide, y guardar la mitad sería
  // peor que fallar. La definición vigente manda (I3/D5).
  const vigentes = new Set(definiciones.map((d) => d.clave));
  for (const { clave } of respuestas) {
    if (!vigentes.has(clave)) {
      throw new DomainError("INVALID", MENSAJE_FORM_DESACTUALIZADO);
    }
  }

  const filas: RespuestaCongelada[] = [];
  for (const definicion of definiciones) {
    const valor = canonizar(definicion, porClave.get(definicion.clave));
    if (valor === null) {
      if (definicion.obligatorio) {
        // Un obligatorio que el cliente NI SIQUIERA CONOCE (su clave no vino en el payload) es el
        // caso simétrico del de arriba: el Organizador AGREGÓ el campo con el checkout abierto.
        // Pedirle al Comprador que complete algo que no tiene renderizado sería mandarlo a buscar
        // un control que no existe — lo que necesita es recargar. Se distinguen porque el cliente
        // manda TODAS las claves que renderizó, incluso vacías (`respuestasParaEnviar`).
        throw new DomainError(
          "INVALID",
          porClave.has(definicion.clave)
            ? `Completa el campo "${definicion.etiqueta}" para continuar.`
            : MENSAJE_FORM_DESACTUALIZADO,
        );
      }
      continue;
    }
    filas.push({
      fieldId: definicion.id,
      clave: definicion.clave,
      etiqueta: definicion.etiqueta,
      tipo: definicion.tipo,
      valor,
    });
  }
  return filas;
}

/**
 * El valor CANÓNICO de una respuesta, o `null` si el campo quedó SIN responder (que no es lo mismo
 * que responder vacío: sin respuesta no hay fila).
 */
function canonizar(
  definicion: CampoParaValidar,
  valor: string | number | boolean | null | undefined,
): string | null {
  const tipo = definicion.tipo;

  // D4/I5 — CHECKBOX va ANTES del guard de presencia, y esa precedencia ES la decisión: su
  // respuesta no puede "faltar". El Comprador que no toca la casilla está respondiendo lo que el
  // Organizador dejó marcado por defecto, así que la fila se materializa igual.
  if (tipo === "CHECKBOX") {
    if (valor === undefined || valor === null)
      return String(definicion.defaultMarcado);
    if (typeof valor !== "boolean") {
      throw errorDeCampo(definicion, "solo admite marcada o sin marcar");
    }
    return String(valor);
  }

  // Para el resto, "sin responder" es ausente, `null` (Select deseleccionado) o string en blanco. `0` NO
  // es un hueco: es una respuesta (misma guarda que el espejo de cliente, campos.form.003).
  if (valor === undefined || valor === null) return null;
  if (typeof valor === "string" && valor.trim().length === 0) return null;

  switch (tipo) {
    case "TEXTO": {
      const texto = exigirTexto(definicion, valor);
      if (texto.length > MAX_LARGO_TEXTO) {
        throw errorDeCampo(
          definicion,
          `admite hasta ${MAX_LARGO_TEXTO} caracteres`,
        );
      }
      return texto;
    }

    case "TELEFONO":
      return canonizarTelefono(definicion, exigirTexto(definicion, valor));

    case "NUMERO":
      return canonizarNumero(definicion, valor);

    case "SELECT": {
      // Pertenencia ESTRICTA a las opciones VIGENTES (D3/I3): el único trato al valor es el trim
      // del transporte. Nada de case-insensitive ni de parecidos — adivinar guardaría un valor que
      // el Organizador nunca ofreció, y el CSV (D9) dejaría de ser agrupable por opción.
      const elegida = exigirTexto(definicion, valor);
      if (!definicion.opciones.includes(elegida)) {
        throw errorDeCampo(definicion, "no tiene esa opción");
      }
      return elegida;
    }
  }
}

/**
 * NUMERO (D3): ENTERO en rango de cordura, congelado en base 10 sin separadores.
 *
 * Acepta el valor como `number` Y como string porque el `NumberInput` de Mantine emite las dos
 * cosas (string mientras se escribe, número al normalizar) — no es laxitud, es el contrato real del
 * input. Un booleano NO entra: `Number(true) === 1` convertiría una casilla en un 1 silencioso.
 */
function canonizarNumero(
  definicion: CampoParaValidar,
  valor: string | number | boolean,
): string {
  if (typeof valor === "boolean") {
    throw errorDeCampo(definicion, "necesita un número entero");
  }
  if (typeof valor === "string" && !/^[+-]?\d+$/.test(valor.trim())) {
    // Base 10 DE VERDAD: `Number()` también entiende `0x10`, `1e3` y `.5`. El valor congelado sería
    // igual un entero correcto, pero aceptar notaciones que el input jamás emite es superficie
    // regalada — y el docstring quedaría mintiendo.
    throw errorDeCampo(definicion, "necesita un número entero");
  }
  const numero = typeof valor === "number" ? valor : Number(valor.trim());
  if (!Number.isInteger(numero)) {
    throw errorDeCampo(definicion, "necesita un número entero");
  }
  if (numero < 0) {
    throw errorDeCampo(definicion, "no admite números negativos");
  }
  if (numero > MAX_NUMERO) {
    throw errorDeCampo(
      definicion,
      `admite hasta ${MAX_DIGITOS_NUMERO} dígitos`,
    );
  }
  return String(numero);
}

/** Los tipos de texto solo aceptan texto: un número o un booleano acá es un cliente inventando. */
function exigirTexto(
  definicion: CampoParaValidar,
  valor: string | number | boolean,
): string {
  if (typeof valor !== "string") {
    throw errorDeCampo(definicion, "no admite ese valor");
  }
  return valor.trim();
}

/**
 * TELEFONO (D3): formato LAXO al entrar —dígitos con `+`, espacios, guiones, puntos y paréntesis,
 * que es como la gente escribe un número— y valor NORMALIZADO al congelar: solo los dígitos,
 * conservando el `+` inicial si venía. Así `+56 9 1234 5678` y `+56912345678` terminan siendo el
 * MISMO valor, que es lo que hace comparable la columna en el CSV (D9) y buscable el teléfono.
 *
 * SIN presunción de país: no se asume Chile ni se completa el `+56` que falte. Los topes son de
 * cordura (7 dígitos abajo, 15 arriba — el máximo de E.164), no una validación de numeración real:
 * eso exigiría una librería y una decisión de producto que nadie pidió.
 */
function canonizarTelefono(
  definicion: CampoParaValidar,
  texto: string,
): string {
  // El `+` SOLO adelante: en el medio no es un prefijo internacional, es un typo.
  if (!/^\+?[\d\s().-]+$/.test(texto)) {
    throw errorDeCampo(definicion, "necesita un teléfono válido");
  }
  const digitos = texto.replace(/\D/g, "");
  if (
    digitos.length < MIN_DIGITOS_TELEFONO ||
    digitos.length > MAX_DIGITOS_TELEFONO
  ) {
    throw errorDeCampo(definicion, "necesita un teléfono válido");
  }
  return texto.startsWith("+") ? `+${digitos}` : digitos;
}

/** Error de dominio que NOMBRA el campo: el mensaje llega tal cual al Comprador (runDomain). */
function errorDeCampo(
  definicion: CampoParaValidar,
  detalle: string,
): DomainError {
  return new DomainError(
    "INVALID",
    `El campo "${definicion.etiqueta}" ${detalle}.`,
  );
}
