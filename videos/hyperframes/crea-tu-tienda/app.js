// @ts-nocheck
/**
 * app.js — mocks de la cápsula "Crea tu tienda y tu sorteo".
 * Coords absolutas del canvas 1920×1080.
 *
 * DOS pantallas (ambas nuevas en el catálogo, ver ../MOCKS.md):
 *   A) Alta self-service — `src/components/admin/crear-tienda.tsx`, que `admin-layout.tsx`
 *      renderiza EN LUGAR del contenido cuando el Organizador todavía no tiene tienda:
 *      topbar sin chip ni «Ver mi tienda», rail sin ítem activo, Card centrada.
 *   B) Sorteo · crear — `src/pages/admin/sorteo.tsx` sin sorteo activo (organizador nuevo ⇒
 *      sin sección de participantes). Al crear, el formulario deja lugar a las 3 StatCards.
 *
 * Lo GENÉRICO (browser frame, rail tinta, topbar, PanelCard, PageHeader, campos, botones,
 * tooltip, spotlight, cursor, crossfade stack) viene de window.TourKit.
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
  const { ic, browserFrame, pageHeader, panelCard, campo, boton,
          spotEl, tipEl, cursorEl, stackEl, mount, CONTENT, FRAME } = K;

  // ══════════════════════════════════════════════ 1) GEOMETRÍA (fuente única)
  // El timeline lee window.TOUR.P → cursor, spotlight y tooltip alineados por construcción.

  /** Acumulador de layout vertical: evita aritmética a mano y desalineados en cascada. */
  const flujo = (inicio) => {
    let y = inicio;
    return {
      avanzar(px) { const actual = y; y += px; return actual; },
      get alto() { return y; },
    };
  };

  // ── Pantalla A: Card centrada en el canvas ────────────────────────────────
  const A_W = 440;                 // ancho de la Card del alta
  const A_IN = 28;                 // padding de la Card
  const A_FW = A_W - A_IN * 2;     // 384 — ancho útil de los campos

  const A = flujo(A_IN);
  const A_ICON = A.avanzar(48 + 14);            // ThemeIcon circular
  const A_TITLE = A.avanzar(24 + 10);           // «Crea tu tienda» (Text lg fw600)
  const A_DESC = A.avanzar(66 + 22);            // bajada dimmed (3 líneas)
  const A_IDENT = A.avanzar(132 + 16);          // label + input + desc + preview ← paso 1
  const A_NOMBRE = A.avanzar(67 + 18);          // label + input
  const A_ALERT = A.avanzar(60 + 20);           // aviso del identificador irreversible
  const A_BOTON = A.avanzar(40);                // «Crear mi tienda» (fullWidth) ← paso 1
  const A_H = A.alto + A_IN;

  // Centrada vertical y horizontalmente en el área de contenido del panel.
  const A_X = Math.round((CONTENT.left + CONTENT.right) / 2 - A_W / 2);   // 856
  const A_Y = Math.round((CONTENT.top + CONTENT.bottom) / 2 - A_H / 2);

  // ── Pantalla B: página Sorteo ─────────────────────────────────────────────
  const PAD = 32;                          // gutter del AppShell en lg (padding="xl")
  const PAGE_L = CONTENT.left + PAD;       // 474
  const PAGE_T = CONTENT.top + 28;         // 208
  const CARDS_Y = PAGE_T + 41 + 6 + 21 + 26;   // 302 — bajo el PageHeader (mb="lg")

  const B_IN = 24;                         // padding de la PanelCard
  const B_FW = 640;                        // ancho de los campos del formulario
  const B_W = B_FW + B_IN * 2;             // 688

  const B = flujo(B_IN);
  const B_HEAD = B.avanzar(26 + 20);       // «Crea tu sorteo» (Text fw600)
  const B_NOMBRE = B.avanzar(67 + 18);     // ← target del paso 2
  const B_PREMIO = B.avanzar(67 + 18);
  const B_FECHA = B.avanzar(67 + 18);
  const B_BASES = B.avanzar(67 + 22);
  const B_BOTON = B.avanzar(40);           // ← target del paso 3
  const B_H = B.alto + B_IN;

  // Estado de gestión: SimpleGrid de 3 StatCards a lo ancho del contenido.
  const GRID_W = CONTENT.right - PAGE_L - PAD;    // 1204
  const STAT_W = 390;
  const STAT_GAP = (GRID_W - STAT_W * 3) / 2;     // 17
  const STAT_H = 132;

  // Ítem «Sorteo» del rail (idx 3): brand 54 + divisor 1 + padding 8, filas de 34 + gap 2.
  const RAIL_ITEM = {
    x: FRAME.left + 8,
    y: FRAME.top + K.CHROME.navegadorAlto + 54 + 1 + 8 + 3 * 36,
    w: K.CHROME.railAncho - 16,
    h: 34,
  };

  const P = {
    start: { x: 1040, y: 900 },                                  // entra por el centro-bajo
    p0: { x: A_X + A_IN + 200, y: A_Y + A_IDENT + 47 },          // campo Identificador
    p1: { x: A_X + A_IN + 192, y: A_Y + A_BOTON + 20 },          // botón «Crear mi tienda»
    p2: { x: RAIL_ITEM.x + 96, y: RAIL_ITEM.y + 17 },            // ítem «Sorteo» del rail
    p3: { x: PAGE_L + B_IN + 200, y: CARDS_Y + B_NOMBRE + 47 },  // campo «Nombre del sorteo»
    p4: { x: PAGE_L + B_IN + 68, y: CARDS_Y + B_BOTON + 20 },    // botón «Crear sorteo»
  };
  window.TOUR = { P };

  // ══════════════════════════════════════════════ 2) DATOS DEL MOCK
  const SLUG = "tienda-aurora";
  const TIENDA = { tienda: "Tienda Aurora", color: "var(--st-exito-6)", iniciales: "TA" };
  const SESION = { iniciales: "NA" };                 // avatar del Organizador recién llegado
  const URL_ALTA = "sorteatelo.cl/admin";
  const URL_SORTEO = "sorteatelo.cl/admin/sorteo";

  // ══════════════════════════════════════════════ 3) PANTALLA A — alta self-service
  /** Bloque del campo Identificador. `lleno` agrega el preview del subdominio. */
  const bloqueIdent = (lleno) => `
    <div class="fld-label">Identificador de la tienda</div>
    <div class="fld-input${lleno ? " foco" : " vacio"}" style="width:${A_FW}px;height:40px;margin-top:6px;">${lleno ? SLUG : "mi-tienda"}</div>
    <div class="fld-desc" style="margin-top:5px;">Solo minúsculas, números y guiones. Será la dirección de tu tienda.</div>
    ${lleno ? `<div class="ct-preview" style="margin-top:8px;">Tu tienda vivirá en <span class="ct-preview-slug">${SLUG}</span>.sorteatelo.cl</div>` : ""}`;

  const bloqueNombre = (lleno) => `
    <div class="fld-label">Nombre de la tienda</div>
    <div class="fld-input${lleno ? "" : " vacio"}" style="width:${A_FW}px;height:40px;margin-top:6px;">${lleno ? TIENDA.tienda : "Mi Tienda"}</div>`;

  /** Card del alta. `estado`: "stack" (el timeline tipea) | "lleno". */
  const cardAlta = (estado) => {
    const ident = estado === "lleno"
      ? bloqueIdent(true)
      : stackEl("slug", A_FW, 132, bloqueIdent(false), bloqueIdent(true));
    const nombre = estado === "lleno"
      ? bloqueNombre(true)
      : stackEl("nombre", A_FW, 67, bloqueNombre(false), bloqueNombre(true));

    return `<div class="ct-card" style="left:${A_X}px;top:${A_Y}px;width:${A_W}px;height:${A_H}px;">
      <div class="ct-icon" style="left:${A_IN + (A_FW - 48) / 2}px;top:${A_ICON}px;">${ic("store", "var(--st-acento)", 26, 1.7)}</div>
      <div class="ct-title" style="left:${A_IN}px;top:${A_TITLE}px;width:${A_FW}px;">Crea tu tienda</div>
      <div class="ct-desc" style="left:${A_IN}px;top:${A_DESC}px;width:${A_FW}px;">Elige un identificador y un nombre para empezar. Podrás configurar tus productos, pagos y sorteo antes de publicarla.</div>
      <div style="position:absolute;left:${A_IN}px;top:${A_IDENT}px;width:${A_FW}px;height:132px;">${ident}</div>
      <div style="position:absolute;left:${A_IN}px;top:${A_NOMBRE}px;width:${A_FW}px;height:67px;">${nombre}</div>
      <div class="ct-alert" style="left:${A_IN}px;top:${A_ALERT}px;width:${A_FW}px;height:60px;">
        ${ic("alert", "var(--st-texto-suave)", 17, 1.75)}
        <div class="ct-alert-txt">El identificador no se puede cambiar después de crear la tienda.</div>
      </div>
      <div class="btn btn-primario" style="position:absolute;left:${A_IN}px;top:${A_BOTON}px;width:${A_FW}px;height:40px;">Crear mi tienda</div>
    </div>`;
  };

  /** Notificación de Mantine (arriba a la derecha del área de contenido). */
  const toast = (id, texto) => `
    <div id="${id}" class="ct-toast tour-hidden" style="left:${CONTENT.right - 32 - 460}px;top:${CONTENT.top + 18}px;width:460px;height:56px;">
      <div class="ct-toast-barra"></div>
      <div class="ct-toast-ic">${ic("check", "var(--st-exito)", 18, 2.2)}</div>
      <div class="ct-toast-txt">${texto}</div>
    </div>`;

  // ══════════════════════════════════════════════ 4) PANTALLA B — Sorteo · crear
  const SORTEO = {
    nombre: "Sorteo de lanzamiento",
    premio: "Pack firmado + póster",
    cierre: "31-08-2026 20:00",
  };

  /** Campo del formulario del sorteo, con las dos variantes del crossfade. */
  const campoSorteo = (id, y, label, placeholder, valor, opt = {}) => {
    const caja = (lleno) => `
      <div class="fld-label">${label}</div>
      <div class="fld-input${lleno ? (opt.foco ? " foco" : "") : " vacio"}" style="width:${B_FW}px;height:40px;margin-top:6px;">${lleno ? (opt.mono ? `<span class="mono">${valor}</span>` : valor) : placeholder}</div>`;
    const inner = opt.estado === "lleno" ? caja(true) : stackEl(id, B_FW, 67, caja(false), caja(true));
    return `<div style="position:absolute;left:${B_IN}px;top:${y}px;width:${B_FW}px;height:67px;">${inner}</div>`;
  };

  /** Formulario «Crea tu sorteo». `estado`: "stack" (el timeline tipea) | "lleno". */
  const formSorteo = (estado, x, y) => panelCard(x, y, B_W, B_H,
    `<div style="position:absolute;left:${B_IN}px;top:${B_HEAD}px;"><span class="pnl-title">Crea tu sorteo</span></div>` +
    campoSorteo("srNombre", B_NOMBRE, "Nombre del sorteo", "Ej. Sorteo de lanzamiento", SORTEO.nombre, { estado, foco: true }) +
    campoSorteo("srPremio", B_PREMIO, "Premio", "Ej. Un pack firmado + envío", SORTEO.premio, { estado }) +
    campoSorteo("srFecha", B_FECHA, "Fecha de cierre", "dd-mm-aaaa hh:mm", SORTEO.cierre, { estado, mono: true }) +
    campo(B_IN, B_BASES, B_FW, "Enlace a las bases (opcional)", { placeholder: "https://…" }) +
    boton(B_IN, B_BOTON, "Crear sorteo", "primario"),
  );

  /** StatCard del estado de gestión (label + valor + hint). */
  const statCard = (x, y, label, valor, hint, opt = {}) => panelCard(x, y, STAT_W, STAT_H,
    `<div class="ct-stat-label" style="position:absolute;left:20px;top:20px;">${label}</div>
     <div class="ct-stat-row" style="position:absolute;left:20px;top:49px;">
       ${opt.icono ? ic(opt.icono, "var(--st-acento)", 26, 1.8) : ""}
       <div class="${opt.mono ? "ct-stat-num" : "ct-stat-valor"}">${valor}</div>
     </div>
     <div class="ct-stat-hint" style="position:absolute;left:20px;top:95px;">${hint}</div>`,
  );

  /** Fila de gestión: reemplaza al formulario cuando el sorteo queda creado. */
  const gestion = () =>
    statCard(0, 0, "Participaciones", "0", "aún sin tickets", { mono: true }) +
    statCard(STAT_W + STAT_GAP, 0, "Estado", "Activo", "en curso", { icono: "ticket" }) +
    statCard((STAT_W + STAT_GAP) * 2, 0, "Cierre", "31 ago", "cierra a las 20:00", { mono: true });

  const paginaSorteo = (estado) => `<div style="position:absolute;left:0;top:0;width:1920px;height:1080px;">
    ${pageHeader(PAGE_L, PAGE_T, "Sorteo", "Crea y gestiona el sorteo de la tienda.")}
    ${estado === "swap"
      ? `<div style="position:absolute;left:${PAGE_L}px;top:${CARDS_Y}px;width:${GRID_W}px;height:${B_H}px;">
           ${stackEl("gestion", GRID_W, B_H, formSorteo("lleno", 0, 0), gestion())}
         </div>`
      : formSorteo(estado, PAGE_L, CARDS_Y)}
  </div>`;

  // ══════════════════════════════════════════════ 5) STAGES (un beat por paso)
  // El estado se SOSTIENE: lo tipeado en el paso 2 sigue tipeado en el 3.
  mount([
    {
      // Paso 1 — pantalla A: rail sin ítem activo, topbar sin chip (aún no hay tienda).
      el: "step-0-stage",
      html: () =>
        browserFrame(URL_ALTA, -1, { sinTienda: true, iniciales: SESION.iniciales }) +
        cardAlta("stack") +
        toast("toast-alta", "¡Tu tienda fue creada! Vamos a configurarla.") +
        spotEl("spot-0", A_X - 10, A_Y - 10, A_W + 20, A_H + 20, 12) +
        tipEl("tip-0", { x: A_X + A_W - 8, y: A_Y + 190 }, "right", 1,
          "Completa el alta",
          "Elige el identificador — no se puede cambiar después — y el nombre. Luego, «Crear mi tienda».") +
        cursorEl("cursor-0"),
    },
    {
      // Paso 2 — pantalla B: ya hay tienda (chip en el topbar) y el rail marca «Sorteo».
      el: "step-1-stage",
      html: () =>
        browserFrame(URL_SORTEO, 3, TIENDA) +
        paginaSorteo("stack") +
        spotEl("spot-1", PAGE_L - 8, CARDS_Y - 8, B_W + 16, B_H + 16, 18) +
        tipEl("tip-1", { x: PAGE_L + B_W + 8, y: CARDS_Y + 118 }, "right", 2,
          "Entra a Sorteo",
          "Completa nombre, premio y fecha de cierre. El enlace a las bases es opcional.") +
        cursorEl("cursor-1"),
    },
    {
      // Paso 3 — click en «Crear sorteo»: toast + el formulario deja lugar a la gestión.
      el: "step-2-stage",
      html: () =>
        browserFrame(URL_SORTEO, 3, TIENDA) +
        paginaSorteo("swap") +
        toast("toast-sorteo", "Sorteo creado. Ya está activo.") +
        spotEl("spot-2", PAGE_L + B_IN - 10, CARDS_Y + B_BOTON - 10, 160, 60, 10) +
        tipEl("tip-2", { x: PAGE_L + B_IN + 150, y: CARDS_Y + B_BOTON + 20 }, "right", 3,
          "Crea el sorteo",
          "Queda activo al instante: cada compra que participa suma tickets.") +
        cursorEl("cursor-2"),
    },
  ]);
})();
