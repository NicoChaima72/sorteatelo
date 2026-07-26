import { describe, expect, it } from "vitest";

import {
  type DatosGate,
  evaluarPublicacion,
  mensajeRequisitoFaltante,
} from "~/server/domain/tenants/_publicacion";

/**
 * Tests del núcleo PURO del gate de publicación (F08/F03, D4/D5). `evaluarPublicacion` es la
 * ÚNICA fuente de verdad del checklist Y del gate: computa cada requisito (ToS + Flow + ≥1
 * producto publicable + el PDF de bases del sorteo ACTIVO si lo hay, ADR-0008) y `puedePublicar`. Se testea
 * puro (sin DB) para cubrir la matriz completa; getEstadoPublicacion y publicarTienda lo reusan.
 */

const base: DatosGate = {
  estado: "CONFIGURACION",
  tosVersion: "2026-07-17",
  tosVersionVigente: "2026-07-17",
  flowConfigurada: true,
  tieneProductoPublicable: true,
  hayRaffleActivo: false,
  basesPdfDelRaffleActivo: null,
  // Facturación de la plataforma (ADR-0026, F03/D2): publicar exige plan activo o exención.
  suscripcionActiva: true,
  exentaVigente: false,
};

describe("domain/tenants/evaluarPublicacion (núcleo puro del gate)", () => {
  // tenants.publicacion.eval.001 — todos los requisitos presentes ⇒ puedePublicar
  it("con todos los requisitos cumplidos, puedePublicar = true", () => {
    const r = evaluarPublicacion(base);
    expect(r.requisitos.tos.cumplido).toBe(true);
    expect(r.requisitos.flow.cumplido).toBe(true);
    expect(r.requisitos.producto.cumplido).toBe(true);
    expect(r.requisitos.bases.aplica).toBe(false); // sin sorteo activo, no aplica
    expect(r.requisitos.bases.cumplido).toBe(true); // no aplica ⇒ no bloquea
    expect(r.puedePublicar).toBe(true);
  });

  // tenants.publicacion.eval.002 — ToS: pendiente si null o versión distinta; cumplido si coincide
  it("el requisito ToS solo se cumple con la versión vigente exacta", () => {
    expect(evaluarPublicacion({ ...base, tosVersion: null }).requisitos.tos.cumplido).toBe(false);
    expect(
      evaluarPublicacion({ ...base, tosVersion: "2020-01-01" }).requisitos.tos.cumplido,
    ).toBe(false);
    expect(evaluarPublicacion(base).requisitos.tos.cumplido).toBe(true);
    // ToS pendiente ⇒ no puede publicar
    expect(evaluarPublicacion({ ...base, tosVersion: null }).puedePublicar).toBe(false);
  });

  // tenants.publicacion.eval.003 — Flow no configurada ⇒ no cumple ⇒ no puede publicar
  it("sin FlowCredential configurada no puede publicar", () => {
    const r = evaluarPublicacion({ ...base, flowConfigurada: false });
    expect(r.requisitos.flow.cumplido).toBe(false);
    expect(r.puedePublicar).toBe(false);
  });

  // tenants.publicacion.eval.004 — sin producto publicable (activo + pdf) ⇒ no puede publicar
  it("sin ≥1 producto publicable no puede publicar", () => {
    const r = evaluarPublicacion({ ...base, tieneProductoPublicable: false });
    expect(r.requisitos.producto.cumplido).toBe(false);
    expect(r.puedePublicar).toBe(false);
  });

  // tenants.publicacion.eval.005 — bases: aplica SOLO con sorteo activo; sin PDF ⇒ bloquea (ADR-0008)
  // Reescrito (admin-bases-pdf F03/D2/D3): las bases YA NO son texto en el Tenant sino el PDF del
  // Raffle ACTIVO. El requisito sigue aplicando solo con sorteo activo; lo que cambió es la fuente.
  it("con sorteo activo, sin PDF de bases bloquea; con el PDF cargado, publica", () => {
    const conSorteoSinBases = evaluarPublicacion({
      ...base,
      hayRaffleActivo: true,
      basesPdfDelRaffleActivo: null, // el sorteo activo no tiene bases subidas
    });
    expect(conSorteoSinBases.requisitos.bases.aplica).toBe(true);
    expect(conSorteoSinBases.requisitos.bases.cumplido).toBe(false);
    expect(conSorteoSinBases.puedePublicar).toBe(false);

    const conSorteoConBases = evaluarPublicacion({
      ...base,
      hayRaffleActivo: true,
      basesPdfDelRaffleActivo: "https://pub.r2.dev/A/sorteo/r1/bases.pdf?v=1",
    });
    expect(conSorteoConBases.requisitos.bases.cumplido).toBe(true);
    expect(conSorteoConBases.puedePublicar).toBe(true);
  });

  // tenants.publicacion.eval.005b — una URL VACÍA/en blanco no es "bases cargadas" (ADR-0008)
  // Edge case textual del gate LEGAL: la columna existe pero con `""` o espacios (dato corrupto, una
  // escritura a medias). Debe bloquear igual que `null` — publicar un sorteo activo sin bases reales
  // es exactamente lo que ADR-0008 prohíbe. Explícito para que nadie lo "optimice" a un `!= null`.
  it("con sorteo activo, un `basesPdfUrl` vacío o en blanco bloquea igual que ausente", () => {
    for (const vacio of ["", "   "]) {
      const r = evaluarPublicacion({
        ...base,
        hayRaffleActivo: true,
        basesPdfDelRaffleActivo: vacio,
      });
      expect(r.requisitos.bases.cumplido).toBe(false);
      expect(r.puedePublicar).toBe(false);
    }
  });

  // tenants.publicacion.eval.006 — mensaje del requisito faltante nombra el PRIMER incumplido
  it("mensajeRequisitoFaltante describe el primer requisito no cumplido", () => {
    const sinTos = evaluarPublicacion({ ...base, tosVersion: null });
    expect(mensajeRequisitoFaltante(sinTos.requisitos)).toMatch(/Términos/i);
    const sinFlow = evaluarPublicacion({ ...base, flowConfigurada: false });
    expect(mensajeRequisitoFaltante(sinFlow.requisitos)).toMatch(/Flow|pago/i);
    // todo cumplido ⇒ null (no hay faltante)
    expect(mensajeRequisitoFaltante(evaluarPublicacion(base).requisitos)).toBeNull();
  });

  // tenants.publicacion.eval.007 — facturación (ADR-0026, F03/D2): publicar exige plan O exención.
  // «El plan corre cuando publicas» es la promesa literal de la landing: la etapa de configuración
  // es el gratis y el cobro nace al publicar, sin trial.
  it("sin plan activo ni exención NO publica; con cualquiera de los dos sí", () => {
    const sinNada = evaluarPublicacion({
      ...base,
      suscripcionActiva: false,
      exentaVigente: false,
    });
    expect(sinNada.requisitos.facturacion.cumplido).toBe(false);
    expect(sinNada.puedePublicar).toBe(false);
    expect(mensajeRequisitoFaltante(sinNada.requisitos)).toMatch(/plan/i);

    // Con suscripción activa (el camino normal).
    expect(evaluarPublicacion(base).requisitos.facturacion.cumplido).toBe(true);

    // Tienda EXENTA: publica sin tarjeta ni suscripción (D8 — cortesía / grandfather).
    const exenta = evaluarPublicacion({
      ...base,
      suscripcionActiva: false,
      exentaVigente: true,
    });
    expect(exenta.requisitos.facturacion.cumplido).toBe(true);
    expect(exenta.requisitos.facturacion.exenta).toBe(true);
    expect(exenta.puedePublicar).toBe(true);
  });

  // tenants.publicacion.eval.008 — el requisito del plan es el ÚLTIMO del checklist
  // Es el paso del compromiso económico: no se le pide la tarjeta a alguien que todavía no
  // terminó de armar la tienda. El mensaje del faltante respeta ese orden.
  it("el plan se reclama recién cuando el resto del checklist está listo", () => {
    const sinProductoNiPlan = evaluarPublicacion({
      ...base,
      tieneProductoPublicable: false,
      suscripcionActiva: false,
    });
    expect(mensajeRequisitoFaltante(sinProductoNiPlan.requisitos)).toMatch(
      /producto/i,
    );
  });
});
