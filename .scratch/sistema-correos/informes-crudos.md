---

# Informe: confirmacion

# Correos de confirmación de compra en plataformas de rifas/sorteos — investigación

**Fecha:** 2026-07-26 · Método: docs oficiales de help centers + páginas de producto. Marco con ⚠️ lo que la documentación **no** dice (para no inventar).

---

## 1. Qué contiene el correo de confirmación

### Rafflebox (Canadá/EEUU, rifas y 50/50 con licencia) — el ejemplo mejor documentado
Su help center publica la anatomía exacta del "Ticket Purchase Confirmation Email", porque en varias provincias el regulador exige aprobarlo antes de sortear:

| Bloque | Contenido |
|---|---|
| Header | Banner + saludo "Thank you for your support" + **título de la rifa** |
| Resumen de orden | **número de orden**, fecha y hora, monto pagado, cantidad de tickets |
| Detalle del sorteo | frase literal: *"The draw [RAFFLE_NAME] will take place on [DRAW_DATE] at the [DRAW_LOCATION]"* |
| Números | frase literal: **"Your ticket numbers are below"** + los números renderizados como bloque visual (imagen de tickets) |
| Header/Footer editables | texto libre del organizador para info regulatoria |
| Footer | **número de licencia** de la rifa (obligatorio por normativa regional) |

Todos los campos en negrita son *merge fields* que se llenan desde el dashboard: nombre del comprador, **nombre de la organización**, datos del sorteo. O sea: correo emitido por la plataforma pero **redactado en voz del organizador**. Además ofrece "Download Tickets" → **PDF de los tickets** que el organizador puede reenviar a mano, y "Email Order" para reenviar la confirmación desde el detalle de la orden.

### RallyUp — el mejor esquema de *presentación de números*
- Los números de entrada se asignan **secuencialmente y con prefijo según el canal**: `W123` = comprado online, `P123` = vendido offline/papel, `T123` = entrada bonus por propina. Esto es lo más cercano a un estándar de nomenclatura que encontré.
- Cuando alguien compra varias entradas, **el recibo muestra un rango**, no una lista larga: `W100–W150`.
- Los números **van dentro del recibo por email** ("entry numbers are displayed on donor receipts so each donor knows which entry numbers are theirs"), no solo en una página web.
- El recibo se envía automáticamente al email dejado en el checkout y se puede **reenviar desde el dashboard** (View Donations → resend receipt). El soporte estándar ante "no me llegó" es *revisa spam*.

### TicketSpice
Los números se generan secuencialmente desde un número inicial configurable, y aparecen en **tres lugares a la vez**: página de confirmación, correo de confirmación y el ticket mismo. Detalle relevante para nosotros: en pre-registros con tarjeta guardada el número sale como **"TBD" hasta que el pago se completa** y la orden pasa a *Completed* — es decir, **número asignado solo con pago confirmado**.

### GalaBid — modelo "email con link, números en la web"
El correo **no lleva los números**: lleva un botón **"Tickets"** que abre la cuenta del comprador dentro de la campaña, donde ve *números, estado del sorteo y link al ítem*. Opcionalmente el mismo link se manda por **SMS en vez de email** según la configuración de la campaña. Es el enfoque opuesto a Rafflebox y, para compradores sin cuenta, el más frágil.

### DoJiggy
Números visibles en la página de confirmación **y** enviados en el email de confirmación (doble canal, sin cuenta).

### SupporterHub
"Confirmación de la compra **y su ticket de rifa**" al email dejado en el registro.

### Raffall (UK, host particular)
Confirmación de ticket al email; los tickets se consultan en la sección **YOUR TICKETS**. Permite entrar **como invitado sin registrarse** — en ese caso el email dejado es el único canal, y es el **host** (no la plataforma) quien contacta al ganador. ⚠️ La página de detalle de sus emails (`help.raffall.com/.../360017872219`) devuelve 403 a scraping; el resto viene de sus otros artículos.

### LATAM / Chile

- **Paga Tu Rifa** (LATAM, flujo transferencia): **dos correos separados y explícitamente nombrados** — al reportar el pago llega **"Recibo de Pedido"**; cuando el organizador confirma el pago en el panel, el sistema manda automáticamente el segundo, **"Ticket Digital Confirmado"**. Ese naming ("recibo" vs "ticket confirmado") es una convención útil.
- **Diseño Digital (Ecuador)**: checkout pide solo **nombre y correo** (sin cuenta), y al verificarse el pago *"el sistema genera los números asignados y el cliente recibe un correo con los detalles de su compra y los números asignados"*, mientras el organizador recibe **su propia notificación de venta**.
- **RifaBase / sistemaderifas.net** (MX/LATAM, el mismo producto — `sistemaderifas.net` redirige 301 a `rifabase.com`): correos automáticos "con diseño profesional" en **tres momentos**: al **reservar/apartar** boletos, al **aprobarse el pago**, y ante **cualquier modificación** de la compra.
- **YeaZ Rifas** (MX): se posiciona explícitamente en **WhatsApp por sobre el email** ("vende, cobra, verifica pagos y notifica a tus clientes directamente a su WhatsApp"). **MasRifas** igual: confirmaciones y recordatorios por WhatsApp + correos personalizados. En LATAM el email no es el canal asumido por defecto.
- **LaOOZ**: no manda los números; apuesta al **verificador de boletos** público ("los participantes consultan solos") — patrón *self-service* que conviene tener igual como respaldo del correo.
- **YoSorteo.cl (Chile)**: correo con **comprobante y número de pedido** para pagar por transferencia; ganadores contactados uno a uno por mail/teléfono. Muy artesanal — la vara chilena es baja.
- **WebUnica (Chile)**: plugin de rifas sobre WooCommerce con Flow/Transbank/Mercado Pago — es decir, la confirmación es **el email nativo de WooCommerce del organizador**, con los números como metadatos del pedido.

**Sobre link de descarga del producto digital:** ninguna plataforma de rifas lo resuelve (no venden digitales). El patrón vigente viene del comercio digital: **Gumroad** manda link de descarga por email + botón *"View content"* que lleva a la página del producto; **Lemon Squeezy** manda un recibo instantáneo con acceso a descarga y permite **reenviar el recibo** desde el menú de acciones de la orden. Ambos usan el recibo como **puerta permanente al archivo**, no como adjunto — coherente con ADR-0002 (URL firmada con expiración) siempre que el correo apunte a una página que **re-firma** la URL, no a la URL firmada en sí.

---

## 2. Remitente: plataforma vs organizador

Tres modelos claramente distinguibles:

**(a) Plataforma pura, cero configuración.**
**Rafflebox** manda todo desde `noreply@tickets.rafflebox.org` — dominio de la plataforma, subdominio dedicado a tickets. La marca del organizador entra **por contenido** (nombre de la organización, banner, header/footer editables, número de licencia), no por el `From`.
**Zeffy** por defecto: `contact@mailer.zeffy.com` (también subdominio `mailer.` dedicado).

**(b) Plataforma con dominio propio opcional del tenant (upgrade).**
**Zeffy** permite "Add custom domain" en Settings: se conecta un dominio propio vía **Entri** (partner DNS), con registros CNAME, propagación de hasta 48h, y auto-configuración en Cloudflare/GoDaddy. Incentivo interesante: con dominio propio el límite de envío sube de **5.000 a 30.000** contactos por newsletter. Trampa documentada: algunos proveedores anexan el dominio solo, hay que poner `zeffy` y no `zeffy.example.org`.
**ViralSweep** es el más granular: **From Address y From Name configurables por promoción** ("this email can come from your own email address and company name"), asunto y cuerpo totalmente editables con variables (`[ENTRY_NAME]`, `[ENTRY_EMAIL]`, `[REFER_URL]`, `[END_TIME]`), y **autenticación de dominio opcional** "so we can send **on your behalf** with better deliverability". Además el branding de la plataforma en el footer es **función del plan** (Starter lleva branding ViralSweep, Business va sin marca).

**(c) `From` de plataforma + `Reply-To` del organizador (el más común en ticketing).**
**Ticket Tailor**: el email de la cuenta del organizador se usa **por defecto como `reply-to`** de las confirmaciones "para que los asistentes te respondan directo a ti"; se puede cambiar si no querés exponerlo, pero sus T&C advierten que **igual te derivan a vos todas las consultas y reclamos**. Para difusión masiva usan un `From` híbrido con el nombre del box office: `myboxoffice@ticketnotification.com` — dominio de plataforma, **local-part del tenant**.
**Eventbrite**: el `reply-to` de la confirmación es configurable por el organizador.
**RallyUp**: los emails de contacto se responden **desde la cuenta propia del organizador**, no vía el sistema.

**El manual del proveedor.** Postmark documenta las tres opciones y sus costos exactos, y aplica igual a Resend:
1. **From-name only** sobre tu dominio — costo cero para el tenant; riesgo: clientes de correo guardan mal el contacto → mitigación recomendada **`"Jane Customer via (vendor)"`**; el `Reply-To` puede apuntar al organizador.
2. **Dirección verificada del tenant** (verificación por click, sin DNS) — mejor alineación de marca, pero sin DKIM/Return-Path alineados **Gmail y Outlook muestran el tag "via" / "on behalf of"**.
3. **Dominio propio autenticado** (DKIM + Return-Path) — mejor entregabilidad y marca, pero exige DNS del tenant y bastante ingeniería/soporte.
Su recomendación explícita: *"empezá simple y expandí con el tiempo"*. Práctica adicional que aparece en foros de operadores multi-tenant: **separar streams transaccional y marketing** para aislar reputación entre tenants.

**Dato específico de Sortéatelo (BYO-Flow):** hay un remitente que ya existe y no controlamos. **Flow envía por su cuenta el comprobante de pago al pagador** cuando la transacción se confirma (y notifica al comercio y al sistema vía API). Si el comprador está registrado en Flow con ese mismo correo puede recuperar el comprobante en "Comprobantes". Precedente idéntico: en **GalaBid**, "una vez pagado el ticket se le envía al comprador un recibo de pago **desde tu cuenta de Stripe**", y el correo de la plataforma es el de *tickets/números*. Conclusión práctica: **el recibo fiscal-ish ya lo cubre Flow con el `From` del organizador**; nuestro correo no debería competir con él sino ser el de **números + acceso al PDF**.

