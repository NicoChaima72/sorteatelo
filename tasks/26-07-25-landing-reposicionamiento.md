---
slug: landing-reposicionamiento
status: planning
owner: nicolas
created: 2026-07-25
related_adrs: [ADR-0005, ADR-0006, ADR-0008, ADR-0014]
related_context: [Tienda, Organizador, Sorteo]

features:
  - id: F01
    behavior: "El copy de la landing cuenta la historia sorteo-first (hero, pasos, momento, confianza, CTA final) sin la palabra 'rifa' ni menciones de Flow, y el tagline de APP_CONFIG pasa a 'Monta tu sorteo online tú mismo, en un día.'"
    state: not_started

  - id: F02
    behavior: "La landing suma las secciones 'hazlo tú mismo' (BLANCA) y 'precio' (AMARILLA) en la secuencia de 9 bandas aprobada, sin blancas adyacentes y sin recolorear secciones existentes; design.md registra la secuencia nueva."
    state: not_started

  - id: F03
    behavior: "La FAQ tiene las 9 entradas aprobadas en su orden, con el precio real, la única mención de Flow de la página y las respuestas honestas de producto (1 sorteo activo por tienda, solo PDF hoy)."
    state: not_started

  - id: F04
    behavior: "La landing sirve JSON-LD válido (FAQPage + Organization + WebSite + SoftwareApplication/Offer $25.000 CLP), canonical, og:locale es_CL y meta keywords (única superficie visible-para-máquinas donde se permite 'rifa')."
    state: not_started

  - id: F05
    behavior: "El apex sirve robots.txt y sitemap.xml, y el og:image pasa a un PNG 1200×630 real con URL absoluta."
    state: not_started
---

# Reposicionamiento sorteo-first de la landing del apex

## Contexto

La landing oficial del apex (`src/components/landing/`) cuenta la historia al revés: se presenta como "tienda para vender PDFs + sorteos" cuando el producto es una plataforma para montar sorteos online donde lo vendido es el vehículo para participar. Además no aparece el diferenciador clave — **autoservicio total en 1 día** (la competencia de referencia vende sitios de rifas a medida desde $650.000 CLP + 1–2 semanas + cotización; Sortéatelo es suscripción mensual barata y lo montas tú mismo), y "Flow" contamina el copy público (el chileno común no sabe qué es). El diagnóstico fue validado por el usuario el 2026-07-25.

Esta iteración reescribe el copy (sorteo-first), agrega dos secciones (precio y hazlo-tú-mismo), reescribe la FAQ con el modelo comercial real recién fijado ($25.000/mes, configura gratis, cero comisión por venta), y deja el apex con SEO técnico de primer nivel (JSON-LD, robots, sitemap, canonical, OG raster). Restricción legal no negociable (ADR-0008): la mecánica descrita es siempre "compras un producto → participas en el sorteo promocional" — nunca venta directa de números de rifa. El usuario pule el copy fino después: este plan fija estructura, mensajes y borrador de copy, no el texto definitivo palabra por palabra.

## Decisiones

