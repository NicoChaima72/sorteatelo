---
slug: storefront-focos-ambiente-animados
status: implementing
owner: nicolas
created: 2026-07-26
related_adrs: [ADR-0016]
related_context: [Tienda, TemaPagina, Organizador]

features:
  - id: F01
    behavior: "El shell del storefront puede animar sus luces de ambiente por CSS puro (TemaPagina.ambienteAnimado, default false = byte-idéntico)"
    state: active

  - id: F02
    behavior: "El hero imagen_fondo puede pintar focos de luz (estáticos o animados) SOBRE la imagen, entre overlay y texto (props luces + lucesAnimadas)"
    state: active

  - id: F03
    behavior: "El Organizador controla ambas superficies desde el editor (Switch en TemaPagina condicionado a ambiente ≠ ninguno; Select luces + Switch lucesAnimadas en el hero imagen_fondo)"
    state: not_started

  - id: F04
    behavior: "Activación curada publicada: iselk con luces animadas en el hero imagen_fondo y demo-noche con ambiente neon animado en el shell; el resto de las tiendas byte-idéntico"
    state: not_started
---

# Focos de ambiente ANIMADOS por CSS en el storefront

## Contexto

El storefront ya tiene «ambiente» de luces per-tenant (`TemaPagina.ambiente`: `ninguno|focos_marca|focos_acento|aurora|neon`), implementado como radial-gradients ESTÁTICOS derivados de la escala del tenant, apilados en el `background` inline del shell (`fondoShellConAmbiente` en `src/styles/estiloSeccion.ts` → `estiloShell` en `storefront-layout.tsx`). El caso que motiva esta feature es **iselk**: su hero `imagen_fondo` es una imagen full-bleed OPACA con overlay tinta, que tapa por completo cualquier ambiente del shell — hoy no hay forma de darle vida lumínica a esa tienda.

Esta feature agrega **movimiento por CSS puro** (sin JS) en dos superficies: (a) una variante animada del ambiente del shell existente, y (b) una capa de focos —estáticos o animados— del hero `imagen_fondo`, pintada entre el overlay y el texto, reutilizando el mismo vocabulario y los mismos keyframes. Todo opt-in con default no-op, y con activación curada en las dos tiendas donde más se nota (iselk y demo-noche). El video de fondo es una fase 2 aparte que NO se planifica aquí (`.scratch/storefront-fondos-en-movimiento/issues/01-video-de-fondo-en-secciones.md`).

Notas de reconocimiento (planner, 2026-07-26):
- `ambiente` (TemaPagina): enum `ninguno|focos_marca|focos_acento|aurora|neon` → `AMBIENTE_CAPAS` + `fondoShellConAmbiente` en `src/styles/estiloSeccion.ts` (líneas ~570-620). Radial-gradients estáticos de tokens del tenant apilados sobre el color sólido del `fondoPagina`, aplicados como `background` INLINE en el shell (`storefront-layout.tsx` `style={estiloShell}`). Solo home + `[slug]` lo reciben; las páginas de plataforma fuerzan `ambiente:"ninguno"` (D6/I8 en `estiloHeredadoDeTema`).
- Restricción técnica clave: hoy el ambiente es un `background` shorthand inline — animar por keyframes requiere o (a) animar `background-position` con `background-size` sobredimensionado, o (b) mover las capas a pseudo-elementos/divs con clases de un CSS module. Los inline styles NO pueden llevar `@keyframes`.
- Hero `imagen_fondo` (`storefront-hero.tsx` ~línea 109 y 696): imagen full-bleed OPACA + overlay tinta (`overlayOscuridad` 0-90) + texto encima. Tapa cualquier ambiente del shell — el caso iselk (que motiva la feature) NO se resuelve solo animando el shell.
- Fase 2 futura (video de fondo, NO planificar): `.scratch/storefront-fondos-en-movimiento/issues/01-video-de-fondo-en-secciones.md`.

## Decisiones

