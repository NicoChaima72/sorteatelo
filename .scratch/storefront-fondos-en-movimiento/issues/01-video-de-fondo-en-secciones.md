# Video de fondo en secciones del storefront

Status: needs-triage

## Contexto

Pedido del usuario (2026-07-26, sesión de pulido de la tienda iselk): además de los
focos animados por CSS (que van primero, por el `planner` en su propia tanda), quiere
explorar **video de fondo** para el hero — como los sitios de sorteos de referencia
(elcapataz.cl / gonzaloko.cl / tiogaleas.cl usan imagen full-bleed; la vuelta de tuerca
sería un loop en movimiento).

## Idea

Un `fondo: { tipo: "video" }` en `EstiloSeccionSchema` (o solo para el hero
`imagen_fondo`): MP4 mudo en loop, servido desde el bucket R2 **público** (ADR-0013),
con poster de fallback (la imagen actual) y degradación elegante.

## Costos conocidos a resolver en el grill

- Peso en móvil (¿servir solo el poster en pantallas chicas? ¿`prefers-reduced-data`?).
- Políticas de autoplay de los navegadores (muted + playsinline obligatorios).
- `prefers-reduced-motion` ⇒ poster estático.
- Producción del asset: ¿quién hace el video? (pipeline HyperFrames de `videos/` podría
  generar loops de marca; los MP4 no se commitean).
- Allowlist del bucket público hoy es imágenes + el PDF de bases — habría que admitir
  `video/mp4` como excepción nueva (espejo de la decisión de `bases`).

## Decisión de secuencia

1. **Primero**: focos animados por CSS (feature separada, liviana, ya encargada al planner).
2. **Después (esto)**: video de fondo — otro día, en su propia sesión con `planner`.
