# Retiro del rol Operador de plataforma

> **Estado: aceptado** (2026-07-25, visto bueno del usuario al plan). Plan: `tasks/26-07-25-plataforma-retiro-operador.md`. **Cierra** la línea que ADR-0022/D11 dejó abierta y **supersede** el modelo de auth del Editor MCP de ADR-0016.

Se **retira entero** el rol **Operador de plataforma** como concepto de código: la allowlist `PLATFORM_OPERATOR_EMAILS`, el flag `esOperador` de `AccesoPanel`, el panel `/admin/operador` con su router y su módulo de dominio, la rama god-mode del editor visual, y el Editor MCP completo con su Bearer `MCP_OPERADOR_TOKEN`.

**Decisión:**

- **La autorización de la plataforma queda con UNA sola puerta: la `TenantMembership`.** No existe rol, env var, email ni flag que autorice por fuera de ella. La política pura `resolverTenantAutorizado` perdió su parámetro `esOperador` y sus dos ramas exclusivas del rol (devolver cualquier `tenantIdSolicitado` sin mirar membresía, y el `INVALID` "indica sobre qué Tienda operar"); `puedoEditar` perdió su early-return god-mode. Editar u operar una tienda **es** tener membresía en ella.
- **Razón:** ADR-0022/D11 (mismo día) ya le había negado al rol el acceso cross-tienda en el panel de Organizador — *"tiene que haber admin por empresas, yo no puedo ver todas las empresas"*. Con esa puerta cerrada, el rol quedó autorizando **solo su propio borde**: mantenerlo era conservar superficie de ataque y vocabulario muerto a cambio de nada.
- **El Editor MCP muere ENTERO** (`/api/mcp`, las 12 tools, `verificarBearer`, `MCP_OPERADOR_TOKEN`), no se renombra. Su auth era un **token god-mode compartido** que elegía tienda por `storeSlug`: incompatible de raíz con el modelo futuro, así que sobrevivir "hasta que se migre" solo habría prolongado el agujero. Los 3 helpers de solo-lectura que el asistente de IA del editor consumía desde ahí (`outlineDe`, `listarTiposWidget`, `listarOpcionesEstilo`) se reubicaron en `src/server/domain/pagebuilder/catalogoDelEditor.ts` **antes** del borrado: el asistente no perdió capacidad.
- **`Tenant.estado = SUSPENDIDA` y todos sus guards QUEDAN.** El storefront sigue negando la tienda suspendida con respuesta neutral (ADR-0007) y `publicarTienda` sigue bloqueando con `CONFLICT`. Lo que muere son las **superficies** de suspender/reactivar: hasta que exista el superadmin, suspender es **UPDATE directo a la DB**, operación del freelancer. Los copys que nombraban al rol pasaron a "el soporte de la plataforma".
- **Los snapshots históricos NO se reescriben.** `StorefrontPageVersion` es append-only: las revisiones publicadas con `publishedBy: "operador"` se quedan como están. Reescribir historia para que cuadre con el vocabulario de hoy sería peor que un nombre viejo en un registro de auditoría.
- **La PERSONA sobrevive; lo que se retira es el ROL en código.** El "Operador de plataforma" como *freelancer que opera la infraestructura* (cuenta R2, Cloudflare, deploy, DB) sigue siendo un concepto vivo en `CLAUDE.md` y en los comentarios de infra. Lo que dejó de existir es un **sujeto autorizado** dentro de la aplicación.

## Decisiones DIFERIDAS (registradas acá a propósito, NO construidas)

Las dos se enunciaron durante el grill y quedan explícitamente fuera de alcance. Se documentan para que quien las retome sepa que son decisiones tomadas y no huecos olvidados:

- **Superadmin de plataforma (viene de ADR-0022/D11).** La supervisión cross-tienda (listar, suspender, reactivar) volverá como una **superficie propia y aparte** — su propia ruta/zona, probablemente en el apex —, jamás como una puerta de servicio dentro del panel del Organizador. Esa fue la objeción original del usuario y sigue en pie.
- **MCP futuro con auth per-usuario.** El MCP renacerá con **tokens por usuario, scopeados a su membresía** (*"una persona tiene un token y ese token le permite configurar su tienda y también crear otra"*), más un **MCP de plataforma aparte** para el operador humano. Es lo contrario del token único compartido que se retiró acá: el scope sale de los datos del usuario, no de un secreto de entorno.

## Consideradas y descartadas

- **Conservar el rol y solo renombrarlo** (p. ej. `MCP_ADMIN_TOKEN`, `publishedBy: "mcp"`): era la recomendación inicial del grill y el usuario la rechazó. Renombrar deja intacto lo que molesta —un secreto compartido que abre todas las tiendas— y solo hace más difícil de encontrar el agujero.
- **Dejar el MCP vivo hasta tener el reemplazo**: habría dejado indefinidamente un god-mode en producción para no perder una herramienta que hoy no tiene usuarios, cuando la misma capacidad ya vive en el editor visual y en su asistente de IA, ambos gateados por membresía.
- **Borrar el enum `SUSPENDIDA` junto con sus superficies**: la suspensión tiene efecto de producto real (apaga la vitrina) y es la palanca de incumplimiento. Lo que faltaba era la UI, no el estado.
- **Reescribir los `publishedBy` históricos a un valor neutro**: viola el append-only del versionado y adultera una traza de auditoría por cosmética.
- **Dejar `PLATFORM_OPERATOR_EMAILS` declarada pero sin uso**: una env var declarada es una invitación a volver a cablearla. Se borró del schema Zod, del `runtimeEnv` y de los dos `.env`.

## Consecuencias

- **La superficie de autorización se reduce a la mitad**: desaparece el único camino que direccionaba tenant por un identificador del cliente (`storeSlug` del MCP) autorizado por un secreto compartido. Lo que queda resuelve el tenant desde el **host server-authored** cruzado con la membresía (ADR-0005/0007/0022).
- **La firma es la defensa, no el runtime**: al desaparecer los parámetros `esOperador`, reintroducir un bypass exige cambiar firmas públicas y romper los guards de regresión de `puedoEditar.test.ts::page.editar.003` y `authPolicy.test.ts` — no alcanza con setear una env var.
- **Suspender/reactivar deja de ser autoservicio** hasta el superadmin: es una operación manual sobre la DB. Aceptable mientras la plataforma tenga un puñado de tiendas y un solo operador humano; es lo primero que va a doler al crecer.
- **Deuda conocida que el retiro deja a la vista** (no la crea, la desnuda):
  - `STOREFRONT_PREVIEW_TOKEN` (ADR-0016) es ahora **el único camino que queda para leer el Borrador de una tienda ajena sin membresía**: es un token único de plataforma, sin sesión, read-only. Estaba tapado por un agujero mayor. El cierre natural es un token per-tenant o derivado de la sesión.
  - En `resolverTenantAutorizado` quedó **viva pero inalcanzable en producción** la rama "sin selección ⇒ primera membresía": su único llamador (`resolverTenantDelPanel`) siempre pasa el host. Es el mismo fallback que ADR-0022 mató en el borde. Candidato a volver `tenantIdSolicitado` requerido — cambio de semántica, carril propio.
  - La dependencia npm `mcp-handler` quedó sin consumidores.
- **Un usuario logueado sin ninguna tienda ve el alta** (`CrearTienda`) en el apex, sin variantes: murió la rama que desviaba al panel de plataforma.
