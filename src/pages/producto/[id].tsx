import { type GetServerSideProps } from "next";

/**
 * `/producto/[id]` — **RETIRADA** (productos-tipos-digitales ENMIENDA v2, E2/F13).
 *
 * La página de detalle existió hasta el 2026-07-26. Murió con el modelo v2: todo se agrega al
 * carrito desde la TARJETA del catálogo, y los packs —que eran la única razón por la que hacía falta
 * un detalle, porque ahí vivía el selector de opciones— son productos con su propia tarjeta. Sin
 * selector que mostrar, el detalle era un click extra entre el Comprador y el carrito.
 *
 * Queda como REDIRECT y no como 404 a propósito: la ruta estuvo publicada, así que hay enlaces
 * vivos (compartidos, indexados, en el historial de alguien). Mandarlos al home de la MISMA Tienda
 * los deja donde está el catálogo, en vez de en una página de error.
 *
 * `permanent: false` (307): la ruta se retira, pero un 308 se cachea en el navegador de forma
 * prácticamente irreversible, y esta decisión tiene días. Si el retiro se confirma, subirlo a
 * permanente es cambiar una palabra.
 *
 * El redirect es RELATIVO (`/`), así que resuelve al home del host que lo pidió — el subdominio de
 * la Tienda si vino de ahí. No hace falta resolver el tenant para eso: no se lee ningún dato ni se
 * expone nada, y por eso esta página tampoco necesita ya el gate de venta del borde.
 */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: "/", permanent: false },
});

/** Nunca se renderiza: `getServerSideProps` siempre redirige. Next exige el default export igual. */
export default function ProductoRetirado() {
  return null;
}
