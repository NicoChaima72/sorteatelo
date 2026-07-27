import { Button, Container, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { IconMailCheck, IconSparkles } from "@tabler/icons-react";
import { type GetServerSideProps, type InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

import { StorefrontLayout } from "~/components/storefront/storefront-layout";
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
 * real es server-side en el webhook (`/api/webhooks/flow`) contra `payment/getStatus`, y la entrega
 * llega por correo (DownloadGrant, ADR-0002/0010). Esta página SOLO informa — no linkea el PDF (I7).
 *
 * Confetti de celebración (builder-tanda-1 F08/D12): con el `token` de Flow en la URL, sondea la
 * query pública de SOLO-ESTADO `estadoOrden` (sin PII, I-T6); cuando el webhook ya confirmó `PAGADO`,
 * la página pasa a celebración y dispara `canvas-confetti` UNA vez (dynamic import lazy, colores de la
 * escala del tenant, `useReducedMotion` lo apaga). La query solo LEE el resultado del webhook — no
 * confirma nada (I6/I-T6).
 *
 * Superficie de ENTREGA, no de venta (facturación F05/I5): entra por `getPropsPaginaEntrega`, que NO
 * gatea por la facturación del tenant. Si la Tienda entrara en pausa mientras un Comprador vuelve de
 * pagar, verlo rebotar a la página neutral sería quitarle el comprobante de una compra que ya hizo —
 * la mora del Organizador no la paga el Comprador.
 */
export const getServerSideProps: GetServerSideProps<PropsStorefront> = async (
  ctx,
) => getPropsPaginaEntrega(ctx);

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

  if (pagado) {
    return (
      <Stack align="center" gap="md" maw={480} mx="auto">
        <ThemeIcon size={56} radius="xl" variant="light">
          <IconSparkles className="size-7" stroke={1.75} />
        </ThemeIcon>
        <Title order={1} fz="xl" ta="center">
          ¡Pago confirmado!
        </Title>
        <Text c="dimmed" ta="center">
          Tu compra quedó lista. Te enviamos un correo con el enlace para descargar tu producto —
          si no lo ves en unos minutos, revisa tu carpeta de spam.
        </Text>
        <Button component={Link} href="/" variant="default" mt="sm">
          Volver a la tienda
        </Button>
      </Stack>
    );
  }

  return (
    <Stack align="center" gap="md" maw={480} mx="auto">
      <ThemeIcon size={56} radius="xl" variant="light">
        <IconMailCheck className="size-7" stroke={1.75} />
      </ThemeIcon>
      <Title order={1} fz="xl" ta="center">
        ¡Gracias por tu compra!
      </Title>
      <Text c="dimmed" ta="center">
        Estamos confirmando tu pago. Apenas quede confirmado, te llega un correo con el enlace para
        descargar tu producto. Si no lo ves en unos minutos, revisa tu carpeta de spam.
      </Text>
      <Button component={Link} href="/" variant="default" mt="sm">
        Volver a la tienda
      </Button>
    </Stack>
  );
}