- D1: **Ambas superficies, compartiendo keyframes y vocabulario** — variante animada del ambiente del shell + capa de luces del hero `imagen_fondo` (entre overlay y texto). Razón: el caso motivador (iselk) solo se resuelve en el hero, pero la capacidad del shell es la generalización natural y el costo marginal de compartir el motor es bajo. (Q1)
- D2: **Shape del dato sin duplicar el enum `ambiente`**: `TemaPagina.ambienteAnimado: boolean` (default `false`, no-op) para el shell; en el hero `imagen_fondo`, prop `luces` con el MISMO vocabulario del enum `ambiente` (default `ninguno`) + `lucesAnimadas: boolean` (default `false`). El ESTILO de movimiento se DERIVA del tipo de ambiente (focos → drift lento, neon → pulso, aurora → drift), sin knobs de velocidad/intensidad. Razón: un solo vocabulario, cero combinatoria nueva, defaults no-op por construcción. (Q2)
- D3: **Mecánica de render**: con el flag apagado, CERO cambio — mismo `background` inline byte-idéntico, sin markup nuevo. Con el flag prendido, capa dedicada `div aria-hidden` absoluta detrás del contenido, con clases de un CSS module (los `@keyframes` viven en el module; los colores del tenant entran por custom properties `--amb-*` seteadas inline), animando SOLO `transform`/`opacity` (GPU), ciclos lentos de 25-45 s desincronizados entre capas. `prefers-reduced-motion` apaga la animación y deja la capa estática idéntica al ambiente actual. Sin una línea de JS. Razón: los inline styles no pueden llevar keyframes; transform/opacity no fuerzan repaint; reduced-motion es accesibilidad no negociable. (Q3)
- D4: **Rollout = capacidad + activación curada**: activar y publicar en iselk (hero `imagen_fondo` con luces animadas — el caso motivador) y en demo-noche (shell `neon` animado — el peor tenant oscuro, per la regla de verificar en el peor tenant); el resto de las tiendas queda byte-idéntico y se verifica. Razón: una capacidad sin ningún tenant usándola no se puede validar visualmente. (Q4)
- D5: **Self-service desde el editor**: Switch «Luces en movimiento» en el inspector de TemaPagina (visible solo si `ambiente ≠ ninguno`) + en el hero `imagen_fondo` un Select `luces` (mismo vocabulario del ambiente) y Switch `lucesAnimadas` (visible solo si `luces ≠ ninguno`). Razón: sin controles la activación quedaría presa del MCP/seed y la feature no sería self-service. (Q5)
- D6: **Tests Vitest = la lista de 7 comportamientos aprobada tal cual** (ver Validaciones); el inspector y la verificación visual quedan para el E2E de navegador, fuera de Vitest. (Q6)

## Plan

1. Motor compartido: CSS module nuevo (keyframes drift/pulso + clases de capa) + helper puro en `estiloSeccion.ts` (o módulo hermano) que, dado el tipo de ambiente y la escala del tenant, devuelve las custom properties `--amb-*` y las clases de capas; derivación del estilo de movimiento por tipo (focos→drift, neon→pulso, aurora→drift). (F01, F02)
2. Shell: `TemaPagina.ambienteAnimado` en el schema Zod del pagebuilder (default `false`, herencia null-si-default intacta, migrate lossless); `storefront-layout.tsx` renderiza la capa animada `aria-hidden` solo cuando `ambienteAnimado && ambiente ≠ ninguno`; con flag apagado el `estiloShell` inline queda byte-idéntico. Las páginas de plataforma siguen forzando `ambiente: "ninguno"` (no reciben nada). (F01)
3. Hero `imagen_fondo`: props `luces` (enum del vocabulario de ambiente, default `ninguno`) + `lucesAnimadas` (default `false`) en el schema del widget (aditivas con default ⇒ sin v-bump); render de la capa de focos entre overlay y texto en `storefront-hero.tsx`, estática o animada según el flag, reusando el motor del paso 1. (F02)
4. Editor: Switch «Luces en movimiento» en el inspector de TemaPagina condicionado a `ambiente ≠ ninguno`; Select `luces` + Switch `lucesAnimadas` en las props del hero `imagen_fondo` (Switch condicionado a `luces ≠ ninguno`). (F03)
5. Activación curada: actualizar los seeds/docs de iselk (hero `imagen_fondo` con `luces` + `lucesAnimadas: true`) y demo-noche (`ambienteAnimado: true` sobre su ambiente `neon`), publicar ambas; verificar que las demás tiendas siguen byte-idénticas. **Ojo con el gotcha de prod (DB compartida)**: si esto se deploya, deploy del código primero, publicar los docs con props nuevas después. (F04)
6. Cierre: proponer el drift de `frontend-conventions.md` (patrón «capa de ambiente animada»: CSS module + custom properties del tenant + reduced-motion) como DRAFT para permiso del usuario — no aplicarlo directo.

