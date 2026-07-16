import { PrismaClient, type TenantStatus } from "@prisma/client";

import { cifrar, parsearClave } from "~/server/services/cifrado";

/**
 * Siembra los tenants de dev de F01 (paso 7 del roadmap): tenant piloto (autora) +
 * tenant de prueba, cada uno con su CredencialFlow sandbox CIFRADA (BYO-Flow, ADR-0006)
 * y 1 producto. Es la base de la prueba de fuego de F01 — "dos tenants cobrando con
 * credenciales distintas en sandbox" (D1).
 *
 * Patrón núcleo testeable + wrapper (backend-conventions § Scripts CLI):
 * - `sembrarTenants({ db, clave, specs })` es el núcleo: recibe el cliente y la clave
 *   de cifrado INYECTADOS, es idempotente (find-or-create por slug / tenantId / título)
 *   y devuelve un resultado estructurado. No toca env, no instancia Prisma, no hace exit.
 * - `main()` es el wrapper: carga .env, lee `CREDENTIALS_ENCRYPTION_KEY` + las
 *   credenciales Flow de env, instancia su propio PrismaClient (excepción aceptada al
 *   singleton para scripts tsx), desconecta en finally y formatea la salida SIN secretos.
 *
 * I5: las credenciales se guardan cifradas; el script jamás loguea secretos.
 */

export interface EspecificacionTenant {
  slug: string;
  nombre: string;
  estado: TenantStatus;
  /** Credenciales Flow en PLANO (se cifran antes de persistir). */
  flow: { apiKey: string; secretKey: string; sandbox: boolean };
  producto: {
    titulo: string;
    descripcion: string;
    /** CLP entero como string (se persiste como Decimal). */
    precio: string;
    pdfPath: string;
  };
}

export interface ResultadoSeedTenant {
  slug: string;
  tenantId: string;
  tenantCreado: boolean;
  credencialCreada: boolean;
  productoCreado: boolean;
}

type DbSeed = Pick<PrismaClient, "tenant" | "flowCredential" | "product">;

export async function sembrarTenants({
  db,
  clave,
  specs,
}: {
  db: DbSeed;
  clave: Buffer;
  specs: EspecificacionTenant[];
}): Promise<ResultadoSeedTenant[]> {
  const resultados: ResultadoSeedTenant[] = [];

  for (const spec of specs) {
    // 1) Tenant — idempotente por slug (único a nivel plataforma).
    let tenant = await db.tenant.findUnique({ where: { slug: spec.slug } });
    const tenantCreado = tenant === null;
    if (!tenant) {
      tenant = await db.tenant.create({
        data: { slug: spec.slug, nombre: spec.nombre, estado: spec.estado },
      });
    }

    // 2) CredencialFlow — 1-1 por tenantId. Se cifra apiKey/secretKey antes de guardar (I5).
    // UPSERT (no find-or-create): si el tenant ya existía con placeholders, re-correr
    // el seed con credenciales reales debe REEMPLAZARLAS — si no, el E2E de F01
    // seguiría firmando con placeholders aunque el env ya tenga las cuentas reales.
    const credExistente = await db.flowCredential.findUnique({
      where: { tenantId: tenant.id },
      select: { id: true },
    });
    const credencialCreada = credExistente === null;
    const datosCredencial = {
      apiKeyCifrada: cifrar(spec.flow.apiKey, clave),
      secretKeyCifrada: cifrar(spec.flow.secretKey, clave),
      sandbox: spec.flow.sandbox,
    };
    await db.flowCredential.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, ...datosCredencial },
      update: datosCredencial,
    });

    // 3) Producto — idempotente por (tenantId, título). Sin unique en DB (no es regla
    //    del dominio), así que find-or-create explícito.
    const prodExistente = await db.product.findFirst({
      where: { tenantId: tenant.id, titulo: spec.producto.titulo },
      select: { id: true },
    });
    const productoCreado = prodExistente === null;
    if (!prodExistente) {
      await db.product.create({
        data: {
          tenantId: tenant.id,
          titulo: spec.producto.titulo,
          descripcion: spec.producto.descripcion,
          precio: spec.producto.precio,
          pdfPath: spec.producto.pdfPath,
          activo: true,
        },
      });
    }

    resultados.push({
      slug: spec.slug,
      tenantId: tenant.id,
      tenantCreado,
      credencialCreada,
      productoCreado,
    });
  }

  return resultados;
}

/**
 * Credenciales Flow sandbox de UN tenant seed, leídas de env por PAR completo
 * (`FLOW_<TENANT>_API_KEY` + `FLOW_<TENANT>_SECRET_KEY`, ver .env.example):
 * - Par completo ⇒ credenciales reales de ESA cuenta.
 * - Ninguna de las dos ⇒ placeholder sandbox (obviamente falso; no sirve para el
 *   E2E contra Flow, sí para la estructura).
 * - Par a medias ⇒ error (mejor fallar que sembrar una credencial mitad real).
 *
 * D1 (prueba de fuego de F01): cada tenant con SU cuenta sandbox DISTINTA — por
 * eso las vars son por-tenant y no un set global.
 */
