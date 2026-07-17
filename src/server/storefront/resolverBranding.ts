import {
  parsearHost,
  type ConfigPlataforma,
} from "~/server/tenancy/parsearHost";
import {
  ESTADO_PUBLICADA,
  type EstadoTienda,
} from "~/server/tenancy/resolverTenant";
import { type TenantBranding } from "~/styles/tenantTheme";

/**
 * Resolución de BRANDING host → Tienda PUBLICADA (F01/D3, ADR-0007). Espeja a
 * `resolverTenantDesdeHost` (misma zona, mismo criterio "solo PUBLICADA sirve"), pero devuelve
 * los campos de MARCA para tematizar el storefront por request. Va SEPARADO del contexto tRPC a
 * propósito (D3): el contexto solo carga `{id, slug}` para scopear queries (I1); el theme necesita
 * la marca ANTES de renderizar (SSR, en `_app`), así que lo resuelve el `getServerSideProps` del
 * storefront con este núcleo. No se infla el contexto tRPC con branding que casi ningún procedure usa.
 *
 * Núcleo con el repo INYECTADO: no importa Prisma; el borde (`getStorefrontProps`) lo cabla contra
 * la DB. La política "solo PUBLICADA" vive acá, no en el repo (un repo que filtrara por estado haría
 * intesteable la diferencia entre suspendida e inexistente — mismo criterio que `resolverTenant`).
 */

/** La marca tal como vive en la DB: el subconjunto serializable + el `estado` (para el gate). */
export interface TenantBrandingPersistido extends TenantBranding {
  estado: EstadoTienda;
}

/** Puerto de datos: el borde lo implementa contra Prisma; los tests, en memoria. */
export interface RepoBranding {
  findBrandingBySlug(slug: string): Promise<TenantBrandingPersistido | null>;
}

/**
 * Resultado de resolver el branding de un host. `sin-storefront` es UNA sola variante sin campo de
 * motivo (a propósito, I2/ADR-0007): "inexistente", "en configuración" y "suspendida" deben ser
 * indistinguibles desde afuera — al no existir el motivo en el tipo, ningún caller puede filtrarlo.
 */
export type ResolucionBranding =
  | { zona: "plataforma" }
  | { zona: "storefront"; branding: TenantBranding }
  | { zona: "sin-storefront" };

export async function resolverBrandingDesdeHost({
  host,
  config,
  repo,
}: {
  host: string | undefined | null;
  config: ConfigPlataforma;
  repo: RepoBranding;
}): Promise<ResolucionBranding> {
  const zonaHost = parsearHost(host, config);

  // Host no interpretable ⇒ fail-closed: no le servimos el apex a un host ajeno, y sin slug no
  // hay nada que consultar en la DB.
  if (zonaHost === null) return { zona: "sin-storefront" };
  if (zonaHost.zona === "plataforma") return { zona: "plataforma" };

  const tienda = await repo.findBrandingBySlug(zonaHost.slug);

  // Cualquier estado que no sea exactamente PUBLICADA ⇒ la MISMA respuesta neutral (I2).
  if (!tienda || tienda.estado !== ESTADO_PUBLICADA) {
    return { zona: "sin-storefront" };
  }

  // Mapeo explícito: se expone al cliente SOLO la marca, nunca el `estado` (que el chrome no usa).
  const branding: TenantBranding = {
    nombre: tienda.nombre,
    slug: tienda.slug,
    descripcion: tienda.descripcion,
    logoUrl: tienda.logoUrl,
    colorPrimario: tienda.colorPrimario,
    heroTitulo: tienda.heroTitulo,
    heroSubtitulo: tienda.heroSubtitulo,
    avisoTexto: tienda.avisoTexto,
  };
  return { zona: "storefront", branding };
}
