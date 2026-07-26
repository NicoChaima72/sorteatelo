# MCP del Organizador: OAuth 2.1 con Authorization Server propio, tokens per-usuario scoped a membresía

> **Estado: aceptado** (2026-07-26, grill con visto bueno del usuario). Plan:
> `tasks/26-07-26-mcp-organizador.md`. **Retoma y cierra** la decisión diferida "MCP futuro con
> auth per-usuario" de ADR-0023. Patrón de referencia: el MCP de terranova_ADMIN (su ADR-0009,
> mismo stack T3/pages-router, en producción) — instrucción textual del usuario: *"lo quiero
> justamente así"*.

La Plataforma expone un **MCP remoto del Organizador**: cada Organizador conecta su cliente de IA
(Claude Code, Claude Desktop, otros) y opera su cuenta por chat — configurar sus Tiendas, productos,
sorteo, el Borrador de su página, y crear otra Tienda.

## Decisión

- **La Plataforma es su propio OAuth 2.1 Authorization Server** (no PAT, no delegación a Google):
  Authorization Code + **PKCE S256 obligatorio** + **Dynamic Client Registration** (RFC 7591), de
  modo que `claude mcp add --transport http <url>` funcione solo. El `/authorize` exige la sesión
  NextAuth existente (el login de Google sigue siendo el proveedor de identidad — el AS no lo
  reemplaza, lo consume) y emite tokens recién tras una **pantalla de consentimiento** brandeada en
  el apex. Discovery RFC 8414/9728 en `/.well-known/*` vía rewrites; `WWW-Authenticate` RFC 6750.
- **Tokens opacos, hasheados, per-USUARIO**: en DB vive solo el SHA-256 (`tokenHash @unique`) — a
  diferencia de `FlowCredential` (cifrada reversible porque se USA contra Flow), un token propio solo
  se compara ⇒ hash, irrecuperable. Access 1 h + refresh 30 d (TTLs en código), `revokedAt` por
  token, revocación desde el panel. La identidad del token es `User.id`.
- **El token porta identidad; la membresía autoriza — en cada llamada.** El MCP vive en el **apex**
  (un solo endpoint: el token cruza tiendas, "crear otra Tienda" no puede colgar del host de una).
  Toda tool que opera una Tienda la **selecciona** por argumento (slug) y la política
  `resolverTenantAutorizado` la **autoriza** contra la `TenantMembership` viva — selecciona-jamás-
  autoriza, espejo exacto del panel (ADR-0022). Es lo contrario del Editor MCP retirado (token
  god-mode de entorno que elegía tienda por `storeSlug` sin membresía, ADR-0023): sacar a un usuario
  de una Tienda lo desarma al instante, sin tocar tokens.
- **El MCP es un borde, no un dominio**: sus tools invocan los **mismos use cases de
  `src/server/domain/`** que el panel (patrón `panelProcedure`), reconstruyendo el `acceso` desde la
  identidad del token. Cero lógica de dominio duplicada en el borde.
- **Transporte**: `@modelcontextprotocol/sdk` oficial con `StreamableHTTPServerTransport` stateless
  en pages router (`pages/api/mcp/`), factory `createMcpHandler`. La dependencia huérfana
  `mcp-handler` (Vercel, app router — resto del MCP viejo) se **desinstala**: este approach no la
  necesita y elimina el único uso de app router que había.
- **UN solo modo v1** (`organizador`). El MCP de administración de plataforma es OTRA superficie,
  diferida junto al superadmin (ADR-0023) — ni siquiera un endpoint vacío.
- **Auditoría**: `McpAuditLog` append-only (tool/resultado/errorCode/args sanitizados), sin FK, para
  trazar qué hizo el agente. Los args jamás incluyen secretos.

## Límites de tools (matriz aprobada por el usuario)

**SÍ v1**: configuración de tienda (textos/colores/redes/contacto), productos CRUD (sin binarios),
sorteo crear/editar, campos de checkout CRUD, edición del **Borrador** de página, crear Tienda,
lecturas (estado, checklist de publicación, ventas, participaciones, estado Flow sin secretos).

