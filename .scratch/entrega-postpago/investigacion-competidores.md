# Entrega post-pago: ¿pantalla o correo? — Informe ejecutivo para Sortéatelo

**Basado en 7 investigaciones paralelas: ~40 plataformas en 6 categorías (rifas Chile/LatAm, rifas globales, venta de productos digitales, infoproductos LATAM, ticketeras, e-commerce general) + marco legal chileno.**

---

## 1. Respuesta directa

**No, "solo por correo" no es el estándar general del mercado — pero la respuesta depende de cuál de los dos activos se mire.** Sortéatelo entrega dos cosas distintas y el mercado las trata distinto:

- **Los números del sorteo**: mostrarlos en pantalla al instante **iguala o supera el estándar** de todas las categorías comparables. En rifas chilenas y LatAm el número se ve en pantalla + verificador self-service (Rifarito documenta explícitamente que su sistema *no* envía boletos por correo automático); los competidores directos chilenos del modelo exacto tienda+sorteo (Premios Increíbles, GanaGana, Sorteo Seguro, Gana Seguro) entregan **solo por correo, a veces con minutos de latencia** — Sortéatelo ya está por delante ahí.
- **El PDF comprado**: entregarlo **solo por correo está por debajo del estándar** de las plataformas de venta de productos digitales, que es el comparable correcto para este activo. Gumroad, Payhip, Itch.io, Ko-fi, Shopify Digital Downloads y WooCommerce muestran la descarga (o un botón hacia ella) **en la propia página post-pago**, con el correo como respaldo. Las excepciones solo-correo existen pero compensan con otra cosa: portal con login (Hotmart, Kiwify, Eduzz, Monetizze), magic link permanente (Lemon Squeezy) o procesamiento individualizado del archivo (Gumroad con PDF stamping).

### Tabla comparativa por categoría

| Categoría (ejemplos) | ¿Producto/ticket en la pantalla post-pago? | Canal persistente de re-acceso | ¿Cuenta de comprador? |
|---|---|---|---|
| **Rifas Chile/LatAm** (TodosPor, Rifarito, Santa Rifa, LAOOZ, Club de Rifas) | **Sí — números en pantalla** es la norma; el correo automático NO es estándar | Verificador público self-service por email o teléfono | No (email/teléfono = identidad) |
| **Competidores directos tienda+sorteo Chile** (Premios Increíbles, GanaGana, Sorteo Seguro, Gana Seguro) | **No documentado** — la promesa es el email ("tu número en menos de 2 minutos") | Correo; la mitad suma panel con cuenta; verificador por email (Premios Increíbles) | Mixto (2 de 4 con cuenta) |
| **Rifas globales fundraising** (RallyUp, Rafflebox, GalaBid, Zeffy, Raffall) | **Sí en las líderes**: RallyUp muestra los números en la confirmación; Rafflebox permite descargar el ticket en pantalla | Correo inmediato con números en texto plano (best practice GalaBid: email/SMS "en momentos") | No |
| **Venta de digitales** (Gumroad, Payhip, Itch.io, Ko-fi, Lemon Squeezy) | **Sí, dominante**: redirección o botón directo a la descarga (Payhip, Itch.io, Gumroad "View content") | Email de recibo + página de orden que regenera acceso; verificación de email al reabrir | No (guest por email; cuenta opcional) |
| **Infoproductos LATAM** (Hotmart, Kiwify, Eduzz, Monetizze) | **No — nunca**: la thank-you page confirma estado y hace upsell | Correo (+WhatsApp en Brasil) → área de miembros con login permanente | Sí, auto-creada con el email del checkout |
| **Ticketeras** (Eventbrite, Ticketmaster, Passline, PuntoTicket, Ticketplus) | Confirmación de orden; el QR vive en cuenta/app (Eventbrite eliminó el PDF del correo en 2024 por seguridad) | Cuenta/app; el correo es recibo y puerta de login | Sí (Eventbrite la crea invisible con el email) |
| **E-commerce general** (Shopify, WooCommerce, Tiendanube) | **Sí para digitales**: botón "Download now" en la thank-you page (Shopify app oficial, Woo core out-of-the-box) | Correo con link a order-status page tokenizada; My Account opcional | No (guest checkout canónico) |

**Honestidad con la evidencia**: gran parte del mercado chileno de rifas no fue verificable — rifamos.cl, misrifas.cl, rifaslive.cl, vamosrifa.cl, easyrifa.cl y la histórica Rifes.cl **no resuelven DNS** (categoría con altísima mortalidad: de ~8 nombres, solo TodosPor y YoRifo operan); YoSorteo y Rifa.cl están "en mantenimiento"; Rifamax, GanaGana, TuRifas, GanaTuAuto y Gana la Parcela bloquean fetchers (403/402 — datos vía snippets indexados, no navegación real). Y en casi ningún competidor directo pudimos ver la **pantalla** post-pago real (requeriría comprar); lo citado sale de docs oficiales, help centers y T&C.

---

## 2. Los tres patrones de mercado que importan

