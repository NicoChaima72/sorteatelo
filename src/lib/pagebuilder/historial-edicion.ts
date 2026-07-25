/**
 * Snapshot-stack de undo/redo del editor (Tanda 3 F13/D20). PURO, genérico, testeable en node. Modelo de
 * dos pilas (`pasado`/`futuro`) con cap acotado. Vive en memoria del editor (se pierde al recargar —
 * aceptable MVP, mapa §4). **Publicar/rollback NUNCA participan** (son acciones fuera del editor): solo
 * las mutaciones normales del borrador registran su estado previo acá.
 *
 * Semántica:
 *  - `registrar(stack, anterior)`: antes de aplicar una edición nueva, empuja el estado PREVIO al `pasado`
 *    y LIMPIA el `futuro` (una rama nueva invalida los redos pendientes). Respeta el cap (descarta lo más
 *    viejo).
 *  - `deshacer(stack, actual)`: saca el último del `pasado` (el snapshot a restaurar) y empuja `actual` al
 *    `futuro`. `null` si no hay pasado.
 *  - `rehacer(stack, actual)`: saca el último del `futuro` y empuja `actual` al `pasado`. `null` si no hay
 *    futuro.
 */

export interface StackSnapshots<T> {
  /** Estados anteriores (para undo); el último es el más reciente. */
  pasado: T[];
  /** Estados deshechos (para redo); el último es el más reciente. */
  futuro: T[];
  /** Tope de `pasado` (cordura de memoria — mapa §4: ~30 basta). */
  cap: number;
}

/** Crea un stack vacío con el cap dado (default 30, D20). */
export function crearStack<T>(cap = 30): StackSnapshots<T> {
  return { pasado: [], futuro: [], cap };
}

/** Empuja `anterior` al pasado y limpia el futuro (rama nueva). Respeta el cap (FIFO del más viejo). */
export function registrar<T>(stack: StackSnapshots<T>, anterior: T): StackSnapshots<T> {
  const pasado = [...stack.pasado, anterior];
  if (pasado.length > stack.cap) pasado.splice(0, pasado.length - stack.cap);
  return { pasado, futuro: [], cap: stack.cap };
}

/** Deshace: devuelve el snapshot a restaurar + el stack nuevo, o `null` si no hay pasado. */
export function deshacer<T>(
  stack: StackSnapshots<T>,
  actual: T,
): { stack: StackSnapshots<T>; snapshot: T } | null {
  if (stack.pasado.length === 0) return null;
  const pasado = [...stack.pasado];
  const snapshot = pasado.pop()!;
  return {
    stack: { pasado, futuro: [...stack.futuro, actual], cap: stack.cap },
    snapshot,
  };
}

/** Rehace: devuelve el snapshot a restaurar + el stack nuevo, o `null` si no hay futuro. */
export function rehacer<T>(
  stack: StackSnapshots<T>,
  actual: T,
): { stack: StackSnapshots<T>; snapshot: T } | null {
  if (stack.futuro.length === 0) return null;
  const futuro = [...stack.futuro];
  const snapshot = futuro.pop()!;
  const pasado = [...stack.pasado, actual];
  if (pasado.length > stack.cap) pasado.splice(0, pasado.length - stack.cap);
  return {
    stack: { pasado, futuro, cap: stack.cap },
    snapshot,
  };
}

/** `true` sii hay algo que deshacer (para habilitar el atajo/botón). */
export function puedeDeshacer<T>(stack: StackSnapshots<T>): boolean {
  return stack.pasado.length > 0;
}

/** `true` sii hay algo que rehacer. */
export function puedeRehacer<T>(stack: StackSnapshots<T>): boolean {
  return stack.futuro.length > 0;
}
