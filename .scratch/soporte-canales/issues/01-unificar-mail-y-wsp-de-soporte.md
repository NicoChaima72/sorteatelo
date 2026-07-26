# Unificar los canales de soporte de la plataforma (mail serio + WhatsApp)

Status: ready-for-human

## Contexto

Con el retiro del rol Operador (ADR-0023, 2026-07-25), el copy de tienda suspendida pasó a
enlazar un canal de soporte real. Decisión del usuario (2026-07-25): **por ahora** el soporte
queda conectado a su correo personal — `APP_CONFIG.soporteEmail = "nikochaima72@gmail.com"`
(`src/config/app.ts`), consumido por el Alert de suspensión en
`src/components/admin/checklist-publicacion.tsx`.

## Pedido

Más adelante, unificar TODO el soporte de la plataforma en canales serios:

- [ ] Crear un correo de soporte dedicado (p.ej. `soporte@sorteatelo.cl`) y reemplazar el
      personal en `APP_CONFIG.soporteEmail` (un solo lugar, el resto de la UI lo hereda).
- [ ] Conectar un WhatsApp de soporte y exponerlo junto al mail (definir dónde: alert de
      suspensión, footer del panel, landing).
- [ ] Barrer cualquier otro copy que mencione soporte/contacto de plataforma para que consuma
      `APP_CONFIG` y no literales.

## Notas

- El canal de soporte es de PLATAFORMA (Sortéatelo → Organizadores). No confundir con el
  contacto por tienda (`Tenant.contactoEmail` / `whatsappUrl`), que es del Organizador hacia
  sus compradores y ya existe.
- Textual del usuario: "por ahora dejarlo conectado a mi mail personal pero más adelante
  quiero unificar todo a un mail de soporte serio […] deja como tarea conectar los mails de
  soporte y wsp".
