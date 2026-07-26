# Headers de tabla del panel: `text-right` de Tailwind no tiene efecto sobre `Table.Th` de Mantine

Status: needs-triage

## Contexto

Finding del `feature-tester` durante el E2E de F01 de `sistema-correos-comprador`
(2026-07-26, Bitácora 11:35 de `tasks/26-07-26-correo-sistema-correos-comprador.md`).
**NO introducido por F01** — es pre-existente en el chrome del panel. Registrado acá por
instrucción del usuario (mejora del chrome del panel, fuera de aquel plan).

## Problema

En la tabla de Participantes del panel de Sorteo (`src/pages/admin/sorteo.tsx`), el
`className="text-right"` puesto en los `Table.Th` **no computa**: `getComputedStyle` da
`text-align: left` en los 4 headers, mientras los `Table.Td` sí computan `right`. Gana la regla
de Mantine `.mantine-Table-th` (clase generada `m_4e7aa4f3`) sobre la utility de Tailwind.

Resultado: **header y valor desalineados en toda columna numérica** (`Tickets`,
`Última participación`). Verificado por `getComputedStyle`, no por screenshot (memoria: gate de
diseño a resolución real).

## Alcance probable

El patrón `Table.Th className="text-right"` probablemente está replicado en las demás tablas del
panel (Ventas, Productos) — barrer con Grep antes de arreglar. Relacionado con la decisión
abierta anotada en `ui-migracion-mantine` (INDEX): «convención `ta` vs `text-right` en tablas».

## Fix candidato

Usar la prop de Mantine (`<Table.Th ta="right">`) en lugar de la utility de Tailwind, y asentar
la convención en `docs/agents/frontend-conventions.md` (con permiso del usuario). Tailwind está
acotado a utilities de layout por CLAUDE.md — la alineación dentro de componentes Mantine debería
ir por props de Mantine, que ganan la especificidad.

## Comments
