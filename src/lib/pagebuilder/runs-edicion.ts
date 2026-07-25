import {
  RichTextoSchema,
  type DestinoLink,
  type MarcaRun,
  type MarkDefLink,
  type RichTexto,
  type Run,
} from "~/lib/pagebuilder/widgets";

/**
 * Manipulación PURA de RichTexto para el editor de runs (Tanda 3 F03/D6). Estas funciones operan sobre
 * el modelo de RUNS (no sobre el DOM) ⇒ testeables en node sin jsdom. El componente `EditorRuns`
 * (contenteditable) es una capa THIN que serializa DOM↔runs y delega TODA la lógica de marcas/links acá.
 *
 * El resultado SIEMPRE pasa por `limpiarRichTexto` (normaliza + limpia markDefs huérfanos) ⇒ produce un
 * RichTexto que parsea contra el MISMO `RichTextoSchema` que valida server-side (I3/I-U1). Cero HTML.
 */

/** Texto plano concatenado de los runs (para mapear offsets de selección DOM ↔ modelo). PURO. */
export function textoPlano(children: Run[]): string {
  return children.map((r) => r.t).join("");
}

/** `true` sii dos listas de marcas son el MISMO conjunto (orden-agnóstico). */
function mismasMarcas(a: MarcaRun[] | undefined, b: MarcaRun[] | undefined): boolean {
  const sa = new Set(a ?? []);
  const sb = new Set(b ?? []);
  if (sa.size !== sb.size) return false;
  for (const m of sa) if (!sb.has(m)) return false;
  return true;
}

/** Copia defensiva de un run (marcas clonadas). */
function clonarRun(run: Run): Run {
  return { t: run.t, ...(run.m ? { m: [...run.m] } : {}), ...(run.link !== undefined ? { link: run.link } : {}) };
}

/**
 * Une runs adyacentes con el MISMO conjunto de marcas y el MISMO link, y descarta runs de texto vacío.
 * NO merge si difieren las marcas o el link (un link distinto = otro span). PURA.
 */
export function normalizarRuns(children: Run[]): Run[] {
  const out: Run[] = [];
  for (const run of children) {
    if (run.t.length === 0) continue;
    const prev = out[out.length - 1];
    if (prev && mismasMarcas(prev.m, run.m) && prev.link === run.link) {
      prev.t += run.t; // merge de adyacentes iguales
    } else {
      out.push(clonarRun(run));
    }
  }
  return out;
}

/**
 * Parte los runs de modo que cada offset (posición en el texto plano) caiga en un BORDE de run. Preserva
 * marcas/links de cada run al partirlo. Base de las operaciones por-rango (marca/link). PURA.
 */
export function partirEnOffsets(children: Run[], offsets: number[]): Run[] {
  const cortes = [...new Set(offsets)].sort((a, b) => a - b);
  const out: Run[] = [];
  let pos = 0;
  for (const run of children) {
    const inicio = pos;
    const fin = pos + run.t.length;
    const internos = cortes.filter((o) => o > inicio && o < fin).map((o) => o - inicio);
    let ultimo = 0;
    for (const corte of internos) {
      out.push(clonarRun({ ...run, t: run.t.slice(ultimo, corte) }));
      ultimo = corte;
    }
    out.push(clonarRun({ ...run, t: run.t.slice(ultimo) }));
    pos = fin;
  }
  return out;
}

/** Limpia markDefs: conserva solo los referenciados por algún run (sin huérfanos, exigido por el schema). */
export function limpiarMarkDefs(children: Run[], markDefs: MarkDefLink[] | undefined): MarkDefLink[] {
  if (!markDefs || markDefs.length === 0) return [];
  const usados = new Set(children.map((r) => r.link).filter((l): l is string => l !== undefined));
  return markDefs.filter((d) => usados.has(d.id));
}

/**
 * Normaliza runs + limpia markDefs huérfanos ⇒ un RichTexto que parsea contra `RichTextoSchema`. Toda
 * operación del editor termina acá. `markDefs` ausente/vacío ⇒ se omite (no persiste `markDefs: []`).
 */
export function limpiarRichTexto(rico: RichTexto): RichTexto {
  const children = normalizarRuns(rico.children);
  const markDefs = limpiarMarkDefs(children, rico.markDefs);
  return { children, ...(markDefs.length ? { markDefs } : {}) };
}

