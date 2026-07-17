import { PrismaClient } from "@prisma/client";

/**
 * CLI de bootstrap de membresías Organizador↔Tienda (F05/D11). Otorga a un `User`
 * (que ya inició sesión con Google al menos una vez) acceso al panel de una `Tienda`,
 * creando su `TenantMembership`. Idempotente.
 *
 * Uso:  npm run otorgar:membresia -- <email> <slug-de-tienda>
 *       (o) tsx scripts/otorgar-membresia.ts <email> <slug-de-tienda>
 *
 * Patrón núcleo testeable + wrapper (backend-conventions § Scripts CLI):
 * - `otorgarMembresia({ db, email, slug })` es el núcleo: recibe el cliente INYECTADO,
 *   busca el User por email y el Tenant por slug (NO los inventa), y crea la membresía
 *   de forma idempotente. No toca env, no instancia Prisma, no hace exit.
 * - `main()` es el wrapper: lee los args de la CLI, instancia su propio PrismaClient
 *   (excepción aceptada al singleton para scripts tsx), desconecta en finally y formatea
 *   la salida.
 *
 * Por qué NO crea el User: la cuenta nace del OAuth de Google (el adapter de NextAuth la
 * persiste al primer login, D2). Otorgar membresía a un email que nunca entró crearía una
 * cuenta fantasma sin `Account` OAuth — mejor fallar claro y pedir que el Organizador
 * inicie sesión primero.
 */

export interface ResultadoOtorgar {
  userId: string;
  tenantId: string;
  slug: string;
  creada: boolean;
}

type DbOtorgar = Pick<PrismaClient, "user" | "tenant" | "tenantMembership">;

export async function otorgarMembresia({
  db,
  email,
  slug,
}: {
  db: DbOtorgar;
  email: string;
  slug: string;
}): Promise<ResultadoOtorgar> {
  const emailNorm = email.trim().toLowerCase();

  const user = await db.user.findUnique({ where: { email: emailNorm } });
  if (!user) {
    throw new Error(
      `No existe un User con email "${emailNorm}". El Organizador debe iniciar ` +
        `sesión con Google en el panel al menos una vez ANTES de recibir la ` +
        `membresía (la cuenta no se crea acá).`,
    );
  }

  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    throw new Error(
      `No existe una Tienda con slug "${slug}". Revisá el slug (o sembrá la ` +
        `Tienda con npm run seed:tenants).`,
    );
  }

  // Idempotente por el unique compuesto (userId, tenantId).
  const existente = await db.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    select: { id: true },
  });
  const creada = existente === null;
  if (creada) {
    await db.tenantMembership.create({
      data: { userId: user.id, tenantId: tenant.id },
    });
  }

  return { userId: user.id, tenantId: tenant.id, slug, creada };
}

async function main() {
  const [email, slug] = process.argv.slice(2);
  if (!email || !slug) {
    throw new Error(
      "Uso: npm run otorgar:membresia -- <email> <slug-de-tienda>\n" +
        "Ej.: npm run otorgar:membresia -- autora@gmail.com autora",
    );
  }

  const db = new PrismaClient();
  try {
    const res = await otorgarMembresia({ db, email, slug });
    console.log(
      `${res.creada ? "✓ creada  " : "= ya existía"} membresía — user ${res.userId} ` +
        `↔ tienda "${res.slug}" (${res.tenantId})`,
    );
  } finally {
    await db.$disconnect();
  }
}

// Solo corre como script invocado; importar el núcleo desde un test NO dispara main().
if (process.argv[1]?.includes("otorgar-membresia")) {
  main().catch((e) => {
    console.error(
      "✗ No se pudo otorgar la membresía:",
      e instanceof Error ? e.message : e,
    );
    process.exit(1);
  });
}
