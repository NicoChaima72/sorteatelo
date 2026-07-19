import { type PrismaClient } from "@prisma/client";
import { type Session } from "next-auth";

import { env } from "~/env";
import { runDomain } from "~/server/api/runDomain";
import { createTRPCRouter, tenantProcedure } from "~/server/api/trpc";
import { esOperador, parsearAllowlist } from "~/server/authPolicy";
import { aplicarMutacionPagina } from "~/server/domain/pagebuilder/aplicarMutacionPagina";
import { getPagina } from "~/server/domain/pagebuilder/getPagina";
import { listarVersiones } from "~/server/domain/pagebuilder/listarVersiones";
import {
  confirmarPageAsset,
  confirmarPageAssetInput,
  crearUrlSubidaPageAsset,
  crearUrlSubidaPageAssetInput,
  eliminarPageAsset,
  eliminarPageAssetInput,
  listarPageAssets,
} from "~/server/domain/pagebuilder/pageAssets";
import { puedoEditar } from "~/server/domain/pagebuilder/puedoEditar";
import { publicarPagina } from "~/server/domain/pagebuilder/publicarPagina";
import { revertirPagina } from "~/server/domain/pagebuilder/revertirPagina";
import {
  editarBorradorInput,
  publicarBorradorInput,
  revertirBorradorInput,
} from "~/server/domain/pagebuilder/schemas";
import { DomainError } from "~/server/domain/errors";
import { crearStoragePublicoDeEnv } from "~/server/storage/storagePublicoDeEnv";

/**
 * Router del page builder de cara al STOREFRONT (F09/catálogo-v2 F08, ADR-0016/0019). `tenantProcedure`:
 * el tenant se resuelve SERVER-SIDE del host (`ctx.tenant`), jamás del input (I1). La sesión
 * (`ctx.session`) viene de la cookie wildcard (ADR-0019) — puede ser null (visitante anónimo).
 *
 * Las mutaciones de edición (subida de imágenes F08; guardar/publicar/etc. F09/F10) van GATEADAS por
 * `exigirEditor`: membresía o Operador resueltos server-side (I1/I7 — la cookie es identidad, no
 * autorización). Anónimo o miembro de OTRO tenant ⇒ FORBIDDEN neutral, sin efecto.
 */

/**
 * Gate de edición (catálogo-v2 F08/F09): exige que el que mira PUEDA editar la Tienda del host y
 * devuelve su `tenantId` (del contexto, I1). Anónimo o sin membresía ⇒ `FORBIDDEN`. Se llama DENTRO de
 * `runDomain` (el `DomainError` mapea a TRPCError FORBIDDEN). Lo reusan todas las mutaciones del editor.
 */
export async function exigirEditor(ctx: {
  db: PrismaClient;
  session: Session | null;
  tenant: { id: string };
}): Promise<string> {
  const user = ctx.session?.user;
  if (!user) {
    throw new DomainError("FORBIDDEN", "Necesitas iniciar sesión para editar esta tienda.");
  }
  const esOp = esOperador(user.email, parsearAllowlist(env.PLATFORM_OPERATOR_EMAILS));
  const { puedeEditar } = await puedoEditar({
    db: ctx.db,
    tenantId: ctx.tenant.id, // del host (I1), no del input
    userId: user.id,
    esOperador: esOp,
  });
  if (!puedeEditar) {
    throw new DomainError("FORBIDDEN", "No administras esta tienda.");
  }
  return ctx.tenant.id;
}

