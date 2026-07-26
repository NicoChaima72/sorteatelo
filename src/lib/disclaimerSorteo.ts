/**
 * Disclaimer FIJO de plataforma sobre la responsabilidad del sorteo (ADR-0008).
 *
 * Vive en un módulo propio —puro, client+server safe, sin dependencias— porque lo muestran DOS
 * superficies distintas: la vitrina del sorteo (`components/storefront/sorteo.tsx`) y la página de
 * bases (`pages/bases.tsx`, admin-bases-pdf F04). Tenerlo duplicado como literal en cada una fue
 * exactamente el drift que este plan vino a matar: las dos copias ya habían divergido (una perdió la
 * frase final) antes de extraerlo acá.
 *
 * **NO es configurable por el tenant** (I4/ADR-0008): no sale del Documento de Página, no lo toca el
 * builder y ninguna prop lo apaga. Se muestra SIEMPRE que hay sorteo activo.
 *
 * La redacción legal fina se ajusta con abogado antes del go-live público (F10 del roadmap): cuando
 * eso pase, este archivo es el ÚNICO lugar a editar.
 */
export const DISCLAIMER_SORTEO =
  "Este sorteo es organizado y ejecutado exclusivamente por quien opera esta tienda, único " +
  "responsable de sus bases, premios y resultado. La plataforma solo provee la tecnología: no " +
  "organiza el sorteo ni responde por su ejecución. Revisa las bases antes de participar.";
