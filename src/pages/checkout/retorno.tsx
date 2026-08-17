import { Button, Container, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import {
  IconClock,
  IconCreditCardOff,
  IconDownload,
  IconLinkOff,
  IconMailCheck,
  IconSparkles,
} from "@tabler/icons-react";
import { type GetServerSideProps, type InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ComponentType, useEffect, useRef, useState } from "react";

import { BoletosDelSorteo } from "~/components/storefront/boletos-del-sorteo";
import { StorefrontLayout } from "~/components/storefront/storefront-layout";
import { faseDelRetorno, type FaseRetorno } from "~/lib/faseRetornoCheckout";
import { destinoRetornoDesdePost } from "~/server/pago/urlRetorno";
import {
  getPropsPaginaEntrega,
  type PropsStorefront,
} from "~/server/storefront/getStorefrontProps";
import { estiloHeredadoDeTema } from "~/styles/estiloSeccion";
import { esHex, type TenantBranding } from "~/styles/tenantTheme";
import { api } from "~/utils/api";

/**
 * Retorno del checkout de Flow (F04/D6), con la marca de la Tienda. Página EXCLUSIVA del
 * Comprador (fuera de storefront ⇒ notFound). Es a donde Flow devuelve el navegador tras el pago.
 *
 * I6/ADR-0001: el redirect del navegador NO es prueba de pago ni marca la orden. La confirmación
 * real es server-side en el webhook (`/api/webhooks/flow`) contra `payment/getStatus`. Esta página
 * SOLO informa — no linkea el PDF (I7) ni presigna nada.
 *
 * Descarga en el acto (`entrega-postpago-retorno-y-reacceso` F02/D1): hasta acá la única salida era
 * «te enviamos un correo», y quien no lo recibía en el minuto de máxima ansiedad quedaba en el aire.
 * Ahora, cuando el polling confirma PAGADO, `estadoOrden` trae además `urlEntrega` y la fase `pagado`
 * muestra un botón primario a `/entrega/<grantToken>` — la MISMA página de entrega que ya usaba el
 * enlace del correo, con sus URLs firmadas por visita (I2). No es una superficie de descarga nueva:
 * es un atajo a la que ya existía. El botón depende de `urlEntrega`, que solo viaja con PAGADO
 * server-side ⇒ el redirect de Flow sigue sin poder inventar una descarga (I1). Y el correo NO se
 * toca como canal (I5): se sigue mandando igual y el copy lo mantiene como respaldo durable.
 *
 * Confetti de celebración (builder-tanda-1 F08/D12): con el `token` de Flow en la URL, sondea la
 * query pública `estadoOrden` (sin PII, I-T6); cuando el webhook ya confirmó `PAGADO`, la página pasa
 * a celebración y dispara `canvas-confetti` UNA vez (dynamic import lazy, colores de la escala del
 * tenant, `useReducedMotion` lo apaga). La query solo LEE el resultado del webhook — no confirma nada
 * (I6/I-T6).
 *
 * Números del sorteo (`checkout-retorno-numeros-sorteo` F02/D1): esa MISMA query trae, al confirmar,
 * los Números del sorteo de la compra (ADR-0024) y el prefijo de la Tienda — la celebración los dibuja
 * como boletos (`BoletosDelSorteo`, hoy en `~/components/storefront/boletos-del-sorteo`: se extrajo de
 * acá al estrenarse su segundo consumidor, la página `/verificar` — `verificador-tickets` F02/D9 —,
 * extracción 1:1 sin cambio visual). Son identidad pública del ticket, no PII; el correo, el total y
 * los ítems siguen sin viajar. Una orden pagada sin tickets celebra sin ese bloque (D4).
 *
 * Cinco fases, no dos (F03/D2 + D6, `COPY_FASE`): a la celebración y al «estamos confirmando» se
 * sumaron los finales que antes caían en el genérico — el pago RECHAZADO (terminal, sin prometer
 * correo ni números), el cap de 2 min del polling (suave: la orden todavía puede confirmarse y la
 * entrega va por correo) y la llegada SIN `?token=` (D6: no hay compra que consultar). Cuál de las
 * cinco es se decide en `faseDelRetorno` (`~/lib/faseRetornoCheckout`, puro y testeado); acá vive el
 * copy. El polling en sí no se tocó (I7): son ramas de presentación.
 *
 * Superficie de ENTREGA, no de venta (facturación F05/I5): entra por `getPropsPaginaEntrega`, que NO
 * gatea por la facturación del tenant. Si la Tienda entrara en pausa mientras un Comprador vuelve de
 * pagar, verlo rebotar a la página neutral sería quitarle el comprobante de una compra que ya hizo —
 * la mora del Organizador no la paga el Comprador.
 */
/**
 * Techo del body que se lee en el puente POST→GET de abajo. El form de retorno de Flow trae UN
 * token de 40 caracteres; 10 KB es holgado para eso y corta cualquier body abusivo sin cargarlo
 * entero en memoria.
 */
const BODY_MAX_RETORNO = 10_000;

/** Lee el body crudo del request hasta el techo (borde de IO; el parseo vive en `urlRetorno.ts`). */
function leerBodyCrudo(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let acumulado = "";
    req.on("data", (chunk: Buffer | string) => {
      acumulado += chunk.toString();
      if (acumulado.length > BODY_MAX_RETORNO) {
        resolve(acumulado.slice(0, BODY_MAX_RETORNO));
        req.removeAllListeners("data");
        req.removeAllListeners("end");
      }
    });
    req.on("end", () => resolve(acumulado));
    req.on("error", reject);
  });
}