export const pagebuilderRouter = createTRPCRouter({
  /**
   * ¿El que mira puede editar esta Tienda? (banner "Editar mi tienda", F09). Anónimo ⇒ false (y así
   * la respuesta no depende de sesión para el 99% de los visitantes). Con sesión ⇒ autorización por
   * `TenantMembership`/Operador server-side (la cookie es identidad, no autorización, I7).
   */
  puedoEditar: tenantProcedure.query(({ ctx }) => {
    const user = ctx.session?.user;
    if (!user) return { puedeEditar: false };
    const esOp = esOperador(
      user.email,
      parsearAllowlist(env.PLATFORM_OPERATOR_EMAILS),
    );
    return runDomain(() =>
      puedoEditar({
        db: ctx.db,
        tenantId: ctx.tenant.id, // del host (I1), no del input
        userId: user.id,
        esOperador: esOp,
      }),
    );
  }),

  // ── Editor visual (catálogo-v2 F09/D10) — procedures FINOS gateados que reusan los use cases ────
  // Cero lógica de dominio acá: cada uno delega 1:1 en el use case que ya usa el MCP. El `tenantId` sale
  // del gate `exigirEditor` (I1); publicar/mutar respetan el lock optimista (expectedVersion, I10);
  // publicar es acción humana explícita (I6) y ahora también la puede hacer la Organizadora.

  /** Lee el Borrador para editar (documento + version para el expectedVersion). */
  getBorrador: tenantProcedure.query(({ ctx }) =>
    runDomain(async () =>
      getPagina({ db: ctx.db, tenantId: await exigirEditor(ctx), cual: "draft" }),
    ),
  ),

  /** Aplica una mutación al Borrador (misma union que el MCP) con el lock optimista. */
  mutar: tenantProcedure
    .input(editarBorradorInput)
    .mutation(({ ctx, input }) =>
      runDomain(async () =>
        aplicarMutacionPagina({
          db: ctx.db,
          tenantId: await exigirEditor(ctx),
          mutacion: input.mutacion,
          expectedVersion: input.expectedVersion,
        }),
      ),
    ),

  /** Publica el Borrador (checkpoint humano, I6). `publicadoPor` = email de la Organizadora. */
  publicar: tenantProcedure
    .input(publicarBorradorInput)
    .mutation(({ ctx, input }) =>
      runDomain(async () => {
        const tenantId = await exigirEditor(ctx);
        return publicarPagina({
          db: ctx.db,
          tenantId,
          expectedVersion: input.expectedVersion,
          publicadoPor: ctx.session?.user.email ?? undefined,
        });
      }),
    ),

  /** Historial de publicaciones (revisiones) para el rollback. */
  listarVersiones: tenantProcedure.query(({ ctx }) =>
    runDomain(async () =>
      listarVersiones({ db: ctx.db, tenantId: await exigirEditor(ctx) }),
    ),
  ),

  /** Copia una revisión publicada al Borrador (rollback, D4); hay que RE-publicar para hacerla visible. */
  revertir: tenantProcedure
    .input(revertirBorradorInput)
    .mutation(({ ctx, input }) =>
      runDomain(async () =>
        revertirPagina({
          db: ctx.db,
          tenantId: await exigirEditor(ctx),
          revision: input.revision,
        }),
      ),
    ),

  // ── Imágenes libres del editor (PageAsset, catálogo-v2 F08) — gateadas por membresía ──────────

  /** Presigna un PUT para subir una imagen al bucket público (valida allowlist + peso + cuota, D11). */
  crearUrlSubidaImagen: tenantProcedure
    .input(crearUrlSubidaPageAssetInput)
    .mutation(({ ctx, input }) =>
      runDomain(async () =>
        crearUrlSubidaPageAsset({
          db: ctx.db,
          tenantId: await exigirEditor(ctx),
          input,
          storage: crearStoragePublicoDeEnv(),
        }),
      ),
    ),

  /** Confirma la subida (headObject) y persiste el `PageAsset`; devuelve su URL pública. */
  confirmarImagen: tenantProcedure
    .input(confirmarPageAssetInput)
    .mutation(({ ctx, input }) =>
      runDomain(async () =>
        confirmarPageAsset({
          db: ctx.db,
          tenantId: await exigirEditor(ctx),
          input,
          storage: crearStoragePublicoDeEnv(),
        }),
      ),
    ),

  /** Lista las imágenes del tenant (para el picker del editor). */
  listarImagenes: tenantProcedure.query(({ ctx }) =>
    runDomain(async () =>
      listarPageAssets({
        db: ctx.db,
        tenantId: await exigirEditor(ctx),
        storage: crearStoragePublicoDeEnv(),
      }),
    ),
  ),

  /** Elimina una imagen del tenant (fila + objeto R2 best-effort). No invalida documentos (D11). */
  eliminarImagen: tenantProcedure
    .input(eliminarPageAssetInput)
    .mutation(({ ctx, input }) =>
      runDomain(async () =>
        eliminarPageAsset({
          db: ctx.db,
          tenantId: await exigirEditor(ctx),
          input,
          storage: crearStoragePublicoDeEnv(),
        }),
      ),
    ),
});
