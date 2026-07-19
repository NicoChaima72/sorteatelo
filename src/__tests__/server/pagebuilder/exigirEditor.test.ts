import { type PrismaClient } from "@prisma/client";
import { type Session } from "next-auth";
import { describe, expect, it } from "vitest";

import { exigirEditor } from "~/server/api/routers/pagebuilder";

/**
 * Tests del gate de edición `exigirEditor` (catálogo-v2 F09/D6). Es el borde de AUTORIZACIÓN de todas
 * las mutaciones del editor: exige que el que mira PUEDA editar la Tienda del host (membresía o
 * Operador, resueltos SERVER-SIDE, I1/I7 — la cookie wildcard es identidad, no autorización). Anónimo o
 * miembro de OTRO tenant ⇒ `FORBIDDEN`, sin tocar nada.
 */

/** Fake db: `tenantMembership.findFirst` responde según un set de pares (tenantId,userId) con membresía. */
function fakeDb(membresias: { tenantId: string; userId: string }[] = []) {
  return {
    tenantMembership: {
      findFirst: async ({ where }: { where: { tenantId: string; userId: string } }) =>
        membresias.find((m) => m.tenantId === where.tenantId && m.userId === where.userId)
          ? { id: "m" }
          : null,
    },
  } as unknown as PrismaClient;
}

const sesion = (userId: string, email: string): Session =>
  ({ user: { id: userId, email }, expires: "2099-01-01" }) as unknown as Session;

const ctxBase = (over: {
  db: PrismaClient;
  session: Session | null;
  tenantId?: string;
}) => ({
  db: over.db,
  session: over.session,
  tenant: { id: over.tenantId ?? "t-A" },
});

describe("pagebuilder/exigirEditor — gate de edición server-side (F09)", () => {
  // page.editor.gate.001 — anónimo (sin sesión) ⇒ FORBIDDEN, sin consultar membresía
  it("anónimo ⇒ FORBIDDEN", async () => {
    await expect(
      exigirEditor(ctxBase({ db: fakeDb(), session: null })),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // page.editor.gate.002 — logueado pero SIN membresía de esta Tienda (ni Operador) ⇒ FORBIDDEN
  it("miembro de OTRO tenant (sin membresía acá) ⇒ FORBIDDEN", async () => {
    const db = fakeDb([{ tenantId: "t-OTRO", userId: "u1" }]); // membresía de otra tienda
    await expect(
      exigirEditor(ctxBase({ db, session: sesion("u1", "org@x.com"), tenantId: "t-A" })),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // page.editor.gate.003 — con membresía de ESTA Tienda ⇒ devuelve el tenantId del contexto (host, I1)
  it("con membresía de esta Tienda ⇒ devuelve el tenantId del host", async () => {
    const db = fakeDb([{ tenantId: "t-A", userId: "u1" }]);
    const tenantId = await exigirEditor(
      ctxBase({ db, session: sesion("u1", "org@x.com"), tenantId: "t-A" }),
    );
    expect(tenantId).toBe("t-A");
  });
});