- **D1 — Solo "sorteo", cero "rifa" en todo el copy visible** (Q1, opción máxima seguridad). Razón: coherencia con la marca Sortéatelo y con ADR-0008; el usuario acepta perder el puente coloquial con "rifa". Ver D13 para la única excepción (metadata invisible).
- **D2 — Audiencia amplia: el organizador de sorteos en general** (Q2). Eyebrow tipo "Organiza sorteos online · Chile" (borrador). El requisito de producto digital se calza en pasos y FAQ, no en el eyebrow; el live deja de ser identidad de audiencia y queda como el momento del sorteo (banda amarilla existente).
- **D3 — Plan único, $25.000 CLP/mes, IVA incluido, sin nombre de fantasía** (Q3). El precio se imprime real en la landing — muere el "en definición" de la FAQ actual.
- **D4 — Promo multi-tienda: 2ª tienda en adelante a mitad de precio ($12.500/mes c/u)** (Q4A). Copy: "¿Otra tienda? La segunda en adelante, a mitad de precio." Sin tablas ni asteriscos.
- **D5 — Remate coloquial del precio: "Menos de mil pesos al día."** (Q4B). Sobrio, verificable ($25.000/30 ≈ $833), no depende de precios ajenos.
- **D6 — Modelo "configura gratis, pagas cuando publicas"** (Q5). "Gratis para partir · Sin tarjeta" SOBREVIVE en el hero; la tarjeta de precio aclara "Configura tu tienda gratis. El plan corre cuando publicas." **DECISIÓN HEREDABLE fijada por el usuario: el gate de cobro del futuro carril de billing = la PUBLICACIÓN de la tienda.**
- **D7 — CTA "Crea tu tienda gratis" en todos los puntos** (Q6): header, hero, boleto final. Login queda como está. El sorteo-first vive en titular/bajada; el botón describe la acción real del click.
- **D8 — Secuencia de bandas (9)** (Q7): AZUL hero → BLANCA cómo funciona → AMARILLA momento → BLANCA hazlo-tú-mismo → AMARILLA precio → BLANCA confianza → GRIS FAQ → AZUL boleto → TINTA footer. Cero recolores de secciones existentes; el precio recibe el amarillo lotería. `docs/design.md` §9 debe actualizarse con la secuencia nueva (aprobada por el usuario en Q7).
- **D9 — Promesa económica: "cero comisión por venta — pagas el plan fijo y punto"** (Q8), con honestidad del procesador (cobra su tarifa por transacción, la ves en tu propia cuenta, no pasa por nosotros). Invariante I4 abajo.
- **D10 — Flow exactamente 1 vez en toda la landing** (Q9): dentro de la FAQ "¿Cómo me llega la plata?", siempre como "el procesador". Nunca en hero/pasos/confianza/CTAs. El paso de pagos se redacta para que conectar la cuenta quepa en el "todo esto en una tarde".
- **D11 — Tagline nuevo en `APP_CONFIG`: "Monta tu sorteo online tú mismo, en un día."** (Q10). Alimenta title/meta description/OG.
- **D12 — FAQ: 9 entradas en el orden aprobado** (Q11; lista completa en el Plan). Título de sección "Lo que preguntaría tu yo de hace cinco minutos" SE MANTIENE. "¿Puedo hacer más de un sorteo?" responde honesto: uno ACTIVO a la vez por tienda (guard secuencial real), con la 2ª tienda a mitad de precio como salida.
- **D13 — Paquete SEO dentro de la task + "rifa" SOLO en metadata invisible** (Q12): JSON-LD (FAQPage, Organization, WebSite, SoftwareApplication con Offer $25.000 CLP), robots.txt, sitemap.xml, canonical, og:locale, OG PNG 1200×630 con URL absoluta, jerarquía h1/h2 verificada. La palabra "rifa" queda permitida ÚNICAMENTE en `<meta name="keywords">` y en la propiedad `keywords` del JSON-LD — ambas invisibles para el lector. **Honestidad técnica registrada: `meta keywords` es ignorado por Google desde ~2009 y el `keywords` de JSON-LD no es factor de ranking confirmado — su valor es ~cero; la captura real del volumen de búsqueda "rifa" es la guía de contenido futura** ("¿Rifa o sorteo? Lo que dice la ley en Chile"), registrada como task futura, fuera de este alcance.

## Plan

1. **Reescribir `src/components/landing/copy.ts`** con el copy sorteo-first (F01). Borrador de mensajes (el usuario pule el texto fino después):
   - HERO — eyebrow: "Organiza sorteos online · Chile". Titular (plumón en las palabras marcadas): "Monta tu **sorteo** online. **Hoy** mismo." Bajada: "Con Sortéatelo armas tú mismo la tienda de tu sorteo: subes lo que vas a vender, activas pagos con tarjeta y compartes el enlace — todo en un día, sin programadores ni cotizaciones." (nombre vía `APP_CONFIG.name`). Nota bajo CTA se mantiene: "Gratis para partir · Sin tarjeta".
   - PASOS (historia del "en un día"): ① "Crea tu tienda" (plantilla, logo, colores — listo) ② "Sube lo que vas a vender" (tu producto digital: novela, fanzine, guía) ③ "Activa pagos con tarjeta" (conectas tu cuenta y cada peso llega directo a ti) ④ "Comparte y sortea en vivo" (cada compra da un número; el ganador sale frente a todos). Remate explícito de la sección: "Todo esto, en una tarde."
   - MOMENTO: se mantiene en espíritu (sorteo frente a todos); retoques menores de coherencia.
   - CONFIANZA: tarjeta [0] sin Flow → "Tu plata nunca pasa por nosotros — cobras directo en tu cuenta, con pago con tarjeta (Webpay)." Tarjetas [1] y [2] se mantienen. Bajada de la intro puede sumar el eco "cero comisión por venta".
   - CTA FINAL: "sube tu primer PDF" → "sube tu producto"; resto del boleto se mantiene.
   - `src/config/app.ts`: tagline → "Monta tu sorteo online tú mismo, en un día."