## Validaciones

### F01 — Shell animado opt-in

**Vitest** (integration):
- [ ] Con `ambienteAnimado` ausente/false, la salida del tema y el estilo del shell son byte-idénticos a los actuales (no-op por construcción) — schema no-op (1/2) — `src/__tests__/styles/lucesAmbiente.test.ts::luces.schema.001` (default `false`) + `::luces.schema.002` (fondo del shell idéntico para TODO el cartesiano esquemas × ambientes)
- [ ] El helper de capa animada deriva el estilo de movimiento correcto por tipo de ambiente (focos→drift, neon→pulso, aurora→drift) — helper (1/3) — `src/__tests__/styles/lucesAmbiente.test.ts::luces.helper.001`
- [ ] El helper emite las custom properties `--amb-*` desde la escala del tenant, sin un solo hex hardcodeado — helper (2/3) — `src/__tests__/styles/lucesAmbiente.test.ts::luces.helper.003`
- [ ] Con `ambiente: "ninguno"`, `ambienteAnimado: true` no produce capa alguna — helper (3/3) — `src/__tests__/styles/lucesAmbiente.test.ts::luces.helper.004`
- [ ] La herencia null-si-default de TemaPagina trata `ambienteAnimado: false` como default (no serializa ruido) — herencia (1/1) — `src/__tests__/server/storefront/temaPagina.test.ts::storefront.tema.resolver.004b` (mutation-testeado: injertar el campo en `soloLoHeredable` lo pone rojo)
- [ ] `migrate` de documentos existentes es lossless: docs publicados sin el campo nuevo pasan intactos — migrate (1/1) — `src/__tests__/styles/lucesAmbiente.test.ts::luces.migrate.001`
- [ ] (cobertura extra, NO planeada — **revisable por el usuario**) Con el flag prendido el shell SUELTA sus gradientes en vez de sumarlos, así la luz no se pinta dos veces — `src/__tests__/styles/lucesAmbiente.test.ts::luces.schema.003`

**E2E** (browser):
- [ ] demo-noche muestra el pulso neon en el shell; con emulación de `prefers-reduced-motion` la capa queda estática e idéntica al ambiente actual

### F02 — Focos del hero imagen_fondo

**Vitest** (integration):
- [ ] Props `luces`/`lucesAnimadas` ausentes ⇒ el hero `imagen_fondo` rinde exactamente igual que hoy (schema no-op 2/2, aditivo sin v-bump) — `src/__tests__/styles/lucesAmbiente.test.ts::luces.hero.001`
- [ ] (cobertura extra, NO planeada — **revisable por el usuario**) `luces` acepta EXACTAMENTE el enum del `ambiente` del tema (D2: un solo vocabulario, no una copia) y rechaza lo inventado — `src/__tests__/styles/lucesAmbiente.test.ts::luces.hero.002`

**E2E** (browser):
- [ ] iselk muestra los focos animados sobre la imagen del hero, entre overlay y texto (el texto sigue legible y clickeable); reduced-motion los deja estáticos

### F03 — Controles del editor

**Vitest**:
- [ ] (no aplica — la lógica condicional del inspector se verifica en navegador; los schemas ya quedan cubiertos por F01/F02)

**E2E** (browser):
- [ ] En el inspector de TemaPagina, el Switch «Luces en movimiento» solo aparece con `ambiente ≠ ninguno`; togglearlo se refleja en el preview y sobrevive guardar/publicar
- [ ] En las props del hero `imagen_fondo`, el Select `luces` y el Switch `lucesAnimadas` (condicionado) funcionan end-to-end desde el editor

### F04 — Activación curada

**Vitest**:
- [ ] (no aplica — es data/publicación, no lógica nueva)

**E2E** (browser):
- [ ] iselk y demo-noche publicadas con sus luces; las demás tiendas (autora, prueba, bcac, demo-dreamy, demo-editorial) responden byte-idéntico (verificable por curl del HTML del shell)

