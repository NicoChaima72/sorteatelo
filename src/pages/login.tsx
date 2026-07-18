import { Anchor, Button, Text, Title } from "@mantine/core";
import { IconBrandGoogle } from "@tabler/icons-react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { signIn } from "next-auth/react";

import { Banda } from "~/components/landing/banda";
import { LOGIN } from "~/components/landing/copy";
import { Etiqueta } from "~/components/landing/etiqueta";
import { TalonarioVivo } from "~/components/landing/talonario-vivo";
import { Wordmark } from "~/components/marca/wordmark";
import { APP_CONFIG } from "~/config/app";

/**
 * Login del panel — split cobalto de «El Talonario» (F04/D8). Mitad de marca AZUL (wordmark +
 * talonario vivo + testimonio en blanco) + mitad blanca con el acceso. Conserva el comportamiento:
 * `signIn("google", { callbackUrl: "/admin" })`, mensaje ante `?error`, `Head`/OG desde
 * `APP_CONFIG`, y el carácter de página PÚBLICA (no exporta guard — backend-conventions § Guard).
 * En móvil la mitad de marca colapsa y el talonario se oculta (`hidden lg:block`).
 */
export default function LoginPage() {
  const router = useRouter();
  const error = Array.isArray(router.query.error)
    ? router.query.error[0]
    : router.query.error;

  const mensajeError = error ? LOGIN.errorMsg : null;

  return (
    <>
      <Head>
        <title>{`Entrar · ${APP_CONFIG.name}`}</title>
        <meta name="description" content={APP_CONFIG.tagline} />
        <meta property="og:title" content={APP_CONFIG.name} />
        <meta property="og:description" content={APP_CONFIG.tagline} />
        <meta property="og:image" content="/og.svg" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <main className="flex min-h-screen flex-col lg:flex-row">
        {/* Mitad de marca (azul cobalto) */}
        <Banda
          tono="azul"
          contenedor={false}
          className="flex flex-col justify-between gap-10 p-8 lg:w-1/2 lg:p-12"
        >
          <Wordmark size={24} c="white" />
          <div className="hidden max-w-sm self-center lg:block">
            <TalonarioVivo />
          </div>
          <Text
            c="white"
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              maxWidth: "26em",
              opacity: 0.85,
            }}
          >
            {LOGIN.testimonio}
            <Etiqueta className="mt-2.5 block" style={{ opacity: 0.75 }}>
              {LOGIN.testimonioAtribucion}
            </Etiqueta>
          </Text>
        </Banda>

        {/* Mitad de acceso (blanca) */}
        <div className="flex flex-1 items-center justify-center px-6 py-14">
          <div style={{ width: "100%", maxWidth: 360 }}>
            <Etiqueta>{LOGIN.eyebrow}</Etiqueta>
            <Title
              order={1}
              fw={800}
              mt={12}
              mb={8}
              style={{ fontSize: 30, letterSpacing: "-0.02em" }}
            >
              {LOGIN.titulo}
            </Title>
            <Text c="dimmed" mb={28} style={{ fontSize: 15.5, lineHeight: 1.55 }}>
              {LOGIN.bajada}
            </Text>

            {mensajeError && (
              <Text role="alert" c="red" mb="md" style={{ fontSize: 14 }}>
                {mensajeError}
              </Text>
            )}

            <Button
              fullWidth
              size="md"
              color="sorteatelo"
              radius="md"
              leftSection={<IconBrandGoogle className="size-[18px]" stroke={2} />}
              onClick={() => void signIn("google", { callbackUrl: "/admin" })}
            >
              {LOGIN.cta}
            </Button>

            <Text mt="lg" size="sm" c="dimmed">
              {LOGIN.sinCuenta}{" "}
              <Anchor component={Link} href="/" fw={600}>
                {LOGIN.sinCuentaCta}
              </Anchor>
            </Text>
          </div>
        </div>
      </main>
    </>
  );
}
