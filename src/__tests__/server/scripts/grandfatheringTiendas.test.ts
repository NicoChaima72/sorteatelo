import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  grandfatherTiendasPublicadas,
  NOTA_GRANDFATHER,
} from "~/server/facturacion/grandfatheringTiendas";

/**
 * Tests del núcleo del **grandfathering** (F07/D3, ADR-0026): al desplegar la facturación, toda
 * Tienda que ya estaba PUBLICADA queda EXENTA a perpetuidad — sin cobro retroactivo ni exigencia de
 * tarjeta. En la práctica son el piloto y las tiendas demo.
 *
 * Corre contra un `db` FAKE que modela los tres filtros de verdad (estado + suscripción + exención):
 * si el fake los ignorara, el filtro del script sería INVISIBLE al test — y el filtro es justo lo que
 * impide regalarle servicio perpetuo a una tienda que sí está pagando.
 */

interface TenantFake {
  id: string;
  slug: string;
  estado: "ALTA" | "CONFIGURACION" | "PUBLICADA" | "SUSPENDIDA";
  /** Ya activó su plan: paga. Nunca debe recibir cortesía. */
  tieneSuscripcion?: boolean;
  /** Ya tiene una `PlatformExemption` (cortesía comercial o una corrida anterior). */
  tieneExencion?: boolean;
}

interface ExencionCreada {
  tenantId: string;
  motivo: string;
  exentaHasta: Date | null;
  nota?: string | null;
}

function fakeDb(
  tenants: TenantFake[],
  /** Simula la carrera contra una DB VIVA: qué error tira el `create` de ese tenant. */
  fallaAlCrear: Record<string, { code: string }> = {},
) {
  const creadas: ExencionCreada[] = [];

  const db = {
    tenant: {
      findMany: async (args: {
        where: {
          estado: string;
          platformSubscription?: { is: null };
          platformExemption?: { is: null };
        };
      }) => {
        const w = args.where;
        return tenants
          .filter(
            (t) =>
              t.estado === w.estado &&
              (w.platformSubscription === undefined || !t.tieneSuscripcion) &&
              (w.platformExemption === undefined || !t.tieneExencion),
          )
          .map((t) => ({ id: t.id, slug: t.slug }));
      },
    },
    platformExemption: {
      create: async ({ data }: { data: ExencionCreada }) => {
        const falla = fallaAlCrear[data.tenantId];
        if (falla) throw Object.assign(new Error("prisma"), falla);
        creadas.push(data);
        // Una fila creada por esta corrida deja de ser candidata en la siguiente.
        const t = tenants.find((x) => x.id === data.tenantId);
        if (t) t.tieneExencion = true;
        return { id: `ex-${data.tenantId}` };
      },
    },
  } as unknown as PrismaClient;

  return { db, creadas };
}

describe("facturacion/grandfatherTiendasPublicadas", () => {
  // facturacion.grandfather.001 — la corrida del despliegue: exención GRANDFATHER perpetua
  it("crea una exención GRANDFATHER perpetua para cada tienda ya publicada", async () => {
    const { db, creadas } = fakeDb([
      { id: "t1", slug: "autora", estado: "PUBLICADA" },
      { id: "t2", slug: "demo", estado: "PUBLICADA" },
    ]);

    const r = await grandfatherTiendasPublicadas({ db, aplicar: true });

    expect(r.map((x) => [x.slug, x.estado])).toEqual([
      ["autora", "creada"],
      ["demo", "creada"],
    ]);
    // Perpetua (D3): `exentaHasta: null`. Con fecha, el piloto dejaría de vender el día que venciera.
    expect(creadas).toEqual([
      { tenantId: "t1", motivo: "GRANDFATHER", exentaHasta: null, nota: NOTA_GRANDFATHER },
      { tenantId: "t2", motivo: "GRANDFATHER", exentaHasta: null, nota: NOTA_GRANDFATHER },
    ]);
  });

  // facturacion.grandfather.002 — el filtro: a quién NO se le regala servicio perpetuo
  it("no toca tiendas sin publicar, ni con plan activo, ni con una exención ya otorgada", async () => {
    const { db, creadas } = fakeDb([
      { id: "t1", slug: "configurando", estado: "CONFIGURACION" },
      { id: "t2", slug: "de-alta", estado: "ALTA" },
      { id: "t3", slug: "suspendida", estado: "SUSPENDIDA" },
      // Publicada pero YA PAGA: darle cortesía sería cobrarle y no cobrarle a la vez.
      { id: "t4", slug: "paga", estado: "PUBLICADA", tieneSuscripcion: true },
      // Publicada con una cortesía comercial que puede tener FECHA: pisarla con una perpetua
      // regalaría servicio que alguien decidió acotar.
      { id: "t5", slug: "cortesia", estado: "PUBLICADA", tieneExencion: true },
    ]);

    const r = await grandfatherTiendasPublicadas({ db, aplicar: true });

    expect(r).toEqual([]);
    expect(creadas).toEqual([]);
  });

  // facturacion.grandfather.003 — idempotente: la 2ª corrida no vuelve a crear nada
  it("es idempotente: correrlo dos veces no duplica ni reescribe exenciones", async () => {
    const { db, creadas } = fakeDb([
      { id: "t1", slug: "autora", estado: "PUBLICADA" },
    ]);

    await grandfatherTiendasPublicadas({ db, aplicar: true });
    const segunda = await grandfatherTiendasPublicadas({ db, aplicar: true });

    expect(segunda).toEqual([]); // ya no es candidata: tiene su exención
    expect(creadas).toHaveLength(1); // sigue en 1
  });

  // facturacion.grandfather.004 — el default del CLI LISTA, no escribe
  it("en modo listado reporta las candidatas sin escribir nada", async () => {
    const { db, creadas } = fakeDb([
      { id: "t1", slug: "autora", estado: "PUBLICADA" },
      { id: "t2", slug: "demo", estado: "PUBLICADA" },
    ]);

    const r = await grandfatherTiendasPublicadas({ db, aplicar: false });

    // La corrida regala servicio GRATIS y PERPETUO: quien la ejecuta ve primero a quiénes.
    expect(r.map((x) => x.estado)).toEqual(["a-crear", "a-crear"]);
    expect(creadas).toEqual([]);
  });

  // facturacion.grandfather.005 — carreras contra una DB VIVA: se reportan y el barrido sigue
  it("una exención creada por otro y una Tienda borrada a mitad del barrido no lo abortan", async () => {
    const { db, creadas } = fakeDb(
      [
        { id: "t1", slug: "ganada", estado: "PUBLICADA" },
        { id: "t2", slug: "borrada", estado: "PUBLICADA" },
        { id: "t3", slug: "sana", estado: "PUBLICADA" },
      ],
      // P2002: alguien creó la exención entre el findMany y el create ⇒ es el resultado deseado.
      // P2003: la Tienda desapareció ⇒ ya no hay nada que eximir.
      { t1: { code: "P2002" }, t2: { code: "P2003" } },
    );

    const r = await grandfatherTiendasPublicadas({ db, aplicar: true });

    expect(r.map((x) => [x.slug, x.estado])).toEqual([
      ["ganada", "ya-exenta"],
      ["borrada", "omitida-fila-ausente"],
      ["sana", "creada"],
    ]);
    // Lo que importa: la tercera SÍ se creó — abortar en la primera carrera dejaría a medias
    // justo la corrida que tiene que poder repetirse.
    expect(creadas.map((c) => c.tenantId)).toEqual(["t3"]);
  });
});
