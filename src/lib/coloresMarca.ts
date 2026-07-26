/**
 * Paleta SUGERIDA para los dos colores de marca del Tenant (`colorPrimario` / `colorAcento`).
 *
 * Son hex literales a propósito y NO violan «cero hex inline» (design.md / I7): no pintan NUESTRA
 * UI —para eso están los tokens semánticos— sino que son DATOS ofrecidos al Organizador como atajo
 * para elegir SU marca. El color que termina guardado es arbitrario por definición (es de él).
 *
 * Vive acá, y no en cada pantalla, porque la marca se edita en DOS superficies (la card «Tu tienda»
 * del admin y el panel de Tema del editor) que escriben la MISMA columna: si cada una llevara su
 * propia lista, volveríamos al drift admin↔builder que admin-bases-pdf F06/D7 vino a matar.
 */
export const SWATCHES_MARCA = [
  "#7c3aed",
  "#ffc530",
  "#e11d48",
  "#0d9488",
  "#2b3fbf",
  "#f97316",
  "#111827",
] as const;
