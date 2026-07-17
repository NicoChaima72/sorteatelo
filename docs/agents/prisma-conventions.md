# Prisma conventions

Convenciones de evolución del schema (`prisma/schema.prisma`). PostgreSQL con FKs nativas — cascade y constraints ejecutan en DB.

**Estado**: seed mínimo. Crece con cada cambio de schema aprobado.

## Workflow de cambios

- **Sin migraciones versionadas.** El schema se aplica con **`npm run db:push`** (`prisma db push` — sincroniza la DB con `schema.prisma`); introspección con **`npm run db:pull`** (`prisma db pull`). No hay carpeta `prisma/migrations/` ni tabla `_prisma_migrations`. Razón: bajo volumen, un solo entorno operativo, mono-dev — el ceremonial de migraciones no aporta y el proyecto se mantiene simple (ver `CLAUDE.md` § Principio rector).
- Antes de cualquier cambio de schema: invocar `schema-guardian` (propone, no aplica).
- Clasificar cada `db push` como **aditivo** (seguro) o **destructivo** (drop de columna, narrowing de tipo, required sin default) — los destructivos implican posible **pérdida de datos** (`prisma db push` pedirá `--accept-data-loss`) y requieren OK explícito del usuario.
- **Ojo con el swap/ampliación de un `@@unique`** (o cualquier cambio de índice único): Prisma lo trata como DROP+CREATE de índice y SIEMPRE exige `--accept-data-loss`, AUNQUE sea aditivo y no haya pérdida real (no puede saber a priori si hay duplicados). Antes de aplicar: (1) verificar en la DB que no existan filas que colisionen con el nuevo constraint (`groupBy` por las columnas del unique, contar grupos con >1); (2) con 0 duplicados confirmados + OK del usuario, correr `npm run db:push -- --accept-data-loss` una sola vez. Precedente: ADR-0012 amplió `@@unique([raffleId,orderId])` → `[…,ordinal]` (2026-07-17). Al migrar a migraciones versionadas (F10), este swap va en una migración propia.

## Convenciones obligatorias

- Modelos en **PascalCase singular** (`Account`, `Movement`, `Category`).
- Campos estándar:
  - `id String @id @default(cuid())` (o `Int @id @default(autoincrement())` si hay razón).
  - `createdAt DateTime @default(now())`.
  - `updatedAt DateTime @updatedAt` (no combinar con `@default(now())` — redundante).
- **`@@index([fkId])` en TODOS los FKs queriables** — Postgres no auto-indexa FKs (sí PKs).
- **`onDelete` explícito en cada relación**: `Cascade`, `SetNull` (FK opcional) o `Restrict`. El implícito `NoAction` es un smell.
  - Criterio (sembrado en el schema inicial F01): `Restrict` hacia **padres auditables/append-only** (`Order`, `Product`, `Payment`) y hacia **`Tenant`** desde todo el dominio comercial (una Tienda se SUSPENDE, no se borra — S9/ADR-0005; borrar un tenant con datos comerciales sería destruir registros de plata). `Cascade` **solo** para **composición intrínseca del agregado** (`OrderItem → Order`: un ítem-snapshot sin vida propia fuera de su orden; `FlowCredential → Tenant`: la credencial no tiene vida fuera de su Tienda). `SetNull` para FKs opcionales.
- Relaciones con back-relation en ambos modelos.
- Enums: convención `ModelNameStatus` / `ModelNameType`, valores en SCREAMING_CASE.
- JSON: tipo `Json` nativo de Postgres.

## Dominio con dinero (precios, IVA, comisiones) — reglas de oro

- **Dinero: `Decimal @db.Decimal(15, 2)`** (o precisión acordada). **NUNCA `Float`**. Los errores de redondeo en finanzas no son aceptables.
- Modelos que registran plata (pagos, órdenes) son **append-only** por diseño: preferir reversión (registro espejo) sobre delete/update destructivo. Discutir excepciones en el grill.
- Todo modelo de datos del usuario tiene FK a `User` con `onDelete: Cascade` y `@@index([userId])`.

## Frontera NextAuth

Los modelos `User`, `Account` (OAuth), `Session`, `VerificationToken` son del adapter de NextAuth — **no proponer renames**. Agregar campos a `User` está OK, pero exponer al session requiere actualizar el callback `session` en `src/server/auth.ts` y la module augmentation de `next-auth`.

⚠️ Ojo con la colisión de vocabulario: `Account` (NextAuth, cuenta OAuth) vs el concepto bancario de "cuenta". Si el dominio necesita un modelo de cuenta bancaria, nombrarlo distinto (eg. `BankAccount`) y registrar el término en `CONTEXT.md`.

## Pivot tables (M:N)

- ¿La fila del join necesita campos extra (`addedAt`, montos, notas)? → pivot explícito con `@@id([fk1, fk2])` y `onDelete` en ambos lados.
- ¿No necesita? → relación implícita de Prisma está OK, pero flagear el tradeoff (no hay lugar para campos de auditoría después).