function credencialDeEnv(
  slug: string,
  par: { apiKey?: string; secretKey?: string },
): { cred: EspecificacionTenant["flow"]; real: boolean } {
  if (par.apiKey && par.secretKey) {
    return {
      cred: { apiKey: par.apiKey, secretKey: par.secretKey, sandbox: true },
      real: true,
    };
  }
  if (par.apiKey ?? par.secretKey) {
    const prefijo = `FLOW_${slug.toUpperCase()}`;
    throw new Error(
      `Credenciales Flow a medias para "${slug}": definí ${prefijo}_API_KEY y ` +
        `${prefijo}_SECRET_KEY juntas (o ninguna, para sembrar placeholders).`,
    );
  }
  return {
    cred: {
      apiKey: `sandbox-apikey-${slug}-PLACEHOLDER`,
      secretKey: `sandbox-secretkey-${slug}-PLACEHOLDER`,
      sandbox: true,
    },
    real: false,
  };
}

/** Construye las specs de dev con la credencial que corresponda a cada tenant. */
function construirSpecs(envFlow: {
  autora: { apiKey?: string; secretKey?: string };
  prueba: { apiKey?: string; secretKey?: string };
}): { specs: EspecificacionTenant[]; realesPorSlug: Record<string, boolean> } {
  const autora = credencialDeEnv("autora", envFlow.autora);
  const prueba = credencialDeEnv("prueba", envFlow.prueba);

  // D1: dos cuentas DISTINTAS. Misma secretKey en ambos tenants = una sola cuenta:
  // la prueba de fuego (firmas HMAC distintas por tenant) perdería sentido.
  if (autora.real && prueba.real && autora.cred.secretKey === prueba.cred.secretKey) {
    throw new Error(
      "Las credenciales Flow de 'autora' y 'prueba' son la MISMA cuenta. La prueba " +
        "de fuego de F01 (D1) exige dos cuentas sandbox distintas.",
    );
  }

  const realesPorSlug = { autora: autora.real, prueba: prueba.real };
  const credAutora = autora.cred;
  const credPrueba = prueba.cred;

  const specs: EspecificacionTenant[] = [
    {
      slug: "autora",
      nombre: "Tienda de la Autora (piloto)",
      estado: "PUBLICADA", // dev: publicada para que el storefront resuelva en E2E (go-live real = F07)
      flow: credAutora,
      producto: {
        titulo: "Cómo enriquecer a tu idol favorito",
        descripcion:
          "La guía definitiva (y con humor) para apoyar a tu idol favorito del K-pop. Incluye tips de fandom ARMY.",
        precio: "3000",
        pdfPath: "autora/seed/como-enriquecer-a-tu-idol-favorito.pdf",
      },
    },
    {
      slug: "prueba",
      nombre: "Tienda de Prueba",
      estado: "PUBLICADA",
      flow: credPrueba,
      producto: {
        titulo: "Guía de prueba del sorteo",
        descripcion:
          "Producto de prueba del segundo tenant para verificar el aislamiento cross-tenant de F01.",
        precio: "5000",
        pdfPath: "prueba/seed/guia-de-prueba-del-sorteo.pdf",
      },
    },
  ];

  return { specs, realesPorSlug };
}

async function main() {
  // Node 20.6+/24: carga .env sin dependencia externa (dotenv no es dep del repo).
  try {
    process.loadEnvFile();
  } catch {
    // .env ausente: seguimos con process.env tal cual (CI/entornos con env inyectado).
  }

  const rawClave = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!rawClave) {
    throw new Error(
      "Falta CREDENTIALS_ENCRYPTION_KEY en el env para cifrar las credenciales Flow. " +
        "Generá una con: openssl rand -base64 32 (ver .env.example).",
    );
  }
  const clave = parsearClave(rawClave); // fail-fast si no es 32 bytes (nunca loguea el valor)

  const { specs, realesPorSlug } = construirSpecs({
    autora: {
      apiKey: process.env.FLOW_AUTORA_API_KEY,
      secretKey: process.env.FLOW_AUTORA_SECRET_KEY,
    },
    prueba: {
      apiKey: process.env.FLOW_PRUEBA_API_KEY,
      secretKey: process.env.FLOW_PRUEBA_SECRET_KEY,
    },
  });

  const db = new PrismaClient();
  try {
    const res = await sembrarTenants({ db, clave, specs });
    // Solo config/resumen inocuo — nunca credenciales.
    for (const r of res) {
      const origen = realesPorSlug[r.slug]
        ? "creds reales de env"
        : "PLACEHOLDER (sin FLOW_*_API_KEY/SECRET_KEY en env — no sirve para el E2E)";
      console.log(
        `${r.tenantCreado ? "✓ creado " : "= existía"} tenant "${r.slug}" (${r.tenantId}) ` +
          `— credencial:${r.credencialCreada ? "creada" : "actualizada"} [${origen}] ` +
          `producto:${r.productoCreado ? "creado" : "existía"}`,
      );
    }
  } finally {
    await db.$disconnect();
  }
}

// Solo corre como script invocado; importar el núcleo desde un test NO dispara main().
if (process.argv[1]?.includes("seed-tenants")) {
  main().catch((e) => {
    // Solo el mensaje (defensa en profundidad: nunca volcar objetos que pudieran
    // arrastrar contexto sensible). parsearClave/Prisma no incluyen secretos.
    console.error("✗ Falló el seed de tenants:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