---

## 3. Otros correos transaccionales alrededor de la compra

| Correo | Quién lo hace |
|---|---|
| **Reserva/apartado de boletos** (antes de pagar) | RifaBase; Paga Tu Rifa ("Recibo de Pedido"); YoSorteo.cl (comprobante + n° de pedido para transferir) |
| **Pago aprobado / ticket confirmado** (2º correo, con números) | Paga Tu Rifa ("Ticket Digital Confirmado"); RifaBase |
| **Modificación de la compra** | RifaBase manda correo ante cualquier cambio en la compra |
| **Recibo/invoice separado del ticket** | GalaBid manda **invoice aparte** a quien dejó email (y recibo de pago desde Stripe); Zeffy separa *thank-you* + *tickets/tax receipt* + *payment receipt* en un mismo envío |
| **Notificación de venta al organizador** | Diseño Digital, LaOOZ, Ticket Tailor (destinatario de "new order notifications" configurable) |
| **Recordatorio antes del cierre del sorteo** | Zeffy y RallyUp publicitan "reminder emails automatizados y personalizables"; Rafflebox ofrece "purchase reminders" |
| **Aviso de sorteo realizado (a todos, no solo al ganador)** | **Raffall**: *todos* los participantes reciben email cuando el sorteo se completa y deben **revisar sus tickets** para ver si ganaron — buen patrón anti-suspicacia |
| **Notificación al ganador** | Mayormente **NO automatizada**: Rafflecopter deja explícitamente que el organizador escriba al email dejado por el participante; Rafflebox: "tu organización es responsable de seleccionar, contactar y pagar al ganador" (con plantillas); Raffall: contacta el host. RallyUp y GalaBid sí ofrecen aviso automático. En Rafflebox el número ganador aparece en la página pública **24h después del cierre** |
| **Fallo de pago** | ⚠️ **No documentado por ninguna** de las plataformas revisadas como correo transaccional propio. Lo que sí existe es el **vencimiento del apartado**: Sorteos Tec advierte que si no se recibe el pago en el plazo indicado en la confirmación electrónica, los boletos reservados se liberan. El aviso de rechazo lo suele dar la pasarela, no la plataforma |
| **Reenvío manual de la confirmación** | Rafflebox (Orders → Show Details → **Email Order**, + descarga de PDF), RallyUp (resend receipt), Lemon Squeezy (resend receipt). **Es una feature de soporte universal** — la primera consulta de soporte de todas es "no me llegó el correo, revisa spam" (Rafflebox pide esperar **30 minutos** antes de abrir ticket) |

---

## 4. Tono y estructura

- **Subject lines**: ⚠️ ninguna de las plataformas publica el asunto literal de su confirmación de compra en la documentación pública — ni Rafflebox, ni RallyUp, ni GalaBid, ni Zeffy. Lo único citable es el **naming interno de los correos**, que funciona como asunto de facto: **"Recibo de Pedido"** y **"Ticket Digital Confirmado"** (Paga Tu Rifa), **"Ticket Purchase Confirmation"** (Rafflebox). En asuntos de ganador sí hay ejemplos publicados: **"You've won!"** y **"Congrats, [Winner's Name], you're our raffle winner!"**. La recomendación de copy más citada en el nicho fundraising es asunto de **≤5 palabras**.
- **Estructura canónica** (destilada de Rafflebox + Zeffy + RallyUp), en este orden:
  1. Agradecimiento en voz del organizador ("Thank you for your support") — Zeffy la trata como **mensaje personalizado editable por la organización**, primer bloque del correo.
  2. Nombre del sorteo/campaña + banner.
  3. **Los números, destacados visualmente** y precedidos de una frase que los anuncia ("Your ticket numbers are below").
  4. Resumen de orden: n° de orden, fecha/hora, monto, cantidad.
  5. Cuándo y dónde es el sorteo.
  6. Bloques legales editables + identificador regulatorio (licencia) en el footer.
- El correo es **artefacto de cumplimiento**, no solo UX: Rafflebox tiene un flujo entero dedicado a *"generar un email de ejemplo para la licencia"* porque el regulador lo pide antes de autorizar la rifa. Análogo directo de nuestro ADR-0008 (bases + disclaimer del Organizador).
- La **voz siempre es del organizador**, la **infraestructura siempre es de la plataforma**. Ningún producto revisado firma la confirmación como plataforma.

---

## 5. Lectura para Sortéatelo (implicancias, no decisiones)

1. **Números en el cuerpo del correo, no detrás de un link.** Rafflebox, RallyUp, TicketSpice y DoJiggy los mandan; GalaBid y LaOOZ obligan a ir a la web. Sin cuentas de comprador (ADR-0004), el modelo "link a mi cuenta" de GalaBid no aplica — el correo **es** el comprobante.
2. **Rangos, no listas.** El `W100–W150` de RallyUp resuelve el caso "compró 50 números" sin un correo ilegible. Un prefijo por canal (online/manual/bonus) sale gratis ahora y es carísimo retroactivamente.
3. **Número asignado solo con pago confirmado server-side** — el "TBD hasta *Completed*" de TicketSpice coincide con ADR-0001.
4. **Un correo, no dos.** Al no haber flujo de transferencia con apartado (el caso de Paga Tu Rifa/RifaBase), Flow confirma sincrónicamente: un solo correo post-webhook con números + acceso al PDF, y el **comprobante de pago lo manda Flow desde la cuenta del Organizador**.
5. **Remitente: arrancar en el nivel 1 de Postmark** — `From` de dominio propio de la plataforma (subdominio dedicado tipo `tickets.sorteatelo.cl`, como hacen Rafflebox y Zeffy), **`From Name` = nombre de la Tienda**, patrón `"<Tienda> vía Sortéatelo"`, y **`Reply-To` = email de contacto del Organizador** (Ticket Tailor, Eventbrite). Dominio propio del tenant, si alguna vez, como upgrade estilo Zeffy. Advertencia de Ticket Tailor que conviene copiar al ToS: **las consultas de compradores se derivan al Organizador**.
6. **Campos editables por tenant desde el día uno**: mensaje de agradecimiento (Zeffy), header/footer legales y datos del sorteo (Rafflebox). El correo lleva el disclaimer y el link a las bases del ADR-0008.
7. **El acceso al PDF debe ser una página que re-firma la URL** (patrón "View content" de Gumroad), no la URL firmada pegada en el correo, que expira y genera soporte.
8. **Reenvío de confirmación desde el panel del Organizador**: feature universal en las 4 plataformas serias, y es *el* ticket de soporte #1.
9. Considerar el **email post-sorteo a todos los participantes** (Raffall): barato, y es la mejor defensa reputacional contra "esto está arreglado" en un mercado chileno donde la vara (YoSorteo.cl) es mail manual al ganador.
10. **WhatsApp es el canal esperado en LATAM** (YeaZ, MasRifas lo ponen antes que el email). Fuera de alcance hoy, pero explica por qué la confirmación por correo debe ser **reenviable y screenshot-eable**: los compradores la comparten por WhatsApp igual.

---

## Fuentes

