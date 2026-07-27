import { leerDocumentoParaRender } from "~/lib/pagebuilder/migrate";
import { derivarNav, reanclarNavALaHome, type NavItem } from "~/lib/pagebuilder/nav";
import { TemaSchema, type Tema } from "~/lib/pagebuilder/schema";
import { db } from "~/server/db";

/**
 * **Herencia mínima del tema de la Tienda para las páginas de PLATAFORMA del storefront**
 * (storefront-tema-paginas-plataforma F01, D2/D3/D6/D7).
 *
 * La home de una tienda tematizada (`iselk`: fondo lila, Poppins, radio `l`) convivía con páginas de
 * plataforma que salían con el "body blanco": `/checkout` renderizaba fondo blanco y "Finalizar compra"
 * en Fraunces. La ruptura visual caía en el momento más delicado del funnel (pagar). Este resolver es lo
 * único que faltaba: la infraestructura ya era página-agnóstica (`_app` aplica radio/tipografía/modo de
 * cualquier `pageProps.temaPagina`; `StorefrontLayout` ya acepta `estiloShell`/`colorPagina`).
 *
 * **NO es una re-tematización**: se hereda lo MÍNIMO (fondo de página, par tipográfico, radio, modo) y
 * nada más (D1). Los glows de `ambiente` no aplican a un form de pago y la columna estrecha editorial de
 * `anchoContenido` no aplica a un checkout.
 */

/**
 * Vive en su PROPIO archivo, no dentro de `getStorefrontProps.ts`, por una razón ESTRUCTURAL (no por el
 * cordón de trabajo in-flight, aunque también ayuda): `/entrega/[token]` necesita este resolver y tiene
 * un guard que le prohíbe importar CUALQUIER cosa de `getStorefrontProps`
 * (`gateVentaEnElBorde.test.ts::facturacion.gate.borde.005`). Ese guard existe porque todos los helpers
 * de ese módulo resuelven la Tienda por HOST y la página de entrega es host-agnóstica a propósito — el
 * enlace que el Comprador recibe por correo apunta al APEX (el correo no conoce subdominios), así que
 * entrar por ahí daría 404 en la única puerta que ese Comprador tiene para llegar a lo que compró.
 *
 * Este módulo NO sabe qué es un host: recibe un `tenantSlug` ya resuelto server-side. Poner el resolver
 * acá hace de esa host-agnosticidad una propiedad del MÓDULO en vez de una disciplina del call site.
 */

/** El tema default del schema — la base sobre la que se injerta lo heredado y la vara de D7. */
const TEMA_DEFAULT: Tema = TemaSchema.parse({});

/**
 * Recorta un tema publicado a lo HEREDABLE (D1/D6/I8): parte del default del schema y le injerta SOLO
 * `fondoPagina`, `tipografia`, `radio` y `modo`.
 *
 * Es una ALLOWLIST y no una lista de exclusiones, y esa elección hace el trabajo: cualquier campo que
 * `TemaSchema` gane mañana nace NO heredado (fail-closed) en vez de colarse solo en las 5 páginas de
 * plataforma. Que la herencia mínima sea estructural acá —y no disciplina de cada página— es lo que
 * evita el accidente concreto que motivó D6: `_app.tsx` inyecta una regla CSS GLOBAL cuando
 * `escalaTitulos:"poster"` viaja en `temaPagina`, así que un checkout que heredara el tema completo de
 * la home saldría con los títulos-poster de la vitrina. Idem `ambiente` (glows de recital sobre un form
 * de pago) y `anchoContenido` (la columna boutique de 640px estrangulando el checkout).
 */
function soloLoHeredable(tema: Tema): Tema {
  return {
    ...TEMA_DEFAULT,
    fondoPagina: tema.fondoPagina,
    tipografia: tema.tipografia,
    radio: tema.radio,
    modo: tema.modo,
  };
}

