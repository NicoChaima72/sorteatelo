import { urlMcpPublica } from "~/lib/urlMcp";

/**
 * Guion de la guía «Conecta tu IA» — **DATA, separada del render** (I7 del plan).
 *
 * Vive como estructura y no como JSX por dos razones que se pagan solas:
 *
 * 1. **Es el seam con la cápsula de video** (D5): los 6 beats están pensados para mapear 1:1 a los
 *    6 beats de una cápsula HyperFrames. El spec del video se arma leyendo este módulo, no raspando
 *    prosa de un componente.
 * 2. **Es donde se corrige el copy.** La guía documenta la UI de terceros (Claude, ChatGPT), que
 *    cambia sin avisarnos: cuando cambie, se edita ACÁ y en un solo lugar — no repartido entre
 *    seis bloques de JSX.
 *
 * **Los pasos de terceros están verificados contra documentación oficial** (D10, 2026-07-26). Cada
 * app declara su `fuente`: si el copy se corrige, se corrige contra esa fuente, no de memoria.
 */

/** Las apps de IA para las que la guía tiene carril propio (D9: las dos habilitadas). */
export type IdAppIa = "claude" | "chatgpt";

export interface CapturaGuia {
  /** Nombre del archivo dentro de `/public/guia-ia/`. Un test verifica que exista. */
  archivo: string;
  /** Alt real: describe QUÉ se ve, no «captura de pantalla». */
  alt: string;
  ancho: number;
  alto: number;
}

export interface BeatGuion {
  /** 1..6. Es el número que se muestra y el que la cápsula usa como beat. */
  n: number;
  titulo: string;
  cuerpo: string;
  /** Pasos literales de una UI ajena (nombres de menú tal cual). */
  pasos?: readonly string[];
  /** Advertencia o excepción del paso. Va abajo, en tono bajo. */
  nota?: string;
  /**
   * Contenido que el render resuelve por su cuenta porque NO es prosa: hoy solo la dirección de
   * conexión con su botón de copiar, que sale de la config (I2) y no se puede escribir acá.
   */
  slot?: "url-conexion";
  capturas: readonly CapturaGuia[];
  /**
   * `true` en los beats cuyo contenido depende de la app elegida. Es el contrato que un test
   * verifica en las dos direcciones: lo marcado difiere entre carriles y lo no marcado es idéntico
   * — así el copy común no se puede desincronizar entre Claude y ChatGPT sin que algo se caiga.
   */
  variaPorApp?: boolean;
}

export interface AppIa {
  id: IdAppIa;
  nombre: string;
  /**
   * Requisitos honestos de plan/modo, en voz de persona. Ninguna app puede declarar cero (test):
   * un carril sin requisitos es un carril que promete de más.
   */
  requisitos: readonly string[];
  /** Contra qué se verificó el paso a paso. Para quien venga a corregirlo. */
  fuente: string;
}

export const APPS_IA: readonly AppIa[] = [
  {
    id: "claude",
    nombre: "Claude",
    requisitos: [
      "Sirve cualquier plan de Claude, incluido el gratis. En el gratis puedes tener un solo conector propio.",
      "Si tu cuenta es de un equipo (Team o Enterprise), el conector lo agrega el dueño de la organización.",
    ],
    fuente:
      "support.claude.com/en/articles/11175166 + la propia pantalla de Claude en español (vista el 2026-07-26)",
  },
  {
    id: "chatgpt",
    nombre: "ChatGPT",
    requisitos: [
      "Necesitas un plan pagado (Plus, Pro, Business, Enterprise o Edu). En el plan gratis no aparece.",
      "Hay que activar el modo desarrollador, que OpenAI todavía declara en beta.",
      "Solo desde el computador: la app del teléfono no agrega conectores.",
      "En cuentas de empresa, las acciones que CAMBIAN cosas pueden estar habilitadas solo en Business, Enterprise y Edu. Si tu ChatGPT solo puede mirar, es por eso.",
    ],
    fuente:
      "developers.openai.com/api/docs/guides/developer-mode + help.openai.com/en/articles/12584461 + la pantalla de Ajustes de ChatGPT en español (vista el 2026-07-26). El formulario del conector NO se pudo ver: aparece recién con el modo desarrollador activado, y activarlo es una decisión del dueño de la cuenta.",
  },
];

