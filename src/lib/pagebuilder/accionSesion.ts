/**
 * Máquina de estados PURA de la acción de sesión del header del storefront (F09c). El usuario vetó el
 * "footer-only discreto" de F09b: la sesión debe verse en el TOPBAR. Este helper decide qué acción
 * mostrar SIN tocar el SSR (I5): antes de hidratar (`montado=false`) la acción es SIEMPRE `oculto`, así
 * el HTML anónimo es idéntico con/sin cookie ⇒ CDN-cacheable (R5).
 *
 * Los tres estados con sesión resuelta:
 *  - anónimo ⇒ `login` (enlace al apex `/login?callbackUrl=<tienda actual>`, F09b/F08).
 *  - logueado y DUEÑA de esta tienda (`puedeEditar`, autz server-side por `TenantMembership`/Operador)
 *    ⇒ `editar` (→ `/editor` relativo, misma tienda).
 *  - logueado pero NO dueña ⇒ `panel` (→ apex `/admin`).
 *
 * Estados transitorios (sesión cargando, o autz aún sin resolver para un logueado) ⇒ `oculto`: no se
 * muestra un "Iniciar sesión" que parpadee a "Editar mi página" un tick después.
 */
export type AccionSesion =
  | { tipo: "oculto" }
  | { tipo: "login" }
  | { tipo: "editar" }
  | { tipo: "panel" };

export function accionSesionStorefront({
  montado,
  estadoSesion,
  puedeEditar,
}: {
  montado: boolean;
  estadoSesion: "loading" | "authenticated" | "unauthenticated";
  /** Resultado de `pagebuilder.puedoEditar`; `undefined` = query aún sin resolver. */
  puedeEditar: boolean | undefined;
}): AccionSesion {
  if (!montado) return { tipo: "oculto" }; // pre-hidratación: no toca el SSR (I5)
  if (estadoSesion === "loading") return { tipo: "oculto" }; // sesión sin resolver: no parpadea
  if (estadoSesion === "unauthenticated") return { tipo: "login" };
  // authenticated:
  if (puedeEditar === undefined) return { tipo: "oculto" }; // autz sin resolver: no parpadea
  return puedeEditar ? { tipo: "editar" } : { tipo: "panel" };
}