2. **Nuevas secciones en `landing-plataforma.tsx` + copy** (F02): banda BLANCA "hazlo tú mismo" (eyebrow tipo "Hazlo tú mismo"; 3 mensajes anti-agencia sin nombrar competencia: nadie te manda un presupuesto / no dependes de un programador / partes hoy, no en dos semanas) y banda AMARILLA "precio" (título "Un solo plan, todo incluido" · $25.000/mes IVA incluido · qué incluye: tienda en tu subdominio, pagos con tarjeta, sorteos, entrega automática · "Configura tu tienda gratis. El plan corre cuando publicas." · "¿Otra tienda? La segunda en adelante, a mitad de precio." · "Cero comisión por venta — pagas el plan fijo y punto." · remate "Menos de mil pesos al día."). Insertarlas en la secuencia D8; verificar h1 único + h2 por sección; reusar `Banda`/`Etiqueta`/`Card`/gramática talonario existente (cero hex, CSS module solo vars del theme). Actualizar `docs/design.md` §9 con la secuencia nueva de bandas.
3. **FAQ nueva (9 entradas, orden aprobado)** en `copy.ts` (F03): ① ¿Cuánto cuesta? (gratis configurar → $25.000/mes IVA incluido al publicar → 2ª tienda mitad de precio → cero comisión por venta; el procesador cobra su tarifa por transacción y la ves en tu propia cuenta) ② ¿Qué puedo vender? (productos digitales en PDF hoy) ③ ¿Necesito saber de páginas web? (no: plantilla + logo + colores) ④ ¿Cómo me llega la plata? (directo a tu cuenta, no pasa por nosotros; **única mención de Flow**, como procesador; la cuenta se crea gratis al configurar, te guiamos) ⑤ ¿Cómo sabe el comprador su número? (pantalla + correo, al confirmarse el pago) ⑥ ¿Cómo se elige al ganador? (se mantiene) ⑦ ¿Puedo hacer más de un sorteo? (todos los que quieras, uno a la vez por tienda; varias tiendas = mitad de precio) ⑧ ¿Qué pasa si un pago falla? (reescrita sin "Flow") ⑨ ¿Necesito iniciar actividades en el SII…? (se mantiene).
4. **JSON-LD + metadata on-page** (F04): componente/helper que derive de `copy.ts`/`APP_CONFIG` los bloques `FAQPage` (9 entradas 1:1), `Organization`, `WebSite` y `SoftwareApplication` con `Offer` (price 25000, priceCurrency CLP, billing mensual); `<link rel="canonical" href="https://sorteatelo.cl/">`; `og:locale` es_CL; `<meta name="keywords">` con "sorteo online, sorteos online Chile, rifa online, rifas" (D13 — dejar comentario en código: valor de ranking ~cero, decisión consciente). Solo en la landing del apex — no tocar el despacho por tenant.
5. **SEO técnico de archivos** (F05): `public/robots.txt` (allow all + `Sitemap: https://sorteatelo.cl/sitemap.xml`), `public/sitemap.xml` estático del apex, rasterizar `og.svg` → `public/og.png` 1200×630 y apuntar `og:image` a la URL ABSOLUTA (`https://sorteatelo.cl/og.png`). Cierra el pendiente "OG raster" de design.md (marcarlo).
6. Verificación visual en :3001 (bandas, precio, FAQ) + revisión del usuario sobre el copy borrador.

## Validaciones

### F01 — Copy sorteo-first + tagline

**Vitest** (integration):
- [ ] Ningún string exportado por `copy.ts` (ni el tagline de `APP_CONFIG`) contiene "rifa"/"Rifa" (D1).
- [ ] "Flow" no aparece en HERO, PASOS, MOMENTO, CONFIANZA, CTA_FINAL ni FOOTER (D10).
- [ ] Toda ocurrencia de "comisión/comisiones" en el copy lleva el apellido "por venta" o "nuestras" (I4).
- [ ] `APP_CONFIG.tagline` es exactamente "Monta tu sorteo online tú mismo, en un día." (D11).

**E2E** (browser):
- [ ] El hero del apex muestra el titular sorteo-first, el eyebrow amplio, la nota "Gratis para partir · Sin tarjeta" y el CTA "Crea tu tienda gratis" apuntando a /login.

### F02 — Secciones nuevas + secuencia de bandas