/** El carril que la cápsula de video mapea 1:1 (D5 + D9). */
export const APP_DE_LA_CAPSULA: IdAppIa = "claude";

/**
 * Beat 3 — el único paso que cambia de verdad entre una app y otra: dónde vive el menú.
 *
 * Los nombres de menú van **literales**, porque el Organizador los va a buscar con los ojos — y
 * están tomados de la **pantalla real en español**, no de la traducción de la documentación. La
 * diferencia no era cosmética: la doc de Claude habla de un botón «+» y de «Añadir conector
 * personalizado», y en pantalla el botón dice **«Agregar»**; el diálogo pide además un **«Nombre»**
 * que la doc no menciona. Un paso escrito con el nombre equivocado manda a mirar donde no hay nada.
 */
function beatAgregar(app: IdAppIa): BeatGuion {
  if (app === "chatgpt") {
    return {
      n: 3,
      titulo: "Agrégala en ChatGPT",
      cuerpo:
        "En ChatGPT los conectores propios viven en el modo desarrollador. Se activa una vez y queda listo para todos tus chats.",
      pasos: [
        "Abre ChatGPT en el computador y anda a Ajustes → «Complementos». Al final de esa lista está «Modo de desarrollador» (se abre dentro de «Seguridad e inicio de sesión», por eso la captura muestra esa sección marcada).",
        "Actívalo. ChatGPT lo marca como «RIESGO ELEVADO»: es el aviso que le pone a cualquier conector que no haya revisado él, no algo nuestro.",
        "Vuelve a «Complementos» y crea uno nuevo con el botón «+».",
        "Ponle un nombre y una descripción —los eliges tú— y pega la dirección que copiaste, con el «/mcp» del final incluido.",
        "Confirma. ChatGPT te va a mandar a Sortéatelo para que autorices (el paso 4) y después te muestra las herramientas que encontró.",
      ],
      nota:
        "Los dos últimos pasos aparecen recién con el modo desarrollador activado, así que pueden verse un poco distintos. Y ojo: dentro de «deep research» los conectores solo pueden leer — para que haga cambios tiene que ser por acá.",
      capturas: [
        {
          archivo: "chatgpt-modo-desarrollador.webp",
          alt: "El panel «Modo de desarrollador» de ChatGPT, con su aviso de riesgo elevado y el interruptor apagado.",
          ancho: 463,
          alto: 416,
        },
      ],
      variaPorApp: true,
    };
  }

  return {
    n: 3,
    titulo: "Agrégala en Claude",
    cuerpo:
      "Un conector propio se agrega una sola vez y queda disponible en todos tus chats.",
    pasos: [
      "Abre Claude y anda a «Personalizar → Conectores» (también llegas escribiendo claude.ai/customize/connectors).",
      "Arriba a la derecha aprieta «Agregar» y elige «Agregar conector personalizado».",
      "Ponle un nombre —el que quieras, es para reconocerlo— y pega la dirección en «URL del servidor MCP remoto».",
      "«Configuración avanzada» déjala como está: no necesitas OAuth Client ID ni secreto, eso se arregla solo.",
      "Aprieta «Agregar». Claude te va a mandar a Sortéatelo para que autorices (el paso 4).",
    ],
    nota:
      "En cuentas de equipo el camino es otro: el dueño de la organización lo agrega desde la configuración de la organización, no desde su perfil.",
    capturas: [
      {
        archivo: "claude-conectores.webp",
        alt: "La pantalla «Conectores» de Claude, con el botón «Agregar» arriba a la derecha.",
        ancho: 856,
        alto: 646,
      },
      {
        archivo: "claude-agregar-conector.webp",
        alt: "El diálogo «Agregar conector personalizado» de Claude, con los campos Nombre y URL del servidor MCP remoto.",
        ancho: 856,
        alto: 646,
      },
    ],
    variaPorApp: true,
  };
}

