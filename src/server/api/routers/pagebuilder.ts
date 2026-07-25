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
import {
  getChrome,
  setChrome,
  setChromeInput,
} from "~/server/domain/pagebuilder/chromeTienda";
import {
  crearPagina,
  crearPaginaInput,
  eliminarPagina,
  eliminarPaginaInput,
  listarPaginas,
  renombrarPagina,
  renombrarPaginaInput,
  setEnNav,
  setEnNavInput,
} from "~/server/domain/pagebuilder/paginas";
import { puedoEditar } from "~/server/domain/pagebuilder/puedoEditar";
import { publicarPagina } from "~/server/domain/pagebuilder/publicarPagina";
import { revertirPagina } from "~/server/domain/pagebuilder/revertirPagina";
import { setColorAcento } from "~/server/domain/pagebuilder/setColorAcento";
import {
  editarBorradorInput,
  leerBorradorInput,
  publicarBorradorInput,
  revertirBorradorInput,
  setColorAcentoInput,
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

  /** Lee el Borrador para editar (documento + version). `slug` opcional elige la página (default home, F04). */
  getBorrador: tenantProcedure
    .input(leerBorradorInput.optional())
    .query(({ ctx, input }) =>
      runDomain(async () =>
        getPagina({ db: ctx.db, tenantId: await exigirEditor(ctx), cual: "draft", slug: input?.slug }),
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
          slug: input.slug,
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
          slug: input.slug,
        });
      }),
    ),

  /** Historial de publicaciones (revisiones) para el rollback. `slug` opcional (F04). */
  listarVersiones: tenantProcedure
    .input(leerBorradorInput.optional())
    .query(({ ctx, input }) =>
      runDomain(async () =>
        listarVersiones({ db: ctx.db, tenantId: await exigirEditor(ctx), slug: input?.slug }),
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
          slug: input.slug,
        }),
      ),
    ),

  // ── Multi-página (Tanda 3 F04/D8) — CRUD de páginas gateado por membresía ──────────────────────

  /** Lista las páginas de la Tienda (home primero) con su estado borrador/publicada + enNav. */
  listarPaginas: tenantProcedure.query(({ ctx }) =>
    runDomain(async () => listarPaginas({ db: ctx.db, tenantId: await exigirEditor(ctx) })),
  ),

  /** Crea una página nueva (slug validado + reservados; siembra el borrador). */
  crearPagina: tenantProcedure
    .input(crearPaginaInput)
    .mutation(({ ctx, input }) =>
      runDomain(async () =>
        crearPagina({ db: ctx.db, tenantId: await exigirEditor(ctx), slug: input.slug, nombre: input.nombre }),
      ),
    ),

  /** Renombra una página (prohíbe home; mueve el historial al slug nuevo). */
  renombrarPagina: tenantProcedure
    .input(renombrarPaginaInput)
    .mutation(({ ctx, input }) =>
      runDomain(async () =>
        renombrarPagina({ db: ctx.db, tenantId: await exigirEditor(ctx), slug: input.slug, slugNuevo: input.slugNuevo }),
      ),
    ),

  /** Elimina una página (prohíbe home; borra la fila + su historial). */
  eliminarPagina: tenantProcedure
    .input(eliminarPaginaInput)
    .mutation(({ ctx, input }) =>
      runDomain(async () =>
        eliminarPagina({ db: ctx.db, tenantId: await exigirEditor(ctx), slug: input.slug }),
      ),
    ),

  /** Suma/quita una página del nav derivado (enNav). */
  setEnNav: tenantProcedure
    .input(setEnNavInput)
    .mutation(({ ctx, input }) =>
      runDomain(async () =>
        setEnNav({ db: ctx.db, tenantId: await exigirEditor(ctx), slug: input.slug, enNav: input.enNav }),
      ),
    ),

  // ── Chrome global (Tanda 3 F07/D12, ADR-0021) — gateado por membresía; el MCP NO lo toca (I12) ──

  /** Lee el chrome del tenant para sembrar el panel Chrome (default si null). */
  getChrome: tenantProcedure.query(({ ctx }) =>
    runDomain(async () => getChrome({ db: ctx.db, tenantId: await exigirEditor(ctx) })),
  ),

  /** Escribe el chrome (validado por ChromeSchema server-side, I3); `null` restablece al default. */
  setChrome: tenantProcedure
    .input(setChromeInput)
    .mutation(({ ctx, input }) =>
      runDomain(async () =>
        setChrome({ db: ctx.db, tenantId: await exigirEditor(ctx), chrome: input.chrome }),
      ),
    ),

  /**
   * Setea el segundo color de marca del tenant (`Tenant.colorAcento`, builder-tanda-1 F01/D2). Vive
   * FUERA del Documento (I-T1) ⇒ el MCP NO gana tool para esto (I12); solo el panel Tema del editor.
   * Gateado por membresía (`exigirEditor`, I1); el `tenantId` sale del host, nunca del input. `null`
   * limpia el acento (⇒ degradación a marca, I-T2). Cambia el theme ⇒ el editor recarga la preview.
   */
  setColorAcento: tenantProcedure
    .input(setColorAcentoInput)
    .mutation(({ ctx, input }) =>
      runDomain(async () =>
        setColorAcento({
          db: ctx.db,
          tenantId: await exigirEditor(ctx),
          colorAcento: input.colorAcento,
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
