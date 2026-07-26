// @ts-nocheck
/**
 * app.js — mocks de la cápsula "Conecta Flow · Parte 2: conecta las claves".
 * Coords absolutas del canvas 1920×1080.
 *
 * PARTE 2 DE UNA CADENA DE 2: se concatena después de `conecta-flow-a` (crea la cuenta en
 * flow.cl) → out/YYYY-MM-DD-conecta-flow.mp4.
 *
 * DOS superficies, y una de ellas NO es nuestra:
 *   A) Dashboard de FLOW (pasos 1 y 2) → SCREENSHOTS REALES recortados, dentro del chrome de
 *      navegador del kit. Flow es un sitio de TERCEROS que no controlamos: mockearlo en HTML
 *      sería inventar UI ajena. La regla "mock, no screencast" aplica a NUESTRO producto.
 *      Los PNG viven COMMITEADOS en `conecta-flow-b/shots/` (no en `assets/`, que es efímero y
 *      lo regenera materializar.mjs). Ver ../MOCKS.md.
 *   B) Panel · Configuración (paso 3) → mock, builder copiado de `configura-la-tienda/app.js`
 *      (card «Pagos (Flow)» + card «Tu tienda»), pantalla real `src/pages/admin/configuracion.tsx`.
 *
 * Lo GENÉRICO (browser frame, rail tinta, topbar, PanelCard, PageHeader, campos, botones,
 * tooltip, spotlight, cursor, badges, crossfade stack) viene de window.TourKit.
 *
 * `@ts-nocheck` arriba: el tsconfig de la app barre todos los `.js` del repo con `checkJs`, y
 * éste es JS de navegador del motor de video, no de la app (I2). NO escribas globs con
 * asterisco-barra en los comentarios: esa secuencia cierra el bloque y rompe el archivo.
 *
 * REGLA DEL MOTOR (gotcha 9): el styling INLINE del DOM que inyecta este script se DESCARTA
 * (tipografía, gap, flex). Sólo sobrevive la geometría de frame y lo que anima GSAP. Todo el
 * estilo visual va en CLASES del `<style>` de index.html o de tour-kit.css.
 */