/** Runs cuyo rango [inicio,fin) del texto plano cae DENTRO de [selInicio, selFin). PURO. */
function runsEnRango(children: Run[], selInicio: number, selFin: number): Run[] {
  let pos = 0;
  const dentro: Run[] = [];
  for (const run of children) {
    const rInicio = pos;
    const rFin = pos + run.t.length;
    if (rInicio >= selInicio && rFin <= selFin) dentro.push(run);
    pos = rFin;
  }
  return dentro;
}

/**
 * TOGGLE de una marca sobre la selección [inicio, fin) (offsets del texto plano). Si TODOS los runs del
 * rango ya tienen la marca ⇒ la quita; si no ⇒ la agrega (respetando el tope de 4 por run — si un run
 * ya tiene 4 marcas distintas, no se le agrega una 5ª, la validación final lo protegería igual). PURA.
 */
export function toggleMarca(rico: RichTexto, inicio: number, fin: number, marca: MarcaRun): RichTexto {
  if (inicio >= fin) return rico;
  const partido = partirEnOffsets(rico.children, [inicio, fin]);
  const enRango = runsEnRango(partido, inicio, fin);
  const todasTienen = enRango.length > 0 && enRango.every((r) => r.m?.includes(marca));
  let pos = 0;
  const nuevos = partido.map((run) => {
    const rInicio = pos;
    const rFin = pos + run.t.length;
    pos = rFin;
    if (rInicio >= inicio && rFin <= fin) {
      const marcas = new Set(run.m ?? []);
      if (todasTienen) {
        marcas.delete(marca);
      } else if (marcas.size < 4 || marcas.has(marca)) {
        marcas.add(marca);
      }
      const m = [...marcas];
      const { m: _viejo, ...resto } = run;
      void _viejo;
      return (m.length ? { ...resto, m } : resto) as Run;
    }
    return run;
  });
  return limpiarRichTexto({ ...rico, children: nuevos });
}

/**
 * Aplica un LINK (destino tipado) sobre [inicio, fin): parte en los bordes, setea `run.link = id` en los
 * runs del rango y agrega el markDef `{id, destino}`. El `id` lo provee el caller (el componente lo
 * genera) ⇒ función PURA/determinista/testeable. Reemplaza cualquier link previo en el rango. PURA.
 */
export function aplicarLink(
  rico: RichTexto,
  inicio: number,
  fin: number,
  id: string,
  destino: DestinoLink,
): RichTexto {
  if (inicio >= fin) return rico;
  const partido = partirEnOffsets(rico.children, [inicio, fin]);
  let pos = 0;
  const nuevos = partido.map((run) => {
    const rInicio = pos;
    const rFin = pos + run.t.length;
    pos = rFin;
    if (rInicio >= inicio && rFin <= fin) return { ...run, link: id };
    return run;
  });
  const markDefs = [...(rico.markDefs ?? []), { id, destino }];
  return limpiarRichTexto({ children: nuevos, markDefs });
}

/** Quita el link de los runs en [inicio, fin) (y limpia el markDef que queda huérfano). PURA. */
export function quitarLink(rico: RichTexto, inicio: number, fin: number): RichTexto {
  if (inicio >= fin) return rico;
  const partido = partirEnOffsets(rico.children, [inicio, fin]);
  let pos = 0;
  const nuevos = partido.map((run) => {
    const rInicio = pos;
    const rFin = pos + run.t.length;
    pos = rFin;
    if (rInicio >= inicio && rFin <= fin && run.link !== undefined) {
      const { link, ...resto } = run;
      void link;
      return resto as Run;
    }
    return run;
  });
  return limpiarRichTexto({ ...rico, children: nuevos });
}

/**
 * Serializa una lista de "tramos" planos (lo que el componente extrae del DOM: texto + marcas + link por
 * span) a un RichTexto VÁLIDO. Normaliza + limpia + PARSEA (el mismo borde Zod, I3): devuelve el RichTexto
 * o `null` si no parsea (p.ej. quedó vacío). El componente usa esto en cada blur/cambio antes de emitir.
 */
export function tramosARichTexto(
  tramos: { t: string; m?: MarcaRun[]; link?: string }[],
  markDefs: MarkDefLink[] | undefined,
): RichTexto | null {
  const children = normalizarRuns(
    tramos.map((tr) => ({ t: tr.t, ...(tr.m && tr.m.length ? { m: tr.m } : {}), ...(tr.link ? { link: tr.link } : {}) })),
  );
  if (children.length === 0) return null;
  const limpio = limpiarRichTexto({ children, ...(markDefs ? { markDefs } : {}) });
  const res = RichTextoSchema.safeParse(limpio);
  return res.success ? res.data : null;
}
