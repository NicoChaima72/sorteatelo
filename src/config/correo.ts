/**
 * Config del sistema de correos al Comprador (F05, seam de **D2**).
 *
 * ── Por qué esto existe ────────────────────────────────────────────────────────────────────────
 * Hasta F05 el remitente era una CONSTANTE dentro de una plantilla (`plantillaDescarga.ts` primero,
 * `layoutCorreo.ts` después). D2 cerró que la separación de subdominios de envío
 * (`notificaciones.` para lo transaccional, `avisos.` para los recordatorios) está **aceptada en
 * principio pero DIFERIDA**: Resend Free da UN dominio verificado y el usuario decidió no contratar
 * Pro todavía. La consecuencia de diseño es esta: **el dominio de envío es un DATO de config, no un
 * literal disperso**, y quién elige el buzón es la `ClaseDeCorreo` del mensaje. El día que se
 * contrate Pro y se creen los subdominios, el switch es editar este archivo — ninguna plantilla.
 *
 * ── Client-safe A PROPÓSITO ────────────────────────────────────────────────────────────────────
 * Sin imports de `~/server` ni de `~/env` (mismo criterio que `config/app.ts`): el
 * `TEXTO_CONSENTIMIENTO_RECORDATORIOS` lo tiene que renderizar el checkout del Comprador (cliente)
 * y persistirlo el server, y esa es exactamente la razón por la que vive acá y no en `domain/`.
 */

/**
 * **Clase de correo** — la distinción de I5 («transaccional ≠ marketing») convertida en tipo.
 *
 * No es una etiqueta descriptiva: gobierna DOS cosas que no pueden discrepar entre sí —
 *
 * - el **buzón/dominio** desde el que sale (hoy el mismo para los dos, D2 diferida; mañana
 *   subdominios separados para que un blast de avisos no arrastre la reputación de los
 *   transaccionales), y
 * - las **cabeceras RFC 8058** (`List-Unsubscribe`/`List-Unsubscribe-Post`), que van SOLO en
 *   `avisos`. Ponerlas en un transaccional le dice a Gmail que la confirmación de una compra es
 *   material promocional del que uno se puede dar de baja — y no lo es: sale igual, sin opt-in
 *   (ADR-0027/I5).
 *
 * - `transaccional` — C1 (confirmación de compra), C4/C5 (resultado del sorteo).
 * - `avisos` — C2/C3 (recordatorios T-48h/T-6h). Marketing bajo el art. 28 B: opt-out SIEMPRE (D3).
 */
export type ClaseDeCorreo = "transaccional" | "avisos";

export const CORREO_CONFIG = {
  /**
   * Dominio de envío verificado en Resend (ADR-0014/0015). **Uno solo por ahora** (D2 diferida:
   * plan Free = 1 dominio). El trigger de reactivación está en ADR-0027 § Trigger: contratar Pro
   * cuando el volumen se acerque a 100/día o 3.000/mes.
   */
  dominioEnvio: "sorteatelo.cl",
  /**
   * Buzón por clase. Hoy los dos apuntan al mismo — y que coincidan es un HECHO DE CONFIG, no una
   * simplificación del código: el código ya sabe preguntar por clase. Con Resend Pro, `avisos`
   * pasa a `no-reply@avisos.sorteatelo.cl` y nada más cambia.
   */
  buzon: {
    transaccional: "no-reply",
    avisos: "no-reply",
  },
} as const;

/**
 * Remitente (`local@dominio`) de una clase de correo. Es la ÚNICA forma de obtener una dirección de
 * envío en todo el repo: un guard de test (`correo.remitente.003`) barre `domain/correo/` y falla
 * si alguna plantilla vuelve a escribir el dominio como literal.
 */
export function remitenteDeCorreo(clase: ClaseDeCorreo): string {
  return `${CORREO_CONFIG.buzon[clase]}@${CORREO_CONFIG.dominioEnvio}`;
}

/**
 * **El texto EXACTO del checkbox de consentimiento** (D5, Ley 21.719: consentimiento verificable).
 *
 * Vive en una constante compartida por una razón que no es DRY: el checkout lo RENDERIZA y el
 * server lo PERSISTE como prueba, y tienen que ser el mismo string carácter por carácter. Si el
 * cliente mandara el texto, el evaluado estaría escribiendo su propia prueba — así que el server lo
 * toma de acá y del input solo lee un booleano.
 *
 * Cambiarlo es legítimo (el copy puede mejorar): los consentimientos ya dados conservan su
 * `textoMostrado` snapshot, que es justamente lo que hace que la prueba se lea sola dentro de tres
 * años. Voz chilena sobria, tuteo (design.md §8); dice qué llega, de quién y que se puede cortar.
 */
export const TEXTO_CONSENTIMIENTO_RECORDATORIOS =
  "Quiero recibir recordatorios por correo de esta tienda antes de que cierre el sorteo. " +
  "Puedo darme de baja cuando quiera desde cualquiera de esos correos.";
