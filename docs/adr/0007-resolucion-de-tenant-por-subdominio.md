# Resolución de tenant por subdominio (wildcard DNS + middleware Next.js)

Cada Tienda publicada opera en su propio **subdominio**: `<slug>.<dominio de la plataforma>`. La resolución del tenant es **por host**: wildcard DNS (`*.dominio`) apunta a la app, y un middleware de Next.js parsea el host del request, resuelve la Tienda por su slug y establece el contexto de tenant para el storefront. El **apex** (`dominio` / `www`) queda reservado a la Plataforma (landing, onboarding, panel).

Razón: le da a cada Organizador una URL propia y compartible sin gestionar dominios de terceros; es el mecanismo estándar y barato de multi-tenancy por host, y encaja con el middleware de Next.js sin infraestructura extra. Alternativa rechazada: paths (`dominio/t/<slug>`) — más barato en DNS pero sin identidad para el tenant y con colisiones de rutas; dominios custom por tenant — deseable a futuro, fuera del MVP (certificados y verificación por tenant).

## Consecuencias

- Las decisiones abiertas de **dominio (#4)** y **hosting (#5)** quedan restringidas: deben soportar wildcard subdomains y certificados wildcard.
- El **slug** de la Tienda es único a nivel plataforma e inmutable tras la publicación (supuesto revisable); subdominio inexistente, tienda no publicada o suspendida ⇒ respuesta neutral de la plataforma (no un storefront).
- En dev se usa `*.localhost` (ej. `piloto.localhost:3000`), que los browsers modernos resuelven sin tocar DNS.
- ~~El panel de Organizadores y del Operador vive en el **apex** (sesión NextAuth con cookie en un solo host, sin cookies cross-subdominio); el subdominio es solo la superficie del Comprador (supuesto revisable).~~ **SUPERSEDED por ADR-0022 (2026-07-25)**: el panel vive en `<tienda>.<dominio>/admin` y el apex queda como puerta (redirect a la primera tienda + alta); la cookie de sesión ya cruza subdominios desde ADR-0019.
- Dominios custom por tenant: fuera del MVP; si llegan, se agregan como alias verificados sobre esta misma resolución por host.
