---
slug: storefront-verificador-tickets
status: planning
owner: nicolas
created: 2026-07-26
related_adrs: [ADR-0004, ADR-0005, ADR-0008, ADR-0012]
# + depende de ADR-0024 (numeración correlativa, propuesto en sistema-correos-comprador F01)
related_context: [Sorteo, Participación, Ticket, Orden, Tienda, Comprador]
features: []
---

# Verificador público de tickets en el storefront

## Contexto

_(pendiente — se llena al cerrar el grill)_

Semilla: moneda de confianza estándar del nicho chileno (gonzaloko.cl / elcapataz.cl /
tiogaleas.cl / tiotito.cl — los 4 llevan «Verificar Tickets» como primer ítem del menú).
Backlog derivado de `landing-reposicionamiento` (la landing promete que el Comprador
«ve su número» y ninguna superficie web lo muestra). Complemento web del plan activo
`sistema-correos-comprador` (C1 lo muestra por correo; este plan lo muestra en la tienda).

**Dependencia dura detectada**: la numeración pública de tickets es F01 de
`sistema-correos-comprador` (ADR-0024 propuesto: `RaffleEntry.numero` correlativo per-Raffle,
D8: presentación en rango, correlativo desde 1, sin prefijo). Sin ese F01 landeado, este
verificador no tiene qué mostrar — hoy `ordinal` es discriminador interno 0..K-1 por orden.

Decisión ya conversada con el usuario (pre-grill, registrar en Decisiones al cerrar): el slot
del header del storefront donde hoy vive `AccesoSesion` («Iniciar sesión») pasa a ocuparlo
«Verificar tickets»; los Organizadores entran al panel por el apex. Queda por grillar qué pasa
con los estados de sesión dueña/no-dueña de `AccesoSesion` (3 estados hoy).

## Bitácora

- [2026-07-26 01:30] [planner-grill] **Q1 (panorama batch con defaults): a) alcance = solo verificador + slot header (resultados históricos / premios múltiples / packs → fuera; countdown YA existe como CountdownChip); b) dependencia declarada sobre ADR-0024 (F01 correos) sin duplicarlo; c) clave de búsqueda = correo exacto; d) privacidad: mostrar números directo (como la competencia) + rate limit, LEAK señalado (cualquiera que tipee un correo ve que compró) vs alternativa enviar-por-correo; e) ruta fija `/verificar` per-subdominio, pinned en chrome, NO página del builder; f) AccesoSesion pierde solo el estado anónimo (dueña/panel se conservan); g) sorteo CERRADO ⇒ tus números + número ganador + «ganaste» si coincide, sin email de terceros.** AWAITING ANSWER.
- [2026-07-26 01:29] [planner-grill] Arranque. Read pass completo: INDEX (colisión/dependencia con `sistema-correos-comprador` F01/ADR-0024 detectada — su Out of scope cede el buscador a ESTE plan), schema (RaffleEntry sin `numero` público aún; Order.email + @@index([tenantId,email]) ya existe — la búsqueda por correo tenant-scoped está indexada), `plantillaDescarga.ts` (el comprador hoy NO recibe ningún identificador salvo su propio correo — sin código de orden ni números), `acceso-sesion.tsx` + `storefront-layout.tsx:239-244` (slot pinned junto al carrito; chrome editable tanda-3 con pinned I-U2; nav derivado del documento con fallback hardcodeado), `src/server/storefront/` (helpers SSR per-tenant; `bases.tsx` es el precedente de página fija de plataforma en el subdominio). Q1 = panorama batch con defaults (memoria «panorama antes que detalle»).
