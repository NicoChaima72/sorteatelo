import {
  Button,
  Card,
  Code,
  Divider,
  Group,
  List,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconCheck, IconLock } from "@tabler/icons-react";
import type { GetServerSideProps, NextPage } from "next";
import Head from "next/head";

import { Wordmark } from "~/components/marca/wordmark";
import { APP_CONFIG } from "~/config/app";
import { getServerAuthSession } from "~/server/auth";
import { db } from "~/server/db";
import { redirectUriVerificada } from "~/server/mcp/decidirAuthorize";

/**
 * Página de consentimiento del MCP del Organizador (ADR-0025 F02). Es el ÚNICO punto donde un
 * humano decide que un cliente de IA puede operar su cuenta: sin este "Autorizar" no existe
 * ningún Token MCP.
 *
 * Superficie de MARCA (design.md §4): gramática suave —card sin borde, radio 18, sombra difusa,
 * canvas `hundido`—, wordmark arriba, cobalto en el CTA. Nada de hex inline (§9).
 *
 * Decisión de diseño con peso de seguridad: la página muestra **también lo que el agente NO va a
 * poder hacer** (publicar, ejecutar el sorteo, borrar, leer credenciales de Flow — D7/I3). Un
 * consent que solo enumera poderes empuja a apretar "Autorizar" sin leer; enseñar los límites es
 * lo que convierte esta pantalla en una decisión informada. Los límites son reales: no existen
 * esas tools en el registro.
 *
 * `clientName` es texto que eligió el cliente al registrarse ⇒ NO confiable. React lo escapa por
 * construcción, y se muestra SIEMPRE junto al `redirect_uri` para que un nombre mentiroso quede
 * en evidencia contra el destino real.
 */

interface ConsentProps {
  clientName: string;
  correoDeLaCuenta: string;
  redirectUri: string;
  /** Pass-through al endpoint de decisión, como hidden inputs. */
  flow: {
    client_id: string;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: string;
    scope: string;
    state: string;
  };
}

const PUEDE = [
  "Ver tus tiendas, sus ventas y las participaciones del sorteo",
  "Configurar textos, colores, redes y datos de contacto",
  "Crear y editar productos, y armar o ajustar el sorteo",
  "Editar el borrador de tu página (tú la revisas y la publicas)",
  "Crear otra tienda y conectar tu cuenta de Flow",
];

const NO_PUEDE = [
  "Publicar tu tienda ni tu página — eso lo haces tú",
  "Ejecutar el sorteo",
  "Borrar productos, ventas ni tiendas",
  "Leer las credenciales de Flow que ya tienes guardadas",
];

