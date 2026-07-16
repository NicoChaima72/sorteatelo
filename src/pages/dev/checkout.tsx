import Head from "next/head";
import { useEffect, useState } from "react";

import { api } from "~/utils/api";

/**
 * Página DEV throwaway (roadmap F01) — SIN marca ni pulido visual.
 *
 * Formulario pelado para ejercer el circuito de pago de F01 contra Flow sandbox: elegir el
 * producto seed + ingresar correo → "Pagar" → redirect a Flow. Corre en el subdominio de
 * una Tienda publicada (`a.localhost`): el catálogo y el checkout se scopean al tenant
 * resuelto server-side. La UI de comprador con identidad de marca (catálogo/carrito/
 * checkout) es F06/F07 y reemplaza esta página. NO es una página de marca: no seguir el
 * design system acá.
 */
export default function DevCheckoutPage() {
  const [email, setEmail] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Solo informativo para el dev que mira la página: la resolución REAL del
  // tenant es server-side desde el host (I1/ADR-0007); esto nunca viaja al server.
  const [host, setHost] = useState<string | null>(null);
  useEffect(() => setHost(window.location.host), []);

  const productos = api.checkout.listarProductos.useQuery();
  // `tenantProcedure` responde NOT_FOUND (respuesta neutral de ADR-0007) cuando el
  // host no resuelve una Tienda publicada — p.ej. en localhost:3000 (zona plataforma).
  const sinTienda = productos.error?.data?.code === "NOT_FOUND";
  const iniciar = api.checkout.iniciarCheckout.useMutation({
    onSuccess: ({ redirectUrl }) => {
      window.location.href = redirectUrl; // redirect a Flow sandbox
    },
    onError: (e) => setError(e.message),
  });

  const clp = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });

  const seleccionado = productId ?? productos.data?.[0]?.id ?? null;

  return (
    <>
      <Head>
        <title>DEV · checkout Flow sandbox</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main style={{ maxWidth: 520, margin: "40px auto", fontFamily: "system-ui", padding: 16 }}>
        <p style={{ background: "#fee", padding: 8, border: "1px solid #c99" }}>
          Página DEV throwaway (F01). Sin marca. Ejerce el pago contra Flow sandbox en el
          subdominio de la Tienda (ej. <code>autora.localhost:3000</code>).
          {host && (
            <>
              {" "}
              Estás en <code>{host}</code>.
            </>
          )}
        </p>
        <h1>Checkout (dev)</h1>

        {productos.isLoading && <p>Cargando productos…</p>}
        {sinTienda && (
          <p style={{ background: "#ffd", padding: 8, border: "1px solid #cc9" }}>
            Este host no resuelve una Tienda publicada (zona plataforma, slug
            inexistente o tienda no publicada — la respuesta es neutral a
            propósito, ADR-0007). Corré <code>npm run seed:tenants</code> y entrá
            por <code>autora.localhost:3000/dev/checkout</code> o{" "}
            <code>prueba.localhost:3000/dev/checkout</code>.
          </p>
        )}
        {productos.isError && !sinTienda && (
          <p style={{ color: "crimson" }}>
            No se pudo cargar el catálogo: {productos.error.message}
          </p>
        )}
        {productos.data?.length === 0 && (
          <p>
            No hay productos activos en esta Tienda. Corré <code>npm run seed:tenants</code>{" "}
            y entrá por el subdominio de un tenant seed.
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (!seleccionado) return setError("Elegí un producto.");
            iniciar.mutate({ email, productIds: [seleccionado] });
          }}
        >
          <fieldset style={{ marginBottom: 16 }}>
            <legend>Producto</legend>
            {productos.data?.map((producto) => (
              <label key={producto.id} style={{ display: "block", marginBottom: 4 }}>
                <input
                  type="radio"
                  name="producto"
                  value={producto.id}
                  checked={seleccionado === producto.id}
                  onChange={() => setProductId(producto.id)}
                />{" "}
                {producto.titulo} — {clp.format(producto.precio)}
              </label>
            ))}
          </fieldset>

          <label style={{ display: "block", marginBottom: 16 }}>
            Correo del comprador
            <br />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="fan@example.cl"
              style={{ width: "100%", padding: 8 }}
            />
          </label>

          <button
            type="submit"
            disabled={iniciar.isPending || !seleccionado}
            style={{ padding: "8px 16px" }}
          >
            {iniciar.isPending ? "Redirigiendo a Flow…" : "Pagar"}
          </button>
        </form>

        {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
      </main>
    </>
  );
}