**Excepción empujada por el usuario — Flow SÍ, write-only**: la tool `guardarCredencialFlow` reusa
el use case del panel (cifrado at-rest, ADR-0006) y **jamás devuelve ni loguea el secreto**; la tool
de estado reporta solo Configurada/no + ambiente + fecha. ADR-0006 protege que la PLATAFORMA no
exponga secretos, y un tool write-only no los expone. **Riesgo residual aceptado y documentado**: el
secreto viaja por el contexto del LLM del cliente y queda en el historial DEL USUARIO — la
description del tool lo advierte y recomienda el panel como camino preferente.

**NO v1** (límites duros): **leer** credenciales Flow en cualquier forma; **publicar** tienda o
página (ADR-0018: Publicar es el checkpoint explícito y HUMANO contra un editor automático — y el
MCP es un editor automático); **ejecutar el sorteo** (irreversible, carga legal ADR-0008); **borrar**
tienda/producto (no existe el use case; no se inventa para el MCP).

## Consideradas y descartadas

- **PAT (token de API generado en el panel)**: recomendación inicial del grill, rechazada por el
  usuario a favor del patrón terranova. OAuth da DCR (conexión sin copiar secretos a mano), consent
  UX, refresh y revocación granular per-cliente.
- **Delegar el AS a Google/NextAuth**: los tokens de Google no portan el dominio de la Plataforma ni
  permiten DCR/revocación propia; construir el AS mínimo ya está resuelto (patrón portado 1:1).
- **Revivir `mcp-handler` + app router**: dependencia extra y un segundo router para lo que el SDK
  oficial hace en pages router (terranova lo prueba en producción).
- **Endpoint MCP por subdominio de tienda**: rompería "crear otra Tienda" y multiplicaría el dance
  OAuth por tienda; el scoping real es la membresía, no el host.
- **Scopes finos por capacidad en v1** (`productos:write`, etc.): scope único `mcp` como terranova;
  la matriz de límites vive en el registro de tools (qué NO existe no se puede llamar). Scopes finos
  son puerta abierta si aparecen clientes de terceros.

## Consecuencias

- Segundo llamador legítimo de `resolverTenantAutorizado` con selección **explícita** ⇒ refuerza el
  candidato de ADR-0023 de volver `tenantIdSolicitado` requerido (sigue siendo carril propio).
- Lookup en DB por request MCP (token opaco): aceptable a esta escala; cache con TTL = `expiresAt`
  es la válvula si duele (mismo trade-off aceptado en terranova).
- DCR abierto registra clientes anónimos (solo loopback + allowlist de callbacks HTTPS de clientes
  conocidos, p. ej. el callback de claude.ai — validación exact-match); el registro no otorga nada:
  sin consentimiento de un usuario logueado no hay token.
- `STOREFRONT_PREVIEW_TOKEN` (deuda desnudada por ADR-0023) queda como el ÚNICO token de plataforma
  restante; su cierre natural (token per-tenant o derivado de sesión) sigue pendiente, fuera de este
  carril.
- El copy de marketing puede prometer "configura tu tienda desde tu IA" — con el asterisco de que
  cobrar, publicar y sortear cierran en el panel.

## Addendum 2026-07-26 — la política de `redirect_uri` admite un tercer caso: prefijo ANCLADO (ChatGPT)

> Aprobado por el usuario (D12 de `tasks/26-07-26-onboarding-guia-conecta-tu-ia.md`, F05). Cambia
> `src/server/mcp/redirectUris.ts` y nada más: ni tools, ni consent, ni emisión de tokens. Ese plan
> traía un invariante de «cero cambios al servidor MCP / consent / flujo OAuth» (su I5) y este es su
> **único carve-out**, autorizado explícitamente: se paró, se preguntó y el usuario respondió — de
> ahí que vaya con feature propia, tests propios y este addendum, en vez de colarse en la guía.

