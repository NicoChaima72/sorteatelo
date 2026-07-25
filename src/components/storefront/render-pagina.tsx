import { AvisoBarra } from "~/components/storefront/aviso-barra";
import { BannerCta } from "~/components/storefront/banner-cta";
import { BeneficiosGrid } from "~/components/storefront/beneficios-grid";
import { BloqueTicketPromo } from "~/components/storefront/bloque-ticket-promo";
import { BotonesSociales } from "~/components/storefront/botones-sociales";
import { CatalogoStorefront } from "~/components/storefront/catalogo";
import { CintaTexto } from "~/components/storefront/cinta-texto";
import { CompartirSorteo } from "~/components/storefront/compartir-sorteo";
import { ComoFunciona } from "~/components/storefront/como-funciona";
import { ContadorTickets } from "~/components/storefront/contador-tickets";
import { EmbedSocial } from "~/components/storefront/embed-social";
import { Espaciador } from "~/components/storefront/espaciador";
import { Estadisticas } from "~/components/storefront/estadisticas";
import { Faq } from "~/components/storefront/faq";
import { Galeria } from "~/components/storefront/galeria";
import { Ganadores } from "~/components/storefront/ganadores";
import { GarantiasSorteo } from "~/components/storefront/garantias-sorteo";
import { ImagenDestacada } from "~/components/storefront/imagen-destacada";
import { LogosConfianza } from "~/components/storefront/logos-confianza";
import { MetaProgresoSorteo } from "~/components/storefront/meta-progreso-sorteo";
import { MomentoTicket } from "~/components/storefront/momento-ticket";
import { PacksPrecio } from "~/components/storefront/packs-precio";
import { PerfilAutora } from "~/components/storefront/perfil-autora";
import { ProductoSpotlight } from "~/components/storefront/producto-spotlight";
import { Separador } from "~/components/storefront/separador";
import { SorteoStorefront } from "~/components/storefront/sorteo";
import { StorefrontHero } from "~/components/storefront/storefront-hero";
import { Testimonios } from "~/components/storefront/testimonios";
import { TextoRico } from "~/components/storefront/texto-rico";
import { UrgenciaCountdown } from "~/components/storefront/urgencia-countdown";
import { Video } from "~/components/storefront/video";
import { VitrinaProximamente } from "~/components/storefront/vitrina-proximamente";
import { WhatsappFlotante } from "~/components/storefront/whatsapp-flotante";
import { Fragment } from "react";

import { anclasSemanticas } from "~/lib/pagebuilder/nav";
import {
  type OverlayNode,
  type PageDocument,
  type SeccionNode,
} from "~/lib/pagebuilder/schema";
import { colorFondoSolido } from "~/styles/estiloSeccion";
import { type TenantBranding } from "~/styles/tenantTheme";

/**
 * Render del Documento de Página (F05/F10/catálogo-v2 F02, ADR-0016). Recorre las secciones en el
 * ORDEN del array y despacha cada una a su componente por un switch EXHAUSTIVO sobre `tipo` (props
 * narrowed por rama). Cada sección recibe su NODO completo (con `estilo`, catálogo-v2 F02) — el
 * `<SeccionWrapper>` que cada componente monta aplica fondo/spacing/ancho/divisor + el id DOM del
 * nodo. El divisor de cada sección se pinta con el color de la sección SIGUIENTE (transición, D2).
 * Los OVERLAYS (F10) van por posición: `aviso_barra` ARRIBA, `whatsapp_flotante` como FAB. Un `tipo`
 * desconocido NO renderiza (I9). El `branding` aporta los fallbacks server-side (I2/I11).
 */
export function RenderPagina({
  secciones,
  overlays,
  branding,
}: {
  secciones: PageDocument["secciones"];
  overlays: PageDocument["overlays"];
  branding: TenantBranding;
}) {
  // Anclas semánticas del nav auto-derivado (F05/D8): la 1ª sección de cada tipo navegable recibe un
  // target de scroll invisible (`#catalogo`/`#sorteo`/`#autora`/`#bases`…) — fuente ÚNICA de anclas
  // (los widgets ya no las hardcodean). El nav del header y los CTA apuntan a estos ids.
  const anclas = anclasSemanticas(secciones);
  return (
    <>
      {/* Overlays "arriba" (barra de aviso BAJO el nav) antes del flujo vertical. Los `aviso_barra` con
          `posicion:"sobre_nav"` (F13) NO se renderizan acá: el `storefront-layout` los pinta ANTES del
          header (fuera de `<main>`) para que queden sobre el nav; acá solo van los `bajo_nav` (default). */}
      {overlays
        .filter((o) => o.tipo === "aviso_barra" && o.props.posicion !== "sobre_nav")
        .map((o) => (
          <RenderOverlay key={o.id} overlay={o} />
        ))}

      {secciones.map((seccion, i) => (
        <Fragment key={seccion.id}>
          {anclas[seccion.id] && (
            // Target de scroll en flujo (zero-height, aria-hidden) justo antes de la sección: mismo Y que
            // el borde superior de la sección ⇒ el scroll del nav/CTA aterriza ahí. Invisible (no afecta
            // el layout ni el screenshot — I-H).
            <div id={anclas[seccion.id]} aria-hidden style={{ position: "relative" }} />
          )}
          <RenderSeccion
            seccion={seccion}
            branding={branding}
            // Color de la sección SIGUIENTE ⇒ fill del divisor inferior de ESTA (lee como transición).
            divisorColor={colorFondoSolido(secciones[i + 1]?.estilo)}
          />
        </Fragment>
      ))}

      {/* Overlays flotantes (FAB): position:fixed, su posición en el DOM no importa. */}
      {overlays
        .filter((o) => o.tipo === "whatsapp_flotante")
        .map((o) => (
          <RenderOverlay key={o.id} overlay={o} />
        ))}
    </>
  );
}