## Invariantes

- I1: **Flag apagado = no-op por construcción**: sin `ambienteAnimado`/`lucesAnimadas` la salida (HTML + estilos inline) es byte-idéntica a la actual; cero markup nuevo.
- I2: **Cero hex inline**: todos los colores salen de la escala del tenant vía custom properties; los keyframes y clases viven en un CSS module.
- I3: **Solo `transform`/`opacity` se animan** (GPU); nada de animar `background-position`, tamaños ni propiedades de layout.
- I4: **`prefers-reduced-motion` apaga la animación** dejando la capa estática visualmente idéntica al ambiente actual — nunca desaparece contenido ni luz.
- I5: **Sin JS**: la animación es 100 % CSS; no se agrega ningún hook, listener ni `requestAnimationFrame`.
- I6: **La capa es `aria-hidden` y no intercepta interacción** (`pointer-events: none`), siempre detrás del contenido (en el hero: entre overlay y texto).
- I7: **Las páginas de plataforma siguen sin ambiente** (`estiloHeredadoDeTema` fuerza `ninguno` — D6/I8 previos intactos).
- I8: **Props aditivas con default ⇒ sin version bump de widget**; y si hay deploy a prod: código primero, docs publicados con props nuevas después (DB compartida degrada prod al revés).

## Out of scope

- Video de fondo (fase 2, issue en `.scratch/storefront-fondos-en-movimiento/`).
- Knobs de velocidad/intensidad/dirección del movimiento — el estilo se deriva del tipo de ambiente y punto.
- Animar el ambiente en otras secciones/widgets (stage-lights de secciones, etc.) o en las páginas de plataforma.
- Cambios de Prisma schema — TemaPagina y las props del hero viven en el jsonb del pagebuilder.
- Tocar el enum `ambiente` existente o sus gradients estáticos.

## Especialistas a consultar

- `frontend-reviewer` — CSS module + capa animada + controles Mantine del inspector; que el patrón respete cero-hex y reduced-motion.
- `backend-reviewer` — cambios en los schemas Zod del pagebuilder (TemaPagina + widget hero) y el migrate lossless.
- `feature-tester` — E2E de navegador: inspector, verificación visual en iselk/demo-noche (incl. emulación reduced-motion) y byte-idéntico del resto vía curl.

## Bitácora