**Por qué se relaja el exact-match.** D9 dejó dos formas permitidas: loopback y **allowlist
exact-match** de callbacks HTTPS conocidos. Al documentar el carril ChatGPT de la guía «Conecta tu
IA» apareció el hecho que el exact-match no puede absorber: ChatGPT recibe el callback en
`https://chatgpt.com/connector/oauth/{callback_id}` y **el `callback_id` es distinto por conector**
—lo genera OpenAI al crear cada uno—, así que **no existe un string exacto que listar**. Con la
allowlist tal como estaba, el DCR de ChatGPT se rechaza y el carril muere en el primer paso: no es
una limitación de la guía, es el AS diciendo que no.

**La forma que lo habilita sin abrir la política**: un caso 3 que compara **sobre la URL ya
parseada**, jamás sobre el string crudo (`startsWith("https://chatgpt.com")` sobre el string
aceptaría `https://chatgpt.com.evil.com/…` y, peor, `https://chatgpt.com%2f@evil.com/…`, que arranca
con el host bueno y apunta a otro). Cuatro condiciones juntas:

1. **`url.origin` EXACTO** (`https://chatgpt.com`) — no "termina en", no "contiene". Deja afuera
   `chatgpt.com.evil.com`, `sub.chatgpt.com`, `chatgpt.com.br`, el FQDN con punto final y cualquier
   puerto no-default (el `origin` lo incluye).
2. **`url.pathname` empieza con `/connector/oauth/`** — y el path que se compara es el **normalizado
   por el parser**, así que un `..` que se sale del prefijo se ve como termina resolviendo.
3. **Algo después del prefijo** (el `callback_id`): el prefijo pelado no es el callback de nadie.
4. **Sin query** — un `?` es el canal para colar parámetros propios en la URL a la que el AS manda
   el code. El **fragmento** y el **userinfo embebido** ya los rechazaba la función para todos los
   casos, y el caso 3 es HTTPS-only como el 2.

**Lo que NO se aflojó, y es lo que mantiene el riesgo acotado**: esto ensancha qué se puede
**registrar**, no cómo se **verifica** cada `/authorize`. `redirectUriVerificada`
(`decidirAuthorize.ts`) sigue exigiendo las dos cosas juntas — que el `redirect_uri` esté entre los
que ESE cliente registró (igualdad de string, RFC 6749 §3.1.2.2) **y** que cumpla la política hoy.
El peor caso del caso 3 es que alguien registre un cliente cuyo callback apunta a una URL de
chatgpt.com que no le pertenece; para cobrar un code igual necesita que un Organizador logueado
apruebe su consent, y el code aterriza en OpenAI, no en él.

El callback **legacy** de OpenAI (`https://chatgpt.com/connector_platform_oauth_redirect`) entra por
la allowlist exact-match: es un string fijo y no necesita relajación ninguna. **Regla para el que
venga**: un cliente nuevo entra por el caso 2 mientras su callback sea fijo; el caso 3 se reserva
para los que de verdad tienen path dinámico.

### Riesgo documentado que este cambio NO resuelve: `resource` / `aud`

La documentación de OpenAI dice que ChatGPT manda **`resource=`** (RFC 8707, Resource Indicators) en
`/authorize` y `/token`, y que espera ese valor en el **`aud` del access token**. Nuestros tokens
son **opacos** por diseño (arriba: en DB vive solo el SHA-256; no son JWT, no tienen claims, no
tienen `aud`), el AS **no lee `resource` en ningún endpoint** y su metadata RFC 8414 **no anuncia**
`resource_indicators_supported` — los tres verificados en código al escribir este addendum.

Consecuencia práctica, escrita acá para que no se confunda con un bug nuevo: **si ChatGPT exige el
`aud` duro, el dance falla igual con este cambio aplicado**. La conexión con ChatGPT solo se puede
confirmar probando con una cuenta real (plan pagado + modo desarrollador, ver D10 del plan), y su
fracaso ahí es ESTE límite conocido, no una regresión de la política ni una falla de la guía. Darle
`aud` a los tokens (JWT, o un campo de audiencia en el token opaco verificado en cada llamada) es
un carril propio y **no se abre acá**: sería rediseñar la emisión de tokens para un cliente que
todavía no sabemos si conecta.
