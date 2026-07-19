import { type GetServerSidePropsContext } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests del gate SSR del editor (`getPropsEditor`, catálogo-v2 F09/D6). Es el borde de AUTORIZACIÓN de
 * la ruta `/editor`: resuelve la Tienda por HOST (I1), exige sesión (cookie wildcard) y autoriza por
 * `puedoEditar` (membresía/Operador server-side, I7). FAIL-CLOSED: host sin tienda, sin sesión, tenant
 * inexistente o sin permiso ⇒ `notFound` (404 NEUTRAL, indistinguibles — no delata que hay un editor).
 * El `previewToken` (env) SOLO llega al cliente tras autorizar. Se mockean las 4 dependencias de I/O.
 */

vi.mock("~/env", () => ({
  env: { STOREFRONT_PREVIEW_TOKEN: "tok-preview", PLATFORM_OPERATOR_EMAILS: "" },
}));
vi.mock("~/server/db", () => ({ db: { tenant: { findUnique: vi.fn() } } }));
// `getFinalSession` (F09c): el gate del editor pasó a este wrapper (respeta configSession). El mock lo
// controla igual que antes — el shape resuelto (sesión o null) es lo que decide el fail-closed.
vi.mock("~/server/auth", () => ({ getFinalSession: vi.fn() }));
vi.mock("~/server/storefront/getStorefrontProps", () => ({ resolverBrandingSSR: vi.fn() }));
vi.mock("~/server/domain/pagebuilder/puedoEditar", () => ({ puedoEditar: vi.fn() }));

import { getFinalSession } from "~/server/auth";
import { db } from "~/server/db";
import { puedoEditar } from "~/server/domain/pagebuilder/puedoEditar";
import { getPropsEditor } from "~/server/storefront/getEditorProps";
import { resolverBrandingSSR } from "~/server/storefront/getStorefrontProps";

// Mocks capturados en consts (evita `unbound-method` al referenciar métodos en `expect`).
const mockBranding = vi.mocked(resolverBrandingSSR);
const mockAuth = vi.mocked(getFinalSession);
const mockPuede = vi.mocked(puedoEditar);
// eslint-disable-next-line @typescript-eslint/unbound-method -- es un vi.fn() del mock, no un método real
const mockTenant = vi.mocked(db.tenant.findUnique);

const ctx = {} as GetServerSidePropsContext;

const brandingStorefront = { zona: "storefront", branding: { slug: "autora" } } as never;
const brandingApex = { zona: "plataforma" } as never;
const sesion = { user: { id: "u1", email: "org@x.com" }, expires: "2099-01-01" } as never;

beforeEach(() => {
  mockBranding.mockReset();
  mockAuth.mockReset();
  mockPuede.mockReset();
  mockTenant.mockReset();
});

describe("editor/getPropsEditor — gate SSR fail-closed (F09/D6)", () => {
  // page.editor.ssr.001 — host que no resuelve a un storefront (apex / host ajeno) ⇒ 404 neutral
  it("host no-storefront ⇒ notFound (sin mirar sesión)", async () => {
    mockBranding.mockResolvedValue(brandingApex);
    const res = await getPropsEditor(ctx);
    expect(res).toEqual({ notFound: true });
    expect(mockAuth).not.toHaveBeenCalled(); // corta antes de tocar la sesión
  });

  // page.editor.ssr.002 — storefront pero visitante ANÓNIMO (sin sesión) ⇒ 404 neutral (no "login")
  it("storefront sin sesión ⇒ notFound", async () => {
    mockBranding.mockResolvedValue(brandingStorefront);
    mockAuth.mockResolvedValue(null);
    expect(await getPropsEditor(ctx)).toEqual({ notFound: true });
    expect(mockPuede).not.toHaveBeenCalled();
  });

  // page.editor.ssr.003 — logueado pero SIN permiso sobre esta Tienda (miembro de otra) ⇒ 404 neutral
  it("storefront + sesión pero sin permiso ⇒ notFound (no filtra previewToken)", async () => {
    mockBranding.mockResolvedValue(brandingStorefront);
    mockAuth.mockResolvedValue(sesion);
    mockTenant.mockResolvedValue({ id: "t-A" } as never);
    mockPuede.mockResolvedValue({ puedeEditar: false } as never);
    expect(await getPropsEditor(ctx)).toEqual({ notFound: true });
  });

  // page.editor.ssr.004 — tenant inexistente por slug (carrera / suspensión) ⇒ 404 neutral, sin autorizar
  it("tenant inexistente por slug ⇒ notFound", async () => {
    mockBranding.mockResolvedValue(brandingStorefront);
    mockAuth.mockResolvedValue(sesion);
    mockTenant.mockResolvedValue(null);
    expect(await getPropsEditor(ctx)).toEqual({ notFound: true });
    expect(mockPuede).not.toHaveBeenCalled();
  });

  // page.editor.ssr.005 — autorizado (membresía) ⇒ props con slug + previewToken (recién acá viaja el token)
  it("autorizado ⇒ props con slug del host + previewToken", async () => {
    mockBranding.mockResolvedValue(brandingStorefront);
    mockAuth.mockResolvedValue(sesion);
    mockTenant.mockResolvedValue({ id: "t-A" } as never);
    mockPuede.mockResolvedValue({ puedeEditar: true } as never);
    const res = await getPropsEditor(ctx);
    expect(res).toEqual({ props: { slug: "autora", previewToken: "tok-preview" } });
    // El tenantId se resolvió por SLUG del host (I1), no de ningún input.
    expect(mockTenant).toHaveBeenCalledWith({ where: { slug: "autora" }, select: { id: true } });
  });
});
