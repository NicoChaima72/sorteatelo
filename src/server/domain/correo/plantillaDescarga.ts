/**
 * SHIM TEMPORAL — BORRAR con el commit del carril `sistema-correos-comprador`.
 *
 * El rename `plantillaDescarga.ts → plantillaConfirmacionCompra.ts` entró al commit 1d8acbd por
 * una carrera de `git add` entre carriles, ANTES de que ese carril commiteara los consumers
 * actualizados (`enviarCorreoDescargaDeOrden.ts` en HEAD todavía importa este path). Sin este
 * re-export, `next build` no compila. Cuando el carril de correos commitee su feature (que ya
 * importa el nombre nuevo), este archivo queda sin consumidores y se borra en ese mismo commit.
 */
export * from "./plantillaConfirmacionCompra";