/**
 * `true` sii el tema es EXACTAMENTE el default del schema (D7). Compara campo a campo contra
 * `TemaSchema.parse({})` —no contra una lista escrita a mano— para que se auto-sincronice cuando el
 * schema gane o cambie un default.
 */
function esTemaDefault(tema: Tema): boolean {
  return (Object.keys(TEMA_DEFAULT) as (keyof Tema)[]).every(
    (campo) => tema[campo] === TEMA_DEFAULT[campo],
  );
}

/** Lo que las páginas de plataforma heredan de la home publicada: el tema mínimo + su nav derivado. */
export interface HerenciaDeLaHome {
  /** Tema mínimo recortado (D1/D6), o `null` si la Tienda tiene el tema default (D7). */
  temaPagina: Tema | null;
  /**
   * Nav derivado de las secciones `nav.incluir` de la home, ya RE-ANCLADO (`#x` → `/#x`) para navegar
   * desde fuera de la home. `[]` ⇒ ninguna sección marcada (el layout cae al nav hardcodeado, I-H).
   */
  navDeLaHome: NavItem[];
}

const SIN_HERENCIA: HerenciaDeLaHome = { temaPagina: null, navDeLaHome: [] };

/**
 * Herencia COMPLETA de la home publicada de una Tienda en UNA query: el tema mínimo (D1/D6/D7) + el nav
 * derivado del Documento (follow-up del navbar: la home de iselk decía «El libro / Preguntas» y su
 * checkout el nav hardcodeado «Catálogo / Cómo funciona»). `tenantSlug` sale del subdominio/grant
 * resuelto SERVER-SIDE (I1) — jamás de input del cliente.
 *
 * **Defensiva por contrato** (D3/I2, mismo patrón que `resolverChrome`): sin fila, sin `publishedJson`,
 * con JSON podrido o con la query lanzando (cliente Prisma stale durante un deploy sin restart, fallo
 * transitorio) devuelve la herencia vacía. El storefront NUNCA 500ea por el tema: quedarse sin el fondo
 * lila es un defecto cosmético; caerse en `/checkout` es una venta perdida.
 */
export async function resolverHerenciaDeLaHome({
  tenantSlug,
}: {
  tenantSlug: string;
}): Promise<HerenciaDeLaHome> {
  try {
    const page = await db.storefrontPage.findFirst({
      // Tenant scopeado server-side por slug (I1). SOLO `publishedJson` (I7): un borrador jamás se
      // sirve en una página pública, y seleccionarlo sería tener el dato a mano para equivocarse.
      where: { slug: "home", tenant: { slug: tenantSlug } },
      select: { publishedJson: true },
    });
    if (page?.publishedJson == null) return SIN_HERENCIA;

    // Lectura TOLERANTE (I9): un documento con secciones podridas igual entrega su `root.props`.
    const doc = leerDocumentoParaRender(page.publishedJson);
    const tema = soloLoHeredable(doc.root.props);
    return {
      // Tienda sin tematizar ⇒ `null`, no un `Tema` de defaults: así el render queda BYTE-idéntico al
      // de hoy (D7/I6) en vez de "visualmente igual pero con un `style=` de más".
      temaPagina: esTemaDefault(tema) ? null : tema,
      navDeLaHome: reanclarNavALaHome(derivarNav(doc.secciones)),
    };
  } catch {
    return SIN_HERENCIA; // degradación elegante (I2)
  }
}

/**
 * Solo el tema (D1/D6/D7) — el contrato original de F01, conservado para call sites que no necesiten
 * el nav. (`/entrega/[token]` ya no es uno: desde el follow-up de su chrome usa
 * `resolverHerenciaDeLaHome` y re-ancla el nav ABSOLUTO al subdominio con `reanclarNavATienda`,
 * porque es host-agnóstica y también se sirve en el apex.)
 */
export async function resolverTemaPagina(args: {
  tenantSlug: string;
}): Promise<Tema | null> {
  return (await resolverHerenciaDeLaHome(args)).temaPagina;
}
