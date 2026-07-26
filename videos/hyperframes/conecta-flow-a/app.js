// @ts-nocheck
/**
 * app.js — cápsula "Conecta Flow · Parte 1: crea tu cuenta".
 * Coords absolutas del canvas 1920×1080.
 *
 * UNA sola superficie, y NO es nuestra: el sitio de FLOW (flow.cl y dashboard.flow.cl).
 * Flow es un TERCERO: no se mockea, se muestran SCREENSHOTS reales recortados dentro del
 * chrome de navegador del kit (regla y precedente en ../MOCKS.md → "Sitios de TERCEROS").
 * Los PNG viven COMMITEADOS en `conecta-flow-a/shots/` (no en `assets/`, que es efímero).
 *
 * Recortes aplicados a los originales:
 *   · flow-home / flow-registro (producción) → crop=1904:841:0:0 — sólo la barra de scroll;
 *     el banner superior se conserva: ahí está el link "Crea tu cuenta".
 *   · flow-datos-negocio / flow-datos-bancarios (sandbox) → crop=1904:749:0:92 — fuera la
 *     franja rosa "Sitio de pruebas de Flow" (mismo crop que la Parte 2).
 * De ahí las DOS alturas naturales: `vista()` deriva la ventana desde el shot, no al revés.
 *
 * La barra de URL muestra siempre la de PRODUCCIÓN (divergencia deliberada: es la que el
 * Organizador va a tipear, aunque dos shots vengan del sandbox).
 *
 * `@ts-nocheck` arriba: el tsconfig de la app barre todos los `.js` del repo con `checkJs` (I2).
 * NO escribas globs con asterisco-barra en los comentarios: esa secuencia cierra el bloque y
 * rompe el archivo en silencio (gotcha 14).
 *
 * REGLA DEL MOTOR (gotcha 9): el styling INLINE del DOM que inyecta este script se DESCARTA
 * (tipografía, gap, flex). Sólo sobrevive la geometría de frame y lo que anima GSAP.
 */
