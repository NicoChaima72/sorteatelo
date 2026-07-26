/**
 * Derivación de la `clave` de un Campo de checkout (F02/D7). Helper PURO e interno del módulo.
 *
 * La clave se auto-deriva de la etiqueta AL CREAR y es INMUTABLE después (D5): es la llave estable
 * del snapshot (`CheckoutFieldResponse.clave`), la que viaja en el input del checkout (`{clave,
 * valor}`, I3) y el encabezado de columna del CSV (D9). Por eso su forma se fija acá de una vez.
 */

/**
 * Forma deliberadamente DISTINTA a `sugerirSlug` (kebab, `components/editor/panel-paginas.tsx`) y a
 * `esSlugValido` (label DNS, `tenancy/parsearHost.ts`): esos son slugs de URL/subdominio, donde el
 * guion es la convención. Una clave NO es una ruta — es una LLAVE DE DATO que termina como
 * encabezado de columna en un CSV y como key de un objeto `{clave, valor}`, así que va snake_case
 * (`telefono_de_contacto`), que no necesita comillas como key de JS ni se confunde con un menos.
 */
function slugificar(etiqueta: string): string {
  return etiqueta
    .trim()
    .toLowerCase()
    .normalize("NFD") // separa las tildes de su letra base…
    .replace(/[̀-ͯ]/g, "") // …y las descarta: "teléfono" ⇒ "telefono"
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_LARGO_CLAVE);
}

/** Tope de cordura del largo (no decisión de producto): la etiqueta ya viene acotada por Zod. */
const MAX_LARGO_CLAVE = 40;

/**
 * Fallback cuando la etiqueta no deja ni un carácter alfanumérico (p. ej. "¿?" o "———"): la clave
 * NUNCA puede quedar vacía, porque es la llave del snapshot. El sufijo anti-colisión la desambigua.
 */
const CLAVE_FALLBACK = "campo";

/**
 * Clave derivada de `etiqueta` que NO colisiona con `clavesTomadas`. El sufijo `_2`, `_3`… se agrega
 * hasta encontrar una libre.
 *
 * `clavesTomadas` debe traer las claves de TODOS los campos del tenant —**incluidos los INACTIVOS**:
 * el `@@unique([tenantId, clave])` alcanza también a los desactivados (fijado en `checkout.schema.001`),
 * así que desambiguar solo contra los activos haría estallar el insert en la cara del Organizador.
 */
export function derivarClaveUnica(
  etiqueta: string,
  clavesTomadas: ReadonlySet<string>,
): string {
  const base = slugificar(etiqueta) || CLAVE_FALLBACK;
  if (!clavesTomadas.has(base)) return base;

  for (let n = 2; ; n++) {
    const candidata = `${base}_${n}`;
    if (!clavesTomadas.has(candidata)) return candidata;
  }
}
