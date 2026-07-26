import { PrismaClient } from "@prisma/client";

import { sanearNombreArchivo } from "../src/server/services/storage";

/**
 * Backfill `Product.pdfPath` → fila `ProductFile` (productos-tipos-digitales F01, D2). Es el paso 2
 * de la migración **EXPANDIR** del archivo vendible: el archivo deja de ser una columna de `Product`
 * y pasa a tabla, para que un producto pueda tener 1 archivo (ESTANDAR) o un pool de M (SOBRE, F05).
 *
 * ⚠ **La DB es COMPARTIDA dev = prod** (ADR-0015, transitorio). Por eso:
 *
 * - Este script es **puramente aditivo**: crea filas en `ProductFile` y **NO TOCA `pdfPath`** ni
 *   ninguna otra columna. El código VIEJO deployado en prod sigue leyendo `pdfPath` y sigue
 *   funcionando exactamente igual mientras esta tabla se llena por detrás.
 * - Es **RE-CORRIBLE, no "una sola vez"**: mientras el código nuevo no esté deployado, prod-viejo
 *   puede seguir escribiendo `pdfPath` nuevos. Correrlo de nuevo (antes/después del deploy) recoge
 *   los rezagados y deja en no-op los ya migrados. La idempotencia la garantiza el unique GLOBAL de
 *   `ProductFile.key`, no una heurística del script.
 *
 * Reglas de la conversión (una fila por `pdfPath`, N = 1):
 *
 * 1. **`key` VERBATIM**. Se copia el `pdfPath` tal cual, sin recomputar ni "arreglar". Las keys
 *    legacy son `<tenantId>/<productId>.pdf`, pero hay filas de seed con otra forma (p. ej.
 *    `prueba/seed/…​.pdf`, sin el prefijo del tenant) que hoy la defensa I9 de `manejarDescarga`
 *    rechaza con un 404 neutral. Copiar verbatim preserva ESE comportamiento byte a byte: la
 *    migración no arregla ni rompe nada, solo cambia dónde vive el dato.
 * 2. **Tipo PDF**. Todo lo que hay en `pdfPath` es un PDF por construcción (`confirmarPdfProducto`
 *    era el único escritor y firmaba `application/pdf`).
 * 3. **`bytes: null`** — el tamaño real es DESCONOCIDO y el backfill NO le pega a R2 para
 *    averiguarlo. `null` es "no lo sé", que es la verdad; un `0` sería un hecho falso que la cuota
 *    futura del carril facturación (D8) sumaría en silencio.
 * 4. **`confirmadoAt` no-null**. El archivo SÍ está confirmado: `pdfPath` no-null solo existía
 *    después de un `headObject` exitoso. El INSTANTE exacto es irrecuperable, así que se usa el de
 *    la corrida — lo que la columna decide es el hecho binario "entregable", no una auditoría fina.
 * 5. **`nombreArchivo` = el nombre que la descarga YA usaba** (`sanearNombreArchivo(titulo)`), para
 *    que el archivo que recibe el Comprador siga llamándose exactamente igual tras la migración.
 *
 * Patrón núcleo testeable + wrapper (`backend-conventions` § Scripts CLI), igual que
 * `backfill-numeros-sorteo.ts`: `backfillArchivosDeProducto({ db })` recibe el cliente INYECTADO y
 * devuelve un resultado estructurado; `main()` carga `.env`, instancia su propio `PrismaClient` y
 * formatea la salida.
 */

/**
 * Qué pasó con un producto durante el barrido:
 * - `creado`: esta corrida insertó su `ProductFile`.
 * - `ya-migrado`: la fila ya existía ⇒ no-op (re-corrida, o carrera ganada por otro proceso).
 * - `omitido-fila-ausente`: el producto o su Tienda **desaparecieron mientras el script corría**.
 *   No es hipotético: el barrido es de la DB ENTERA y la app está VIVA, así que entre el
 *   `findMany` y el `create` alguien puede haber borrado la fila. Se salta y se sigue con el
 *   resto — abortar dejaría a medias una migración que justamente tiene que poder re-correrse.
 */
export type EstadoBackfillArchivo =
  | "creado"
  | "ya-migrado"
  | "omitido-fila-ausente";

export interface ResultadoBackfillArchivo {
  productId: string;
  tenantId: string;
  /** La key copiada verbatim del `pdfPath`. */
  key: string;
  estado: EstadoBackfillArchivo;
}