const McpConsentPage: NextPage<ConsentProps> = ({
  clientName,
  correoDeLaCuenta,
  redirectUri,
  flow,
}) => {
  return (
    <>
      <Head>
        <title>{`Autorizar acceso · ${APP_CONFIG.name}`}</title>
        {/* Pantalla de decisión de seguridad: fuera de buscadores. */}
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <main
        className="flex min-h-screen flex-col items-center px-4 py-10 lg:py-16"
        // Fondo por color scheme, como documenta frontend-conventions para este token.
        style={{
          background:
            "light-dark(var(--mantine-color-hundido-1), var(--mantine-color-dark-8))",
        }}
      >
        <Wordmark size={22} />

        <Card
          withBorder={false}
          radius={18}
          padding="xl"
          shadow="sm"
          mt="xl"
          style={{ width: "100%", maxWidth: 560 }}
        >
          <Stack gap="lg">
            <div>
              <Text
                fw={600}
                c="dimmed"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                Conexión con IA
              </Text>
              {/* `break-words`: `clientName` lo eligió quien registró el cliente OAuth. React
                  escapa el contenido, pero una cadena larga SIN espacios desbordaría la card.
                  Mismo patrón que `detalle-venta.tsx` para datos no confiables. */}
              <Title
                order={1}
                mt={10}
                className="break-words"
                style={{ fontSize: 26, letterSpacing: "-0.02em" }}
              >
                {clientName} quiere conectarse a tu cuenta
              </Title>
              <Text c="dimmed" mt={8} style={{ fontSize: 15, lineHeight: 1.55 }}>
                Si autorizas, esta aplicación va a poder trabajar en tus tiendas
                por ti — con los mismos permisos que tienes tú, ni uno más.
              </Text>
            </div>

            <Divider variant="dashed" />

            <div>
              <Etiqueta>Tu cuenta</Etiqueta>
              <Text mt={4} style={{ fontSize: 15 }}>
                {correoDeLaCuenta}
              </Text>
            </div>

            <div>
              <Etiqueta>Va a poder</Etiqueta>
              <List
                mt={8}
                spacing={6}
                size="sm"
                icon={<IconCheck size={16} stroke={2.2} />}
              >
                {PUEDE.map((item) => (
                  <List.Item key={item}>{item}</List.Item>
                ))}
              </List>
            </div>

            <div>
              <Etiqueta>No va a poder</Etiqueta>
              <List
                mt={8}
                spacing={6}
                size="sm"
                icon={<IconLock size={16} stroke={2.2} />}
              >
                {NO_PUEDE.map((item) => (
                  <List.Item key={item}>{item}</List.Item>
                ))}
              </List>
            </div>

            <div>
              <Etiqueta>Te vamos a devolver a</Etiqueta>
              <Code
                block
                mt={6}
                style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}
              >
                {redirectUri}
              </Code>
              <Text c="dimmed" mt={8} size="xs">
                Si no reconoces esta dirección, rechaza.
              </Text>
            </div>

            <Divider variant="dashed" />

            <Text c="dimmed" size="sm">
              Puedes cortar este acceso cuando quieras desde Configuración →
              Conexiones IA, en tu panel.
            </Text>

            {/* Form nativo: el POST lo procesa el endpoint de decisión, que re-valida TODO
                contra la sesión y el cliente registrado (el HTML es manipulable). */}
            <form method="POST" action="/api/mcp/oauth/authorize/decision">
              {Object.entries(flow).map(([clave, valor]) => (
                <input key={clave} type="hidden" name={clave} value={valor} />
              ))}
              <Group justify="flex-end" gap="sm">
                <Button
                  type="submit"
                  name="decision"
                  value="deny"
                  variant="subtle"
                  color="gray"
                  radius={12}
                >
                  Rechazar
                </Button>
                <Button
                  type="submit"
                  name="decision"
                  value="approve"
                  color="sorteatelo"
                  radius={12}
                >
                  Autorizar
                </Button>
              </Group>
            </form>
          </Stack>
        </Card>
      </main>
    </>
  );
};

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <Text
      fw={600}
      c="dimmed"
      style={{
        fontSize: 11,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
}

export const getServerSideProps: GetServerSideProps<ConsentProps> = async (
  ctx,
) => {
  const sesion = await getServerAuthSession(ctx);
  if (!sesion?.user?.id) {
    // I8: sin sesión no hay consentimiento posible. Se vuelve acá después del login de Google.
    return {
      redirect: {
        destination: `/login?callbackUrl=${encodeURIComponent(ctx.resolvedUrl)}`,
        permanent: false,
      },
    };
  }

  const q = ctx.query;
  const clientId = unParam(q.client_id);
  const redirectUri = unParam(q.redirect_uri);
  const codeChallenge = unParam(q.code_challenge);
  const codeChallengeMethod = unParam(q.code_challenge_method) ?? "S256";
  const scope = unParam(q.scope) ?? "mcp";
  const state = unParam(q.state) ?? "";

  // Los errores acá NO redirigen al cliente (no está verificado): se cae al apex, igual que en
  // `/authorize`. Llegar a esta página sin params válidos es un enlace roto o un intento.
  if (!clientId || !redirectUri || !codeChallenge) {
    return { redirect: { destination: "/", permanent: false } };
  }

  const cliente = await db.mcpClient.findUnique({
    where: { clientId },
    select: { clientName: true, redirectUris: true },
  });
  if (!cliente || !redirectUriVerificada(cliente.redirectUris, redirectUri)) {
    return { redirect: { destination: "/", permanent: false } };
  }

  return {
    props: {
      clientName: cliente.clientName,
      correoDeLaCuenta: sesion.user.email ?? "",
      redirectUri,
      flow: {
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        scope,
        state,
      },
    },
  };
};

function unParam(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default McpConsentPage;
