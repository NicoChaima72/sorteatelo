# Página de tienda como documento JSON de dos niveles con registro Zod de widgets

> **Estado: aceptado** (2026-07-17, visto bueno del usuario). Plan: `tasks/26-07-17-page-builder.md` (carril A). Origen: investigación multi-agente `.scratch/page-builder/investigacion-builder-profesional.md` (D1–D5).
>
> **Addendum 2026-07-25 — el Editor MCP de esta ADR fue RETIRADO** (ADR-0023). El documento JSON, el registro Zod, draft/published y el versionado siguen **intactos y vigentes**: lo que murió es uno de sus *editores*. El `/api/mcp` con sus 12 tools y el Bearer god-mode `MCP_OPERADOR_TOKEN` se borraron enteros al retirar el rol Operador de plataforma; los 3 helpers de solo-lectura que el asistente de IA consumía de ahí viven ahora en `src/server/domain/pagebuilder/catalogoDelEditor.ts`. Los editores vigentes son el **editor visual del panel** y su **asistente de IA**, ambos gateados por `TenantMembership`. La frase de más abajo *"cualquier editor (MCP, chat IA, drag-drop futuro) produce siempre documentos schema-válidos"* sigue siendo el argumento correcto — solo que el MCP ya no está en la lista. La **preview tokenizada** (`STOREFRONT_PREVIEW_TOKEN`) SÍ sobrevive: la usa el editor del panel (ver la deuda anotada en ADR-0023).

El storefront pasa de una plantilla fija de secciones a una **Página de tienda por tenant definida por un documento JSON**, cuya fuente única de verdad estructural es un **registro Zod de discriminated unions** (`tipo → propsSchema + defaultProps + Componente + versión`).

**Decisión:**

- **Documento de dos niveles, sin recursión**: `PageDocument = { schemaVersion, root:{props: tema}, secciones:[…], overlays:[…] }`; cada nodo es `{ id: cuid ESTABLE, tipo, v, props }`. Las secciones se ordenan por **posición en el array** (no campo `orden`). Un slot `overlays[]` separado para widgets fuera del flujo vertical (barra de aviso, botón flotante).
- **Registro Zod como fuente única**: `z.discriminatedUnion('tipo', [...])` — un objeto por widget da validación en el borde, tipos de render, `defaultProps`, versión `v` y componente por switch exhaustivo, sin duplicar shapes. Es el mismo patrón `destinoImagen` ya usado en el dominio.
- **Persistencia en columna `Json` (jsonb), NO tablas normalizadas**: `StorefrontPage { id, tenantId, slug, draftJson, publishedJson?, version, publishedAt, updatedAt }` con `@@unique([tenantId, slug])` y `tenantId` **columna real** con FK + `@@index` (jamás dentro del JSON). El documento se lee/escribe atómico como unidad; nunca se filtra por dentro del jsonb. `slug:'home'` desde ya deja la puerta a multi-página sin cambiar el modelo (sin construir ruteo multi-página ahora).
- **Draft/published como columnas gemelas**: publicar = copiar `draftJson→publishedJson` en un update atómico. El storefront público lee **solo** `publishedJson`.
- **Versionado en dos planos**: `version: Int` en la fila = lock optimista (mutaciones con `expectedVersion`, rechazo estructurado ante conflicto); `v` por nodo con **migrate-on-read lazy** (migraciones puras vN→vN+1 al leer, nunca big-bang con `jsonb_set`). El render tolera `tipo` desconocido mostrando nada — un documento publicado nunca crashea la página.

Razón: es el modelo que el mercado validó (Shopify OS 2.0 ganó con secciones+bloques+settings_schema; Wix retiró su canvas libre EditorX). El borde Zod en cada escritura es el mismo seam que resuelve seguridad y tenancy (ADR-0018), y hace que cualquier editor (MCP, chat IA, drag-drop futuro) produzca siempre documentos schema-válidos.

## Consideradas y descartadas

- **Anidamiento recursivo/arbitrario** → JSON inmanejable para un LLM, explota el jsonb. Tope 2 niveles (regla de Shopify).
- **Campo `orden` numérico** → una fuente más para desincronizar; el array ya ordena.
- **Tablas normalizadas `Section/Block` con ordinales y FKs** → obligaría al editor (LLM) a orquestar inserts/updates/deletes ordenados con integridad referencial por micro-edición; reintroduce bugs de ordering y multiplica round-trips.
- **Field-config estilo Puck en JS plano** → Zod ya es el validador de todo el borde tRPC; reusarlo es lo que garantiza salida de IA schema-válida.
- **Migración big-bang de documentos** → rompe páginas publicadas si algo falla a mitad de camino.

## Consecuencias

- El pivote es **aditivo**: los componentes actuales del storefront se vuelven los widgets semilla; una factory pura `documentoInicial(branding)` emite el equivalente de la plantilla actual desde las columnas de `Tenant`, que se **mantienen** como seed/fallback durante la transición.
- Snapshots append-only (`StorefrontPageVersion` al publicar) para historial/rollback quedan como fase pro (el editor es un LLM que se equivoca).
- Los invariantes de contenido del documento (referencias, no copias; sin HTML libre) se fijan en ADR-0017 y ADR-0018.
