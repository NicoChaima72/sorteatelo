# Informe: Protección de sorteatelo.cl (Vercel Hobby → Pro)

**Para**: Operador de plataforma Sortéatelo · **Fecha**: 2026-07-17 · **Base**: hallazgos verificados contra docs oficiales de Vercel (actualizados jun-2026) y casos reales de la comunidad.

---

## 1. ¿Conviene poner Cloudflare delante de sorteatelo.cl?

**NO.** Y no es solo una recomendación: en tu configuración es prácticamente imposible hacerlo de forma soportada.

**Por qué no se puede (requisito duro):**
- El wildcard `*.sorteatelo.cl` exige nameservers de Vercel porque el certificado wildcard se emite vía desafío DNS-01 de Let's Encrypt — Vercel necesita escribir registros DNS para responderlo ([vercel.com/kb/guide/why-use-domain-nameservers-method-wildcard-domains](https://vercel.com/kb/guide/why-use-domain-nameservers-method-wildcard-domains)). Mover el DNS a Cloudflare rompe la emisión/renovación del cert.
- Existe un workaround (delegar solo `_acme-challenge` vía registros NS a Vercel, [vercel.com/kb/guide/wildcard-domain-without-vercel-nameservers](https://vercel.com/kb/guide/wildcard-domain-without-vercel-nameservers)), pero es incompatible en la práctica con el proxy naranja: Cloudflare usa el mismo namespace `_acme-challenge` para validar su propio certificado Universal SSL, y la delegación lo eclipsa. Con nube gris (DNS only) funciona, pero entonces Cloudflare no protege nada.
- La única vía soportada para wildcard + Cloudflare proxied es subir un certificado Cloudflare Origin CA como cert custom a Vercel — **exclusivo de plan Enterprise** ([vercel.com/kb/guide/cloudflare-with-vercel](https://vercel.com/kb/guide/cloudflare-with-vercel)). Descartado para Hobby/Pro.

**Por qué tampoco convendría aunque se pudiera:**
- Vercel lo desaconseja oficialmente: "We do not recommend using a reverse proxy in front of Vercel" ([vercel.com/docs/security/reverse-proxy](https://vercel.com/docs/security/reverse-proxy)). Con un proxy delante, el Firewall de Vercel pierde visibilidad del tráfico real: se degradan la mitigación DDoS automática, Bot Protection y Attack Mode (las protecciones que ya tienes gratis). La rotación de IPs de salida de Cloudflare además provoca re-challenges a compradores legítimos — pésimo en pleno checkout.
- Un ataque al proxy se reenvía igual a Vercel y se factura allá: doble CDN, doble complejidad, cero ganancia.

**Conclusión**: Cloudflare se queda donde está (R2 para storage). El perímetro de seguridad es el Firewall de Vercel, que es gratis, nativo y suficiente para este tamaño.

---

## 2. Qué activar HOY (Hobby) y qué al pasar a Pro

### HOY, en Hobby (todo gratis, ~30 minutos de trabajo)

Ordenado por impacto/costo:

1. **Verificar que la mitigación DDoS está activa** (lo está por defecto, L3/L4/L7, sin configuración) y familiarizarse con el dashboard Firewall del proyecto. No hace falta hacer nada, pero hay que saber dónde mirar. ([vercel.com/docs/vercel-firewall/ddos-mitigation](https://vercel.com/docs/vercel-firewall/ddos-mitigation))

2. **Crear la custom rule de Bypass para `/api/webhooks/flow` AHORA, antes de necesitarla.** Flow.cl NO está en el directorio de bots verificados de Vercel (bots.fyi lista Stripe, PayPal, Adyen... pero no Flow). Si algún día activas Attack Mode bajo ataque sin esta regla, bloqueas las confirmaciones de pago. Es la regla más importante de las 3 que da Hobby. ([vercel.com/docs/attack-mode](https://vercel.com/docs/attack-mode))

3. **Configurar la única regla de rate limit de Hobby sobre `/api/*`** (excluyendo el path del webhook, o con umbral que el webhook nunca alcance): key por IP, fixed window, acción 429. Hobby incluye 1 regla + 1M de allowed requests gratis. Ojo: la regla de rate limit cuenta dentro del tope de 3 custom rules. ([vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting))

4. **Saber activar Attack Mode a mano** (Firewall > Bot Management): gratis e ilimitado en todos los planes, challenge a todo el tráfico de navegador; Googlebot y bots verificados pasan solos. Es tu botón de pánico — pero solo sirve si la regla del punto 2 ya existe. ([vercel.com/docs/attack-mode](https://vercel.com/docs/attack-mode))

5. **Mirar el dashboard de uso semanalmente.** En Hobby no hay factura sorpresa (no hay tarjeta ni overages), pero al agotar cuota el proyecto se PAUSA hasta 30 días — tienda y webhook caídos. Un burst de bots "grises" (no clasificados como DDoS) consume cuota facturable/pausable. ([vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby))

### Al pasar a Pro (obligatorio ANTES del primer checkout real — ver riesgo #1)

6. **Spend Management con auto-pausa, el día 1 de Pro.** Fijar un monto tipo US$10-20 sobre el fee del seat (US$20), con "Pause production deployment" activado — no solo notificaciones. Caveats: el chequeo corre "cada pocos minutos" (no es hard cap instantáneo; fijar el monto POR DEBAJO del máximo tolerable) y el unpause es manual por proyecto. Los equipos Pro nuevos traen un presupuesto on-demand por defecto de US$200 — bajarlo de inmediato. ([vercel.com/docs/spend-management](https://vercel.com/docs/spend-management))

7. **Ampliar reglas WAF** (Pro: 40 custom rules, 100 IP blocks, 40 reglas de rate limit usage-based desde ~US$0,50/M allowed requests por región): límites diferenciados — `/api/auth/*` estricto, storefront público por IP, webhook con su bypass. ([vercel.com/docs/vercel-firewall/vercel-waf](https://vercel.com/docs/vercel-firewall/vercel-waf))

8. **Opcional, solo si aparece abuso fino por endpoint/tenant**: rate limiting app-level con `@upstash/ratelimit` + Upstash Redis (free tier, sliding window). No es "el estándar oficial" (la doc de Next.js es agnóstica y Vercel empuja su WAF first-party), pero es la opción práctica cuando las reglas WAF no alcanzan para lógica por tenant, y porque los contadores del WAF son POR REGIÓN (un atacante distribuido excede el límite nominal). No lo montes preventivamente — bajo volumen no lo justifica aún.

---

## 3. ¿Qué hace "alguien serio" a este tamaño?

A cientos de visitas/día y US$42/mes de presupuesto, alguien serio **no** monta Cloudflare Enterprise, ni WAF gestionado de terceros, ni Kubernetes con rate limiters distribuidos. Hace exactamente esto:

- **Deja el tráfico hostil "antes del medidor"**: usa el firewall del hosting (gratis, tráfico bloqueado no se factura) en vez de código propio. Vercel no cobra lo que su Firewall bloquea ([vercel.com/docs/vercel-firewall/ddos-mitigation](https://vercel.com/docs/vercel-firewall/ddos-mitigation)).
- **Pone un cap de gasto que DETIENE el uso, no que solo avisa** (Spend Management con pausa, apenas esté en Pro). La lección de los casos reales: Vercel rechazó el reembolso de un DDoS de US$170 en mayo 2026 ("usage charges are non-refundable") — no contar con refunds de buena voluntad; la protección se configura ANTES del incidente ([community.vercel.com/t/.../44044](https://community.vercel.com/t/ddos-attack-caused-170-in-extra-charges-support-refuses-refund/44044)).
- **Protege el webhook de pagos por diseño, no por perímetro**: confirmación server-side contra la API de Flow + idempotencia (ya lo tienes por ADR-0001). Eso hace que un webhook falso o repetido sea inofensivo aunque pase el firewall.
- **Mira el uso a diario/semanal** y sabe dónde está el botón de Attack Mode.
- **No agrega piezas nuevas** (Upstash, proxies, CDNs extra) hasta que un problema real lo pida.

Total: US$0 hoy, US$20-25/mes en Pro. Calza en el presupuesto.

---

## 4. Riesgos reales priorizados para ESTE producto

**#1 — Vender en Hobby viola los ToS (riesgo más alto y más inmediato).** El fair use de Hobby prohíbe uso comercial explícitamente ("any method of requesting or processing payment from visitors"). Un checkout Flow activo en Hobby habilita a Vercel a bajar el sitio en cualquier momento. **Mitigación**: upgrade a Pro ANTES del primer checkout real (piloto F07 incluido), no "antes de escalar". ([vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby))

**#2 — Tienda pausada por bots "grises" en Hobby.** Vercel cobra/consume cuota por el tráfico servido antes de que la mitigación actúe y por bots/crawlers no clasificados como DDoS. Caso real: 2,18M requests de un ataque L7 no auto-detectado en Hobby → proyecto pausado. En Hobby eso no cuesta plata, cuesta **disponibilidad** (storefronts + webhook de Flow caídos hasta 30 días, con reportes de pausas que se extienden más allá hasta que interviene soporte). **Mitigación**: regla de rate limit hoy (punto 3), Attack Mode como botón de pánico, y acelerar el paso a Pro donde el mismo evento se convierte en un cargo acotable con Spend Management.

**#3 — Attack Mode bloqueando los pagos de Flow.** El escenario más específico de Sortéatelo: bajo ataque activas Attack Mode, el POST server-to-server de Flow no pasa el challenge (Flow no es bot verificado), las órdenes quedan pagadas en Flow pero no confirmadas en la plataforma. **Mitigación**: custom rule Bypass para `/api/webhooks/flow` creada HOY (punto 2), y probarla. La idempotencia del webhook + confirmación server-side contra la API de Flow (ADR-0001) son la red de seguridad si algo se pierde igual.

**#4 — Factura sorpresa al pasar a Pro.** Los casos existen: US$96k por viralidad legítima (Cara.app, jun-2024, verificado por TechCrunch/InfoQ), US$23k por DDoS facturado a US$0,15/GB (fuente secundaria UsageBox), US$170 con refund rechazado (foro oficial, may-2026). El hueco documentado: se factura lo servido pre-mitigación y el tráfico bot no reconocido como ataque. **Mitigación**: Spend Management con auto-pausa el día 1 de Pro, monto bajo (US$10-20 sobre el seat), presupuesto on-demand por defecto de US$200 reducido de inmediato. Con eso el peor caso pasa de miles de dólares a "sitio pausado unos minutos + tu cap". ([vercel.com/docs/spend-management](https://vercel.com/docs/spend-management), [usagebox.com/articles/vercel-23000-dollar-bill-usage-based-platform-bill-shock-2026](https://usagebox.com/articles/vercel-23000-dollar-bill-usage-based-platform-bill-shock-2026))

**#5 — Abuso de endpoints públicos multi-tenant (scraping, credential stuffing en OAuth, spam de checkout).** Riesgo real pero de menor urgencia al volumen actual. **Mitigación escalonada**: hoy la regla única de rate limit en `/api/*`; en Pro reglas diferenciadas por path; recién si aparece abuso por tenant, Upstash app-level. No construir esto preventivamente.

### Resumen ejecutivo en una línea

Cloudflare no va (el wildcard lo impide y degradaría las protecciones nativas); hoy: bypass del webhook de Flow + 1 rate limit + saber activar Attack Mode, todo gratis; antes de vender: Pro + Spend Management con auto-pausa; y la seriedad a este tamaño es exactamente eso — nada más.
