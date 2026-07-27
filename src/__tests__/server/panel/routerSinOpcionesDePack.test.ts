import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guard ESTRUCTURAL de la muerte de `ProductPackOption` (productos-tipos-digitales ENMIENDA v2,
 * F11 / V-I3).
 *
 * La enmienda v2 convirtió el pack en un PRODUCTO (`Product.fuenteId` + `unidadesPorPack`), así que
 * el CRUD de «opciones de pack» dejó de existir: se borraron sus use cases, sus 4 procedures del
 * router y su UI. Lo que NO se borró es la **tabla** — la DB es compartida dev=prod (ADR-0015) y el
 * drop es un plan aparte, así que `ProductPackOption` sigue en el schema y sigue siendo accesible
 * vía `db.productPackOption.*`. Esa es exactamente la condición peligrosa: el modelo está vivo en el
 * cliente de Prisma y compila, de modo que un lector nuevo no lo delata ni con `tsc` ni con un test
 * de comportamiento. Lo único que lo delata es una aserción de AUSENCIA.
 *
 * Por eso este test es estructural, en el espíritu de `facturacion.gate.borde.005`: la validación de
 * F11 que dice «las procedures ya no existen» no se puede satisfacer con un grep de una tarde —el
 * grep pasa hoy y nadie lo vuelve a correr—, se satisface pinneando la ausencia.
 *
 * Lo que este test NO afirma: que la tabla no exista (existe a propósito, V-I3) ni que nunca vuelva
 * a haber packs. Solo que el CÓDIGO DE APLICACIÓN no la lee ni la escribe, y que el router del panel
 * no expone su CRUD. El día que se dropee la tabla, este archivo se borra con ella.
 */

const SRC = fileURLToPath(new URL("../../../", import.meta.url)); // src/

const leer = (rel: string) => readFileSync(SRC + rel, "utf8");

/**
 * El mismo archivo SIN sus comentarios — que es sobre lo que un guard de ausencia tiene que
 * razonar.
 *
 * El repo documenta sus muertes en el lugar donde ocurrieron: `checkout.ts` y
 * `checkout/schemas.ts` tienen una lápida que explica por qué `getProductoStorefront` ya no está
 * ahí. Buscar sobre el texto crudo convertía esas lápidas en «resurrecciones» y ponía el test rojo
 * por hacer bien la documentación — el mismo impuesto que el bloque (a) ya evita al buscar
 * `nombre:` en vez de la palabra suelta. Un guard que castiga los comentarios termina borrándolos.
 *
 * Se sacan los bloques `/* … *\/` y las líneas que son COMENTARIO ENTERO (`//` o `*` de JSDoc). No
 * se tocan los `//` al final de una línea de código: cortar ahí se llevaría puesto cualquier `://`
 * de una URL y podría ESCONDER un lector real, y un guard de ausencia solo puede equivocarse hacia
 * el lado de gritar de más.
 */
const leerCodigo = (rel: string) =>
  leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");

/** Todos los `.ts`/`.tsx` bajo un directorio de `src/`, en rutas con `/`. */
function archivosBajo(dir: string): string[] {
  return readdirSync(SRC + dir, { recursive: true, encoding: "utf8" })
    .map((f) => `${dir}/${f.split("\\").join("/")}`)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
}

/**
 * El código de APLICACIÓN: server, componentes y páginas. Se excluye `src/__tests__` a propósito —
 * los tests de F05 que verifican los constraints de la tabla en Postgres siguen siendo legítimos
 * mientras la tabla exista, y los fixtures de otras features todavía la limpian.
 */
const APLICACION = [
  ...archivosBajo("server"),
  ...archivosBajo("components"),
  ...archivosBajo("pages"),
];

describe("panel/sin opciones de pack (guard estructural de la ENMIENDA v2)", () => {
  // panel.packs.muertos.001 — el CRUD de opciones no existe ni como procedure ni como caller
  it("ni el router del panel ni el código de aplicación tocan ProductPackOption", () => {
    // (a) Las 4 procedures que existieron hasta la enmienda. Se buscan como CLAVE de procedure
    // (`nombre:`) y no como palabra suelta: el router documenta su muerte en un comentario, y ese
    // comentario tiene que poder nombrarlas sin romper el test — si no, la doc se vuelve mentira o
    // el test se vuelve un impuesto.
    const router = leer("server/api/routers/panel.ts");
    for (const nombre of [
      "crearOpcionDePack",
      "actualizarOpcionDePack",
      "borrarOpcionDePack",
      "listarOpcionesDePack",
    ]) {
      expect(router).not.toMatch(new RegExp(`^\\s*${nombre}\\s*:`, "m"));
    }

    /*
      (b) Cero lectores y cero escritores en el código de APLICACIÓN. Se cuentan las DOS puertas: el
      acceso directo (`db.productPackOption`) y —la que se escapa— la relación `packOptions` del
      Product, que lee la misma tabla sin nombrarla.

      La lista está VACÍA desde F13. Llegó a tener tres entradas mientras la enmienda avanzaba: la
      muerte de `ProductPackOption` se repartió en tres tandas (F11 el panel, F12 el checkout, F13
      el catálogo y el detalle), y el allowlist llevaba la deuda declarada por archivo. Se deja
      asserteado como IGUALDAD y no como «subconjunto» a propósito: así el guard falla en las dos
      direcciones —si aparece un lector nuevo, y también si alguien borra un archivo y no actualiza
      la lista—. Un allowlist que solo sabe crecer es un allowlist que miente.
    */
    const lectores = APLICACION.filter((f) =>
      /\b(db|tx|prisma)\.productPackOption\b|\bpackOptions\b/.test(leerCodigo(f)),
    );
    expect(lectores).toEqual([]);

    // (c) Los módulos borrados no volvieron por otra puerta (un import a un archivo inexistente lo
    // cazaría `tsc`, pero un archivo NUEVO con el mismo rol no lo caza nadie).
    const resucitados = APLICACION.filter((f) =>
      /opciones-de-pack|opcionesDePack|selector-de-pack|getProductoStorefront/.test(
        leerCodigo(f),
      ),
    );
    expect(resucitados).toEqual([]);
  });
});
