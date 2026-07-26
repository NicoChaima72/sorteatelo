import { type GetServerSideProps, type InferGetServerSidePropsType } from "next";
import Head from "next/head";

import { env } from "~/env";
import { db } from "~/server/db";
import {
  datosEntregableDeFila,
  esProductoEntregable,
  SELECCION_PRODUCTO_ENTREGABLE,
} from "~/server/productos/productoEntregable";

/**
 * Página DEV throwaway (F03/D7) — puente de E2E hasta que exista el correo transaccional (F04
 * del roadmap, Resend). Lista las órdenes PAGADAS recientes de CUALQUIER Tienda con sus
 * `DownloadGrant`(s) y el enlace `/api/descargas/<token>`. Es una página de OPERADOR local: no
 * simula al Comprador real (eso lo hará el correo). Solo-development: en producción responde 404.
 * Sin marca ni pulido visual; `noindex`. Muere en F04/F06.
 */

interface GrantView {
  token: string;
  productoTitulo: string;
  /**
   * ¿El producto tiene algo que entregar? Desde productos-tipos-digitales F04 se resuelve con la
   * MISMA regla que la descarga real (`tieneArchivoEntregable`: ≥1 `ProductFile` confirmado **o** el
   * `pdfPath` legacy) en vez de mirar solo la columna. Antes de este cambio esta página mentía: el
   * código nuevo ya no escribe `pdfPath`, así que todo producto subido de ahora en adelante se
   * mostraba como "pendiente — 404" cuando su descarga funcionaba perfecto.
   */
  entregable: boolean;
  expiresAt: string;
}

interface OrdenView {
  id: string;
  email: string;
  tiendaSlug: string;
  tiendaNombre: string;
  createdAt: string;
  grants: GrantView[];
}

export const getServerSideProps: GetServerSideProps<{
  ordenes: OrdenView[];
}> = async () => {
  // Solo-development: en producción la página no existe (404). Puente de dev, no de prod.
  if (env.NODE_ENV !== "development") return { notFound: true };

  const ordenes = await db.order.findMany({
    where: { estado: "PAGADO" },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      email: true,
      createdAt: true,
      tenant: { select: { slug: true, nombre: true } },
      downloadGrants: {
        orderBy: { createdAt: "asc" },
        select: {
          token: true,
          expiresAt: true,
          product: {
            // El `select` de la regla de entregable (trae la columna legacy, el `_count` FILTRADO de
            // archivos confirmados —sin las `key`, que no tienen por qué llegar acá (I2/ADR-0002)— y
            // la opción de pack activa más grande) + el título para mostrar.
            select: { ...SELECCION_PRODUCTO_ENTREGABLE, titulo: true },
          },
        },
      },
    },
  });

  return {
    props: {
      ordenes: ordenes.map((o) => ({
        id: o.id,
        email: o.email,
        tiendaSlug: o.tenant.slug,
        tiendaNombre: o.tenant.nombre,
        createdAt: o.createdAt.toISOString(),
        grants: o.downloadGrants.map((g) => ({
          token: g.token,
          productoTitulo: g.product.titulo,
          // MISMA regla que la entrega, importada y no re-escrita (I5): si esta página y la descarga
          // discrepan, la página de dev es inútil justo cuando más se la necesita.
          entregable: esProductoEntregable(datosEntregableDeFila(g.product)),
          expiresAt: g.expiresAt.toISOString(),
        })),
      })),
    },
  };
};

export default function DevDescargasPage({
  ordenes,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <Head>
        <title>DEV · enlaces de descarga</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main
        style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui", padding: 16 }}
      >
        <p style={{ background: "#fee", padding: 8, border: "1px solid #c99" }}>
          Página DEV throwaway (F03). Sin marca. Puente hasta el correo transaccional (F04):
          lista las órdenes PAGADAS y sus enlaces de descarga. Solo development.
        </p>
        <h1>Descargas (dev)</h1>

        {ordenes.length === 0 && (
          <p>
            No hay órdenes PAGADAS todavía. Completa un checkout contra Flow sandbox
            (<code>/dev/checkout</code> en el subdominio de una Tienda) y confirma el pago vía
            el webhook.
          </p>
        )}

        {ordenes.map((orden) => (
          <section
            key={orden.id}
            style={{ border: "1px solid #ccc", borderRadius: 6, padding: 12, marginBottom: 16 }}
          >
            <div style={{ marginBottom: 8 }}>
              <strong>{orden.email}</strong> · tienda <code>{orden.tiendaSlug}</code> (
              {orden.tiendaNombre}) ·{" "}
              <span style={{ color: "#666" }}>
                {new Date(orden.createdAt).toLocaleString("es-CL")}
              </span>
            </div>

            {orden.grants.length === 0 ? (
              <p style={{ color: "#999" }}>Sin grants de descarga.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {orden.grants.map((grant) => (
                  <li key={grant.token} style={{ marginBottom: 6 }}>
                    {grant.productoTitulo}{" "}
                    {grant.entregable ? (
                      <a
                        href={`/api/descargas/${grant.token}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        descargar
                      </a>
                    ) : (
                      <span style={{ color: "#c60" }}>
                        (archivo pendiente — 404 hasta subirlo)
                      </span>
                    )}{" "}
                    <span style={{ color: "#999", fontSize: 12 }}>
                      · vence {new Date(grant.expiresAt).toLocaleDateString("es-CL")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </main>
    </>
  );
}