/**
 * Renderiza UNA sección por el mismo switch exhaustivo que el documento completo. Exportada para que la
 * WidgetGallery del editor (catálogo-v2 F11) monte el componente REAL de cada widget en miniatura —
 * misma fuente de verdad que el render público (cero duplicación del dispatch por tipo).
 */
export function RenderSeccion({
  seccion,
  branding,
  divisorColor,
}: {
  seccion: SeccionNode;
  branding: TenantBranding;
  divisorColor: string;
}) {
  switch (seccion.tipo) {
    case "hero":
      return <StorefrontHero nodo={seccion} branding={branding} divisorColor={divisorColor} />;
    case "catalogo":
      return (
        <CatalogoStorefront
          nodo={seccion}
          colorPrimario={branding.colorPrimario}
          divisorColor={divisorColor}
        />
      );
    case "sorteo_vitrina":
      return (
        <SorteoStorefront
          nodo={seccion}
          colorPrimario={branding.colorPrimario}
          divisorColor={divisorColor}
        />
      );
    case "como_funciona":
      return <ComoFunciona nodo={seccion} divisorColor={divisorColor} />;
    case "contador_tickets":
      return <ContadorTickets nodo={seccion} divisorColor={divisorColor} />;
    case "urgencia_countdown":
      return <UrgenciaCountdown nodo={seccion} divisorColor={divisorColor} />;
    case "testimonios":
      return <Testimonios nodo={seccion} divisorColor={divisorColor} />;
    case "ganadores":
      return <Ganadores nodo={seccion} divisorColor={divisorColor} />;
    case "faq":
      return <Faq nodo={seccion} divisorColor={divisorColor} />;
    case "video":
      return <Video nodo={seccion} divisorColor={divisorColor} />;
    case "embed_social":
      return <EmbedSocial nodo={seccion} divisorColor={divisorColor} />;
    case "beneficios_grid":
      return <BeneficiosGrid nodo={seccion} divisorColor={divisorColor} />;
    case "texto_rico":
      return <TextoRico nodo={seccion} divisorColor={divisorColor} />;
    case "imagen_destacada":
      return (
        <ImagenDestacada
          nodo={seccion}
          colorPrimario={branding.colorPrimario}
          divisorColor={divisorColor}
        />
      );
    case "separador":
      return <Separador nodo={seccion} divisorColor={divisorColor} />;
    case "espaciador":
      return <Espaciador nodo={seccion} divisorColor={divisorColor} />;
    case "banner_cta":
      return <BannerCta nodo={seccion} divisorColor={divisorColor} />;
    case "estadisticas":
      return <Estadisticas nodo={seccion} divisorColor={divisorColor} />;
    case "botones_sociales":
      return <BotonesSociales nodo={seccion} divisorColor={divisorColor} />;
    case "logos_confianza":
      return (
        <LogosConfianza
          nodo={seccion}
          colorPrimario={branding.colorPrimario}
          divisorColor={divisorColor}
        />
      );
    case "bloque_ticket_promo":
      return <BloqueTicketPromo nodo={seccion} divisorColor={divisorColor} />;
    case "meta_progreso_sorteo":
      return <MetaProgresoSorteo nodo={seccion} divisorColor={divisorColor} />;
    case "garantias_sorteo":
      return <GarantiasSorteo nodo={seccion} divisorColor={divisorColor} />;
    case "compartir_sorteo":
      return <CompartirSorteo nodo={seccion} divisorColor={divisorColor} />;
    case "galeria":
      return (
        <Galeria
          nodo={seccion}
          colorPrimario={branding.colorPrimario}
          divisorColor={divisorColor}
        />
      );
    case "cinta_texto":
      return <CintaTexto nodo={seccion} divisorColor={divisorColor} />;
    case "perfil_autora":
      return <PerfilAutora nodo={seccion} divisorColor={divisorColor} />;
    case "vitrina_proximamente":
      return (
        <VitrinaProximamente
          nodo={seccion}
          colorPrimario={branding.colorPrimario}
          divisorColor={divisorColor}
        />
      );
    case "packs_precio":
      return <PacksPrecio nodo={seccion} divisorColor={divisorColor} />;
    case "momento_ticket":
      return <MomentoTicket nodo={seccion} divisorColor={divisorColor} />;
    case "producto_spotlight":
      return (
        <ProductoSpotlight
          nodo={seccion}
          colorPrimario={branding.colorPrimario}
          divisorColor={divisorColor}
        />
      );
    default: {
      // Candado de exhaustividad EN COMPILACIÓN (F10/F11 no pueden olvidar una rama) + tolerancia I9
      // en runtime (un `tipo` desconocido de un documento publicado viejo renderiza `null`, no crashea).
      const _exhaustivo: never = seccion;
      void _exhaustivo;
      return null;
    }
  }
}

function RenderOverlay({ overlay }: { overlay: OverlayNode }) {
  switch (overlay.tipo) {
    case "aviso_barra":
      return <AvisoBarra props={overlay.props} />;
    case "whatsapp_flotante":
      return <WhatsappFlotante props={overlay.props} />;
    default: {
      const _exhaustivo: never = overlay;
      void _exhaustivo;
      return null;
    }
  }
}
