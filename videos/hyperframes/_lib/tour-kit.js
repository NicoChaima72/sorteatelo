// @ts-nocheck
/**
 * tour-kit.js — builders GENÉRICOS compartidos por todos los videos Tour de Sortéatelo.
 * Fuente única: videos/hyperframes/_lib/. El scaffolder (new-tour.mjs) lo copia a
 * <video>/assets/tour-kit.js. Un fix acá llega a los videos nuevos vía scaffold.
 *
 * Expone window.TourKit. Se carga ANTES del app.js del video (que arma los mocks
 * específicos de esa pantalla) y antes del timeline inline.
 *
 * `@ts-nocheck` arriba a propósito: el `tsconfig.json` de la app barre TODOS los `.js` del
 * repo con `checkJs: true`, y este archivo es JS de NAVEGADOR para el motor de video, no de
 * la app. Sin esa línea, `npm run check:types` del repo se pone rojo (I2). Va en todo `.js`
 * de `videos/` — el `app.js` del template ya lo trae, así se propaga a cada video nuevo.
 * (Ojo al escribir comentarios: un glob con la secuencia asterisco-barra CIERRA el bloque y
 * rompe el archivo en silencio. Pasó de verdad acá — el timeline no se registraba.)
 *
 * REGLA DEL MOTOR (gotcha 9 del README): HyperFrames DESCARTA el styling INLINE del
 * DOM inyectado por JS (font-family/size/weight/letter-spacing/text-transform/
 * white-space y `gap`). Sólo sobrevive inline la GEOMETRÍA de frame (position/left/
 * top/width/height/background/border/border-radius/box-shadow) y lo que anima GSAP
 * (opacity/transform). Por eso estos builders sólo asignan CLASES (definidas en
 * tour-kit.css) + geometría. Nunca tipografía inline.
 *
 * MARCA: identidad «El Talonario» (docs/design.md). Colores SIEMPRE por token
 * `var(--st-*)` de assets/brand.tokens.css — nunca un hex a mano (I7).
 *
 * Coordenadas: canvas absoluto 1920×1080.
 */
