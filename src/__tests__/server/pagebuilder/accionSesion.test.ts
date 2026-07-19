import { describe, expect, it } from "vitest";

import { accionSesionStorefront } from "~/lib/pagebuilder/accionSesion";

/**
 * Tests de la máquina de estados PURA de la acción de sesión del header del storefront (F09c). Decide
 * qué mostrar (nada / iniciar sesión / editar mi página / mi panel) a partir de si el componente ya
 * montó (post-hidratación, I5), el estado de sesión de NextAuth y si el que mira puede editar ESTA
 * tienda (`puedoEditar`, autz server-side). La clave del cache público (I5/R5): antes de hidratar
 * (`montado=false`) la acción es SIEMPRE `oculto` ⇒ el HTML SSR anónimo no varía por sesión.
 */
describe("pagebuilder/accionSesionStorefront (estado del header)", () => {
  // page.sesion.001 — pre-hidratación: nunca toca el SSR
  it("montado=false ⇒ oculto, pase lo que pase con sesión/autz", () => {
    expect(
      accionSesionStorefront({
        montado: false,
        estadoSesion: "authenticated",
        puedeEditar: true,
      }),
    ).toEqual({ tipo: "oculto" });
    expect(
      accionSesionStorefront({
        montado: false,
        estadoSesion: "unauthenticated",
        puedeEditar: undefined,
      }),
    ).toEqual({ tipo: "oculto" });
  });

  // page.sesion.002 — sesión cargando (post-hidratación) ⇒ oculto (no parpadea a "Iniciar sesión")
  it("montado=true + sesión loading ⇒ oculto", () => {
    expect(
      accionSesionStorefront({
        montado: true,
        estadoSesion: "loading",
        puedeEditar: undefined,
      }),
    ).toEqual({ tipo: "oculto" });
  });

  // page.sesion.003 — anónimo resuelto ⇒ iniciar sesión
  it("montado=true + unauthenticated ⇒ login", () => {
    expect(
      accionSesionStorefront({
        montado: true,
        estadoSesion: "unauthenticated",
        puedeEditar: undefined,
      }),
    ).toEqual({ tipo: "login" });
  });

  // page.sesion.004 — logueado pero autz sin resolver ⇒ oculto (no parpadea a "Iniciar sesión"/panel)
  it("montado=true + authenticated + puedeEditar=undefined ⇒ oculto", () => {
    expect(
      accionSesionStorefront({
        montado: true,
        estadoSesion: "authenticated",
        puedeEditar: undefined,
      }),
    ).toEqual({ tipo: "oculto" });
  });

  // page.sesion.005 — dueña de ESTA tienda ⇒ editar mi página (/editor relativo)
  it("montado=true + authenticated + puedeEditar=true ⇒ editar", () => {
    expect(
      accionSesionStorefront({
        montado: true,
        estadoSesion: "authenticated",
        puedeEditar: true,
      }),
    ).toEqual({ tipo: "editar" });
  });

  // page.sesion.006 — logueada pero NO dueña de esta tienda ⇒ mi panel (apex /admin)
  it("montado=true + authenticated + puedeEditar=false ⇒ panel", () => {
    expect(
      accionSesionStorefront({
        montado: true,
        estadoSesion: "authenticated",
        puedeEditar: false,
      }),
    ).toEqual({ tipo: "panel" });
  });
});