(() => {
  const K = window.TourKit;
  const { ic, browserFrame, pageHeader, panelCard, panelHead, campo, area, boton,
          lb, spotEl, tipEl, cursorEl, stackEl, mount, CONTENT, FRAME } = K;

  // ══════════════════════════════════════════════ 1) GEOMETRÍA — dashboard de Flow
  // El shot recortado (sin la franja rosa del sandbox) se encaja EXACTO en el viewport del
  // navegador: la ventana se dimensiona a partir del shot, no al revés. Así el mapeo
  // shot→canvas es una sola escala y cursor/spotlight caen sobre su target por construcción.

  const SHOT_NAT = { w: 1904, h: 749 };             // PNG recortado (crop=1904:749:0:92)
  const FF_W = 1500;                                // mismo ancho que FRAME (continuidad visual)
  const SC = FF_W / SHOT_NAT.w;                     // 0.7878
  const SHOT_H = Math.round(SHOT_NAT.h * SC);       // 590
  const FF = {
    left: FRAME.left,                               // 210
    width: FF_W,
    height: K.CHROME.navegadorAlto + SHOT_H,        // 646
  };
  FF.top = Math.round((1080 - FF.height) / 2);      // 217 — ventana centrada en el canvas
  const SX = FF.left, SY = FF.top + K.CHROME.navegadorAlto;

  /** Punto del shot (coords del PNG) → punto del canvas. */
  const sx = (x) => SX + Math.round(x * SC);
  const sy = (y) => SY + Math.round(y * SC);
  /** Rectángulo del shot → rectángulo del canvas (para el spotlight). */
  const sRect = (x, y, w, h) => ({
    x: sx(x), y: sy(y), w: Math.round(w * SC), h: Math.round(h * SC),
  });

  // Targets medidos sobre los PNG recortados:
  //   · índice de Configuración → tarjeta «Datos de integración» (la última de las 4)
  //   · Datos de integración    → campo API Key + su botón de copiar
  const T_SECCION = sRect(228, 613, 1649, 99);
  const T_APIKEY = sRect(275, 458, 775, 77);
  const COPY_BTN = { x: sx(1013), y: sy(510) };

  // ══════════════════════════════════════════════ 2) GEOMETRÍA — panel · Configuración
  // Copiada de `configura-la-tienda/app.js` (MOCKS.md: la pantalla ya está mockeada).

  const PAD = 32;                          // gutter del AppShell en lg (padding="xl")
  const PAGE_L = CONTENT.left + PAD;       // 474
  const PAGE_T = CONTENT.top + 28;         // 208
  const CARDS_Y = PAGE_T + 41 + 6 + 21 + 26;   // 302 — bajo el PageHeader (mb="lg")

  const COL_W = 594;                       // (ancho útil 1204 − spacing 16) / 2
  const IZQ_X = PAGE_L;                    // 474
  const DER_X = PAGE_L + COL_W + 16;       // 1084
  const IN = 24;                           // padding de la PanelCard
  const FIELD_W = COL_W - IN * 2;          // 546

  /** Acumulador de layout vertical: evita aritmética a mano y desalineados en cascada. */
  const flujo = (inicio) => {
    let y = inicio;
    return {
      avanzar(px) { const actual = y; y += px; return actual; },
      get alto() { return y; },
    };
  };

  // ── card izquierda: «Pagos (Flow)» — la protagonista del paso 3 ───────────
  const L = flujo(IN);
  const L_HEAD = L.avanzar(26 + 6 + 42 + 20);   // título + bajada (2 líneas) + aire
  const L_ESTADO = L.avanzar(52 + 22);          // bloque inset del estado
  const L_APIKEY = L.avanzar(21 + 6 + 40 + 18);
  const L_SECRET = L.avanzar(21 + 6 + 40 + 18);
  const L_AMB = L.avanzar(21 + 6 + 40 + 22);
  const L_BOTON = L.avanzar(40);
  const IZQ_H = L.alto + IN;

  // ── card derecha: «Tu tienda» (contexto; el SimpleGrid real es de 2 columnas) ──
  const R = flujo(IN);
  const R_HEAD = R.avanzar(26 + 6 + 21 + 20);
  const R_SEC_ASSETS = R.avanzar(20 + 10);
  const R_ASSETS = R.avanzar(62 + 16);
  const R_DIV1 = R.avanzar(1 + 16);
  const R_DESC = R.avanzar(21 + 6 + 54 + 16);
  const R_COLOR = R.avanzar(21 + 6 + 40 + 18);
  const R_DIV2 = R.avanzar(1 + 14);
  const R_SEC_TEXTOS = R.avanzar(20 + 10);
  const R_HERO = R.avanzar(21 + 6 + 40 + 16);
  const R_SUB = R.avanzar(21 + 6 + 40 + 22);
  const R_BOTON = R.avanzar(40);
  const DER_H = R.alto + IN;

  // ── recorrido del cursor: continuo, Flow → Flow → panel ───────────────────
  const P = {
    start: { x: 980, y: 940 },                                   // entra por el centro-bajo
    p0: { x: sx(420), y: sy(646) },                              // «Datos de integración» (Flow)
    p1: COPY_BTN,                                                // copiar la API Key (Flow)
    p2: { x: IZQ_X + IN + 240, y: CARDS_Y + L_APIKEY + 47 },     // campo API Key (panel)
    p3: { x: IZQ_X + IN + 100, y: CARDS_Y + L_BOTON + 20 },      // «Guardar credenciales»
  };
  window.TOUR = { P };

  // ══════════════════════════════════════════════ 3) DATOS DEL MOCK
  const URL_FLOW = "dashboard.flow.cl";   // producción: es la URL que verá el Organizador real
  const URL_PANEL = "sorteatelo.cl/admin/configuracion";
  const NAV_IDX = 4;                      // Configuración (NAV_PIE, después de las 4 principales)
  // Misma tienda de ejemplo que `crea-tu-tienda`. El color del chip es DATO del tenant, pero
  // sale de un token para no meter un hex en el tour (I7). El avatar es la sesión (NA).
  const TIENDA = { tienda: "Tienda Aurora", color: "var(--st-exito-6)", iniciales: "NA" };
  // Claves SIEMPRE enmascaradas: jamás una credencial real en un video.
  const MASCARA = "••••••••••••••••••••••••••••";

  // ══════════════════════════════════════════════ 4) SUPERFICIE A — dashboard de Flow
  /**
   * Chrome de navegador con un SCREENSHOT real adentro. No usa `browserFrame` del kit porque
   * ése trae el rail y el topbar de NUESTRO panel: acá el contenido es un sitio de terceros.
   * Reusa las mismas clases de chrome, así la ventana es idéntica a la de los pasos del panel.
   */
  const flowFrame = (shot) => `
    <div class="app-browser" style="left:${FF.left}px;top:${FF.top}px;width:${FF.width}px;height:${FF.height}px;">
      <div class="app-chrome">
        <div class="app-dot"></div><div class="app-dot"></div><div class="app-dot"></div>
        <div class="app-url">${URL_FLOW}</div>
        <div class="app-chrome-spacer"></div>
      </div>
      <div class="cf-viewport">
        <img class="cf-shot" src="shots/${shot}.png" style="left:0;top:0;width:${FF_W}px;height:${SHOT_H}px;">
      </div>
    </div>`;

  // ══════════════════════════════════════════════ 5) SUPERFICIE B — panel · Configuración
  /** Fila de un asset de marca: miniatura vacía (dashed) + label + input de archivo. */
  const filaAsset = (x, y, w, label) => `
    <div class="cf-asset" style="left:${x}px;top:${y}px;width:${w}px;height:62px;">
      <div class="cf-thumb" style="left:0;top:2px;">${ic("photo", "var(--st-texto-tenue)", 20, 1.5)}</div>
      <div style="position:absolute;left:70px;top:0;width:${w - 70}px;">
        <div class="fld-label">${label}</div>
        <div class="fld-input vacio" style="height:36px;margin-top:5px;">${ic("photo", "var(--st-texto-tenue)", 15, 1.75)}Elegir imagen</div>
      </div>
    </div>`;

  /** Campo de clave con crossfade: vacío (placeholder) → pegado (enmascarado, con foco). */
  const campoClave = (id, y, label) => {
    const caja = (lleno) => `
      <div class="fld-label">${label}</div>
      <div class="fld-input${lleno ? " foco" : " vacio"}" style="width:${FIELD_W}px;height:40px;margin-top:6px;">${lleno ? MASCARA : "••••••••••••"}</div>`;
    return `<div style="position:absolute;left:${IN}px;top:${y}px;width:${FIELD_W}px;height:67px;">
      ${stackEl(id, FIELD_W, 67, caja(false), caja(true))}
    </div>`;
  };

  /**
   * Card «Pagos (Flow)» — write-only: nunca precarga secretos, sólo muestra el estado.
   * El inset de estado es un stack: «No conectada» (badge outline) → «Configurada» + ambiente.
   */
  const cardFlow = () => panelCard(IZQ_X, CARDS_Y, COL_W, IZQ_H,
    panelHead(IN, L_HEAD, "card", "Pagos (Flow)",
      "Conecta tu cuenta de Flow para cobrar. Tus claves se guardan cifradas y nunca se muestran.") +
    `<div class="pnl-inset cf-estado" style="left:${IN}px;top:${L_ESTADO}px;width:${FIELD_W}px;height:52px;">
       <div class="cf-estado-label">Estado</div>
       <div class="cf-estado-badge">${stackEl("estado", 240, 26,
         `<div class="cf-badges">${lb("No conectada", "borde")}</div>`,
         `<div class="cf-badges">${lb("Configurada", "exito", { icono: "check" })}${lb("Producción", "gris")}</div>`)}</div>
     </div>` +
    campoClave("apikey", L_APIKEY, "API Key") +
    campoClave("secret", L_SECRET, "Secret Key") +
    campo(IN, L_AMB, 208, "Ambiente", { valor: "Producción" }) +
    boton(IN, L_BOTON, "Guardar credenciales", "primario"),
  );

  /** Card «Tu tienda»: contexto de la página (el SimpleGrid real tiene alturas independientes). */
  const cardTienda = () => panelCard(DER_X, CARDS_Y, COL_W, DER_H,
    panelHead(IN, R_HEAD, "palette", "Tu tienda",
      "La marca de tu tienda: logo, imagen, color y textos.") +
    `<div class="cf-sec" style="left:${IN}px;top:${R_SEC_ASSETS}px;">${ic("photo", "var(--st-texto)", 17, 1.75)}<span class="cf-sec-txt">Logo e imagen de portada</span></div>` +
    filaAsset(IN, R_ASSETS, 258, "Logo de la tienda") +
    filaAsset(IN + 288, R_ASSETS, 258, "Imagen de hero") +
    `<div class="cf-div" style="left:${IN}px;top:${R_DIV1}px;width:${FIELD_W}px;"></div>` +
    area(IN, R_DESC, FIELD_W, 54, "Descripción", { valor: "Libros y fanzines hechos a mano." }) +
    campo(IN, R_COLOR, 208, "Color de marca (hex)", { valor: "#1d7a70" }) +
    `<div class="cf-div" style="left:${IN}px;top:${R_DIV2}px;width:${FIELD_W}px;"></div>` +
    `<div class="cf-sec" style="left:${IN}px;top:${R_SEC_TEXTOS}px;">${ic("navbar", "var(--st-texto)", 17, 1.75)}<span class="cf-sec-txt">Textos del storefront</span></div>` +
    campo(IN, R_HERO, FIELD_W, "Título del hero", { placeholder: "Bienvenido a mi tienda" }) +
    campo(IN, R_SUB, FIELD_W, "Subtítulo del hero", { placeholder: "Una frase corta que enganche." }) +
    boton(IN, R_BOTON, "Guardar cambios", "primario"),
  );

  /** Notificación de Mantine tras guardar (arriba a la derecha del área de contenido). */
  const toast = () => `
    <div id="toast" class="cf-toast tour-hidden" style="left:${CONTENT.right - 32 - 360}px;top:${CONTENT.top + 18}px;width:360px;height:56px;">
      <div class="cf-toast-barra"></div>
      <div class="cf-toast-ic">${ic("check", "var(--st-exito)", 18, 2.2)}</div>
      <div class="cf-toast-txt">Credenciales guardadas.</div>
    </div>`;

  // Wrapper del canvas con las 4 coords explícitas: el shorthand `inset` NO está en la lista de
  // propiedades que el motor conserva del DOM inyectado (gotcha 9).
  const paginaPanel = () => `<div style="position:absolute;left:0;top:0;width:1920px;height:1080px;">
    ${pageHeader(PAGE_L, PAGE_T, "Configuración", "Los ajustes de tu tienda: pagos, marca y bases del sorteo.")}
    ${cardFlow()}
    ${cardTienda()}
  </div>`;

  // ══════════════════════════════════════════════ 6) STAGES (un beat por paso)
  // El estado se SOSTIENE: lo que se copia en Flow se pega en el panel en el paso siguiente.
  mount([
    {
      // Paso 1 — índice de Configuración de Flow: dónde están las claves.
      el: "step-0-stage",
      html: () =>
        flowFrame("flow-configuracion") +
        spotEl("spot-0", T_SECCION.x, T_SECCION.y, T_SECCION.w, T_SECCION.h, 10) +
        tipEl("tip-0", { x: P.p0.x, y: T_SECCION.y - 2 }, "above", 1,
          "Entra a Configuración",
          "En el menú: Configuración → Datos de integración.") +
        cursorEl("cursor-0"),
    },
    {
      // Paso 2 — Datos de integración: copiar la API Key con el botón del campo.
      el: "step-1-stage",
      html: () =>
        flowFrame("flow-datos-integracion") +
        spotEl("spot-1", T_APIKEY.x, T_APIKEY.y, T_APIKEY.w, T_APIKEY.h, 8) +
        tipEl("tip-1", { x: P.p1.x, y: T_APIKEY.y }, "above", 2,
          "Copia las claves",
          "Usa el botón de copiar de cada campo. La Secret Key no se comparte con nadie.") +
        cursorEl("cursor-1"),
    },
    {
      // Paso 3 — panel de Sortéatelo: pegar, elegir Producción y guardar.
      el: "step-2-stage",
      html: () =>
        browserFrame(URL_PANEL, NAV_IDX, TIENDA) +
        paginaPanel() +
        toast() +
        spotEl("spot-2", IZQ_X - 10, CARDS_Y - 10, COL_W + 20, IZQ_H + 20, 16) +
        tipEl("tip-2", { x: IZQ_X + COL_W + 10, y: CARDS_Y + 210 }, "right", 3,
          "Pega en Sortéatelo",
          "En Configuración → Pagos (Flow): pega las claves, elige Producción y guarda.") +
        cursorEl("cursor-2"),
    },
  ]);
})();
