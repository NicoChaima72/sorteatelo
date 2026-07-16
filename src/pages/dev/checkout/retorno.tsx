import Head from "next/head";

/**
 * Página DEV throwaway de retorno tras el checkout de Flow (FLOW_URL_RETURN).
 *
 * IMPORTANTE (ADR-0001): el redirect del navegador NO es prueba de pago. La
 * confirmación real ocurre server-side en el webhook (`/api/webhooks/flow`)
 * contra `payment/getStatus`. Esta página solo informa; no marca la orden.
 */
export default function DevCheckoutRetornoPage() {
  return (
    <>
      <Head>
        <title>DEV · retorno de Flow</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main style={{ maxWidth: 520, margin: "40px auto", fontFamily: "system-ui", padding: 16 }}>
        <p style={{ background: "#fee", padding: 8, border: "1px solid #c99" }}>
          Página DEV throwaway (F01). Sin marca.
        </p>
        <h1>Volviste de Flow</h1>
        <p>
          El resultado del pago se confirma server-side vía el webhook, no desde
          este redirect. Verificá el estado de la orden en Prisma Studio
          (<code>npm run db:studio</code>).
        </p>
      </main>
    </>
  );
}
