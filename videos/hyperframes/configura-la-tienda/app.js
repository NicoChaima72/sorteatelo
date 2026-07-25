// @ts-nocheck
/**
 * app.js — mock de `/admin/configuracion` para la cápsula "Configura la tienda".
 * Coords absolutas del canvas 1920×1080.
 *
 * Pantalla real: `src/pages/admin/configuracion.tsx` — `SimpleGrid cols={{base:1, lg:2}}` con
 * `CredencialFlowCard` (izquierda) y `ConfiguracionTiendaCard` (derecha), ambas `PanelCard`.
 * Catálogo: `../MOCKS.md`.
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

  // ══════════════════════════════════════════════ 1) GEOMETRÍA (fuente única)
  // El timeline lee window.TOUR.P → cursor, spotlight y tooltip alineados por construcción.

  const PAD = 32;                          // gutter del AppShell en lg (padding="xl")
  const PAGE_L = CONTENT.left + PAD;       // 474
  const PAGE_T = CONTENT.top + 28;         // 208

  // PageHeader: h1 34px (lh 1.2) + bajada 16px, más el `mb="lg"` del componente real.
  const CARDS_Y = PAGE_T + 41 + 6 + 21 + 26;   // 302

  const COL_W = 594;                       // (ancho útil 1204 − spacing 16) / 2
  const IZQ_X = PAGE_L;                    // 474
  const DER_X = PAGE_L + COL_W + 16;       // 1084
  const IN = 24;                           // padding de la PanelCard
  const FIELD_W = COL_W - IN * 2;          // 546

  /** Acumulador de layout vertical: evita aritmética a mano y que un ajuste desalinee todo. */
  const flujo = (inicio) => {
    let y = inicio;
    return {
      avanzar(px) { const actual = y; y += px; return actual; },
      get alto() { return y; },
    };
  };

  // ── card izquierda: «Pagos (Flow)» ────────────────────────────────────────
  const L = flujo(IN);
  const L_HEAD = L.avanzar(26 + 6 + 42 + 20);   // título + bajada (2 líneas) + aire
  const L_ESTADO = L.avanzar(52 + 22);          // bloque inset del estado
  const L_APIKEY = L.avanzar(21 + 6 + 40 + 18);
  const L_SECRET = L.avanzar(21 + 6 + 40 + 18);
  const L_AMB = L.avanzar(21 + 6 + 40 + 22);
  const L_BOTON = L.avanzar(40);
  const IZQ_H = L.alto + IN;

  // ── card derecha: «Tu tienda» ─────────────────────────────────────────────
  const R = flujo(IN);
  const R_HEAD = R.avanzar(26 + 6 + 21 + 20);
  const R_SEC_ASSETS = R.avanzar(20 + 10);
  const R_ASSETS = R.avanzar(62 + 16);          // fila de assets (logo + portada)
  const R_DIV1 = R.avanzar(1 + 16);
  const R_DESC = R.avanzar(21 + 6 + 54 + 16);
  const R_COLOR = R.avanzar(21 + 6 + 40 + 18);
  const R_DIV2 = R.avanzar(1 + 14);
  const R_SEC_TEXTOS = R.avanzar(20 + 10);
  const R_HERO = R.avanzar(21 + 6 + 40 + 16);   // ← target del paso 2
  const R_SUB = R.avanzar(21 + 6 + 40 + 22);
  const R_BOTON = R.avanzar(40);                // ← target del paso 3
  const DER_H = R.alto + IN;

  // Ítem «Configuración» del rail: al pie, dentro del footer (padding 8).
  const RAIL_ITEM = { x: FRAME.left + 8, y: FRAME.top + FRAME.height - 8 - 34, w: 216, h: 34 };

  const P = {
    start: { x: 980, y: 700 },                                   // entra por el centro-bajo
    p0: { x: RAIL_ITEM.x + 96, y: RAIL_ITEM.y + 17 },            // «Configuración» en el rail
    p1: { x: DER_X + IN + 240, y: CARDS_Y + R_HERO + 47 },       // input «Título del hero»
    p2: { x: DER_X + IN + 82, y: CARDS_Y + R_BOTON + 20 },       // botón «Guardar cambios»
  };
  window.TOUR = { P };

  // ══════════════════════════════════════════════ 2) MOCK de la pantalla
  const URL = "sorteatelo.cl/admin/configuracion";
  const NAV_IDX = 4;   // Configuración (NAV_PIE, después de las 4 principales)
  // Tienda de ejemplo. El color del chip es DATO del tenant (design.md §9 lo permite como único
  // color-desde-dato del admin), pero acá sale de un token para no meter un hex en el tour (I7).
  const TIENDA = { tienda: "Ediciones Luna", color: "var(--st-exito)", iniciales: "PL" };

  const HERO_PLACEHOLDER = "Bienvenido a mi tienda";
  const HERO_VALOR = "Todo lo que publiqué este año";

  /** Fila de un asset de marca: miniatura vacía (dashed) + label + input de archivo. */
  const filaAsset = (x, y, w, label) => `
    <div class="cfg-asset" style="left:${x}px;top:${y}px;width:${w}px;height:62px;">
      <div class="cfg-thumb" style="left:0;top:2px;">${ic("photo", "var(--st-texto-tenue)", 20, 1.5)}</div>
      <div style="position:absolute;left:70px;top:0;width:${w - 70}px;">
        <div class="fld-label">${label}</div>
        <div class="fld-input vacio" style="height:36px;margin-top:5px;">${ic("photo", "var(--st-texto-tenue)", 15, 1.75)}Elegir imagen</div>
      </div>
    </div>`;

  /** Card «Pagos (Flow)» — write-only: nunca precarga secretos, sólo muestra el estado. */
  const cardFlow = () => panelCard(IZQ_X, CARDS_Y, COL_W, IZQ_H,
    panelHead(IN, L_HEAD, "card", "Pagos (Flow)",
      "Conecta tu cuenta de Flow para cobrar. Tus claves se guardan cifradas y nunca se muestran.") +
    `<div class="pnl-inset cfg-estado" style="left:${IN}px;top:${L_ESTADO}px;width:${FIELD_W}px;height:52px;">
       <div class="cfg-estado-label">Estado</div>
       <div class="cfg-estado-badge">${lb("No conectada", "borde")}</div>
     </div>` +
    campo(IN, L_APIKEY, FIELD_W, "API Key", { placeholder: "••••••••••••" }) +
    campo(IN, L_SECRET, FIELD_W, "Secret Key", { placeholder: "••••••••••••" }) +
    campo(IN, L_AMB, 208, "Ambiente", { valor: "Sandbox (pruebas)" }) +
    boton(IN, L_BOTON, "Guardar credenciales", "primario"),
  );

  /**
   * Card «Tu tienda». `estado`:
   *   "vacio"  → el título del hero muestra el placeholder (paso 1)
   *   "stack"  → crossfade placeholder ↔ valor (paso 2, lo togglea el timeline)
   *   "lleno"  → el valor ya escrito (paso 3)
   */
  const cardTienda = (estado) => {
    const heroVacio = `<div class="fld-input vacio" style="width:${FIELD_W}px;height:40px;">${HERO_PLACEHOLDER}</div>`;
    const heroLleno = `<div class="fld-input foco" style="width:${FIELD_W}px;height:40px;">${HERO_VALOR}</div>`;
    const heroInput =
      estado === "vacio" ? heroVacio :
      estado === "lleno" ? heroLleno :
      stackEl("hero", FIELD_W, 40, heroVacio, heroLleno);

    return panelCard(DER_X, CARDS_Y, COL_W, DER_H,
      panelHead(IN, R_HEAD, "palette", "Tu tienda",
        "La marca de tu tienda: logo, imagen, color y textos.") +
      `<div class="cfg-sec" style="left:${IN}px;top:${R_SEC_ASSETS}px;">${ic("photo", "var(--st-texto)", 17, 1.75)}<span class="cfg-sec-txt">Logo e imagen de portada</span></div>` +
      filaAsset(IN, R_ASSETS, 258, "Logo de la tienda") +
      filaAsset(IN + 288, R_ASSETS, 258, "Imagen de hero") +
      `<div class="cfg-div" style="left:${IN}px;top:${R_DIV1}px;width:${FIELD_W}px;"></div>` +
      area(IN, R_DESC, FIELD_W, 54, "Descripción", { valor: "Libros y fanzines hechos a mano." }) +
      campo(IN, R_COLOR, 208, "Color de marca (hex)", { valor: "#1d7a70" }) +
      `<div class="cfg-div" style="left:${IN}px;top:${R_DIV2}px;width:${FIELD_W}px;"></div>` +
      `<div class="cfg-sec" style="left:${IN}px;top:${R_SEC_TEXTOS}px;">${ic("navbar", "var(--st-texto)", 17, 1.75)}<span class="cfg-sec-txt">Textos del storefront</span></div>` +
      `<div style="position:absolute;left:${IN}px;top:${R_HERO}px;width:${FIELD_W}px;">
         <div class="fld-label">Título del hero</div>
         <div style="position:absolute;left:0;top:27px;width:${FIELD_W}px;height:40px;">${heroInput}</div>
       </div>` +
      campo(IN, R_SUB, FIELD_W, "Subtítulo del hero", { placeholder: "Una frase corta que enganche." }) +
      boton(IN, R_BOTON, "Guardar cambios", "primario"),
    );
  };

  /** Notificación de Mantine tras guardar (arriba a la derecha del área de contenido). */
  const toast = () => `
    <div id="toast" class="cfg-toast tour-hidden" style="left:${CONTENT.right - 32 - 340}px;top:${CONTENT.top + 18}px;width:340px;height:56px;">
      <div class="cfg-toast-barra"></div>
      <div class="cfg-toast-ic">${ic("check", "var(--st-exito)", 18, 2.2)}</div>
      <div class="cfg-toast-txt">Cambios guardados.</div>
    </div>`;

  // Wrapper del canvas con las 4 coords explícitas: el shorthand `inset` NO está en la lista de
  // propiedades que el motor conserva del DOM inyectado (gotcha 9) — venía funcionando de suerte.
  const pagina = (estado) => `<div style="position:absolute;left:0;top:0;width:1920px;height:1080px;">
    ${pageHeader(PAGE_L, PAGE_T, "Configuración", "Los ajustes de tu tienda: pagos, marca y bases del sorteo.")}
    ${cardFlow()}
    ${cardTienda(estado)}
  </div>`;

  // ══════════════════════════════════════════════ 3) STAGES (un beat por paso)
  // El estado se SOSTIENE: lo que se escribe en el paso 2 sigue escrito en el 3.
  mount([
    {
      el: "step-0-stage",
      html: () =>
        browserFrame(URL, NAV_IDX, TIENDA) +
        pagina("vacio") +
        spotEl("spot-0", RAIL_ITEM.x, RAIL_ITEM.y, RAIL_ITEM.w, RAIL_ITEM.h, 8) +
        tipEl("tip-0", { x: P.p0.x, y: RAIL_ITEM.y - 4 }, "above", 1,
          "Abre Configuración",
          "Está al final del menú lateral, junto al resto de los ajustes.") +
        cursorEl("cursor-0"),
    },
    {
      el: "step-1-stage",
      html: () =>
        browserFrame(URL, NAV_IDX, TIENDA) +
        pagina("stack") +
        spotEl("spot-1", DER_X + IN - 8, CARDS_Y + R_HERO - 6, FIELD_W + 16, 79, 10) +
        tipEl("tip-1", { x: DER_X + IN - 14, y: CARDS_Y + R_HERO + 40 }, "left", 2,
          "Escribe el título del hero",
          "Es el titular grande de la portada. Si lo dejas vacío, se usa el nombre de la tienda.") +
        cursorEl("cursor-1"),
    },
    {
      el: "step-2-stage",
      html: () =>
        browserFrame(URL, NAV_IDX, TIENDA) +
        pagina("lleno") +
        toast() +
        spotEl("spot-2", DER_X + IN - 8, CARDS_Y + R_BOTON - 8, 186, 56, 10) +
        tipEl("tip-2", { x: DER_X + IN - 14, y: CARDS_Y + R_BOTON + 20 }, "left", 3,
          "Guarda los cambios",
          "Listo: la tienda ya muestra el texto nuevo.") +
        cursorEl("cursor-2"),
    },
  ]);
})();