export const getServerSideProps: GetServerSideProps<PropsStorefront> = async (
  ctx,
) => {
  // Flow devuelve al Comprador con un POST (auto-submit con el `token` en el body urlencoded), no
  // con `?token=` en la URL — sin este puente, TODO comprador real caía en la fase `sin_token`
  // («No encontramos tu compra») aunque su pago/ticket/correo salieran perfectos (incidente
  // 2026-08-16). El 303 convierte el POST en GET sobre esta misma página, que desde ahí corre su
  // flujo de siempre (`?token=` → polling de `estadoOrden` → celebración con los boletos).
  // I6/ADR-0001 intacto: el token solo alimenta el SONDEO; la confirmación sigue siendo el webhook.
  if (ctx.req.method === "POST") {
    const body = await leerBodyCrudo(ctx.req).catch(() => null);
    return {
      redirect: { destination: destinoRetornoDesdePost(body), statusCode: 303 },
    };
  }
  return getPropsPaginaEntrega(ctx);
};

export default function RetornoPage({
  tenantBranding,
  temaPagina,
  chrome,
  navItems,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  // Fondo heredado de la Tienda (tema-paginas F02). Es la página donde MÁS pesa la continuidad visual:
  // el Comprador vuelve de pagar en Flow y tiene que reconocer que aterrizó en la misma tienda.
  // El chrome + navItems (follow-up del navbar) completan esa continuidad en el header.
  const { estiloShell, colorPagina } = estiloHeredadoDeTema(temaPagina);

  return (
    <StorefrontLayout
      branding={tenantBranding}
      estiloShell={estiloShell}
      colorPagina={colorPagina}
      chrome={chrome}
      navItems={navItems}
    >
      <Container size="lg" py="xl" px={{ base: "md", lg: "xl" }}>
        <RetornoContenido branding={tenantBranding} />
      </Container>
    </StorefrontLayout>
  );
}

/** Colores del confetti: la escala del tenant (marca/acento) o un fallback neutro festivo si el tenant
 *  no tiene colores. Canvas-confetti PINTA en `<canvas>` ⇒ necesita hex reales (no lee CSS vars). */
function coloresConfetti(branding: TenantBranding): string[] {
  const cols = [branding.colorPrimario, branding.colorAcento].filter((c): c is string => esHex(c));
  return cols.length > 0 ? cols : ["#6D5AE6", "#C9A130"]; // fallback confetti-only (canvas no usa tokens)
}

/** Dispara el confetti one-shot con import dinámico (el peso se paga solo tras pago confirmado). */
async function dispararConfetti(colors: string[]): Promise<void> {
  const confetti = (await import("canvas-confetti")).default;
  void confetti({
    particleCount: 120,
    spread: 78,
    startVelocity: 42,
    origin: { y: 0.35 },
    colors,
    disableForReducedMotion: true,
  });
  // Segundo golpe leve para dar cuerpo (sigue siendo one-shot: no hay loop).
  setTimeout(() => {
    void confetti({ particleCount: 70, spread: 100, origin: { y: 0.4 }, colors, disableForReducedMotion: true });
  }, 220);
}

/** Mismo alias que los siblings del panel (`admin-layout`, `banner-facturacion`, `empty-state`…). */
type IconCmp = ComponentType<{ className?: string; stroke?: number | string }>;

interface CopyFase {
  icono: IconCmp;
  /** Token semántico del theme; `null` = el primario de la Tienda (design.md §2: `red` solo para el
   *  rechazo, «en proceso» NUNCA en rojo). Unión literal y no `string`, para que un typo no compile;
   *  y explícito y no opcional-con-default, porque que una fase nueva tenga que declarar su color es
   *  justo lo que este `Record` compra. */
  color: "red" | "pendiente" | null;
  titulo: string;
  cuerpo: string;
}

/**
 * Copy por fase, fuera del componente y con TODA propiedad requerida (frontend-conventions § Avisos y
 * tablas de copy por estado): una fase nueva no compila hasta que alguien le escribe su copy, su
 * ícono y su color. El ícono comunica la NATURALEZA del final —tarjeta tachada = el cobro no pasó,
 * reloj = todavía está en camino— y no la entidad.
 */
const COPY_FASE: Record<FaseRetorno, CopyFase> = {
  // El copy NO nombra el botón ni depende de él (F02/D4a): la descarga inmediata la comunica el
  // botón, y este párrafo se ocupa del correo como RESPALDO durable — que es lo que sigue siendo
  // cierto si `urlEntrega` no viajó (orden PAGADA sin grants, el caso defensivo de estado.011).
  // «No vence» es la política de D2 dicha al Comprador: es la razón por la que guardar el correo
  // ahora sirve de algo.
  pagado: {
    icono: IconSparkles,
    color: null,
    titulo: "¡Pago confirmado!",
    cuerpo:
      "Tu compra quedó lista. Te enviamos el enlace de descarga por correo y no vence: guárdalo para volver a bajarla cuando quieras. Si no lo ves en unos minutos, revisa tu carpeta de spam.",
  },
  // Terminal y honesto: no se promete correo ni números, porque no hay compra que entregar. El
  // «ningún cargo definitivo» es lo primero que la persona necesita saber al ver una pantalla así.
  fallido: {
    icono: IconCreditCardOff,
    color: "red",
    titulo: "El pago no se concretó",
    cuerpo:
      "No se hizo ningún cargo definitivo. Puedes volver a la tienda e intentarlo de nuevo cuando quieras.",
  },
  // Se acabó el cap del polling sin respuesta. NO es un fracaso: el webhook puede confirmar después,
  // y la entrega va por correo (ADR-0002/0010) — así que la pantalla deja de sondear pero no cierra
  // la puerta. Ámbar (`pendiente`), nunca rojo.
  //
  // El copy dice «tu compra» a secas y NO «tu compra y tus números» (D2 corregida por el usuario):
  // acá todavía no se sabe si la orden participa del sorteo, y una compra sin tickets (D4) no
  // tendría número que mandar. Prometerlo en la única fase donde el dato no existe es justo la
  // promesa que esta tanda vino a poder cumplir.
  timeout: {
    icono: IconClock,
    color: "pendiente",
    titulo: "Seguimos confirmando tu pago",
    cuerpo:
      "La confirmación está tardando más de lo normal. Apenas se confirme, te llega el correo con tu compra.",
  },
  // Alguien llegó a esta URL sin el `?token=` de Flow (D6): un enlace pegado a medias, un favorito
  // viejo, la URL escrita a mano. No hay compra que consultar —la query ni siquiera corre— así que
  // la pantalla lo dice y ofrece la salida al inicio, en vez de dejar girando para siempre un
  // «estamos confirmando tu pago» sobre un pago que nunca existió. Rojo como el rechazo, porque las
  // dos son un final con problema; lo que las separa es el ícono (enlace roto vs. cobro que no pasó),
  // que es la 2ª dimensión que pide frontend-conventions cuando dos casos comparten color.
  sin_token: {
    icono: IconLinkOff,
    color: "red",
    titulo: "No encontramos tu compra",
    cuerpo:
      "Este enlace no trae la referencia del pago, así que no hay ninguna compra que mostrar acá. Si acabas de comprar, revisa tu correo: ahí te llega la confirmación con el enlace de descarga.",
  },
  esperando: {
    icono: IconMailCheck,
    color: null,
    titulo: "¡Gracias por tu compra!",
    cuerpo:
      "Estamos confirmando tu pago. Apenas quede confirmado, te llega un correo con el enlace para descargar tu producto. Si no lo ves en unos minutos, revisa tu carpeta de spam.",
  },
};

function RetornoContenido({ branding }: { branding: TenantBranding }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const token = typeof router.query.token === "string" ? router.query.token : undefined;

  // Se detiene al resolver (PAGADO/FALLIDO) o tras el cap de tiempo (evita polling infinito de una
  // orden atascada). Mientras esté PENDIENTE, sondea cada 2.5s. `retry:false`: cosmético, degrada limpio.
  const [detenido, setDetenido] = useState(false);
  const q = api.checkout.estadoOrden.useQuery(
    { token: token ?? "" },
    { enabled: !!token && !detenido, retry: false, refetchInterval: detenido ? false : 2500 },
  );
  const estado = q.data?.estado ?? null;
  const pagado = estado === "PAGADO";

  useEffect(() => {
    if (estado === "PAGADO" || estado === "FALLIDO") setDetenido(true);
  }, [estado]);

  // Cap de tiempo del polling (~2 min): si el webhook no confirmó, deja de sondear (sin confetti).
  useEffect(() => {
    const t = setTimeout(() => setDetenido(true), 120_000);
    return () => clearTimeout(t);
  }, []);

  // Confetti one-shot al confirmar PAGADO (guard con ref ⇒ nunca dispara dos veces). reduced-motion lo apaga.
  const disparado = useRef(false);
  useEffect(() => {
    if (!pagado || disparado.current || reduce) return;
    disparado.current = true;
    void dispararConfetti(coloresConfetti(branding));
  }, [pagado, reduce, branding]);

  // Fase de la pantalla (F03/D2 + D6): la decide una función pura y testeada, no un ternario acá.
  // Lo que se compra es la PRECEDENCIA — sin token gana sobre todo lo demás, incluido el cap de
  // tiempo, que se enciende igual aunque nunca haya habido nada que confirmar.
  const fase: FaseRetorno = faseDelRetorno({ token, estado, detenido });
  const copy = COPY_FASE[fase];
  const Icono = copy.icono;

  // URL de la página de entrega (F02/D1), solo si el polling la trajo. Se saca a una constante —y no
  // se repite el `q.data?.…` inline— porque la miran DOS cosas: el botón y el espaciado del botón que
  // le sigue. Con la condición duplicada, cambiar una y olvidar la otra deja un hueco raro.
  const urlEntrega = fase === "pagado" ? q.data?.urlEntrega : undefined;

  return (
    <Stack align="center" gap="md" maw={480} mx="auto">
      <ThemeIcon size={56} radius="xl" variant="light" color={copy.color ?? undefined}>
        <Icono className="size-7" stroke={1.75} />
      </ThemeIcon>
      <Title order={1} fz="xl" ta="center">
        {copy.titulo}
      </Title>
      {/* Los números van ARRIBA del párrafo de la descarga: son lo que el Comprador vino a ver en
          este momento (la promesa de la landing). Sin tickets el bloque no se renderiza (D4). */}
      {fase === "pagado" && (
        <BoletosDelSorteo numeros={q.data?.numeros ?? []} prefijo={q.data?.prefijo ?? null} />
      )}
      <Text c="dimmed" ta="center">
        {copy.cuerpo}
      </Text>
      {/* Descarga en el acto (F02/D1). Existe SOLO si `estadoOrden` —server-side— trajo la URL: no se
          infiere de la fase, ni del `?token=` de Flow, ni de nada que traiga el navegador (I1). Es un
          link común y corriente a la página de entrega, que es la que presigna por visita (I2); acá no
          se toca ni una key de R2. Va ANTES de «Volver a la tienda» y en variante primaria porque es
          lo que la persona vino a hacer — el otro botón queda secundario, como ya estaba.

          El `mt="sm"` lo lleva el PRIMER botón de la cola y no los dos: lo que separa es la zona de
          acción del párrafo, no un botón del otro (entre ellos alcanza el `gap` del Stack). Con el
          `mt` repetido, el par dejaba de leerse como un grupo. */}
      {urlEntrega && (
        <Button
          component={Link}
          href={urlEntrega}
          mt="sm"
          leftSection={<IconDownload className="size-4" stroke={1.75} />}
        >
          Descargar mi compra
        </Button>
      )}
      <Button component={Link} href="/" variant="default" mt={urlEntrega ? undefined : "sm"}>
        Volver a la tienda
      </Button>
    </Stack>
  );
}
