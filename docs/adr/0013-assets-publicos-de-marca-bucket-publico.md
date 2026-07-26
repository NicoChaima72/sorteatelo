# Assets públicos de marca en bucket R2 público, separado del storage privado de PDFs

Las imágenes del storefront (logo de la Tienda, imagen de hero, portadas de producto, imagen del premio del sorteo) son **assets públicos de marketing**: se muestran a cualquiera que visite la tienda pública, deben ser **cacheables** y servidas por CDN, y no tienen valor si se "filtran" (son propaganda, no el producto). Son categóricamente distintas del **PDF** vendido, que es el producto pirateable y vive en un **bucket privado gated por `Entitlement`** ([ADR-0002](0002-entrega-pdf-storage-privado-url-firmada.md) / [ADR-0009](0009-storage-pdfs-cloudflare-r2.md)).

**Decisión (2026-07-17):** los assets públicos de marca viven en un **segundo bucket R2, con acceso público de lectura**, separado del bucket privado de PDFs. La frontera público/privado es **a nivel de bucket**, no de prefijo: R2 expone el acceso público por bucket, y un bucket entero con lectura pública no puede filtrar un PDF porque los PDF no están ahí. La subida **reutiliza el patrón de F03** (presigned PUT desde el navegador + confirmación con `headObject` antes de persistir), generalizando el `Content-Type` de `application/pdf` a una allowlist de imágenes. La app compone la **URL pública** desde `R2_PUBLIC_BASE_URL` (dominio público de R2 — `r2.dev` gestionado en el MVP, dominio propio cuando se cierre la decisión #5) y persiste la URL resultante con un sufijo de cache-busting (`?v=…`) en las columnas `*Url` del modelo.

Razón:
- **Frontera de seguridad limpia.** Dos buckets = el compromiso de "público" es del bucket entero. Un prefijo público dentro del bucket privado obligaría a un Worker o a arriesgar que un bug de presign exponga una key de PDF; separar buckets elimina esa clase de bug por construcción.
- **Cacheable y barato.** Una URL pública estable la cachea el CDN de R2; egreso cero (ADR-0009). Presignar GET de larga duración daría URLs no cacheables, feas y que expiran — mal ajuste para propaganda que se sirve miles de veces.
- **Reúso máximo.** El adapter S3 de `services/storage.ts` ya sabe presignar PUT y hacer `headObject`; el flujo público es el mismo con otro bucket y otro `Content-Type`. No hay pieza de infra nueva salvo el bucket y dos env vars.
- **Misma cuenta R2 del Operador.** Como el storage privado, es de **plataforma** (una cuenta R2 del Operador), no BYO por tenant — a diferencia de Flow (ADR-0006).

## Consecuencias

- **Env nuevas** (Zod, opcionales, fail-fast al usar): `R2_PUBLIC_BUCKET` (bucket público) y `R2_PUBLIC_BASE_URL` (base de la URL pública). Reusan `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ENDPOINT` de ADR-0009. El Operador crea el bucket y habilita el acceso público a mano en Cloudflare (paso manual, como el CORS de F03).
- **Keys per-tenant** (organización, no seguridad — todo el bucket es público): `<tenantId>/branding/logo`, `<tenantId>/branding/hero`, `<tenantId>/productos/<productId>/portada`, `<tenantId>/sorteo/<raffleId>/premio`. La key la computa **siempre el server** (el cliente nunca la elige, mismo invariante I6 que el PDF).
- **Content-Type firmado** contra una allowlist (`image/png`, `image/jpeg`, `image/webp`): la URL prefirmada solo es válida para el tipo declarado (misma técnica `signableHeaders` que el PDF de F03). El objeto se guarda sin extensión en la key; el `?v=` (timestamp/aleatorio) busca cache al re-subir sobre la misma key.
- **Confirmación con `headObject`** antes de persistir la URL: la columna nunca apunta a un objeto inexistente (mismo contrato que `confirmarPdfProducto`).
- **Sin límite de tamaño duro en el MVP** (el presigned PUT de R2 no lo aplica sin política POST): se valida tamaño **client-side** y se acepta el riesgo (bucket de marketing, solo suben Organizadores autenticados). Revisable a presigned POST con `content-length-range` si aparece abuso.
- **Degradación elegante obligatoria** (regla de producto, no de infra): cada imagen es opcional; sin ella el storefront muestra un **gradiente/placeholder temático derivado del `colorPrimario`** del tenant, nunca un hueco ni un `<img>` roto.
- **La marca de la PLATAFORMA sigue PENDIENTE** (decisión #4): este ADR es sobre los assets de las TIENDAS (theming per-tenant), no sobre la identidad del SaaS. El pie del storefront no lleva nombre de marca de plataforma hasta que #4 se cierre.
- **Atadura a la decisión #5** (dominio/hosting): `R2_PUBLIC_BASE_URL` es hoy el subdominio `r2.dev` gestionado; migrar a dominio propio es cambiar la env + un script one-time que recomponga las URLs almacenadas (barato, pre-go-live). Alternativa considerada y diferida: guardar solo la KEY y componer la URL server-side en cada lectura (evita el script pero agrega composición en todo read path) — revisable si el dominio público pasa a variar por entorno.

## Addendum 2026-07-25 — el PDF de las Bases del sorteo entra al bucket público (destino `bases`)

> Plan `tasks/26-07-25-admin-bases-pdf-y-limpieza.md` (D1). Amplía la decisión original sin reescribirla.

El bucket público ahora acepta **`application/pdf` SOLO para el destino nuevo `bases`** (el PDF de las
Bases del sorteo, `Raffle.basesPdfUrl`, key per-tenant/per-raffle generada server-side:
`<tenantId>/sorteo/<raffleId>/bases.pdf`, con el mismo cache-buster `?v=` que el resto de los assets).
Cualquier otro destino público (logo/hero/portada/premio) sigue rechazando PDFs, y el destino `bases`
rechaza todo lo que no sea PDF.

**El invariante se re-redacta**: de «el bucket público jamás contiene un PDF» a «el bucket público
jamás contiene un PDF de **PRODUCTO**». Los PDFs de producto pagados siguen SOLO en el bucket privado
con URL prefirmada + `Entitlement` — ADR-0002/0009 quedan intactos.

Razón: las bases son un **documento legal público por naturaleza** — ADR-0008 obliga a mostrarlas a
cualquier visitante del storefront (visor embebido en la página `/bases`), así que no hay nada que
"filtrar": no son el producto pirateable, son la letra chica del sorteo. Una URL pública estable
simplifica el visor embebido (`<iframe>` nativo) y evita URLs firmadas que expiran a mitad de una
visita. El razonamiento original de la frontera a nivel de bucket sigue en pie: lo que cambia no es
la frontera sino la clasificación — las bases pertenecen al lado público de ella.