type DbBackfill = Pick<PrismaClient, "product" | "productFile">;

export async function backfillArchivosDeProducto({
  db,
}: {
  db: DbBackfill;
}): Promise<ResultadoBackfillArchivo[]> {
  const conPdf = await db.product.findMany({
    where: { pdfPath: { not: null } },
    select: { id: true, tenantId: true, titulo: true, pdfPath: true },
    orderBy: { id: "asc" }, // orden determinista para una salida reproducible
  });

  const resultados: ResultadoBackfillArchivo[] = [];

  for (const producto of conPdf) {
    // `pdfPath` no-null garantizado por el `where`; el narrowing lo pide TS.
    const key = producto.pdfPath;
    if (key === null) continue;

    // Idempotencia por el unique GLOBAL de `key`. El `findUnique` resuelve el caso normal y el
    // `catch` cubre las dos carreras posibles contra una DB VIVA — en ambas el script sigue con
    // el resto de los productos en vez de abortar a medias:
    //  - P2002 (key duplicada): otro proceso creó exactamente la fila que íbamos a crear ⇒ es el
    //    resultado deseado, no un error.
    //  - P2003 (FK violada): el producto o su Tienda se borraron entre el barrido y el insert ⇒
    //    ya no hay nada que migrar.
    const existente = await db.productFile.findUnique({
      where: { key },
      select: { id: true },
    });

    let estado: EstadoBackfillArchivo = "ya-migrado";
    if (!existente) {
      try {
        await db.productFile.create({
          data: {
            tenantId: producto.tenantId,
            productId: producto.id,
            key,
            contentType: "application/pdf",
            tipo: "PDF",
            bytes: null, // desconocido: el backfill no le pega a R2 (regla 3)
            nombreArchivo: sanearNombreArchivo(producto.titulo, "application/pdf"),
            confirmadoAt: new Date(), // el hecho es "confirmado"; el instante real es irrecuperable
          },
          select: { id: true },
        });
        estado = "creado";
      } catch (e) {
        if (esCodigoPrisma(e, "P2002")) estado = "ya-migrado";
        else if (esCodigoPrisma(e, "P2003")) estado = "omitido-fila-ausente";
        else throw e;
      }
    }

    resultados.push({
      productId: producto.id,
      tenantId: producto.tenantId,
      key,
      estado,
    });
  }

  return resultados;
}

/**
 * `true` si el error trae ese `code` de Prisma. Se detecta por el `code` sin depender de la clase
 * concreta del error (mismo criterio que `esNotFound` en `services/storage.ts`), para no importar
 * `Prisma` solo por el type-guard.
 */
function esCodigoPrisma(e: unknown, code: string): boolean {
  if (typeof e !== "object" || e === null) return false;
  return (e as { code?: string }).code === code;
}

async function main() {
  // Node 20.6+/24: carga .env sin dependencia externa (dotenv no es dep del repo).
  try {
    process.loadEnvFile();
  } catch {
    // .env ausente: seguimos con process.env tal cual (CI/entornos con env inyectado).
  }

  const db = new PrismaClient();
  try {
    const res = await backfillArchivosDeProducto({ db });
    if (res.length === 0) {
      console.log("= nada que hacer: no hay productos con `pdfPath`.");
      return;
    }
    const creados = res.filter((r) => r.estado === "creado");
    const omitidos = res.filter((r) => r.estado === "omitido-fila-ausente");
    for (const r of creados) {
      console.log(
        `✓ producto ${r.productId} (tenant ${r.tenantId}): ProductFile creado para ${r.key}`,
      );
    }
    for (const r of omitidos) {
      console.warn(
        `! producto ${r.productId} (tenant ${r.tenantId}): se borró durante el barrido; omitido.`,
      );
    }
    console.log(
      `✓ ${creados.length} archivo(s) creado(s); ` +
        `${res.length - creados.length - omitidos.length} ya migrado(s) (no-op)` +
        `${omitidos.length > 0 ? `; ${omitidos.length} omitido(s)` : ""} ` +
        `de ${res.length} producto(s) con pdfPath.`,
    );
  } finally {
    await db.$disconnect();
  }
}

// Solo corre como script invocado; importar el núcleo desde un test NO dispara main().
if (process.argv[1]?.includes("backfill-product-files")) {
  main().catch((e) => {
    console.error(
      "✗ Falló el backfill de archivos de producto:",
      e instanceof Error ? e.message : e,
    );
    process.exit(1);
  });
}