**Vitest**:
- [ ] El copy de la sección precio contiene "$25.000", "IVA incluido", la línea de la 2ª tienda a mitad de precio, "El plan corre cuando publicas" y "Menos de mil pesos al día." (D3–D6).
- [ ] El copy de hazlo-tú-mismo no nombra competencia alguna (ni "r3q" ni marcas).

**E2E**:
- [ ] La landing renderiza las 9 bandas en el orden D8 exacto, sin dos blancas adyacentes, y las secciones nuevas se ven correctas en desktop y móvil.

### F03 — FAQ nueva

**Vitest**:
- [ ] `FAQ` tiene exactamente 9 entradas en el orden aprobado (D12).
- [ ] "Flow" aparece exactamente 1 vez en TODO el copy de la landing, y es dentro de la respuesta "¿Cómo me llega la plata?" (D10).
- [ ] La respuesta de "¿Cuánto cuesta?" contiene el precio real y NO contiene "en definición".

**E2E**:
- [ ] El Accordion muestra las 9 preguntas y las respuestas se expanden.

### F04 — JSON-LD + metadata

**Vitest**:
- [ ] El JSON-LD `FAQPage` refleja 1:1 las 9 preguntas/respuestas de `copy.ts` (derivado, no duplicado a mano) y parsea como JSON válido.
- [ ] El JSON-LD `SoftwareApplication/Offer` declara price 25000 y priceCurrency CLP.
- [ ] "rifa" NO aparece en title, meta description ni OG — solo en meta keywords / JSON-LD keywords (D13).

**E2E**:
- [ ] El HTML servido del apex incluye los scripts `application/ld+json`, el canonical `https://sorteatelo.cl/` y `og:locale` es_CL (y nada de eso aparece en las páginas de tenant).

### F05 — robots + sitemap + OG raster

**Vitest**:
- [ ] `public/robots.txt` y `public/sitemap.xml` existen y el sitemap referencia el apex con URL absoluta.

**E2E**:
- [ ] `GET /robots.txt` y `GET /sitemap.xml` responden 200 en el dev server; `og:image` apunta a una URL absoluta `.png` y el archivo existe (1200×630).

## Invariantes

- I1: **ADR-0008** — la mecánica descrita es SIEMPRE "cada compra participa en el sorteo promocional"; PROHIBIDO prometer venta de números de rifa, en cualquier superficie.
- I2: "rifa" PROHIBIDO en toda superficie visible (copy, headings, title, meta description, OG, JSON-LD visible en rich results); permitido SOLO en `<meta name="keywords">` y `keywords` de JSON-LD (D13).
- I3: "Flow" exactamente 1 vez en la landing, en la FAQ "¿Cómo me llega la plata?", como "el procesador" (D10).
- I4: nunca prometer "sin comisiones" sin el apellido "por venta" o "nuestras" (D9).
- I5: secuencia de bandas D8 exacta; dos blancas nunca adyacentes (design.md §9); si se toca la secuencia, actualizar design.md.
- I6: NO tocar el despacho por zona/tenant de `src/pages/index.tsx` ni el storefront de tenants — esta task es solo la superficie del apex.
- I7: cero hex inline; CSS module de landing solo con vars del theme; Tailwind solo layout (design.md §9). Marca/dominio SIEMPRE desde `APP_CONFIG` (nunca literal "Sortéatelo" en JSX).
- I8: voz design.md §8 — tuteo chileno sobrio, sin lenguaje de urgencia/escasez; no justificar recortes "porque es MVP" (el producto ya no lo es).
- I9: no prometer features inexistentes: el billing NO existe (la landing declara el modelo D6, no un flujo de pago de suscripción); los sorteos son 1 activo a la vez por tienda.
- I10: el JSON-LD se DERIVA de `copy.ts`/`APP_CONFIG` — prohibido duplicar los textos a mano (dos verdades divergen).

## Out of scope

- Implementar el cobro de la suscripción (carril de billing futuro; hereda D6: gate = publicación).
- Guía de contenido "¿Rifa o sorteo?" y toda estrategia de contenido programático (task futura registrada en D13).
- SEO de las tiendas de tenants, Search Console, analytics, link building.
- Cambios al login (copy o layout), al panel, al storefront de tenants.
- Logo/isotipo dibujado (pendiente aparte de design.md).
- Texto legal definitivo (validación de abogado = F10 del roadmap).

## Especialistas a consultar