- [2026-07-26 23:30] [planner-grill] Arranco grill. Read pass: INDEX, template, estiloSeccion.ts (AMBIENTE_CAPAS/fondoShellConAmbiente/estiloHeredadoDeTema), grep de estiloShell + imagen_fondo. Hallazgo técnico: ambiente hoy = background inline ⇒ animarlo exige refactor a clases CSS module o animación de background-position; hero imagen_fondo es opaco y tapa el shell.
- [2026-07-26 23:30] [planner-grill] Q1: ¿dónde viven las luces animadas — solo shell, solo hero imagen_fondo, o ambas superficies? Recomendada: AMBAS — (a) variante animada del ambiente del shell existente, (b) opción del hero imagen_fondo que pinta focos animados SOBRE la imagen (entre overlay y texto), porque el caso iselk solo se resuelve con (b).
- [2026-07-26 23:45] [planner-grill] Q1 answered: opción (c) recomendada — AMBAS superficies, compartiendo keyframes y vocabulario.
- [2026-07-26 23:45] [planner-grill] Q2: shape del dato/opt-in. Recomendada: NO duplicar el enum `ambiente`; 1 campo nuevo por superficie — `TemaPagina.ambienteAnimado: boolean` (default false, no-op) y prop del hero imagen_fondo `luces` (mismo vocabulario del enum ambiente) + `lucesAnimadas: boolean`; el ESTILO de movimiento se deriva del tipo de ambiente (focos→drift, neon→pulso, aurora→drift), sin knobs extra.
- [2026-07-27 00:00] [planner-grill] Q2 answered: opción (b) la recomendada — `TemaPagina.ambienteAnimado` boolean default false; hero imagen_fondo con `luces` (vocabulario del enum ambiente) + `lucesAnimadas` boolean; movimiento derivado del tipo, sin knobs.
- [2026-07-27 00:00] [planner-grill] Q3: mecánica de render de la capa animada. Recomendada: animado=false ⇒ CERO cambio (mismo background inline byte-idéntico, sin markup nuevo); animado=true ⇒ capa `aria-hidden` absoluta detrás del contenido con clases de CSS module (keyframes en el module, colores del tenant por custom properties `--amb-*` inline), animando `transform`/`opacity` (GPU), ciclos lentos 25-45s desincronizados; `prefers-reduced-motion` apaga la animación y deja la capa estática idéntica al ambiente actual. Sin JS.
- [2026-07-27 00:10] [planner-grill] Q3 answered: opción (b) la recomendada — capa dedicada `div aria-hidden` con CSS module, transform+opacity en GPU, custom properties del tenant, reduced-motion estático, no-op por construcción con flag apagado.
- [2026-07-27 00:10] [planner-grill] Q4: rollout — ¿la feature incluye ACTIVAR y publicar las luces en tiendas reales (iselk hero + demo-noche shell) o solo entrega la capacidad? Recomendada: sí, activar en iselk (caso motivador, hero imagen_fondo) + demo-noche (peor tenant oscuro), resto de tiendas byte-idéntico.
- [2026-07-27 00:20] [planner-grill] Q4 answered: opción (b) la recomendada — capacidad + activación curada (iselk hero imagen_fondo, demo-noche shell neon pulso; resto byte-idéntico verificado).
- [2026-07-27 00:20] [planner-grill] Q5: superficie de EDICIÓN — ¿controles en el editor/inspector para el Organizador, o data-only (seed/MCP) por ahora? Recomendada: SÍ exponer ambos controles — Switch «Luces en movimiento» en el inspector de TemaPagina (visible solo si ambiente ≠ ninguno) + en el hero imagen_fondo un Select `luces` (mismo vocabulario del ambiente) y Switch `lucesAnimadas`; sin controles, la activación quedaría presa del MCP y la feature no sería self-service.
- [2026-07-27 00:30] [planner-grill] Q5 answered: opción (b) — controles completos en el editor (Switch condicionado en TemaPagina + Select/Switch en el hero imagen_fondo).
- [2026-07-27 00:30] [planner-grill] Dimensión Tests (skill tdd). Reconocimiento: `estiloSeccion.test.ts` ya tiene describes de ambiente/stage-lights/neon; `temaPagina.test.ts` cubre herencia null-si-default — el boolean nuevo puede tocar ambos. Q6: lista de tests Vitest ordenada red→green propuesta (7 comportamientos: schema no-op ×2, helper capa animada ×3, herencia TemaPagina ×1, migrate lossless ×1). Recomendada: aprobar la lista tal cual.
- [2026-07-27 00:40] [planner-grill] Q6 answered: aprobada la lista de 7 tests tal cual; el inspector queda para E2E de navegador, fuera de Vitest.
- [2026-07-27 00:40] [planner-grill] Grill CERRADO (6 rondas; dinero/auth no aplican — sin tRPC nuevo ni montos; drift de docs sigue el protocolo estándar de drafts). Plan escrito: F01 shell animado, F02 focos del hero, F03 controles del editor, F04 activación curada. AWAITING USER APPROVAL.
- [2026-07-27 00:55] [feature-implementer] Arranca implementación (visto bueno explícito del usuario). Features pendientes: F01, F02, F03, F04. Read pass: `_template.md`, `CLAUDE.md`, ADR-0016 + ADR-0020 (motion en storefront), `frontend-conventions.md` (§motion/§cero-hex), `estiloSeccion.ts` (AMBIENTE_CAPAS/fondoShellConAmbiente/estiloHeredadoDeTema), `storefront-layout.tsx`, `storefront-hero.tsx`, `seccion-wrapper.tsx`, `animar.tsx`, `globals.css`, `schema.ts` (TemaSchema), `widgets.ts` (heroProps/AMBIENTE_FONDO), `migrate.ts`, `temaPagina.ts`, `form-props.tsx` + `introspeccion.ts` + `panel-tema.tsx` + `panel-edicion.tsx` (editor), `catalogoDelEditor.ts`.
- [2026-07-27 00:55] [feature-implementer] **Reconocimiento contra la DB VIVA (read-only, `.tmp-luces.ts` descartable)** — corrige un supuesto del plan y cambia cómo se hace F04. Estado publicado hoy: `iselk v36 ambiente=ninguno fondoPagina=marca_suave modo=claro · hero=imagen_fondo +imagenUrl overlay=50` ✅ (el plan acertó: el caso motivador ES un `imagen_fondo`); `demo-noche v9 ambiente=neon fondoPagina=tinta_profunda modo=oscuro` ✅; el resto (`autora` v29, `bcac` v12 focos_marca, `demo-dreamy` v11, `demo-editorial` v9, `prueba` v16) sin ambiente animable. **PERO `scripts/seed-iselk.ts` está STALE respecto del documento vivo**: el seed declara `hero variante:"split"` con `visual:{tipo:"imagen",holo:true}` y `ambiente:"ninguno"`, o sea re-correrlo REGRESARÍA el hero de iselk de `imagen_fondo` a `split`. ⇒ F04 NO puede pasar por re-correr el seed de iselk: irá por mutación DIRIGIDA (`update_section_props` es merge shallow) sobre el borrador vivo con los use cases del editor, y el seed de iselk queda sin tocar (además está `M` en git por otro carril).
- [2026-07-27 01:40] [feature-implementer] **F01 IMPLEMENTADA** (TDD, 4 slices verticales red→green). Archivos: `src/styles/estiloSeccion.ts` (AMBIENTE_CAPAS → `readonly string[]`; `fondoShellConAmbiente` gana un 3er parámetro `animado` con DEFAULT false; `capaDeLuces` + `MovimientoAmbiente` + `CapaDeLuces` + `lucesDelShell`), `src/lib/pagebuilder/schema.ts` (`TemaSchema.ambienteAnimado` boolean default false), `src/components/storefront/luces-ambiente.module.css` (NUEVO: capa/luz/drift/pulso + 6 keyframes), `src/components/storefront/luces-ambiente.tsx` (NUEVO), `src/components/storefront/storefront-layout.tsx` (prop `capaLuces`), `src/pages/index.tsx` + `src/pages/[slug].tsx` (cablean `lucesDelShell`). Tests: `src/__tests__/styles/lucesAmbiente.test.ts` (NUEVO, 8) + 1 en `temaPagina.test.ts` + actualización del canario `estiloTema.test.ts::tema.001` (asserta la forma COMPLETA del tema default — hacía exactamente su trabajo).
- [2026-07-27 01:40] [feature-implementer] **Hallazgo del TDD que cambió el diseño (no estaba en el plan): la luz se pintaba DOS VECES.** El plan decía «capa animada» y el shell ya trae su ambiente como `background` estático — si la capa se monta encima con los MISMOS gradientes, la tienda sale al doble de intensidad. Corregido con `fondoShellConAmbiente(..., animado)`: con el flag prendido el shell se queda con el color sólido y los radiales se MUDAN a la capa. Efecto lateral bueno: con `prefers-reduced-motion` la capa queda quieta con esos mismos gradientes ⇒ el resultado es exactamente el ambiente de hoy, que es lo que I4 pide. Cubierto por `luces.schema.003` (test EXTRA sobre los 7 del plan, marcado revisable en Validaciones).
- [2026-07-27 01:40] [feature-implementer] Auto-chequeo contra `docs/design.md` antes del `frontend-reviewer`: cero hex (el CSS module no tiene UN literal de color — todo entra por `--amb-N` desde tokens Mantine) ✓; solo `transform`/`opacity` animados, CLS=0 §7 ✓; `prefers-reduced-motion` gatea TODA animación ✓; identidad «preciso y calmado» §7 (ciclos 26–41 s, opacity ≥0,70, scale ≤1,11 — sin parallax ni zoom dramático, el anti-patrón declarado) ✓; ADR-0020 intacto (cero `motion`: esto es CSS puro, así que el test estático de «`motion` solo desde `animar.tsx`» sigue valiendo) ✓; SSR-visible ✓ (la capa sale pintada del server, nunca `opacity:0` esperando JS). **1 tensión REAL con la doc, que va al drift de F04**: `design.md` §7 dice que las microinteracciones CSS del storefront viven en `globals.css`, y el plan (D3/I2) manda CSS module. Gana el plan; queda como draft de drift, no aplicado.
- [2026-07-27 02:30] [feature-implementer] **F02 IMPLEMENTADA** (TDD red→green). Archivos: `src/lib/pagebuilder/widgets.ts` (`heroProps.luces` enum `AMBIENTE_FONDO` default `ninguno` + `lucesAnimadas` boolean default false — aditivas ⇒ SIN v-bump, el hero sigue en v3), `src/components/storefront/seccion-wrapper.tsx` (slot nuevo `capaFondo` + `isolation:isolate` condicional), `src/components/storefront/storefront-hero.tsx` (`HeroImagenFondo` monta `<LucesAmbiente>` por el slot). Tests: `luces.hero.001` + `luces.hero.002`. Decisión táctica: la capa se compone en el **`SeccionWrapper`, no dentro del hero** — el único elemento posicionado de la sección es su `<section>`, así que una capa montada más adentro (dentro del `Container`, o dentro del `<Animar>` cuando arma su `transform`) se mediría contra un bloque contenedor más chico y el glow quedaría recortado en el padding vertical. Poner el slot en el wrapper hace que «entre el overlay y el texto» sea una propiedad del wrapper y no puntería del widget.
- [2026-07-27 02:30] [feature-implementer] **I1 verificado EN VIVO, no solo por tests**: `curl` al dev server (:3001, el del usuario — no se levantó ninguno nuevo) sobre `iselk`, `demo-noche`, `autora` y `prueba` ⇒ los 4 responden 200 y su HTML SSR tiene **0 ocurrencias de `isolation` y 0 de `--amb-1`**. O sea que con los flags apagados no se emite ni la capa ni la propiedad de apilamiento. **Limitación conocida (anotada, sin acción)**: si alguien pone `estilo.anchoFondo:"contenido"` en un hero `imagen_fondo` con luces, el fondo deja de pintarse en el `<section>` y pasa a un box interior ⇒ la capa queda detrás de ese box y las luces no se ven. Degrada a «sin luces», no rompe nada; el default (`completo`) es el que usan las 7 tiendas.
- [2026-07-27 03:00] [feature-implementer] **F02 reviewers: `frontend-reviewer` APPROVE + `backend-reviewer` APPROVE, 0 blockers.** (El 1er intento del frontend-reviewer murió por un error de API justo antes del veredicto y `SendMessage` no está en mi toolset ⇒ se re-invocó uno fresco con prompt acotado; el veredicto que vale es el del 2º.) El frontend confirmó a mano el orden de pintado (imagen+overlay < luces < texto) y que el `DivisorInferior` sigue arriba del contenido como hasta hoy. **1 hallazgo REAL del backend-reviewer, corregido**: un comentario que yo había escrito citaba MAL su propio precedente — decía que no bumpear `v` seguía «el mismo criterio de `variante`/`overlayOscuridad`», y esos dos SÍ bumpearon (v1→v2). El precedente correcto es `visual` (Tanda 2), que entró aditiva en la misma v2 sin bump. Comentario reescrito con la regla que de verdad separa los casos: se bumpea cuando `migrate.ts` tiene que TRANSFORMAR la forma (el `string → RichTexto` de v3), no cuando alcanza el `.default()` de Zod. 3 nits aplicados/anotados: comentario del `comoHoja` (la capa no aplica ahí), comentario de la degradación con `anchoFondo:"contenido"`, y **para el drift de F04**: `backend-conventions.md` debería fijar por escrito ese criterio de v-bump, que hoy vive solo en comentarios sueltos y contradictorios.
- [2026-07-27 02:05] [feature-implementer] **F01 reviewers: `frontend-reviewer` APPROVE + `backend-reviewer` APPROVE, 0 blockers.** Confirmaron a mano I1 (byte-idéntico), la composición `isolation:isolate` + `z-index:-1` (no rompe el header sticky `zIndex:100` —queda en el MISMO contexto de apilamiento— ni el `CarritoDrawer`, que Mantine portalea a `body`, ni la rama de columna estrecha), I2/I3/I4/I5/I6, y que `migrate.ts` correctamente NO había que tocarlo (`.strict()` de Zod rechaza claves EXTRA, no claves declaradas ausentes ⇒ el `.default()` alcanza). 3 nits atendidos y 2 anotados: (a) **aplicado** — composición de clases con `cn()` de `~/lib/utils` (precedente `landing/sello.tsx`) en vez de `join(" ")`; (b) **aplicado** — `amb-drift-b` al 50% pasa de `scale(1.04)` a `scale(1.07)`: era la única de las 6 curvas con el colchón anti-franja-transparente en ~0,5% (pocos px en un viewport angosto), ahora ~1,8%; (c) **anotado para el `feature-tester`** — el E2E de demo-noche tiene que mirar los EXTREMOS del ciclo, no un screenshot a mitad de camino, que es donde asomaría un hairline; (d) **anotado para el drift de F04** — el drift no es solo de `frontend-conventions.md`: `design.md` §7 dice literalmente que las microinteracciones CSS del storefront van en `globals.css` y su §9 lista las excepciones de forma CERRADA sin incluir al storefront ⇒ el draft tiene que tocar los DOS documentos; (e) **riesgo anotado, sin acción** — que `set_page_theme` REEMPLACE `root.props` entero es seguro HOY solo porque `PanelTema` se inicializa con el `Tema` completo ya parseado (round-trip fiel de `ambiente`/`ambienteAnimado`/`escalaTitulos`, ninguno con control propio); si alguien reescribe el panel para mandar «solo lo que edita», esos 3 campos se apagarían en silencio. No lo introdujo F01 y F03 lo respeta, pero no hay test que lo fije.
- [2026-07-27 00:55] [feature-implementer] Decisiones tácticas de arquitectura, todas dentro de D3/I1/I2/I3/I6 (se registran acá para el reviewer): (a) **`AMBIENTE_CAPAS` pasa de string joineado a `readonly string[]`** y `fondoShellConAmbiente` hace el `.join(", ")` — la salida del shell estático queda BYTE-idéntica (I1) y el motor animado gana acceso a cada capa por separado (que es lo que exige animarlas desincronizadas). (b) **La capa se compone con `isolation:"isolate"` en el contenedor + `z-index:-1` en la capa**, y NO con abspos por encima: un abspos normal pinta ARRIBA del contenido en flujo (regla de pintado CSS) y taparía el texto; el par isolate/−1 la deja exactamente entre el fondo del contenedor y su contenido — que es literalmente «entre overlay y texto» (I6). Ambas propiedades se aplican SOLO cuando la capa existe ⇒ con flags apagados no hay ni `isolation` ni markup (I1). (c) **Las capas se pintan en orden inverso** al del `background` shorthand: en `background: g1, g2, g3` la PRIMERA va arriba, en divs apilados la ÚLTIMA — invertir es lo que hace que la capa con reduced-motion sea idéntica al ambiente estático de hoy (I4).