/** Beat 5 — el mismo paso, pero cada app enciende sus herramientas en un lugar distinto. */
function beatPedir(app: IdAppIa): BeatGuion {
  return {
    n: 5,
    titulo: "Pídele algo",
    cuerpo:
      "Listo. Escríbele como le hablarías a alguien de tu equipo: «¿cómo van las ventas de esta semana?» o «cambia el color principal de mi tienda». Lo que cambie queda guardado en tu cuenta al tiro.",
    nota:
      app === "chatgpt"
        ? "El conector aparece entre las herramientas del modo desarrollador. Antes de cada cambio, ChatGPT te va a pedir que confirmes."
        : "Dentro del chat, el conector se enciende con el botón «+» → «Conectores». Ahí mismo puedes dejar prendidas solo las herramientas que quieras.",
    capturas: [],
    variaPorApp: true,
  };
}

/**
 * El guion completo del carril `app`: 6 beats en orden.
 *
 * Los beats 1, 2, 4 y 6 son **los mismos objetos** para las dos apps (no copias): lo que se conecta
 * y lo que se autoriza es nuestro, no del cliente de IA. Solo cambian el «dónde se agrega» (3) y el
 * «dónde se enciende» (5).
 */
export function guionDe(app: IdAppIa): readonly BeatGuion[] {
  return [
    {
      n: 1,
      titulo: "Qué es esto",
      cuerpo:
        "Conectas una app de inteligencia artificial a tu cuenta y le pides cambios conversando, en vez de andar buscando dónde se editaba cada cosa. Trabaja con tus mismos permisos: ni uno más.",
      capturas: [],
    },
    {
      n: 2,
      titulo: "Copia la dirección de conexión",
      cuerpo:
        "Es la dirección de tu cuenta en Sortéatelo, y es la misma para todas tus tiendas: la conexión es tuya, no de una tienda.",
      slot: "url-conexion",
      capturas: [],
    },
    beatAgregar(app),
    {
      n: 4,
      titulo: "Autoriza en Sortéatelo",
      cuerpo:
        "Vas a caer en una pantalla nuestra con tu correo, lo que la app va a poder hacer y lo que no. Léela con calma: este es el momento en que decides.",
      nota:
        "Abajo aparece la dirección a la que te vamos a devolver. Si no la reconoces, rechaza — nadie te va a pedir esto por correo.",
      capturas: [
        {
          archivo: "consent.webp",
          alt: "La pantalla de autorización de Sortéatelo: qué va a poder hacer la app, qué no, y a qué dirección te devuelve.",
          ancho: 760,
          alto: 986,
        },
      ],
    },
    beatPedir(app),
    {
      n: 6,
      titulo: "El control es tuyo",
      cuerpo:
        "La conexión queda listada acá mismo, en Conexiones IA, con la última vez que la usó. Le cortas el acceso cuando quieras con «Revocar», y si quiere volver tiene que pedirte permiso de nuevo.",
      // Sin captura A PROPÓSITO: la lista de conexiones está literalmente detrás de este panel.
      // Una foto de la card que el Organizador tiene a 40 píxeles de distancia no enseña nada y sí
      // agrega una imagen más que mantener cada vez que la card cambie.
      capturas: [],
    },
  ];
}

/** Ejemplo de lo que se le puede pedir, atado a la tool REAL que lo resuelve (I3). */
export interface PromptEjemplo {
  texto: string;
  /**
   * Nombre de la tool de la whitelist del MCP que atiende ese pedido. Un test lo verifica contra el
   * registro real: si una tool se renombra o se retira, la guía deja de prometerla en rojo.
   */
  tool: string;
  nota?: string;
}

