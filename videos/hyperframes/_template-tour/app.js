// @ts-nocheck
/**
 * app.js — mock del panel para el tour "__TITULO__".
 * Coords absolutas del canvas 1920×1080.
 *
 * Lo GENÉRICO (browser frame, rail tinta del panel, topbar, PanelCard, PageHeader,
 * campos, botones, switch, tooltip, spotlight, cursor, badges, crossfade stack)
 * viene de window.TourKit (assets/tour-kit.js — fuente en hyperframes/_lib/).
 * Acá va SÓLO el mock de la pantalla de este video.
 *
 * `@ts-nocheck` arriba: el tsconfig de la app barre todos los `.js` del repo con
 * `checkJs: true`, y éste es JS de navegador del motor de video, no de la app (I2).
 * NO borres esa línea ni escribas globs con asterisco-barra en los comentarios:
 * esa secuencia cierra el bloque y rompe el archivo en silencio.
 *
 * REGLA DEL MOTOR (gotcha 9 del README): HyperFrames DESCARTA el styling INLINE del
 * DOM que inyecta este script — font-family/size/weight/letter-spacing/text-transform/
 * white-space y `gap`. Sólo sobrevive la GEOMETRÍA de frame (position/left/top/width/
 * height/background/border/border-radius/box-shadow) y lo que anima GSAP (opacity/
 * transform). => TODO el estilo visual/tipográfico va en CLASES declaradas en el
 * <style> de index.html. Un snapshot puede verse bien y el MP4 salir roto: verificá
 * siempre sobre frames del MP4 real.
 */
(() => {
  const K = window.TourKit;
  const { ic, browserFrame, pageHeader, panelCard, panelHead, campo, area, boton,
          switchEl, lb, spotEl, tipEl, cursorEl, stackEl, mount, CONTENT } = K;

  // ══════════════════════════════════════════════ 1) GEOMETRÍA (fuente única)
  // Definí acá TODA la geometría del mock. El timeline lee window.TOUR.P para el
  // cursor → cursor, spotlight y tooltip quedan alineados por construcción.
  const PAGE_L = CONTENT.left + 32;    // margen del contenido del panel
  const PAGE_T = CONTENT.top + 28;     // arranque del PageHeader

  // Puntos que recorre el cursor (uno por paso + el punto de entrada).
  const P = {
    start: { x: 960, y: 620 },        // de dónde entra el cursor
    p0: { x: 0, y: 0 },               // target del paso 1  ← COMPLETAR
    p1: { x: 0, y: 0 },               // target del paso 2  ← COMPLETAR
    p2: { x: 0, y: 0 },               // target del paso 3  ← COMPLETAR
  };
  window.TOUR = { P };

  // ══════════════════════════════════════════════ 2) MOCK de la pantalla
  // Ejemplo de estructura (borrar y reemplazar por la pantalla real):
  //
  // const page = () => `<div style="position:absolute;inset:0;">
  //   ${pageHeader(PAGE_L, PAGE_T, "Título", "Bajada de la página.")}
  //   ${panelCard(PAGE_L, PAGE_T + 90, 560, 380,
  //       panelHead(24, 24, "palette", "Tu tienda", "Descripción corta.") +
  //       campo(24, 110, 500, "Nombre", { valor: "Mi tienda" }))}
  // </div>`;

  const page = () => `<div style="position:absolute;inset:0;"></div>`;

  // ══════════════════════════════════════════════ 3) STAGES (un beat por paso)
  // Cada paso: navegador + página + (estado del paso) + spotlight + tooltip + cursor.
  // Un estado mostrado en el paso N se SOSTIENE en los siguientes (no se resetea).
  //
  // browserFrame(url, activeNavIdx, opt) — activeNavIdx sobre NAV_PRINCIPAL:
  //   0 Resumen · 1 Productos · 2 Ventas · 3 Sorteo · 4 Configuración (pie)
  // opt: { tienda, color, iniciales, colapsado, operador }
  const URL = "sorteatelo.cl/admin/__RUTA__";
  const NAV_IDX = 0;                 // ← COMPLETAR
  const TIENDA = { tienda: "Mi tienda", color: "var(--st-exito)", iniciales: "MC" };

  mount([
    {
      el: "step-0-stage",
      html: () =>
        browserFrame(URL, NAV_IDX, TIENDA) +
        page() +
        spotEl("spot-0", 0, 0, 10, 10, 12) +
        tipEl("tip-0", { x: P.p0.x, y: P.p0.y }, "right", 1, "Título del paso 1", "Qué hace el Organizador acá, en imperativo.") +
        cursorEl("cursor-0"),
    },
    {
      el: "step-1-stage",
      html: () =>
        browserFrame(URL, NAV_IDX, TIENDA) +
        page() +
        spotEl("spot-1", 0, 0, 10, 10, 12) +
        tipEl("tip-1", { x: P.p1.x, y: P.p1.y }, "left", 2, "Título del paso 2", "Qué hace el Organizador acá.") +
        cursorEl("cursor-1"),
    },
    {
      el: "step-2-stage",
      html: () =>
        browserFrame(URL, NAV_IDX, TIENDA) +
        page() +
        spotEl("spot-2", 0, 0, 10, 10, 12) +
        tipEl("tip-2", { x: P.p2.x, y: P.p2.y }, "left", 3, "Título del paso 3", "Qué hace el Organizador acá.") +
        cursorEl("cursor-2"),
    },
  ]);

  // Toggle de estado (algo que cambia al hacer click) — usar SIEMPRE stackEl:
  //   stackEl("sw", 44, 24, switchEl(0, 0, false), switchEl(0, 0, true))
  // emite #sw-a (visible) y #sw-b (oculto) con la caja reservada. Sin el
  // width/height explícito el elemento se cae de su fila.
})();