(() => {
  const K = window.TourKit;
  const { spotEl, tipEl, cursorEl, mount, FRAME } = K;

  // ══════════════════════════════════════════════ 1) GEOMETRÍA — ventana por shot
  // El shot recortado se encaja EXACTO en el viewport: la ventana se dimensiona a partir del
  // PNG (ancho fijo 1500 = el de FRAME, para que sea la misma ventana que la del panel) y se
  // centra vertical en el canvas. Así el mapeo shot→canvas es UNA escala y cursor, spotlight
  // y tooltip caen sobre el botón real POR CONSTRUCCIÓN.
  const SHOT_W = 1904;                       // ancho natural común a los 4 recortes
  const FF_W = FRAME.width;                  // 1500
  const SC = FF_W / SHOT_W;                  // 0.7878

  /** Vista = ventana + helpers de mapeo para una altura natural de shot. */
  const vista = (natH) => {
    const alto = Math.round(natH * SC);
    const FF = {
      left: FRAME.left,
      width: FF_W,
      height: K.CHROME.navegadorAlto + alto,
      shotH: alto,
    };
    FF.top = Math.round((1080 - FF.height) / 2);
    const SX = FF.left, SY = FF.top + K.CHROME.navegadorAlto;
    const sx = (x) => SX + Math.round(x * SC);
    const sy = (y) => SY + Math.round(y * SC);
    return {
      FF, sx, sy,
      sRect: (x, y, w, h) => ({
        x: sx(x), y: sy(y), w: Math.round(w * SC), h: Math.round(h * SC),
      }),
    };
  };

  const V_WEB = vista(841);   // shots de producción (con banner): ventana de 719 de alto
  const V_APP = vista(749);   // shots del dashboard sandbox (sin franja rosa): 646 de alto

  // Targets medidos sobre los PNG recortados (coords del propio PNG):
  //   · home     → botón "Crea tu cuenta" del nav superior
  //   · registro → tarjeta del formulario de alta
  //   · sandbox  → banda de encabezado (breadcrumb + título), igual en los DOS shots
  const T_CREAR = V_WEB.sRect(1393, 18, 188, 52);
  const T_FORM = V_WEB.sRect(120, 116, 722, 648);
  const T_HEAD = V_APP.sRect(210, 62, 1664, 130);

  // ── recorrido del cursor: continuo, home → registro → dashboard ───────────
  const P = {
    start: { x: 980, y: 960 },                     // entra por el centro-bajo
    p0: { x: V_WEB.sx(1487), y: V_WEB.sy(43) },    // "Crea tu cuenta" (flow.cl)
    p1: { x: V_WEB.sx(481), y: V_WEB.sy(669) },    // "Crear cuenta" (registro)
    p2: { x: V_APP.sx(283), y: V_APP.sy(88) },     // breadcrumb "Configuración" (dashboard)
  };
  window.TOUR = { P };

  // ══════════════════════════════════════════════ 2) DATOS
  const URL_HOME = "flow.cl";
  const URL_REG = "dashboard.flow.cl/register";
  const URL_APP = "dashboard.flow.cl";

  // ══════════════════════════════════════════════ 3) SUPERFICIE — sitio de Flow
  /**
   * Chrome de navegador con SCREENSHOTS reales adentro. No usa `browserFrame` del kit porque
   * ése trae el rail y el topbar de NUESTRO panel: acá el contenido es un sitio de terceros.
   * Reusa las mismas clases de chrome, así la ventana es idéntica a la del resto de la cadena.
   * `shots` puede traer más de uno: el primero visible y el resto ocultos, para el crossfade
   * de páginas del paso 3 (ids `#shot-<nombre>`).
   */
  const flowFrame = (V, url, shots) => `
    <div class="app-browser" style="left:${V.FF.left}px;top:${V.FF.top}px;width:${V.FF.width}px;height:${V.FF.height}px;">
      <div class="app-chrome">
        <div class="app-dot"></div><div class="app-dot"></div><div class="app-dot"></div>
        <div class="app-url">${url}</div>
        <div class="app-chrome-spacer"></div>
      </div>
      <div class="cf-viewport">
        ${shots.map((s, i) => `<img id="shot-${s}" class="cf-shot${i > 0 ? " tour-hidden" : ""}" src="shots/${s}.png" style="left:0;top:0;width:${FF_W}px;height:${V.FF.shotH}px;">`).join("")}
      </div>
    </div>`;

  // ══════════════════════════════════════════════ 4) STAGES (un beat por paso)
  mount([
    {
      // Paso 1 — flow.cl: dónde se abre la cuenta.
      el: "step-0-stage",
      html: () =>
        flowFrame(V_WEB, URL_HOME, ["flow-home"]) +
        spotEl("spot-0", T_CREAR.x, T_CREAR.y, T_CREAR.w, T_CREAR.h, 22) +
        tipEl("tip-0", { x: P.p0.x, y: T_CREAR.y + T_CREAR.h }, "below", 1,
          "Entra a flow.cl",
          "Arriba a la derecha: «Crea tu cuenta».") +
        cursorEl("cursor-0"),
    },
    {
      // Paso 2 — formulario de alta. El cursor llega al botón pero NO se simula el submit:
      // el alta real termina con el correo de activación, fuera del video.
      el: "step-1-stage",
      html: () =>
        flowFrame(V_WEB, URL_REG, ["flow-registro"]) +
        spotEl("spot-1", T_FORM.x, T_FORM.y, T_FORM.w, T_FORM.h, 12) +
        tipEl("tip-1", { x: T_FORM.x + T_FORM.w, y: T_FORM.y + 160 }, "right", 2,
          "Completa el registro",
          "Correo, contraseña, país y teléfono. Luego confirma el correo de activación.") +
        cursorEl("cursor-1"),
    },
    {
      // Paso 3 — Configuración del dashboard: los dos formularios que habilitan el cobro.
      // Las DOS páginas viven en el mismo stage y se cruzan a mitad de beat (crossfade de
      // shots, mismo patrón de los stackEl del resto de la fábrica): Datos del negocio →
      // Datos bancarios. El spotlight cae sobre la banda de encabezado, que existe igual en
      // los dos shots (breadcrumb + título), así el swap se lee sin mover nada más.
      el: "step-2-stage",
      html: () =>
        flowFrame(V_APP, URL_APP, ["flow-datos-negocio", "flow-datos-bancarios"]) +
        spotEl("spot-2", T_HEAD.x, T_HEAD.y, T_HEAD.w, T_HEAD.h, 10) +
        tipEl("tip-2", { x: V_APP.sx(430), y: T_HEAD.y + T_HEAD.h }, "below", 3,
          "Completa Configuración",
          "Datos del negocio (tu información del SII) y Datos bancarios: la cuenta donde llega el dinero. El RUT debe coincidir con el de tu comercio.") +
        cursorEl("cursor-2"),
    },
  ]);
})();