- **2026-07-27 (sesión principal, cierre por decisión del usuario)**: F01–F04 implementadas y DEPLOYADAS
  (commits 7153f59 + 7829e92 fix del wrapper + a504154 + 823c373). Iteración de diseño EN VIVO con el
  usuario cambió el producto final: el glow que respira le pareció "todo feo" — lo que esperaba eran
  ELEMENTOS moviéndose. Se sumó `particulas: "corazones"` al hero `imagen_fondo` (set curado de 8
  corazones flotantes, aprobado sobre maqueta `tmp/test-corazones.html` ANTES de tocar el motor) y el
  glow quedó relegado a ambiente (intensidad 1.5× vía multiplicador nuevo de `capaDeLuces`; ciclos
  finales drift 14-18s / pulso 12-20s). Activado y publicado en iselk (rev 27, con fondo sin corazones
  estáticos — camuflaban a los animados); demo-noche con `ambienteAnimado` (rev 9). Diagnóstico del "no
  veo que se muevan" que consumió la mitad de la tanda: (1) dev server sirviendo CSS stale tras los
  `next build` de la sesión, (2) glows a 14-22% imperceptibles sobre imagen oscura, (3) glows estáticos
  pintados en el póster camuflando los animados. El usuario dio el visto bueno final en prod.
  **Pendiente del feature-tester**: Vitest de las Validaciones + E2E reduced-motion + byte-idéntico del
  resto de tiendas; los 7 tests del plan NO se corrieron (decisión del usuario: ship directo).