- [Rafflebox — How to Edit & Generate a Sample Ticket Purchase Confirmation Email](https://help.rafflebox.ca/how-to-generate-an-email-example-for-licensing) · [How to Send a Ticket Confirmation Email](https://help.rafflebox.ca/how-to-to-send-a-ticket-confirmation-email) · [Ticket Buyer Support](https://www.rafflebox.ca/ticket-buyer-support) · [FAQ](https://www.rafflebox.ca/faq)
- [RallyUp — How Raffle and Sweepstakes Entry Numbers Are Assigned](https://learn.rallyup.com/insignts-and-best-practices/how-are-entry-numbers-assigned) · [Find Your Entry Numbers](https://rallyup1.helpjuice.com/en_US/raffles-and-sweepstakes-general-questions/how-do-i-find-my-ticket-numbers) · [What to Do If a Donor Doesn't Receive a Receipt](https://rallyup.com/learn/insights-what-to-do-if-a-donor-doesnt-receive-a-receipt/) · [Raffles](https://rallyup.com/raffles/)
- [GalaBid — What email or text message notification is sent to a raffle ticket purchaser?](https://support.galabid.com/fundraising-help-center/article/how-do-raffle-purchasers-receive-their-online-tickets) · [Platform Features](https://www.galabid.com/platform-features)
- [TicketSpice — Sell raffle tickets and export numbers](https://help.ticketspice.com/en/articles/8709734-sell-raffle-tickets-and-export-numbers)
- [DoJiggy — How do I find my raffle ticket numbers?](https://support.dojiggy.com/hc/en-us/articles/39979875850515-How-do-I-find-my-raffle-ticket-numbers)
- [Zeffy — Customizing your email sender domain](https://support.zeffy.com/customizing-your-email-sender-domain-hjzl1) · [Transaction and payment receipts](https://support.zeffy.com/transaction-and-payment-receipts-in-zeffy-59zve) · [Online Raffle for Nonprofits](https://www.zeffy.com/en-gb/home/online-raffle-nonprofit)
- [ViralSweep — Email Notifications](https://support.viralsweep.com/en/articles/9272709-email-notifications)
- [Ticket Tailor — Terms and Conditions (reply-to)](https://www.tickettailor.com/legal/terms-and-conditions) · [Email broadcasts](https://help.tickettailor.com/en/articles/2410288-how-to-send-announcements-to-your-ticket-buyers-using-email-broadcasts) · [Edit order confirmation email](https://help.tickettailor.com/en/articles/8015413-how-to-edit-your-order-confirmation-email)
- [Raffall — Ticket confirmation and draw notification emails](https://help.raffall.com/hc/en-gb/articles/360017872219-Ticket-confirmation-and-draw-notification-emails) · [Enter as a Guest](https://help.raffall.com/hc/en-gb/articles/18837621807900-Can-I-Enter-a-Raffle-as-a-Guest-or-without-Signing-Up)
- [Rafflecopter — How do I choose & contact winners?](https://kb.rafflecopter.com/hc/en-us/articles/204521649-How-do-I-choose-contact-winners-for-my-giveaway) · [Contacting Your Winners](http://learn.rafflecopter.com/ending-your-giveaway/contacting_your_winners.html)
- [SupporterHub — Digital Raffles](https://supporterhub.com/product/digital-raffles/)
- [Paga Tu Rifa](https://pagaturifa.com/) · [RifaBase / sistemaderifas.net](https://rifabase.com/) · [Diseño Digital — Sistema de Rifas y Sorteos](https://disenodigitalec.com/informativo/sistema-de-rifas-y-sorteos/) · [LaOOZ](https://laooz.com/sistema-de-rifas/) · [YeaZ Rifas](https://yeazrifas.com/) · [MasRifas](https://masrifas.com/) · [RIFARITO](https://www.rifarito.com/)
- [YoSorteo.cl — Preguntas frecuentes](https://yosorteo.cl/preguntas-frecuentes/) · [WebUnica — Sistema Rifas Sorteos WooCommerce](https://webunica.cl/sistema-rifas-sorteos-woocommerce/)
- [Flow Chile — Ayuda / Preguntas frecuentes](https://web.flow.cl/es-cl/ayuda/)
- [Postmark — How to send on behalf of your customers](https://postmarkapp.com/guides/agencies-sending-on-behalf-of-users) · [Discuss@Bootstrapped.fm — outbound transactional customer email](https://discuss.bootstrapped.fm/t/how-do-you-handle-outbound-transactional-customer-email/4842)
- [Gumroad — How do I access my purchase?](https://gumroad.com/help/article/199-how-do-i-access-my-purchase.html) · [Lemon Squeezy — Resend Receipt](https://docs.lemonsqueezy.com/help/orders/resend-receipt)
- [Vanco — How to Announce Raffle Winners (subject lines)](https://www.vancopayments.com/non-profit/blog/raffle-winner-announcement) · [Sorteos Tec — ¿Qué pasa si no pago los boletos?](https://www.laps4.com/preguntas-y-respuestas/que-pasa-si-no-pago-los-boletos-del-sorteo-tec)

---

# Informe: recordatorios

# Recordatorios previos a un deadline — investigación de campo

**Contexto:** Sortéatelo (Chile), compradores sin cuenta (ADR-0004), Resend (ADR-0010), multi-tenant con remitente por tienda.
**Fecha de la investigación:** 2026-07-26. Marco de confianza: **[A]** = documentación oficial del producto; **[B]** = blog de la propia plataforma / vendor; **[C]** = agregador de benchmarks o foro (tratar como indicio, no como dato duro).

---

## 1. Cadencia: cuántos correos y cuándo

### Lo que hacen las plataformas reales (no lo que recomiendan los blogs)

| Plataforma | Correos previos al deadline | Momentos exactos | Nota |
|---|---|---|---|
| **Kickstarter** ("Remind me") | **2** | **48 h** antes del cierre + **8 h** antes | Solo a quien tocó "Remind me" y **NO ha respaldado todavía**. Quien ya es backer queda excluido de esos recordatorios. [A] |
| **Eventbrite** | **1 automático** | **48 h** antes del evento | *"With Eventbrite, reminder emails are automatically sent 48 hours before the event"*. El organizador puede desactivarlo y armar los suyos. [B] |
| **eBay** ("ending soon") | **1** | Hoy ~**24 h** antes (históricamente eran 5–15 min antes; hay quejas activas por el cambio y por avisos que llegan *después* del cierre) | Es push/notificación, no un embudo de correos. Desactivable en *Communication preferences → "Auction item ending soon"*. [A]/[C] |
| **RallyUp** (rifas benéficas) | Configurable por el organizador | Fecha/hora que él elige | Lo notable es lo del cierre (ver §3), no lo previo. [A] |
| **Rafflebox** (rifas / 50-50) | Correos de *"purchase reminders"* configurables | A discreción del organizador | El correo de confirmación ya trae **números de ticket + fecha del sorteo**. [B] |

**Hallazgo #1 — el estándar de la industria para un deadline duro son 2 correos, no 4.** Kickstarter, que vive literalmente de la conversión en las últimas horas y tiene datos de millones de campañas, se conforma con **48 h + 8 h**. Eventbrite manda **uno solo** por defecto.

### Lo que recomienda el consenso de lifecycle email

- **Eventos presenciales/webinars:** 2–3 recordatorios es el "sweet spot": *una semana antes + un día antes + el día del evento*; para virtual, *1 día + 1 hora*. Más allá de tres, "extra messages deliver sharply diminishing returns and rising unsubscribe risk". [C]
- **Eventbrite (su propio blog):** 1 semana antes + 48 h antes. Para virtual: 1 día + 1 hora. [B]
- **Campañas de rifa online:** el rango citado es **3 a 5 correos por campaña completa** (lanzamiento + 1–2 recordatorios + resultado/agradecimiento), advirtiendo explícitamente sobre "email fatigue that leads people to opt out". [C]
- **Flash sale (Klaviyo):** recordatorio a **8 h** del cierre y un *"final hours"* **2–4 h** antes. [B]

### Evidencia sobre "cuántos son demasiados"

- Tasa de baja por frecuencia: **<1 correo/mes → 0,87 %**; 1–3/mes → 0,54 %; **1/semana → 0,38 %**; 2/semana → 0,33 %; diario → 0,36 %. La curva es contraintuitiva (mandar *poco* también sube la baja, por olvido), pero el mínimo está alrededor de 1–2/semana. [C]
- **Tipo de envío importa más que la cantidad:** unsubscribe de **transaccionales 0,067 %**, envíos programados 0,077 %, **automatizados/flows 0,182 %** — un flujo de recordatorios se comporta ~2,5× peor que un correo transaccional puro. [C]
- Benchmarks 2026: baja promedio 0,46 %; **<0,5 % se considera sano**; MailerLite reporta que su promedio saltó de 0,08 % (2024) a 0,22 % (2025) — la tolerancia del inbox está bajando. [C]
- Motivo #1 declarado de baja: **31 % "demasiados correos saturando el inbox"**; 28 % contenido repetitivo. **90 % quiere poder elegir frecuencia y tipo** de correo que recibe. [C]

**Recomendación aterrizada a Sortéatelo:** para un sorteo con fecha de cierre, **máximo 3 toques**, y solo 2 si el sorteo dura menos de 2 semanas:

1. **T-7 días** — solo si el sorteo dura >14 días. Informativo + "tus números".
2. **T-48 h** — el ancla de la industria (Kickstarter/Eventbrite coinciden).
3. **T-6/8 h** o "última noche" — el que efectivamente convierte (Kickstarter 8 h; Klaviyo 2–4 h).

Y un principio robado a Kickstarter que vale oro en un modelo de "compra más números": **segmentar por si ya compró**. El que ya tiene números recibe un recordatorio informativo ("tu sorteo cierra, estos son tus números"); el que abandonó el carrito recibe el de urgencia con CTA de compra. Mezclar ambos es lo que dispara las bajas.

---

## 2. Contenido de cada recordatorio

**¿Repiten los números del participante?** Sí, y es la práctica que más diferencia una rifa de una promo genérica:

- **Rafflebox:** *"Ticket buyers receive automatic emails with their ticket numbers, draw details and payment confirmation immediately after making a purchase"*; la **fecha del sorteo aparece en el correo de confirmación** además de en la landing. [B]
- **Omaze:** cada entrada comprada recibe **un número único**, y *"the earlier you enter, the more reminders you receive"* — es decir, la cadencia se modula por antigüedad de la compra, no es fija. [C]
- **RaffleSites / plataformas de competencias:** personalización del tipo *"You've entered 3 raffles this month — don't miss this one"* para compradores previos. [B]

**Countdown:** es la técnica dominante y hay números, aunque son de vendors de countdown widgets (leer con pinzas):

- Timers "genuinos" (atados a un deadline real) reportan +20–35 % de conversión; +25 % CTR. Caso citado: flash sale 3,1 % → 6,4 % con timer. [C]
- La advertencia repetida en todas las fuentes: **"Never use fake urgency — it destroys trust"**, y el timer debe ir arriba del correo. [B]/[C]

**CTA — informar vs. vender más:** aquí las plataformas se dividen y esto es la decisión de diseño clave:

- **Kickstarter** manda el recordatorio **solo a no-backers** → CTA puro de conversión, sin conflicto. A los backers existentes les recomienda al creador mandar un mensaje entre las 60 h y 48 h para que **suban su pledge**, pero con la advertencia de que "they appreciate the option **without pressure**". [B]
- **Eventbrite** (ya compraron): contenido operativo — fecha, hora, lugar, cambios de último minuto, FAQ, y CTA blandos (agregar al calendario, invitar a un amigo). Explícito: *"mantener el mensaje breve y enfocado, evitando gráficos complicados"*. [B]
- **Rifas:** subject lines de escasez tipo *"Last 2 Days to Enter"*, *"Only 3 Days Left to Enter"*, con **un solo botón** grande al link de la competencia, y —dato útil— **mostrar cuántos tickets se han vendido "si el número impresiona"**. [B]

**Estructura sugerida para el recordatorio de Sortéatelo** (mezcla de lo anterior):
`Tu sorteo en <tienda> cierra en X` → **tus N números listados** (es el activo emocional y además reduce el "¿me llegó o no?" a soporte) → countdown/fecha exacta con zona horaria (Omaze cierra 23:59:59 con timezone explícita en las bases) → CTA único ("Comprar más números" para el que puede; "Ver mis números" para el que solo debe ser informado) → link a las bases del sorteo (ADR-0008: la responsabilidad legal es del Organizador, y el disclaimer debe viajar en el correo, no solo en la web).

---

## 3. Correo de resultado (ganador y no-ganadores)

Este es el punto donde las plataformas de rifas son *más* explícitas que las de crowdfunding, y donde tienes producto que copiar casi 1:1:

- **RallyUp** tiene dos flujos separados y ambos automáticos:
  - **Ganadores:** *"Automatic winner notifications are sent on the date and time you specify during Campaign Setup"*. [A]
  - **No ganadores:** *"you can select how to notify non-winners: automatically by email on a specified date and time, or choose not to notify them"*. **El default es notificar.** Y un detalle de diseño importante: *"The names of winners are automatically added to the non-winner email. If you don't want to share the names of the winners, please delete this section in the customized email."* → o sea, **el nombre del ganador se publica por defecto pero es removible** (esto en Chile toca directo la Ley 21.719: publicar el nombre de un ganador es tratamiento de dato personal y necesita base de licitud; hazlo configurable y con aviso en las bases). [A]
- **Racional del "no ganaste":** la primera reacción es decepción, así que el objetivo del correo es **consuelo + retención**: agradecer, ofrecer algo (código de descuento, acceso anticipado al próximo sorteo) e invitar a la siguiente. Plantilla citada: *"While we couldn't pick everyone as a winner, your participation means the world to us. As a token of appreciation, here's a [discount code/perk]."* [B]
- **Correo al ganador:** subject celebratorio con el nombre, premio, **instrucciones de reclamo + fecha límite para reclamarlo**, y un canal de preguntas. La fecha límite no es adorno: es lo que te protege cuando el ganador no responde. [B]
- Se recomienda además **anunciar el resultado a todos** (no solo al ganador) porque *"having a clear and smooth process for winner notification will increase their chances of entering again"* — el correo de resultado es el principal driver de recompra en la siguiente rifa. [B]

**Para Sortéatelo:** 2 plantillas distintas disparadas por el mismo evento (`sorteo.resuelto`), con el correo a no-ganadores incluyendo **los números que jugaron y el número ganador** (transparencia = la moneda de una rifa online), más el link a la verificación del sorteo. Considerá que el no-ganador es exactamente el público del próximo sorteo del tenant.

---

## 4. Cumplimiento

### 4.1 ¿Transaccional o marketing?

**El test es el "primary purpose", no la etiqueta que le pongas al job de cron.**

- FTC/CAN-SPAM: es "transactional or relationship" si el contenido **solo** facilita/completa/confirma una transacción ya acordada, o notifica un cambio en los términos o en el *standing* del destinatario dentro de la relación. Esos están **exentos del opt-out**. [A]
- Y la trampa explícita: *"Simply having a relationship with a consumer as a subscriber or member doesn't transform a marketing message… into a 'relationship' message"*. Si el correo mezcla, **el primary purpose decide**. [A]

**Traducción a tu caso:** "Tu sorteo cierra el viernes, estos son tus 12 números" = plausiblemente transaccional/relacional (informa el estado de algo que el comprador ya pagó). **"Te quedan 6 horas — compra más números"** = **comercial**, sin discusión. En cuanto el CTA principal es vender, el correo es marketing y necesita opt-out.

Postura defendible y simple: **tratar TODOS los recordatorios como marketing** (con unsubscribe), y dejar como transaccional solo confirmación de compra, entrega del PDF, y el correo de resultado del sorteo. Es más barato que discutir el primary purpose de cada plantilla.

### 4.2 Gmail/Yahoo (esto muerde antes que la ley)

- Bulk sender = **5.000+ mensajes/día**: exige DMARC + alineación de dominio, **one-click unsubscribe (RFC 8058: `List-Unsubscribe` + `List-Unsubscribe-Post`)** en correo *marketing*, honrar la baja **en ≤2 días**, y **spam rate <0,3 %** (mitigación recién con 7 días consecutivos bajo el umbral). Los transaccionales quedan excluidos del one-click. Google escaló de retrasos temporales a **rechazos permanentes en noviembre de 2025**. [A]/[C]
- **Implicancia multi-tenant específica de Sortéatelo:** el umbral y la reputación se miden por dominio/IP remitente. Si todas las tiendas mandan desde `@sorteatelo.cl`, **una tienda que abuse te quema la reputación de todas** — y con recordatorios de rifa el riesgo de "esto es spam" es alto. Vale la pena diseñar desde ya: subdominio de envío separado para marketing (`mail.sorteatelo.cl`) vs transaccional, o dominio verificado por tenant en Resend.

### 4.3 Resend — lo que ya te da resuelto

- **Broadcasts + Audiences:** poné `{{{RESEND_UNSUBSCRIBE_URL}}}` y Resend maneja el flujo de baja y **agrega los headers de unsubscribe automáticamente conforme a los requisitos de Gmail/Yahoo 2024**. [A]
- **Transaccionales:** Resend *no* gestiona listas ahí; si querés `List-Unsubscribe` en un transaccional, lo agregás vos por API. [A]
- **Unsubscribe Topics:** permite topics granulares ("Recordatorios de sorteo" vs "Novedades de la tienda"). Ojo con la jerarquía: *"If a Contact's Subscribed status is false, they will not receive emails from your account, even if they have opted in to a specific Topic."* → el `subscribed` global manda sobre los topics. [A]
  Esto ataca directo el hallazgo de que **90 % de la gente quiere controlar frecuencia y tipo**: dar "solo recordatorios del sorteo que compré" como opción evita la baja total.

### 4.4 Chile — dos regímenes, uno ya vigente y otro a 4 meses

**Ley 19.496 art. 28 B (vigente hoy).** Toda comunicación **promocional o publicitaria** por correo electrónico debe:
1. indicar **la materia o asunto** sobre el que versa,
2. **la identidad del remitente**, y
3. contener **una dirección válida** a la que el destinatario pueda **solicitar la suspensión de los envíos, que quedarán desde entonces prohibidos**. [A – SERNAC]

Notar que la norma chilena exige una **dirección válida** (correo/canal), no necesariamente un link — pero el link one-click es lo que exige Gmail, así que se implementan ambos.

**Sistema "No Molestar" (Reglamento publicado 13-feb-2020).** El consumidor se inscribe en SERNAC y desde ahí las comunicaciones promocionales quedan prohibidas. Los proveedores **registrados en el Portal del Proveedor reciben un reporte diario** con las solicitudes de suspensión y **deben responder dentro de 1 día hábil**. Usar el sistema **no exime** de ofrecer igualmente el canal propio de baja. Incumplir una solicitud legítima: **multas de hasta 300 UTM por consumidor afectado**. [B – Carey / DLA Piper / az]

**Ley 21.719 de datos personales — publicada 13-dic-2024, plena vigencia 1 de diciembre de 2026** (o sea: **en 4 meses**, y probablemente antes de que tu F08 self-service escale). [B]
- **Marketing directo requiere consentimiento específico**; el consentimiento debe ser *"libre, informado, específico, inequívoco y verificable"* y **quedan prohibidas las casillas premarcadas** (opt-in real).
- **El derecho de oposición es absoluto para marketing directo** (plazo de respuesta: 15 días hábiles).
- Lo transaccional se sostiene en la base **"ejecución de contrato"** — la confirmación de compra, la entrega del PDF y el resultado del sorteo no necesitan consentimiento separado.
- Sanciones: hasta **20.000 UTM**, y en reincidencia hasta **4 % de los ingresos anuales**.

**Consecuencias concretas de diseño para Sortéatelo:**

1. **Checkbox de opt-in NO premarcado en el checkout**, separado del "acepto las bases": *"Quiero recibir recordatorios antes del cierre del sorteo"*. Guardar **timestamp + IP + texto exacto mostrado** (el consentimiento debe ser *verificable* y eso es una columna en la DB, no una intención).
2. **Segmentar por tenant también el consentimiento.** El comprador consintió recibir correos de *esa tienda*, no de la plataforma ni de las otras tiendas. Con `tenantId` en el registro de consentimiento y en la audiencia de Resend.
3. **Quién figura como remitente define quién responde legalmente.** Coherente con ADR-0008 (la responsabilidad del sorteo es del Organizador), el `From` debería leerse como la tienda (`Nombre de la Tienda <no-responder@sorteatelo.cl>` vía `Reply-To` del Organizador) y el pie del correo debe traer la **identidad del remitente** (art. 28 B) — nombre/razón social del Organizador, no solo "Sortéatelo".
4. **Una baja por tienda, más una baja global.** Mapea 1:1 con el modelo de Resend (Topic por tenant + `subscribed` global), y cubre el "derecho de oposición absoluto".
5. **Honrar la baja en ≤1 día hábil** (No Molestar) y ≤2 días (Gmail) → en la práctica: efecto inmediato, chequeo de supresión en el momento del envío, no al armar la lista.
6. Si el Operador registra la plataforma en el **Portal del Proveedor de SERNAC**, hay que procesar el reporte diario de "No Molestar" — es un job, no un trámite único. Decidir si eso lo absorbe la plataforma o cae en cada Organizador (yo lo pondría en la plataforma: los Organizadores no lo van a hacer).

---

## Resumen ejecutable

| Correo | Tipo | Trigger | Opt-out |
|---|---|---|---|
| Confirmación de compra (con números + fecha de cierre) | Transaccional | Pago confirmado | No (base: ejecución de contrato) |
| Entrega de PDF (URL firmada) | Transaccional | Pago confirmado | No |
| Recordatorio T-7d *(solo sorteos largos)* | Marketing | Cron | Sí |
| Recordatorio T-48h | Marketing | Cron | Sí |
| Recordatorio T-6h / última noche | Marketing | Cron | Sí |
| Resultado — ganador | Transaccional | Sorteo resuelto | No |
| Resultado — no ganaste (+ números jugados + número ganador) | Transaccional* | Sorteo resuelto | No, *salvo* que incluya código de descuento/promo → entonces marketing |

\* Si le metés el "consolation discount" que recomiendan RallyUp y Vanco, el primary purpose se vuelve discutible. Solución barata: mandar el resultado limpio como transaccional, y el descuento como un correo aparte de marketing 24–48 h después.

**Techo duro sugerido:** nunca más de **3 correos de recordatorio por sorteo por comprador**, con supresión cruzada si el mismo email compró en varios sorteos del mismo tenant.

---

### Fuentes

- [What does the "Remind me" button do? – Kickstarter Support](https://help.kickstarter.com/hc/en-us/articles/115005126574-What-does-the-Remind-me-button-do) *(no fetchable directamente: 403; el contenido llegó vía índice de búsqueda)*
- [Live-Blogging Lesson #7: The 48-Hour "Remind Me" Message – Stonemaier Games](https://stonemaiergames.com/live-blogging-lesson-7-what-do-backers-look-for-when-returning-to-a-project-via-the-48-hour-remind-me-message/)
- [Kickstarter Lesson #33: The Final 48 Hours – Stonemaier Games](https://stonemaiergames.com/kickstarter-lesson-33-the-final-48-hours/)
- [Your Watchlist | eBay Help](https://www.ebay.com/help/buying/search-tips/watchlist?id=4046)
- [eBay Community — notificaciones de items por terminar](https://community.ebay.com/t5/Buying/How-to-get-notified-right-before-watched-item-ends/td-p/31798973/)
- [Event Reminder Emails: Templates, Examples + AI Assistance — Eventbrite](https://www.eventbrite.com/blog/event-reminder-email/)
- [Event Reminder Emails: What to Send and When — eventcloud](https://www.eventcloud.io/blog/event-reminder-emails-what-to-send-and-when)
- [The Pre-Event Email Sequence That Cuts No-Shows — Tickera](https://blog.tickera.com/event-email-reminder-sequence/)
- [How-to: Notify Raffle, Sweepstakes, and Auction Non-Winners — RallyUp](https://learn.rallyup.com/raffles-and-sweepstakes-general-questions/does-rallyup-notify-the-people-who-don%E2%80%99t-win)
- [How to Notify Raffle, Sweepstakes & Auction Winners — RallyUp](https://rallyup.com/learn/how-to-notify-raffle-sweepstakes-and-auction-winners/)
- [How to Announce Raffle Winners: Free Templates & Best Practices — Vanco](https://www.vancopayments.com/non-profit/blog/raffle-winner-announcement)
- [Rafflebox — 50/50 Raffle software](https://rafflebox.ca/raffle-software/5050-raffle/) y [Why emails are key in growing your raffle program](https://blog.rafflebox.ca/why-emails-are-key-in-growing-your-raffle)
- [Email Marketing for Raffle Competitions — RaffleSites](https://rafflesites.co.uk/resources/email-marketing-for-raffle-competitions-building-and-engaging-your-list)
- [The Best Way to Promote Your Virtual Online Raffle — BetterWorld](https://betterworld.org/blog/giveaways/the-best-way-to-promote-your-vitual-online-raffle/)
- [Omaze Subscriptions / entradas y recordatorios](https://omaze.co.uk/pages/enter-subscription) y [How do you contact and announce winners? — Omaze Support](https://support.omaze.com/hc/en-us/articles/217033928-How-do-you-contact-and-announce-winners-) *(403 al fetch)*
- [3 effective flash sale email templates — Klaviyo](https://www.klaviyo.com/blog/3-essential-flash-sale-emails-ecommerce-stores)
- [Create Urgency: Using Email Countdown Timers for Conversions — Mailchimp](https://mailchimp.com/resources/email-countdown-timer/)
- [Email Cadence & Frequency: Data-Backed Strategy — MailerLite](https://www.mailerlite.com/blog/email-cadence-and-frequency-best-practices)
- [Email Marketing Benchmarks: Region & Industry Data — Brevo](https://www.brevo.com/blog/email-marketing-benchmarks/)
- [Email Subscription Fatigue Statistics — Clean Email](https://clean.email/blog/insights/email-subscription-fatigue-statistics)
- [CAN-SPAM Act: A Compliance Guide for Business — FTC](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- [When sending commercial email, businesses can't unsubscribe from CAN-SPAM compliance — FTC](https://www.ftc.gov/business-guidance/blog/2023/08/when-sending-commercial-email-businesses-cant-unsubscribe-can-spam-compliance)
- [Email sender guidelines FAQ — Gmail Help](https://support.google.com/a/answer/14229414?hl=en)
- [What is RFC 8058? One-click unsubscribe — Mailgun](https://www.mailgun.com/blog/deliverability/what-is-rfc-8058/)
- [Add an unsubscribe link to transactional emails — Resend Docs](https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails)
- [Unsubscribe Topics — Resend](https://resend.com/blog/unsubscribe-topics) y [Manage subscribers with Resend Audiences](https://resend.com/blog/manage-subscribers-using-resend-audiences)
- [Ley 19.496, artículo 28 B — SERNAC Jurídico](https://www.sernac.cl/portal/609/w3-propertyvalue-58918.html)
- [No Molestar — SERNAC](https://www.sernac.cl/portal/618/w3-propertyvalue-62998.html)
- [Reglamento que regula el Sistema No Molestar o Antispam — Carey Abogados](https://www.carey.cl/reglamento-que-regula-el-sistema-no-molestar-o-antispam-es-aprobado-por-el-ministerio-de-economia) y [DLA Piper Chile](https://www.dlapiper.cl/2020/02/21/se-aprueba-reglamento-que-regula-el-sistema-no-molestar-o-antispam/)
- [Ley 21.719 de Protección de Datos Personales en Chile — GRC360](https://www.grc360.cl/blog/ley-21719-proteccion-datos-chile) y [RSM Chile](https://www.rsm.global/chile/es/news/ley-21719-proteccion-de-datos-personales)

---

# Informe: tecnica

# Informe: arquitectura del sistema de correos — Sortéatelo (Resend + Vercel + Next 14 pages router)

## 0. Corrección al brief (importante)

**El premise "Hoy NO existe ningún correo" es falso.** El repo ya tiene F04 entregado y funcionando:

- `src/server/services/correo.ts` — adapter Resend por `fetch` directo a `POST /emails` (sin SDK ni react-email, decisión D4/I7: cero deps nuevas).
- `src/server/domain/correo/enviarCorreoDescargaDeOrden.ts` + `plantillaDescarga.ts` — correo de descarga post-pago, con `from` = `"<Tienda> · vía Sortéatelo <no-reply@sorteatelo.cl>"` y `reply_to` = email del Organizador (membresía más antigua).
- `src/server/pago/conCorreoPostPago.ts` — decorator post-commit que dispara solo en la transición real `PENDIENTE→PAGADO`, en try/catch log-and-continue.
- `src/server/domain/correo/reenviarCorreoDescargaDeOrden.ts` — reenvío manual desde el panel.

O sea: **la decisión #2 del brief (multi-tenant sender) ya está tomada e implementada** — friendly-from de plataforma + reply-to del Organizador. Este informe la valida contra el estado del arte 2026 y se concentra en lo que falta: recordatorios agendados, idempotencia persistida, no bloquear el webhook, y webhooks de entregabilidad.

---

## 1. Resend en 2026 — superficie de API relevante

| Capacidad | Detalle | Fuente |
|---|---|---|
| `POST /emails` | `from`, `to` (máx 50), `subject`, `html`/`text`/`react`, `cc`, `bcc`, `reply_to`, `headers`, `tags`, `attachments` (40 MB), `scheduled_at`, `topic_id`, `template` | [API ref](https://resend.com/docs/api-reference/emails/send-email) |
| `scheduled_at` | ISO 8601 **o lenguaje natural** (`"in 1 hour"`, `"friday at 3pm"`). **Máximo 30 días** de anticipación (era 72 h; ampliado 17-abr-2025) | [changelog](https://resend.com/changelog/extended-email-scheduling) |
| Cancelar agendado | `POST /emails/{id}/cancel`. **No hay PATCH/reschedule** — reagendar = cancelar + recrear | [API ref](https://resend.com/docs/api-reference/emails/cancel-email) |
| `POST /emails/batch` | **Hasta 100 correos por llamada**. Soporta `scheduled_at`, `tags`, `headers`, `reply_to`, `Idempotency-Key`. **NO soporta `attachments`**. Devuelve un array de `{id}` **en el mismo orden** del request | [API ref](https://resend.com/docs/api-reference/emails/send-batch-emails) |
| Idempotency keys | Header `Idempotency-Key`, máx 256 chars, **ventana 24 h**. Solo en `POST /emails` y `POST /emails/batch`. Formato sugerido `<event-type>/<entity-id>`. `409` si misma key con payload distinto (reintentar no sirve); `409` también si otra request con esa key está en vuelo (ahí sí reintentar) | [docs](https://resend.com/docs/dashboard/emails/idempotency-keys) |
| `GET /emails/{id}` | Devuelve `last_event` (estado actual) + `scheduled_at`, `tags` → sirve para reconciliación pull sin webhooks | [API ref](https://resend.com/docs/api-reference/emails/retrieve-email) |
| Rate limit | **10 req/s por team**, todas las API keys suman. `429` al exceder; ampliable por solicitud | [API ref](https://resend.com/docs/api-reference/introduction) |
| Webhooks | Firmados con **Svix**: headers `svix-id`, `svix-timestamp`, `svix-signature`. Verificar con `resend.webhooks.verify()` o `npm i svix`. **Requiere raw body** | [docs](https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests) |
| Eventos | `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, `email.opened`, `email.clicked`, `email.scheduled`, `email.suppressed`, `email.received` + eventos de domain/contact/suppression | [docs](https://resend.com/docs/dashboard/webhooks/event-types) |
| Precio | Free: **3.000/mes con tope de 100/día y 1 dominio**. Pro $20/mes 50k. Scale $90/mes 100k | [resumen 2026](https://www.stackscored.com/pricing/transactional-email/resend/) |
| react-email | **6.0 (abril 2026)**: todos los componentes unificados en el paquete `react-email`; CLI puede subir templates a Resend (`npx react-email@latest resend setup`). Pages Router soportado | [blog 6.0](https://resend.com/blog/react-email-6) |
| List-Unsubscribe | **Resend NO inyecta** los headers RFC 8058 en `/emails` — hay que ponerlos a mano vía `headers`. Solo los Broadcasts los inyectan solos | [docs](https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails) |

### Trampas concretas para este repo

1. **El tope de 100/día del plan Free rompe un blast de recordatorios.** Un sorteo con 300 compradores = 300 correos en una hora. **Hay que pasar a Pro ($20/mes) antes de F07**, o el recordatorio se corta a la mitad silenciosamente. Es la restricción operativa más dura del informe.
2. **10 req/s** → los recordatorios deben ir por `POST /emails/batch` (chunks de 100), no en un `for` de `POST /emails`. 300 destinatarios = 3 llamadas en vez de 300.
3. **`tags` solo acepta ASCII alfanumérico + `_` + `-`** → sirve `tenantId` (cuid), `tipo`, `raffleId`; **no** sirve el nombre de la tienda.
4. **La ventana de idempotencia de Resend es 24 h** → no es un sustituto del ledger en DB para recordatorios agendados con días de anticipación. Es un cinturón, no los tirantes.

---

## 2. Remitente multi-tenant

### Lo que ya hacen los otros

- **Shopify**: si el Organizador no autenticó su dominio, el From se muestra como `su-correo@... via shopifyemail.com`; si el dominio del sender tiene DMARC en enforcement, Shopify **reescribe el From a `store+123@shopifyemail.com`** y reenvía las respuestas al correo elegido. Desde el 1-feb-2024 esa reescritura es automática para cumplir Gmail/Yahoo. ([Shopify Help](https://help.shopify.com/en/manual/intro-to-shopify/initial-setup/email-rewrites))
- **Eventbrite**: From siempre de Eventbrite (`noreply@eventbrite.com`, recordatorios desde `noreply@reminder.eventbrite.com` — **subdominio distinto para recordatorios**), y el organizador solo controla el **Reply-to**. ([Eventbrite Help](https://www.eventbrite.com/help/en-us/articles/484221/how-to-email-your-attendees-through-eventbrite/))

**Conclusión: el patrón ya implementado en Sortéatelo es exactamente el estado del arte.** No tocar el modelo. Confirmado como correcto:

```
From:     Tienda X · vía Sortéatelo <no-reply@sorteatelo.cl>
Reply-To: organizador@gmail.com
```

### Por qué es la única opción sana

El dominio del header `From:` **debe** estar alineado con SPF o DKIM para pasar DMARC. Si pusieras `organizador@gmail.com` en el `From`, Gmail tiene `p=none`… pero muchos organizadores usan dominios propios con `p=reject`, y ahí el correo se **rechaza duro**. Reply-To no participa de la autenticación → es gratis y seguro. ([Gmail sender guidelines](https://support.google.com/mail/answer/81126?hl=en))

### Requisitos Gmail/Yahoo 2024+ que aplican

Sortéatelo está muy por debajo de **5.000 mensajes/día a Gmail**, así que legalmente solo aplican los requisitos de "todos los remitentes":

- SPF **o** DKIM (Resend te da ambos al verificar el dominio)
- PTR válido y TLS (los pone Resend)
- Tasa de spam < 0,3% en Postmaster Tools
- RFC 5322, sin suplantar `From:` de Gmail

**Recomendación igual: cumplir el paquete de bulk sender completo desde el día 1** (SPF + DKIM + DMARC `p=none` alineado + one-click unsubscribe en recordatorios). Es gratis, y el umbral de 5.000/día se cruza rápido si el piloto escala.

### Tres cambios concretos que sí recomiendo

**(a) Mover el envío a un subdominio, y separar transaccional de recordatorio.**

Hoy el código usa `no-reply@sorteatelo.cl` (apex). Resend recomienda explícitamente subdominios, para no jugarse la reputación del dominio raíz y para señalar la intención al proveedor. ([Resend, add-a-domain](https://resend.com/docs/add-a-domain); [KB deliverability](https://resend.com/docs/knowledge-base/how-do-i-maximize-deliverability-for-supabase-auth-emails))

```
compras@notificaciones.sorteatelo.cl   ← confirmación de compra + descarga (transaccional puro)
sorteos@avisos.sorteatelo.cl           ← recordatorios (bulk, con unsubscribe)
```

Esto es **la decisión más barata y de mayor palanca del informe**: un blast de recordatorios que junte quejas de spam no contamina la entregabilidad de los PDFs comprados, que es el correo que *no puede fallar*. Es exactamente lo que hace Eventbrite (`reminder.eventbrite.com`). Cada subdominio se verifica por separado en Resend. Cuesta: 1 constante en `plantillaDescarga.ts` + registros DNS.

> Nota: el plan Free permite **1 solo dominio** → otro argumento para Pro antes de F07.

**(b) `List-Unsubscribe` + `List-Unsubscribe-Post` en los recordatorios (no en la confirmación de compra).** Resend no los inyecta en `/emails`; hay que mandarlos en `headers`. Requiere un token de baja + endpoint `POST /api/correo/baja/<token>` (sin login, ADR-0004) + una tabla de supresión `(tenantId, email)`.

**(c) Riesgo estructural del dominio compartido: un tenant tóxico quema a todos.** Mitigación mínima viable sin infra nueva: la tabla de log (§3) + los webhooks de bounce/complaint (§4) permiten detectar qué tenant genera las quejas y suspenderle el envío. La escalada futura (F08+) es la **Domains API de Resend** (`POST /domains`, `POST /domains/{id}/verify`) para que un tenant grande traiga su propio dominio — el link de verificación **expira a los 7 días**. Además Resend soporta **Custom Return Path** (default `send.tudominio.tld`), pensado justamente para multi-tenant. ([changelog](https://resend.com/changelog/custom-return-path)) **Fuera de alcance hoy** — pero el seam a dejar es que `construirFrom()` reciba el dominio de envío como dato, no como constante.

---

## 3. Scheduling de recordatorios

### Comparación

| Opción | Costo | Pros | Contras para Sortéatelo |
|---|---|---|---|
| **Vercel Cron + scan** | $0 (incluido) | Cero vendors nuevos; el job es un `SELECT` + N batches; se testea como cualquier use case; secured con `CRON_SECRET` | Hobby = **1 vez/día** y ejecución en cualquier momento *dentro de la hora*, función máx 10 s. **Pro = por minuto, 300 s.** UTC puro, **sin DST** (Chile tiene DST → convertir en código). Delivery **best-effort: puede perder Y puede duplicar corridas** |
| **Resend `scheduled_at`** | $0 | Fire-and-forget en el momento de la compra | **Máx 30 días** (una ventana de sorteo puede ser mayor); el contenido depende del estado *al momento del envío* (nº de tickets, sorteo cerrado antes, tenant suspendido, fecha movida); no hay PATCH → cada cambio obliga a persistir el `email.id`, cancelar y recrear. **Estado de scheduling duplicado en un tercero.** |
| **Vercel Queues** | $0,60 / 1M ops | Nativo del stack | **Beta pública desde feb-2026**; agrega un concepto de infra para un job que son 3 llamadas HTTP |
| **Inngest** | Free 50k ejecuciones/mes, Pro $99 | Steps durables, `sleep`, fan-out, reintentos, control de concurrencia; integración Vercel Marketplace que setea las envs sola | Vendor nuevo + su SDK dentro del bundle; **el salto de precio Free→Pro es $99/mes**, brutal para un SaaS chico |
| **trigger.dev** | Free 1k runs/mes, $20/mes 10k; **self-host Apache-2.0** | Self-hostable | Free tier muy chico; self-host = infra que contradice "simple y barato" |

### Recomendación: **Vercel Cron horario + ledger en Postgres + batch API de Resend**

```json
// vercel.json
{ "crons": [{ "path": "/api/cron/recordatorios", "schedule": "0 * * * *" }] }
```

- **Requiere plan Pro de Vercel** (Hobby está capado a 1/día y a 10 s de ejecución). Ya está asumido por ADR-0015.
- Proteger con `CRON_SECRET`: Vercel manda `Authorization: Bearer <CRON_SECRET>` automáticamente. ([docs](https://vercel.com/docs/cron-jobs/manage-cron-jobs))
- **UTC only, sin DST.** No codificar "9 AM Chile" en la expresión cron. Correr cada hora y calcular en el use case con `America/Santiago` (`Intl.DateTimeFormat` con `timeZone` alcanza; no hace falta dep nueva).
- **Reconciliación, no disparo puntual.** La doc de Vercel es explícita: *"cron delivery is best effort… can also occasionally invoke the same scheduled run more than once… design your operations to be idempotent and reconciliation-based"*. El job no pregunta "¿qué toca justo ahora?" sino **"¿qué recordatorios están vencidos y sin enviar?"** — así una corrida perdida se recupera sola a la hora siguiente.
- **`scheduled_at` de Resend como micro-optimización opcional dentro del job**, no como scheduler: si querés que el recordatorio salga a las 09:00 de Chile pero el cron corre a las 08:00, mandás con `scheduled_at`. Nunca como fuente de verdad del agendamiento.

### Idempotencia: ledger `CorreoEnviado` con claim-antes-de-enviar

```prisma
enum CorreoTipo   { CONFIRMACION_COMPRA, DESCARGA, RECORDATORIO_SORTEO }
enum CorreoEstado { PENDIENTE, ENVIADO, FALLIDO }

model CorreoEnviado {
  id          String       @id @default(cuid())
  tenantId    String
  tipo        CorreoTipo
  clave       String       // clave natural determinística — ver abajo
  email       String       // snapshot del destinatario
  proveedorId String?      // id de Resend (join con el webhook de entrega)
  estado      CorreoEstado @default(PENDIENTE)
  intentos    Int          @default(0)
  ultimoError String?
  enviadoAt   DateTime?
  createdAt   DateTime     @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Restrict)

  @@unique([tipo, clave])            // ← la llave de idempotencia
  @@index([estado, createdAt])       // barrido de PENDIENTE/FALLIDO
  @@index([tenantId, tipo])          // panel del Organizador
  @@index([proveedorId])             // lookup desde el webhook de Resend
}
```

**Claves naturales** (siguiendo la convención ya establecida en el repo: los uniques omiten `tenantId` redundante cuando el id padre ya es tenant-bound, igual que `RaffleEntry` y `DownloadGrant`):

| Tipo | `clave` |
|---|---|
| `CONFIRMACION_COMPRA` | `orderId` |
| `RECORDATORIO_SORTEO` | `${raffleId}:${offsetHoras}:${email}` |
| `DESCARGA` (reenvío manual) | `${orderId}:${nonce}` (el reenvío es intencionalmente repetible) |

**El protocolo (claim → send → confirm):**

1. **Claim**: `createMany({ data: [...], skipDuplicates: true })` — el mismo patrón que ya usa `aplicarEfectosPostPago` para las `RaffleEntry`. Devuelve el `count` real de filas creadas; las que ya existían no se reclaman. **Dos corridas concurrentes del cron no pueden reclamar la misma fila** → *no hace falta lock de Redis*, contra lo que sugiere la doc de Vercel para el caso general.
2. **Send**: leer las filas `PENDIENTE`, chunkear de a 100, `POST /emails/batch` con `Idempotency-Key: recordatorio-sorteo/${chunkId}`. La respuesta viene **en el mismo orden** del request → mapear `ids`.
3. **Confirm**: `updateMany` a `ENVIADO` + `proveedorId` + `enviadoAt`.

**Modo de falla elegido a propósito**: si el proceso muere entre (1) y (2), la fila queda `PENDIENTE` y **no** se manda el correo (falla segura, recuperable, visible). Lo inverso —enviar primero, registrar después— arriesga **duplicados**, que son irrecuperables y le queman la reputación al dominio compartido. Para un sorteo, un recordatorio duplicado es peor que uno tarde.

4. **Sweeper**: la misma corrida horaria arranca barriendo `PENDIENTE` con `createdAt < now - 10min` e `intentos < 3` → reintento automático. Después de 3, `FALLIDO` y visible en el panel del Operador.

**Costo total del diseño**: 1 modelo Prisma, 1 route de cron, 1 use case, 0 dependencias nuevas, 0 vendors nuevos, $0/mes marginal.

---

## 4. Disparo del correo de confirmación

### Lo que ya está bien (no tocar)

`conCorreoPostPago` es el patrón correcto y está bien argumentado en el propio código: post-commit (los tokens ya existen), solo en la transición real, try/catch log-and-continue para que un fallo de Resend nunca comprometa la venta ni el ack 200 a Flow. **El correo de confirmación de compra debe entrar por este mismo camino, no por una segunda ruta.**

### Cuatro gaps concretos

**(a) El webhook de Flow espera a Resend.** Hoy `await enviarCorreoDescarga(...)` está en el camino crítico de la respuesta a Flow. Si Resend tarda 8 s, Flow puede dar timeout y reintentar el webhook (que es idempotente, pero desperdicia y ensucia).

Solución para **Next 14 pages router**: `waitUntil` de `@vercel/functions` — soportado en API routes del pages router, encola trabajo que sobrevive al `res.status(200)`. (`after()` de `next/server` es Next 15.1+, **no aplica acá**.) ([Vercel docs](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package))

```ts
import { waitUntil } from "@vercel/functions";
// ...
waitUntil(enviarCorreoDescargaDeOrden({ db, correo, orderId, baseUrl }));
res.status(status).json(body);
```

Complementar con un **timeout duro en el adapter** (`AbortSignal.timeout(8000)` en el `fetch`): hoy `crearCorreoService` no tiene ninguno, y `waitUntil` tampoco sobrevive indefinidamente al apagado de la función.

**(b) Reintento inexistente.** Hoy el único plan B ante un fallo de Resend es que un humano note el problema y use el reenvío del panel. Con el ledger de §3: escribir la fila `PENDIENTE` **dentro de la misma `$transaction`** de `confirmarPagoDeOrden` (es un efecto post-pago más, junto a `DownloadGrant` y `RaffleEntry`), y enviar post-commit. Si el envío falla, la fila queda `PENDIENTE` y **el cron horario la drena sola**. El `console.error` invisible se convierte en backlog consultable. Esto unifica confirmación y recordatorios sobre una sola máquina.

**(c) Sin `Idempotency-Key`.** Agregar `Idempotency-Key: confirmacion-compra/${orderId}` al `POST /emails` es una línea y cubre la carrera entre un replay del webhook y el guard transaccional, dentro de la ventana de 24 h.

**(d) Sin visibilidad de entrega.** Recomiendo `POST /api/webhooks/resend`:

- Verificación **Svix** (`svix-id`/`svix-timestamp`/`svix-signature`) con **raw body** → en pages router hace falta `export const config = { api: { bodyParser: false } }`, igual que probablemente ya hace el webhook de Flow.
- Eventos a persistir: `email.delivered`, `email.bounced`, `email.complained`, `email.failed`, `email.suppressed` → join por `proveedorId`.
- **Valor real para el producto**: una tienda que vende PDFs y cuyo comprador tipeó mal el mail hoy tiene un agujero negro. Con esto el panel del Organizador muestra "el correo rebotó" y ofrece corregir + reenviar. Además acumula la lista de supresión que protege la reputación del dominio compartido.
- Se puede diferir a una fase 2: `GET /emails/{id}` → `last_event` da lo mismo en modo pull desde el mismo cron, sin endpoint nuevo ni Svix. **Empezar por el pull; el webhook cuando duela.**

---

## 5. Sobre react-email

**Recomiendo NO adoptarlo ahora.** El adapter actual habla HTTP crudo a propósito (D4/I7, cero deps) y `plantillaDescarga.ts` ya sanea headers contra inyección y escapa HTML. react-email 6.0 metería un render de React en el camino del webhook de pago para un beneficio marginal sobre 3 plantillas. ([blog 6.0](https://resend.com/blog/react-email-6))

**Reconsiderar cuando** las plantillas tengan que llevar la identidad visual per-tenant (logo/colores del `Tenant`) — ahí el HTML a mano sí se vuelve insostenible y `react-email` + `Tailwind` de su paquete paga.

Lo que sí conviene extraer ya: `CorreoInput` debe crecer con `headers?`, `tags?`, `scheduledAt?`, `idempotencyKey?`, y el service ganar un `enviarLote(inputs: CorreoInput[])` → `POST /emails/batch`. La interfaz sigue siendo nuestra, no la del SDK.

---

## 6. Resumen ejecutivo — decisiones recomendadas

1. **Remitente**: mantener friendly-from de plataforma + reply-to del Organizador (ya implementado, valida contra Shopify/Eventbrite). **Mover a subdominios y separar `notificaciones.` (transaccional) de `avisos.` (recordatorios).**
2. **Scheduler**: **Vercel Cron horario** (`0 * * * *`) con `CRON_SECRET`, reconciliation-based. No queue, no Inngest, no `scheduled_at` como fuente de verdad.
3. **Idempotencia**: modelo `CorreoEnviado` con `@@unique([tipo, clave])`, protocolo **claim (`createMany` + `skipDuplicates`) → send (`/emails/batch`) → confirm**, más `Idempotency-Key` de Resend como segunda línea. Sin locks distribuidos.
4. **Confirmación**: reusar `conCorreoPostPago`; agregar `waitUntil` + timeout en el `fetch` + fila `PENDIENTE` en la `$transaction` para reintento automático.
5. **Entregabilidad**: empezar con pull (`GET /emails/{id}` → `last_event`) desde el mismo cron; webhook Svix cuando haga falta.
6. **Bloqueante operativo**: **Resend Free (100/día, 1 dominio) no aguanta un blast de recordatorios ni la separación de subdominios → Pro $20/mes antes de F07.** Vercel Pro también es requisito (Hobby = cron 1/día, 10 s).

---

## Archivos relevantes

- `C:\Users\NicolásChaima\Desktop\PROGRAMACION\PERSONAL\libros-iselk\src\server\services\correo.ts` — adapter Resend (falta timeout, batch, idempotency key)
- `C:\Users\NicolásChaima\Desktop\PROGRAMACION\PERSONAL\libros-iselk\src\server\domain\correo\plantillaDescarga.ts` — `REMITENTE_CORREO = "no-reply@sorteatelo.cl"` (apex, mover a subdominio), `construirFrom()`
- `C:\Users\NicolásChaima\Desktop\PROGRAMACION\PERSONAL\libros-iselk\src\server\domain\correo\enviarCorreoDescargaDeOrden.ts`
- `C:\Users\NicolásChaima\Desktop\PROGRAMACION\PERSONAL\libros-iselk\src\server\pago\conCorreoPostPago.ts` — punto de inserción del ledger
- `C:\Users\NicolásChaima\Desktop\PROGRAMACION\PERSONAL\libros-iselk\src\pages\api\webhooks\flow.ts` — donde va el `waitUntil`
- `C:\Users\NicolásChaima\Desktop\PROGRAMACION\PERSONAL\libros-iselk\prisma\schema.prisma` — `Raffle.fechaFin` (base del scan), patrones de unique de `RaffleEntry`/`DownloadGrant` a replicar

---

## Fuentes

- [Resend — Send Email API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend — Send Batch Emails](https://resend.com/docs/api-reference/emails/send-batch-emails)
- [Resend — Cancel Email](https://resend.com/docs/api-reference/emails/cancel-email)
- [Resend — Retrieve Sent Email](https://resend.com/docs/api-reference/emails/retrieve-email)
- [Resend — Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend — API introduction (rate limits)](https://resend.com/docs/api-reference/introduction)
- [Resend — Webhook event types](https://resend.com/docs/dashboard/webhooks/event-types)
- [Resend — Verify webhook requests (Svix)](https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests)
- [Resend — Extended Email Scheduling (30 días)](https://resend.com/changelog/extended-email-scheduling)
- [Resend — Schedule API with Natural Language](https://resend.com/changelog/schedule-api-with-natural-language)
- [Resend — Custom Return Path](https://resend.com/changelog/custom-return-path)
- [Resend — Add and verify a domain](https://resend.com/docs/add-a-domain)
- [Resend — Unsubscribe en correos transaccionales](https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails)
- [Resend — Maximize deliverability (subdominios, DMARC)](https://resend.com/docs/knowledge-base/how-do-i-maximize-deliverability-for-supabase-auth-emails)
- [Resend — React Email 6.0](https://resend.com/blog/react-email-6)
- [Resend pricing 2026 (StackScored)](https://www.stackscored.com/pricing/transactional-email/resend/)
- [Vercel — Managing Cron Jobs (CRON_SECRET, idempotencia, best-effort delivery)](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Vercel — `@vercel/functions` / `waitUntil`](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)
- [Vercel — waitUntil disponible en Vercel Functions](https://vercel.com/changelog/waituntil-is-now-available-for-vercel-functions)
- [Vercel Queues — public beta](https://vercel.com/changelog/vercel-queues-now-in-public-beta) · [pricing](https://vercel.com/docs/queues/pricing)
- [Inngest — Pricing](https://www.inngest.com/pricing) · [Inngest en Vercel Marketplace](https://vercel.com/marketplace/inngest)
- [Google — Email sender guidelines](https://support.google.com/mail/answer/81126?hl=en)
- [Shopify — Displaying your store's sending email (reescritura del From)](https://help.shopify.com/en/manual/intro-to-shopify/initial-setup/email-rewrites)
- [Eventbrite — Email your registered attendees (reply-to)](https://www.eventbrite.com/help/en-us/articles/484221/how-to-email-your-attendees-through-eventbrite/)
- [MailChannels — Multi-tenant email deliverability 2026](https://www.mailchannels.com/multi-tenant-email-deliverability/)
- [AWS — Improve deliverability with tenant management in SES](https://aws.amazon.com/blogs/messaging-and-targeting/improve-email-deliverability-with-tenant-management-in-amazon-ses)

---

# Informe: repo

# Mapeo del repo — Sortéatelo (libros-iselk)

## 1. `prisma/schema.prisma` — modelos relevantes

Archivo: `prisma/schema.prisma` (553 líneas).

**`Tenant`** (`prisma/schema.prisma:118-179`) — entidad de plataforma, sin `tenantId` propio:
```prisma
model Tenant {
  id             String       @id @default(cuid())
  slug           String       @unique
  nombre         String
  estado         TenantStatus @default(ALTA)
  descripcion    String?
  logoUrl        String?
  colorPrimario  String?
  colorAcento    String?
  chromeJson     Json?
  instagramUrl   String?
  tiktokUrl      String?
  whatsappUrl    String?
  contactoEmail  String?   // email PÚBLICO de contacto (footer) — distinto de Order.email
  tosVersion     String?
  tosAceptadoAt  DateTime?
  tosAceptadoPor String?
  createdAt/updatedAt
  // relations: flowCredential, products, orders, orderItems, payments, raffles,
  // raffleEntries, downloadGrants, memberships, checkoutFields, checkoutFieldResponses,
  // storefrontPages, storefrontPageVersions, pageAssets
}
```

**`Order`** (`prisma/schema.prisma:237-254`) — identidad del comprador = su correo (ADR-0004):
```prisma
model Order {
  id        String
  tenantId  String
  email     String            // identidad del comprador
  estado    OrderStatus @default(PENDIENTE)  // PENDIENTE | PAGADO | FALLIDO
  total     Decimal @db.Decimal(15, 2)
  createdAt/updatedAt
  // items, payment, downloadGrants, raffleEntries, checkoutResponses
}
```

**`OrderItem`** (`prisma/schema.prisma:258-275`): snapshot inmutable de `precio`, `cantidad`, `participaEnSorteo`.

**`Payment`** (`prisma/schema.prisma:279-295`): `token`, `flowOrder`, `estado` (`PaymentStatus`), `monto`, `fee`.

**`Raffle`** (sorteo, `prisma/schema.prisma:315-347`) — **sí tiene fechas de cierre/realización**:
```prisma
model Raffle {
  id             String
  tenantId       String
  nombre         String
  premio         String
  estado         RaffleStatus @default(ACTIVO)  // ACTIVO | CERRADO
  fechaInicio    DateTime      // prisma/schema.prisma:321
  fechaFin       DateTime      // prisma/schema.prisma:322 — fecha de cierre/realización
  basesPdfUrl    String?
  premioImageUrl String?
  ganadorEmail   String?       // snapshot email del ganador
  ejecutadoAt    DateTime?     // idempotencia de la ejecución del sorteo
  ejecutadoPor   String?
  createdAt/updatedAt
  entries RaffleEntry[]
}
```

**`RaffleEntry`** (números/tickets, `prisma/schema.prisma:351-367`): una fila por TICKET (no por orden), con `ordinal` 0..K-1, `email` snapshot, `@@unique([raffleId, orderId, ordinal])`.

**`DownloadGrant`** (Entitlement, `prisma/schema.prisma:372-388`): autoridad de descarga por `(orderId, productId)`, `token` opaco único global, `expiresAt`.

## 2. Flujo de confirmación de pago (webhook Flow)

- Wrapper Next (borde de cableado): `src/pages/api/webhooks/flow.ts:1-78`
- Núcleo testeable del webhook: `src/server/pago/webhookFlow.ts`
- Enrutamiento token→Payment→Tenant: `src/server/pago/enrutarPagoFlow.ts`
- Transición de estado + persistencia: `src/server/domain/pago/confirmarPagoDeOrden.ts:31-90` — todo dentro de `db.$transaction`, con UPDATE condicional atómico (idempotencia) en línea 47-50.
- Efectos post-pago (Entitlement + tickets): `src/server/domain/pago/aplicarEfectosPostPago.ts:56-148`, invocado en `confirmarPagoDeOrden.ts:84-86` **dentro de la misma transacción**, solo en la transición a `PAGADO`.
  - Crea `DownloadGrant` por ítem (línea 88-97) y `RaffleEntry` × K tickets (línea 138-147), ambos idempotentes vía `createMany({ skipDuplicates: true })`.

**Punto exacto para disparar un correo**: ya existe. `src/pages/api/webhooks/flow.ts:63-69` cablea un decorator `conCorreoPostPago` (`src/server/pago/conCorreoPostPago.ts:26-48`) que envuelve `confirmarPagoDeOrden`. Se dispara **después del commit** (post-transacción, D1) y **solo** cuando `resultado.transicion === "PAGADO" && !resultado.yaProcesado` (línea 33 de `conCorreoPostPago.ts`), en try/catch log-and-continue — un fallo de correo nunca revierte la venta ni cambia el ack 200 del webhook.

## 3. Correo — YA EXISTE infraestructura completa (no hay que crearla de cero)

`package.json` no tiene `resend`/`nodemailer`/`react-email` como dependencia — **a propósito**: el service habla con la API HTTP de Resend directo por `fetch`, sin SDK (ver comentario en `src/server/services/correo.ts:1-19`, decisión D4/I7 "cero dependencias nuevas").

Piezas existentes:
- `src/server/services/correo.ts` — adapter `CorreoService`/`crearCorreoService` contra `POST https://api.resend.com/emails`.
- `src/server/correo/correoDeEnv.ts` — factory `crearCorreoDeEnv()` (lee `env.RESEND_API_KEY`) y `baseUrlApp()` (`APP_URL` ?? `NEXTAUTH_URL`).
- `src/server/domain/correo/plantillaDescarga.ts` — plantilla PURA `armarCorreoDescarga()` (from/subject/text/html), con `MARCA_PLATAFORMA = "Sortéatelo"` y `REMITENTE_CORREO = "no-reply@sorteatelo.cl"`.
- `src/server/domain/correo/enviarCorreoDescargaDeOrden.ts` — use case que arma y envía el correo de descarga de UNA orden (reply-to = email de la membresía más antigua del tenant).
- `src/server/domain/correo/reenviarCorreoDescargaDeOrden.ts` — reenvío desde el panel, regenera grants expirados.
- `src/server/pago/conCorreoPostPago.ts` — decorator que dispara el envío post-pago.
- Env vars: `RESEND_API_KEY` (opcional) y `APP_URL` (opcional) en `src/env.js:71,77,127-128`.
- ADR: `docs/adr/0010-correo-transaccional-resend.md` — decisión de usar Resend vía fetch directo, capa gratis 3.000/mes, remitente "Tienda X · vía Sortéatelo" con reply-to del Organizador.
- Tests: `src/__tests__/server/correo/*.test.ts`, `src/__tests__/server/services/correo.test.ts`, `src/__tests__/server/pago/conCorreoPostPago.test.ts`.
- Dev/manual: `src/pages/dev/descargas.tsx`.

Es decir: **hoy solo existe el correo de descarga post-pago**; no hay correo de "ganaste el sorteo" ni de "sorteo por cerrar" — pero toda la plomería (service Resend, factory de env, patrón decorator post-commit, plantilla pura) está lista para reutilizar con un caso de uso nuevo.

## 4. Config del sorteo por tienda

- Modelo `Raffle` (`prisma/schema.prisma:315-347`), 1 fila por sorteo, `@@index([tenantId, estado])`.
- **Fechas**: `fechaInicio` (línea 321) y `fechaFin` (línea 322) — ambas `DateTime` obligatorias. `fechaFin` es la fecha de cierre/realización.
- Ejecución auditada: `ejecutadoAt`/`ejecutadoPor`/`ganadorEmail` (líneas 337-339) — el guard de idempotencia es `WHERE ejecutadoAt IS NULL`, invariante de use case (no constraint de DB).
- Invariante de negocio: a lo sumo un `Raffle` `ACTIVO` por tenant (no forzado por DB, S5).

## 5. Resolución de tenant + branding

- `Tenant.nombre`, `logoUrl`, `colorPrimario`, `colorAcento`, `contactoEmail`, `instagramUrl`, `tiktokUrl`, `whatsappUrl` (`prisma/schema.prisma:118-148`) — campos útiles para personalizar un correo de marca de tienda.
- Resolución server-side por subdominio: `resolverTenantDelPanel` se usa en `src/server/domain/correo/reenviarCorreoDescargaDeOrden.ts:3,47` (importado de `~/server/authPolicy`); no exploré ese archivo en detalle pero es la puerta de resolución tenant-por-host/membresía mencionada en el ADR de tenancy.
- El "reply-to del Organizador" se deriva hoy de `TenantMembership` más antigua (no de `Tenant.contactoEmail`) — ver comentario D7 en `enviarCorreoDescargaDeOrden.ts:18-19,88-101`; nota ahí mismo: "cuando F08 agregue un email de contacto por Tienda, se cambia SOLO acá la fuente" (pero `Tenant.contactoEmail` YA existe en el schema desde plantilla-rica F02/D2 ADR-0013 — posible desalineación a considerar si se toca correo).

## 6. Convenciones sobre jobs/crons/side-effects

- **No encontré ninguna mención de "job"/"cron"/scheduler en `docs/agents/backend-conventions.md`** (grep sin resultados) ni en `CLAUDE.md`. No parece existir hoy infraestructura de cron/jobs en el repo — los side-effects post-pago se resuelven con el patrón **decorator post-commit + try/catch log-and-continue** (`conCorreoPostPago.ts`), invocado sincrónicamente desde el propio handler del webhook, no vía cola/job.
- El patrón documentado en el código (no en docs/agents) para side-effects: separar el **efecto transaccional** (dentro de `$transaction`, debe ser idempotente vía `@@unique`+`skipDuplicates` o UPDATE condicional) del **efecto post-commit no crítico** (correo — fuera de la transacción, nunca revierte la venta, log-and-continue). Ver comentarios extensos en `src/pages/api/webhooks/flow.ts:47-61` y `src/server/pago/conCorreoPostPago.ts:9-25`.
- No leí `docs/agents/backend-conventions.md` completo (solo grep dirigido); si se necesita el texto íntegro de esa convención puedo volcarlo, pero no contiene la palabra job/cron/scheduler/background.