(() => {
  // ══════════════════════════════════════════════ geometría del chrome
  /**
   * Medidas del panel de Organizador mockeado. ESPEJO EXACTO de
   * `_brand/tokens.local.json → chrome`: `build-tokens.mjs` FALLA si divergen.
   * (El CSS las consume como `--st-rail-ancho` etc.; el JS las necesita en número
   * para derivar CONTENT.)
   */
  const CHROME = {
    railAncho: 232,      // rail tinta expandido (AppShell navbar width, §4)
    railColapsado: 68,   // rail icon-only
    topbarAlto: 64,      // AppShell.Header, sin borde inferior
    navegadorAlto: 56,   // barra del navegador mockeado (no es del producto)
  };

  // Ventana del navegador dentro del canvas 1920×1080.
  const FRAME = { left: 210, top: 60, width: 1500, height: 920 };

  // Derivadas para posicionar mocks/spotlights POR CONSTRUCCIÓN (nunca a ojo):
  //   navegador 56 + topbar 64 → el contenido arranca en y = top + 120
  //   rail 232                 → el contenido arranca en x = left + 232
  const CONTENT = {
    top: FRAME.top + CHROME.navegadorAlto + CHROME.topbarAlto,  // 180
    left: FRAME.left + CHROME.railAncho,                        // 442
    right: FRAME.left + FRAME.width,                            // 1710
    bottom: FRAME.top + FRAME.height,                           // 980
  };

  // ══════════════════════════════════════════════ navegación real del panel
  // Espejo de `NAV` en src/components/admin/admin-layout.tsx (operativa arriba,
  // Configuración anclada al pie; Operador solo con el rol).
  const NAV_PRINCIPAL = [
    ["Resumen", "dashboard"],
    ["Productos", "book"],
    ["Ventas", "cart"],
    ["Sorteo", "ticket"],
  ];
  const NAV_PIE = [["Configuración", "settings"]];

  // ══════════════════════════════════════════════ íconos (paths de @tabler/icons)
  const IC = {
    dashboard: '<path d="M4 4h6v8h-6z"/><path d="M4 16h6v4h-6z"/><path d="M14 12h6v8h-6z"/><path d="M14 4h6v4h-6z"/>',
    book: '<path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6l0 13"/><path d="M12 6l0 13"/><path d="M21 6l0 13"/>',
    cart: '<path d="M6 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M17 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M17 17h-11v-14h-2"/><path d="M6 5l14 1l-1 7h-13"/>',
    ticket: '<path d="M15 5l0 2"/><path d="M15 11l0 2"/><path d="M15 17l0 2"/><path d="M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-3a2 2 0 0 0 0 -4v-3a2 2 0 0 1 2 -2"/>',
    settings: '<path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/>',
    shield: '<path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3"/><path d="M12 11m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M12 12l0 2.5"/>',
    burger: '<path d="M4 6l16 0"/><path d="M4 12l16 0"/><path d="M4 18l16 0"/>',
    search: '<path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/>',
    external: '<path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"/><path d="M11 13l9 -9"/><path d="M15 4h5v5"/>',
    card: '<path d="M3 5m0 3a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3z"/><path d="M3 10l18 0"/><path d="M7 15l.01 0"/><path d="M11 15l2 0"/>',
    palette: '<path d="M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25"/><path d="M8.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M12.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M16.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
    photo: '<path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z"/><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"/><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"/>',
    navbar: '<path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z"/><path d="M4 9l16 0"/>',
    instagram: '<path d="M4 8a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4z"/><path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M16.5 7.5l0 .01"/>',
    mail: '<path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10z"/><path d="M3 7l9 6l9 -6"/>',
    check: '<path d="M5 12l5 5l10 -10"/>',
    plus: '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>',
    upload: '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 9l5 -5l5 5"/><path d="M12 4l0 12"/>',
    chevronDown: '<path d="M6 9l6 6l6 -6"/>',
    eye: '<path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6"/>',
    alert: '<path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.535a1.914 1.914 0 0 0 1.636 2.874h16.214a1.914 1.914 0 0 0 1.636 -2.874l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z"/><path d="M12 16h.01"/>',
  };

  // ══════════════════════════════════════════════ tokens (SIEMPRE var(--st-*))
  const T = {
    acento: "var(--st-acento)",
    premio: "var(--st-premio)",
    tinta: "var(--st-tinta)",
    texto: "var(--st-texto)",
    suave: "var(--st-texto-suave)",
    tenue: "var(--st-texto-tenue)",
    invertido: "var(--st-texto-invertido)",
    railTexto: "var(--st-rail-texto)",
    exito: "var(--st-exito)",
    blanco: "var(--st-blanco)",
  };

  // ══════════════════════════════════════════════ helpers de icono
  const ic = (name, color, size = 18, stroke = 1.75) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" class="ic">${IC[name]}</svg>`;

  /**
   * Isotipo de plataforma (eco de public/favicon.svg): cuadrado cobalto + barra
   * amarilla + «S» en Bricolage 800. Va INLINE (no <img src="*.svg">): un SVG
   * externo no hereda las @font-face embebidas del documento y la letra caería a
   * fuente del sistema (mismo síntoma del gotcha 12). La letra se estila por CLASE
   * (.iso-letra), nunca inline (gotcha 9).
   */
  const isotipo = (size = 28) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 64 64" class="ic">
      <rect width="64" height="64" rx="15" class="iso-caja"/>
      <rect x="17" y="45" width="30" height="6" rx="3" class="iso-barra"/>
      <text x="32" y="30" font-size="40" class="iso-letra">S</text>
    </svg>`;

  // ══════════════════════════════════════════════ rail tinta «Oscuro + calmo»
  const navRow = (label, icono, active, solo) => {
    const color = active ? T.invertido : T.railTexto;
    // La barra de acento va pegada al borde IZQUIERDO del rail (geometría inline).
    const barra = active ? `<div class="app-nav-bar" style="left:-8px;top:9px;"></div>` : "";
    return `<div class="app-nav-item${active ? " active" : ""}${solo ? " solo" : ""}">${barra}${ic(icono, color, 17, 1.7)}${solo ? "" : label}</div>`;
  };

  /**
   * Rail del panel. `activeIdx` indexa NAV_PRINCIPAL (0 Resumen · 1 Productos ·
   * 2 Ventas · 3 Sorteo); NAV_PIE sigue numerando después (4 Configuración).
   * `opt.colapsado` → modo icon-only (68px), `opt.operador` → agrega el ítem del rol.
   */
  const rail = (activeIdx, opt = {}) => {
    const solo = !!opt.colapsado;
    const principal = NAV_PRINCIPAL.map(([l, i], k) => navRow(l, i, k === activeIdx, solo)).join("");
    const pie = NAV_PIE.map(([l, i], k) => navRow(l, i, NAV_PRINCIPAL.length + k === activeIdx, solo)).join("");
    const operador = opt.operador ? navRow("Operador", "shield", false, solo) : "";
    return `<div class="app-rail${solo ? " app-rail-colapsado" : ""}">
      <div class="app-rail-brand${solo ? " app-rail-brand-solo" : ""}">
        ${isotipo(solo ? 28 : 26)}${solo ? "" : `<div class="app-rail-name">Sortéatelo</div>`}
      </div>
      <div class="app-rail-div"></div>
      <div class="app-navlist">${principal}</div>
      <div class="app-railfoot">
        <div class="app-railfoot-div"></div>
        ${pie}${operador}
      </div>
    </div>`;
  };

  /**
   * Topbar liviano SIN borde inferior (§4): hamburguesa · chip de tienda (con el
   * swatch de su colorPrimario, el ÚNICO color-desde-dato del admin) · Buscar ⌘K ·
   * Ver mi tienda · avatar de la sesión.
   */
  const topbar = (opt = {}) => {
    const tienda = opt.tienda ?? "Mi tienda";
    const color = opt.color ?? "var(--st-gris-4)";
    const iniciales = opt.iniciales ?? "MC";
    return `<div class="app-topbar">
      ${ic("burger", T.suave, 20, 1.75)}
      <div class="app-chip"><div class="app-swatch" style="background:${color};"></div>${tienda}</div>
      <div class="app-topbar-right">
        <div class="btn btn-default btn-sm">${ic("search", T.suave, 14, 1.75)}Buscar<div class="app-kbd">⌘K</div></div>
        <div class="btn btn-suave btn-sm">${ic("external", "var(--st-acento-fuerte)", 14, 1.75)}Ver mi tienda</div>
        <div class="app-avatar">${iniciales}</div>
      </div>
    </div>`;
  };

  /**
   * Navegador completo con el panel adentro. El contenido de la página se superpone
   * al .app-content con coords ABSOLUTAS de canvas (ver CONTENT) — no se anida
   * adentro, para que spotlight/cursor compartan el mismo sistema de coordenadas.
   *
   * `url`: lo que se lee en la barra. El panel vive en el APEX
   * (`sorteatelo.cl/admin/…`, src/middleware.ts); un tour de storefront usaría
   * `<slug>.sorteatelo.cl`. Es un parámetro a propósito: el frame es genérico.
   */
  const browserFrame = (url, activeIdx, opt = {}) => {
    const g = { ...FRAME, ...(opt.geo ?? {}) };
    return `<div class="app-browser" style="left:${g.left}px;top:${g.top}px;width:${g.width}px;height:${g.height}px;">
      <div class="app-chrome">
        <div class="app-dot"></div><div class="app-dot"></div><div class="app-dot"></div>
        <div class="app-url">${url}</div>
        <div class="app-chrome-spacer"></div>
      </div>
      <div class="app-body">
        ${rail(activeIdx, opt)}
        <div class="app-main">
          ${topbar(opt)}
          <div class="app-content"></div>
        </div>
      </div>
    </div>`;
  };

  // ══════════════════════════════════════════════ superficies del panel
  /** PageHeader del panel: h1 Fraunces + bajada. Coords absolutas de canvas. */
  const pageHeader = (x, y, titulo, bajada) =>
    `<div style="position:absolute;left:${x}px;top:${y}px;">
      <div class="pg-title">${titulo}</div>
      ${bajada ? `<div class="pg-desc" style="margin-top:6px;">${bajada}</div>` : ""}
    </div>`;

  /** PanelCard: superficie SIN borde con sombra difusa (§4). Coords absolutas. */
  const panelCard = (x, y, w, h, inner = "") =>
    `<div class="pnl-card" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;">${inner}</div>`;

  /** Cabecera de una PanelCard: ícono + título + descripción. Relativa a la card. */
  const panelHead = (x, y, icono, titulo, desc) =>
    `<div style="position:absolute;left:${x}px;top:${y}px;">
      <div class="pnl-head">${ic(icono, T.texto, 19, 1.75)}<span class="pnl-title">${titulo}</span></div>
      ${desc ? `<div class="pnl-desc" style="margin-top:6px;max-width:520px;">${desc}</div>` : ""}
    </div>`;

  /**
   * Campo de formulario del panel (label + input + descripción opcional).
   * `opt.valor` vacío ⇒ se muestra el placeholder en gris (clase .vacio).
   * `opt.foco` ⇒ borde cobalto (el campo que el cursor acaba de clickear).
   */
  const campo = (x, y, w, label, opt = {}) => {
    const alto = opt.alto ?? 40;
    const lleno = opt.valor != null && opt.valor !== "";
    const texto = lleno ? opt.valor : (opt.placeholder ?? "");
    const clase = `fld-input${lleno ? "" : " vacio"}${opt.foco ? " foco" : ""}`;
    return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;">
      <div class="fld-label">${label}</div>
      <div class="${clase}" style="height:${alto}px;margin-top:6px;">${texto}</div>
      ${opt.desc ? `<div class="fld-desc" style="margin-top:5px;">${opt.desc}</div>` : ""}
    </div>`;
  };

  /** Textarea del panel (mismo contrato que `campo`, con alto explícito). */
  const area = (x, y, w, h, label, opt = {}) => {
    const lleno = opt.valor != null && opt.valor !== "";
    const texto = lleno ? opt.valor : (opt.placeholder ?? "");
    return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;">
      <div class="fld-label">${label}</div>
      <div class="fld-area${lleno ? "" : " vacio"}${opt.foco ? " foco" : ""}" style="height:${h}px;margin-top:6px;">${texto}</div>
    </div>`;
  };

  /** Botón del panel. `variante`: primario | premio | suave | default. */
  const boton = (x, y, texto, variante = "primario", opt = {}) =>
    `<div class="btn btn-${variante}${opt.sm ? " btn-sm" : ""}" style="position:absolute;left:${x}px;top:${y}px;">${opt.icono ? ic(opt.icono, variante === "primario" ? T.invertido : T.texto, 16, 1.8) : ""}${texto}</div>`;

  /** Switch on/off. */
  const switchEl = (x, y, on) =>
    `<div class="sw${on ? " on" : ""}" style="position:absolute;left:${x}px;top:${y}px;"><div class="sw-knob"></div></div>`;

  // ══════════════════════════════════════════════ primitivas
  const lb = (texto, hue = "gris", opt = {}) =>
    `<div class="lb lb-${hue}">${opt.icono ? ic(opt.icono, "currentColor", 13, 2) : ""}${texto}</div>`;

  const ava = (txt, bg, sm) => `<div class="ava${sm ? " ava-sm" : ""}" style="background:${bg};">${txt}</div>`;
  const avaStack = (team, sm) =>
    `<div class="ava-stack">${team.map((m, i) => `<div style="margin-left:${i === 0 ? 0 : (sm ? -7 : -8)}px;">${ava(m.txt, m.bg, sm)}</div>`).join("")}</div>`;
  const segmented = (opts, active) =>
    `<div class="seg">${opts.map((o, i) => `<div class="seg-opt${i === active ? " active" : ""}">${o}</div>`).join("")}</div>`;

  /**
   * Crossfade stack — dos variantes del MISMO elemento en el mismo lugar, para
   * togglear estado con GSAP (opacity 1→0 / 0→1 en 2 frames).
   *
   * Emite <div class="tour-stack" style="width;height"> con dos hijos absolutos:
   *   #<id>-a (visible)  y  #<id>-b (.tour-hidden)
   * El width/height EXPLÍCITO es obligatorio: sin él el stack colapsa a 0 en su
   * fila y el elemento se cae de la línea.
   *
   * En el timeline:
   *   tl.fromTo("#<id>-a", {opacity:1}, {opacity:0, duration:f(2), ease:"none"}, f(t));
   *   tl.fromTo("#<id>-b", {opacity:0}, {opacity:1, duration:f(2), ease:"none"}, f(t));
   */
  const stackEl = (id, w, h, htmlA, htmlB) =>
    `<div class="tour-stack" style="width:${w}px;height:${h}px;">
      <div id="${id}-a" class="tour-abs" style="width:${w}px;height:${h}px;">${htmlA}</div>
      <div id="${id}-b" class="tour-abs tour-hidden" style="width:${w}px;height:${h}px;">${htmlB}</div>
    </div>`;

  // ══════════════════════════════════════════════ overlays del tour
  const spotEl = (id, x, y, w, h, r = 12) =>
    `<div id="${id}" class="spot" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${r}px;"></div>`;

  /**
   * Tooltip anclado a un punto del mock.
   * target: {x,y} punto del elemento destacado (donde apunta el pico).
   * place: "below" | "above" | "right" | "left".
   * n / total: "PASO n DE total".
   */
  const tipEl = (id, target, place, n, titulo, cuerpo, total = 3) => {
    const W = 402, GAP = 18, BEAK = 16, INSET = 40, H_EST = 186;
    const clampX = (v) => Math.max(30, Math.min(1920 - W - 30, v));
    let left, top, beak;
    if (place === "below") {
      left = clampX(target.x - INSET); top = target.y + GAP;
      beak = `top:${-BEAK / 2}px;left:${target.x - left - BEAK / 2}px;`;
    } else if (place === "above") {
      left = clampX(target.x - INSET); top = target.y - GAP - H_EST;
      beak = `bottom:${-BEAK / 2}px;left:${target.x - left - BEAK / 2}px;`;
    } else if (place === "right") {
      left = target.x + GAP; top = target.y - INSET;
      beak = `left:${-BEAK / 2}px;top:${target.y - top - BEAK / 2}px;`;
    } else { // left
      left = target.x - GAP - W; top = target.y - INSET;
      beak = `right:${-BEAK / 2}px;top:${target.y - top - BEAK / 2}px;`;
    }
    return `<div id="${id}" class="tip" style="left:${left}px;top:${top}px;width:${W}px;">
      <div class="tip-beak" style="${beak}"></div>
      <div class="tip-box">
        <div class="tip-numrow"><div class="tip-num">${n}</div><div class="tip-eyebrow">PASO ${n} DE ${total}</div></div>
        <div class="tip-title">${titulo}</div>
        <div class="tip-body">${cuerpo}</div>
      </div>
    </div>`;
  };

  // Cursor: punta blanca + anillo de click. Se mueve con transform x/y (gotcha 10:
  // el guard bloquea el render si se anima left/top). Posición inicial:
  //   tl.set("#cursor-0", { x, y }, f(t));
  const cursorEl = (id) =>
    `<div id="${id}" class="wt-cursor" style="left:0;top:0;">
      <div id="${id}-ring" class="wt-cursor-ring"></div>
      <svg width="38" height="38" viewBox="0 0 28 28" class="wt-cursor-svg">
        <path d="M3 2 L3 21 L8 16.2 L11.4 23.2 L14.2 21.8 L10.8 15 L17.2 15 Z" fill="var(--st-blanco)" stroke="var(--st-tinta)" stroke-width="1.6" stroke-linejoin="round"/>
      </svg>
    </div>`;

  // Monta los stages: [{ el: "step-0-stage", html: () => "..." }, ...]
  const mount = (stages) => {
    stages.forEach((s) => {
      const node = document.getElementById(s.el);
      if (node) node.innerHTML = s.html();
    });
  };

  window.TourKit = {
    CHROME, FRAME, CONTENT, NAV_PRINCIPAL, NAV_PIE, IC, T,
    ic, isotipo, navRow, rail, topbar, browserFrame,
    pageHeader, panelCard, panelHead, campo, area, boton, switchEl,
    lb, ava, avaStack, segmented, stackEl, spotEl, tipEl, cursorEl, mount,
  };
})();