export const PROMPTS_EJEMPLO: readonly PromptEjemplo[] = [
  { texto: "¿Cómo van las ventas de mi tienda esta semana?", tool: "listar_ventas" },
  { texto: "Cambia el precio del pack de 3 a $5.000", tool: "actualizar_producto" },
  {
    texto: "Agrega una sección de preguntas frecuentes a mi página",
    tool: "agregar_seccion",
    nota: "Queda en el borrador de tu página: publicarla sigue siendo tuyo.",
  },
  { texto: "Cambia el color principal de mi tienda", tool: "cambiar_tema_pagina" },
  { texto: "Agrega un campo de RUT al checkout", tool: "crear_campo_checkout" },
];

/**
 * Lo que el agente NO puede hacer. **No es una lista de pendientes: es diseño** (ADR-0018/0025) —
 * esas tools no existen, así que no hay forma de llamarlas. Es el mismo texto que se lee en la
 * pantalla de consentimiento, a propósito: la guía y el consent no pueden prometer cosas distintas.
 */
export const LIMITES: readonly string[] = [
  "Publicar tu tienda ni tu página — eso lo haces tú",
  "Ejecutar el sorteo",
  "Borrar productos, ventas ni tiendas",
  "Leer las credenciales de Flow que ya tienes guardadas",
];

/** El comando de Claude Code, con la dirección DERIVADA (I2) — nunca tipeada en el copy. */
export function comandoClaudeCode(): string {
  return `claude mcp add --transport http sorteatelo ${urlMcpPublica()}`;
}

export interface ItemTroubleshooting {
  titulo: string;
  cuerpo: string;
}

export const TROUBLESHOOTING: readonly ItemTroubleshooting[] = [
  {
    titulo: "No encuentro dónde agregar el conector",
    cuerpo:
      "En Claude está en «Personalizar → Conectores» y funciona en cualquier plan, incluido el gratis (con un conector). En ChatGPT hay que tener plan pagado y activar el modo desarrollador; si tu cuenta es de una empresa, quizás el administrador tenga que habilitarlo.",
  },
  {
    titulo: "La app se está portando raro o dejó de responder",
    cuerpo:
      "Revócala acá mismo, en Conexiones IA, y vuelve a conectarla repitiendo el paso 3. Revocar corta el acceso al instante; lo que ya hizo no se deshace.",
  },
];

/**
 * **Capturas que faltan y quién las tiene que sacar.** Viven acá y no en un archivo suelto para que
 * quien abra el guion vea el hueco: son pantallas de terceros, dentro de la cuenta del Organizador,
 * y sacarlas exige entrar a esa cuenta y activar cosas en ella (el modo desarrollador de ChatGPT es
 * un cambio de configuración de la cuenta, no una pantalla que se mire de pasada).
 *
 * Un test verifica que ninguna de estas esté declarada en un beat: mientras el archivo no exista, la
 * guía muestra el paso escrito y no una imagen rota.
 */
export const CAPTURAS_PENDIENTES: readonly {
  archivo: string;
  beat: number;
  app: IdAppIa;
  queCapturar: string;
}[] = [
  {
    archivo: "claude-chat.webp",
    beat: 5,
    app: "claude",
    queCapturar:
      "Un chat pidiéndole un cambio real («cambia el color principal de mi tienda») y el conector respondiendo que lo hizo. Exige tener la conexión ya autorizada.",
  },
  {
    archivo: "chatgpt-conector-nuevo.webp",
    beat: 3,
    app: "chatgpt",
    queCapturar:
      "El formulario de conector nuevo en «Complementos», con nombre, descripción y la URL del MCP. Solo aparece con el modo desarrollador ACTIVADO — activarlo es una decisión de quien es dueño de la cuenta.",
  },
  {
    archivo: "chatgpt-chat.webp",
    beat: 5,
    app: "chatgpt",
    queCapturar:
      "Un chat con el conector encendido haciendo un cambio, incluida la confirmación que ChatGPT pide antes de escribir.",
  },
];