- `frontend-reviewer` — las bandas nuevas, la gramática talonario y las reglas de design.md §9.
- `change-set-reviewer` — cierre del diff (incluye `docs/design.md` y `public/`).
- `feature-tester` — E2E browser de la landing (bandas, FAQ, metas, robots/sitemap) — recomendado: sí toca UI.

## Bitácora

- [2026-07-25 21:05] [planner-grill] Contexto cargado: copy.ts completo (hero/pasos/confianza/FAQ/CTA), landing-plataforma.tsx (secuencia de bandas D9 + regla I6), design.md §8 voz (tuteo chileno, SIN lenguaje de urgencia/escasez de rifa en chrome de plataforma — bandera de estafa) y §9 reglas duras, APP_CONFIG (tagline actual "Vende lo que hiciste y sortéalo entre quienes te compraron"). Flow aparece en: hero.bajada, PASOS[1], CONFIANZA[0], FAQ[3].
- [2026-07-25 21:05] [planner-grill] Q1: ¿Palabra dominante del copy: "rifa" o "sorteo"? Recomendada: "sorteo" dominante con "rifa" como puente acotado.
- [2026-07-25 21:20] [planner-grill] Q1 answered: opción (c) — SOLO "sorteo", CERO "rifa" en todo el copy de la landing. Máxima seguridad legal/marca; el usuario acepta perder el puente coloquial.
- [2026-07-25 21:20] [planner-grill] Q2: ¿A quién le habla la landing (eyebrow y voz del hero)? Recomendada: ampliar al organizador de sorteos en general.
- [2026-07-25 21:35] [planner-grill] Q2 answered: opción (b) — audiencia amplia, eyebrow tipo "Organiza sorteos online · Chile"; el requisito de producto digital se calza en pasos y FAQ; el live queda como momento del sorteo.
- [2026-07-25 21:35] [planner-grill] Q3: Precio — ¿monto exacto, plan único, nombre? Recomendada: plan único sin nombre, $20.000/mes IVA incluido.
- [2026-07-25 21:50] [planner-grill] Q3 answered: **$25.000/mes, plan único, sin nombre de fantasía, IVA incluido**. El usuario pide además: (a) promoción por 2ª/3ª tienda del mismo organizador — esquema a proponer por el planner; (b) remate coloquial "menos que..." en la sección de precio — a proponer en voz chilena sobria.
- [2026-07-25 21:50] [planner-grill] Q4: Esquema de la promo multi-tienda + remate "menos que...". Recomendada: mitad de precio 2ª tienda + "menos de mil pesos al día".
- [2026-07-25 22:05] [planner-grill] Q4 answered: Parte A opción (a) — 2ª tienda en adelante a mitad de precio ($12.500/mes c/u), línea "¿Otra tienda? La segunda en adelante, a mitad de precio.". Parte B opción (1) — remate "Menos de mil pesos al día."
- [2026-07-25 22:05] [planner-grill] Q5: ¿Sobrevive "Gratis para partir · Sin tarjeta" con $25.000/mes visibles? Recomendada: modelo "configura gratis, pagas cuando publiques".
- [2026-07-25 22:20] [planner-grill] Q5 answered: opción (a) — configura gratis / el plan corre cuando publicas. "Gratis para partir · Sin tarjeta" SOBREVIVE; tarjeta de precio aclara "Configura tu tienda gratis. El plan corre cuando publicas." **DECISIÓN HEREDABLE: el gate de cobro del futuro carril de billing = la PUBLICACIÓN de la tienda** (fijado por el usuario, registrar en Decisiones del plan).
- [2026-07-25 22:20] [planner-grill] Q6: ¿CTA principal? Recomendada: mantener "Crea tu tienda gratis" en todos los botones.
- [2026-07-25 22:35] [planner-grill] Q6 answered: opción (a) — "Crea tu tienda gratis" en header, hero y boleto final; login queda como está. Sorteo-first vive en titular/bajada.
- [2026-07-25 22:35] [planner-grill] Q7: ¿Secuencia de bandas con las 2 secciones nuevas? Recomendada: precio en AMARILLA propia tras hazlo-tú-mismo BLANCA, cero recolores.
- [2026-07-25 22:50] [planner-grill] Q7 answered: opción (a) — AZUL hero → BLANCA cómo funciona → AMARILLA momento → BLANCA hazlo-tú-mismo → AMARILLA precio → BLANCA confianza → GRIS FAQ → AZUL boleto → TINTA footer.
- [2026-07-25 22:50] [planner-grill] Q8: ¿Se mantiene "sin comisiones escondidas" con suscripción? Recomendada: reforzar a "cero comisión por venta" + honestidad del procesador.
- [2026-07-25 23:05] [planner-grill] Q8 answered: opción (a) — "cero comisión por venta — pagas el plan fijo y punto"; FAQ aclara la tarifa del procesador por transacción. **INVARIANTE DE COPY fijado: nunca prometer "sin comisiones" sin el apellido "por venta" o "nuestras".**
- [2026-07-25 23:05] [planner-grill] Q9: ¿Dónde queda la ÚNICA mención de Flow + cómo contar el requisito BYO-Flow? Recomendada: 1 mención en FAQ "¿Cómo me llega la plata?".
- [2026-07-25 23:20] [planner-grill] Q9 answered: opción (a) — **INVARIANTE: Flow exactamente 1 vez en toda la landing, dentro de la FAQ "¿Cómo me llega la plata?", siempre como "el procesador"**; nunca en hero/pasos/confianza/CTAs. Paso de pagos redactado para que conectar la cuenta quepa en el "todo esto en una tarde".
- [2026-07-25 23:20] [planner-grill] Q10: ¿Se actualiza APP_CONFIG.tagline? Recomendada: sí, "Monta tu sorteo online tú mismo, en un día."
- [2026-07-25 23:35] [planner-grill] Q10 answered: opción (a) — tagline nuevo "Monta tu sorteo online tú mismo, en un día." entra al alcance (src/config/app.ts).
- [2026-07-25 23:35] [planner-grill] Q11: Lista final y orden de la FAQ (9 propuestas: cuánto cuesta / qué puedo vender / saber de páginas web / cómo me llega la plata / número del comprador / cómo se elige ganador / más de un sorteo / pago falla / SII). Nota de producto: "más de un sorteo" debe responder honesto = uno ACTIVO a la vez por tienda (guard secuencial 1-ACTIVO de launch-crear-sorteo).
- [2026-07-26 00:00] [planner-grill] Q11 answered: las 9 entradas en el orden propuesto APROBADAS; el título de sección "Lo que preguntaría tu yo de hace cinco minutos" SE MANTIENE.
- [2026-07-25 23:50] [planner-grill] Usuario pregunta (antes de responder Q11): ¿se puede dejar esto con SEO de primer nivel para Chile? Hallazgos del repo: NO existen robots.txt ni sitemap.xml ni canonical; og:image apunta a `/og.svg` (SVG relativo — los crawlers sociales no lo renderizan Y necesita URL absoluta: 2 bugs); no hay JSON-LD; design.md ya listaba el OG raster PNG 1200×630 como pendiente.
- [2026-07-25 23:50] [planner-grill] Q12: Alcance SEO de ESTA task + tensión rifa/sorteo en keywords. Recomendada: paquete on-page+técnico acotado a la landing (JSON-LD FAQPage/Organization/WebSite/SoftwareApplication con Offer $25.000, robots.txt, sitemap.xml, canonical, OG PNG 1200×630 absoluto, jerarquía h1/h2 verificada) DENTRO de la task; keywords "rifa" opción (i) cero-rifa también en SEO, con task futura de contenido (guías) registrada como el vehículo legítimo para capturar búsquedas de "rifa".
- [2026-07-26 00:15] [planner-grill] Q12 answered: Parte A — paquete SEO completo APROBADO (entra a la task); lo futuro (guías, tenant SEO, Search Console) queda registrado como task futura. Parte B — recomendada (i)+(iii) aceptada CON adición del usuario: "rifa" SÍ entra como metadata invisible. Aterrizaje acordado con el orquestador: "rifa" permitido SOLO en `<meta name="keywords">` (ignorado por Google desde ~2009 — valor ~cero, dicho explícito) y `keywords` de JSON-LD (no factor de ranking confirmado, invisible en rich results); PROHIBIDO en title, meta description, OG, headings y todo copy visible. Captura real del volumen "rifa" = guía futura (D13).
- [2026-07-26 00:20] [planner-grill] GRILL CERRADO (12 rondas). Plan escrito: 5 features (F01 copy sorteo-first + tagline, F02 secciones nuevas + bandas, F03 FAQ ×9, F04 JSON-LD/metadata, F05 robots/sitemap/OG raster), 13 decisiones, 10 invariantes. Task futura a registrar cuando se abra: contenido SEO ("¿Rifa o sorteo? Lo que dice la ley en Chile" + guías). AWAITING USER APPROVAL.