**Patrón 1 — La página post-pago debe resolver la transacción por sí sola; el correo es respaldo y registro, no canal primario.** Es la recomendación núcleo de Baymard (benchmark de 800+ páginas de confirmación): cuando la página no basta, los usuarios se quedan varados esperando el correo. Y el punto de dolor #1 documentado en *todos* los help centers de modelo solo-correo es el mismo: "no me llegó / cayó en spam" (Rafflebox tiene una página entera de soporte dominada por eso; Zeffy, Raffall, Passline y Kiwify tienen artículos dedicados). Rafflebox lo dice sin rodeos: la descarga en pantalla existe *porque* el correo falla. En Chile además el correo es **piso legal, no elección de UX**: el Art. 12 A de la Ley 19.496 obliga a enviar confirmación escrita del contrato (si no, el retracto se extiende de 10 a 90 días), y el D.S. 6/2021 contempla que en marketplaces la envíe el Operador de la plataforma sin eximir al vendedor — mapea 1:1 al rol Operador/Organizador. Ninguna norma impide entregar el producto *además* en pantalla.

**Patrón 2 — Quien muestra contenido en la página post-pago la protege con tokens, no con cuentas.** El repertorio estándar, todo compatible con "sin cuentas de comprador":
- **Capability URL de la orden**: Shopify protege la order-status page con un token en la URL que expira (3 semanas mismo navegador / 2 semanas hasta 5 navegadores; expirado, pide verificar orden + email). WooCommerce usa la `order key` en la URL; Itch.io una "secret URL" por transacción.
- **Página de orden estable + URL firmada efímera** (el patrón más citable, Lemon Squeezy): el link del correo no es el archivo — es la orden, que **regenera URLs firmadas frescas en cada visita** ("signed, expire after 1 hour, rate-limited to 10 downloads/day per IP").
- **Verificación del email de compra al reabrir** (Gumroad, Payhip) y **límite de descargas** (Payhip: 5 por defecto).
- **PDF stamping** (Gumroad, Payhip, Hotmart): email del comprador impreso en cada página como disuasivo. Dato clave: Gumroad con stamping activado **pasa a entrega solo-correo** porque el archivo requiere procesamiento individualizado — precedente directo para la decisión abierta #6 (marca de agua) de Sortéatelo.

**Patrón 3 — El verdadero eje competitivo no es el canal sino la persistencia del re-acceso.** Los infoproductos LATAM entregan por correo igual que Sortéatelo, pero *todos* dan re-acceso permanente self-service (Hotmart "Mis compras", MyEduzz, Minhas Compras); las rifas LatAm lo resuelven con el verificador público por email/teléfono; Lemon Squeezy e Itch.io con magic link / reenvío por email. **Sortéatelo es hoy el único del set con un enlace que expira a 30 días sin vía de recuperación para el comprador** — ese es el gap real, más que la pantalla. (WhatsApp, en cambio, NO es gap: en Chile es canal de marketing y comprobantes manuales, no de entrega automática; solo es estándar espejo en infoproductos brasileños.)

---

## 3. Qué significa para Sortéatelo

**El modelo actual es conservador, no atípico — con un gap concreto.**

- **Números en pantalla**: estándar cumplido y superado. Frente al clúster directo chileno (email diferido de minutos) es una ventaja; no tocar.
- **Descarga solo por correo**: defendible — coincide con infoproductos LATAM, con el clúster directo chileno, y cumple de paso la obligación legal — pero **por debajo del estándar del comparable correcto** (venta de digitales: Shopify/Woo/Gumroad/Payhip/Itch.io, donde la descarga en pantalla es lo esperado y su ausencia se reporta como bug en foros de Shopify). El comprador que pagó un PDF y ve solo números + "revisa tu correo" queda expuesto al modo de falla #1 de la industria (spam, correo mal tipeado) justo en el momento de mayor ansiedad post-pago.
- **Enlace de 30 días sin recuperación**: por debajo de *todas* las categorías. Nadie más deja al comprador sin camino self-service cuando el enlace muere o el correo se pierde.

---

## 4. Recomendación (acotada, en orden de valor)

1. **Botón de descarga en la página de retorno** (la de "¡Pago confirmado!"), habilitado solo tras la confirmación server-side contra Flow que ya existe. No reutilizar el enlace de 30 días del correo: generar ahí una **URL prefirmada corta on-demand** (minutos–1 hora, patrón Lemon Squeezy) desde el `Entitlement`. Cambio pequeño: la autorización ya existe, es agregar una superficie.
2. **Convertir el enlace del correo en página de orden estable** (`/orden/{token}` con token largo no adivinable) **que regenera URLs firmadas frescas**, en vez de un enlace directo que muere a los 30 días. Resuelve la expiración sin cuentas ni infraestructura nueva; si se quiere endurecer, verificación del email de compra al abrirla desde otro dispositivo (patrón Gumroad/Payhip).
3. **(Roadmap, opcional)** Verificador self-service "consulta tus números y compras con tu correo" — el patrón de confianza dominante de la categoría rifas, y reemplaza a la cuenta. WhatsApp: descartarlo como prioridad; no es gap competitivo en Chile.
4. **Mantener el correo siempre** — es obligación legal (Art. 12 A), y conviene verificar que el correo actual califique como "confirmación escrita del contrato" y reflejar en los ToS que el Operador lo envía por cuenta del Organizador (D.S. 6/2021).

**Trade-off de seguridad explícito**: hoy el único portador de acceso al PDF es el inbox del comprador; con (1) y (2), la URL de la página post-pago y la de la orden se vuelven *capability URLs* — quien tenga el link accede. Es exactamente el riesgo que toda la industria acepta y mitiga con expiración corta de la URL firmada del archivo, límite de descargas y rate limit por IP, sin exigir cuenta. La mitigación fuerte contra el compartido deliberado no es esconder el link sino la **marca de agua** (decisión abierta #6): el precedente Gumroad muestra que, si se adopta stamping, la entrega diferida por correo se vuelve la arquitectura natural — o sea, la decisión #6 y esta deberían resolverse juntas.