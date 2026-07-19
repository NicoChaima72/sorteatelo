import {
  PutBucketCorsCommand,
  S3Client,
  type CORSRule,
} from "@aws-sdk/client-s3";

/**
 * Configura el CORS del bucket R2 para permitir la SUBIDA del PDF por presigned PUT desde el
 * navegador (F03/D2). Sin este CORS, el `fetch` PUT del panel (origen `<slug>.localhost:3001`)
 * lo bloquea el navegador. La descarga NO necesita CORS: es una navegación top-level al
 * redirect 302 (no un fetch/XHR).
 *
 * Patrón núcleo testeable + wrapper (backend-conventions § Scripts CLI):
 * - `construirReglasCors()` es PURO (testeable sin red): arma las reglas CORS.
 * - `aplicarCorsR2({ client, bucket })` es el núcleo: envía `PutBucketCors` con esas reglas.
 * - `main()` es el wrapper: carga .env, construye el S3Client desde process.env (excepción CLI
 *   al singleton), formatea la salida y, si el token no tiene permiso para `PutBucketCors`
 *   (S2), imprime el error claro + el paso manual en el dashboard de Cloudflare (no bloquea el
 *   resto de la fase). Un CLI jamás loguea secretos: solo config inocua.
 *
 * Uso:  npm run cors:r2
 */

/**
 * Orígenes que pueden hacer el PUT: apex + subdominios de tenant, en dev (:3001) y en
 * producción (sorteatelo.cl, ADR-0014/0015). El editor sube imágenes DESDE el subdominio.
 */
export const ORIGENES_DEV = [
  "http://localhost:3001",
  "http://*.localhost:3001",
  "https://sorteatelo.cl",
  "https://*.sorteatelo.cl",
];

/** Reglas CORS puras (para el PUT de subida del PDF). */
export function construirReglasCors(origenes: string[] = ORIGENES_DEV): CORSRule[] {
  return [
    {
      AllowedOrigins: origenes,
      AllowedMethods: ["PUT"],
      AllowedHeaders: ["content-type"],
      MaxAgeSeconds: 3600,
    },
  ];
}

export async function aplicarCorsR2({
  client,
  bucket,
  origenes = ORIGENES_DEV,
}: {
  client: Pick<S3Client, "send">;
  bucket: string;
  origenes?: string[];
}): Promise<{ bucket: string; reglas: CORSRule[] }> {
  const reglas = construirReglasCors(origenes);
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: { CORSRules: reglas },
    }),
  );
  return { bucket, reglas };
}

function exigirEnv(nombre: string): string {
  const v = process.env[nombre];
  if (!v) {
    throw new Error(`Falta ${nombre} en .env (ver .env.example).`);
  }
  return v;
}

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    // .env ausente: seguimos con process.env tal cual.
  }

  const bucket = exigirEnv("R2_BUCKET");
  const client = new S3Client({
    region: "auto",
    endpoint: exigirEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: exigirEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: exigirEnv("R2_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  try {
    const { reglas } = await aplicarCorsR2({ client, bucket });
    console.log(`✓ CORS aplicado al bucket "${bucket}":`);
    console.log(JSON.stringify(reglas, null, 2));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`✗ No se pudo aplicar el CORS al bucket "${bucket}": ${msg}`);
    console.error(
      "\nSi el token Object R&W no tiene permiso para PutBucketCors (S2), configúralo\n" +
        "MANUALMENTE en el dashboard de Cloudflare → R2 → " +
        `${bucket} → Settings → CORS Policy, con:\n` +
        JSON.stringify(construirReglasCors(), null, 2),
    );
    process.exit(1);
  }
}

// Solo corre como script invocado; importar el núcleo desde un test NO dispara main().
if (process.argv[1]?.includes("configurar-cors-r2")) {
  main().catch((e) => {
    console.error("✗ Falló la configuración de CORS:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
