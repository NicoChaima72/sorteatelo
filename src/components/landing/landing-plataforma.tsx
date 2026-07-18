import { Accordion, Button, Group, Text, Title } from "@mantine/core";
import {
  IconBrandGoogle,
  IconBuildingBank,
  IconFileCertificate,
  IconLockSquareRounded,
  type Icon,
} from "@tabler/icons-react";
import Head from "next/head";
import Link from "next/link";
import { type ReactNode } from "react";

import { Wordmark } from "~/components/marca/wordmark";
import { APP_CONFIG } from "~/config/app";
import { cn } from "~/lib/utils";

import { Banda } from "./banda";
import { BoletoCta } from "./boleto-cta";
import {
  COMO_FUNCIONA,
  CONFIANZA,
  CONFIANZA_INTRO,
  CTA_FINAL,
  FAQ,
  FAQ_INTRO,
  FOOTER,
  HEADER_CTA,
  HERO,
  MOMENTO,
  PASOS,
  TESTIMONIO,
} from "./copy";
import { Etiqueta } from "./etiqueta";
import s from "./landing.module.css";
import { Perforacion } from "./perforacion";
import { Plumon } from "./plumon";
import { RevelarAlScroll } from "./revelar-al-scroll";
import { TalonarioVivo } from "./talonario-vivo";
import { TelefonoTienda } from "./telefono-tienda";

/**
 * Landing oficial de la plataforma «El Talonario» (F03). Reemplaza el `PlaceholderPlataforma` del
 * apex (`src/pages/index.tsx`) SIN tocar el despacho por zona/tenant (I2). Secuencia de bandas D9:
 * AZUL (hero) → BLANCO (cómo funciona) → AMARILLO (momento clave + talonario) → BLANCO (confianza)
 * → GRIS (FAQ) → AZUL (boleto CTA) → TINTA (footer). Regla I6: dos blancas nunca adyacentes. Copy
 * migrado (I8), 100% Mantine + la gramática talonario encapsulada (D6). CTAs a `/login`. Indexable
 * (sin `noindex`), title/OG desde `APP_CONFIG` (D9).
 */

/** Fuente display para los titulares (Bricolage 800 vía theme headings). */
const TITULAR = {
  fontSize: "clamp(28px, 3.4vw, 40px)",
  fontWeight: 800,
  letterSpacing: "-0.02em",
  textWrap: "balance",
} as const;

const CONFIANZA_ICONOS: Icon[] = [
  IconBuildingBank,
  IconFileCertificate,
  IconLockSquareRounded,
];

/** Card de la gramática suave (radio 18, sombra difusa) — CSS module acotado. */
function Card({
  children,
  suave,
  className,
}: {
  children: ReactNode;
  suave?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(suave ? s.cardSuave : s.card, className)}>{children}</div>
  );
}

export function LandingPlataforma() {
  return (
    <>
      <Head>
        <title>{`${APP_CONFIG.name} · ${APP_CONFIG.tagline}`}</title>
        <meta name="description" content={APP_CONFIG.tagline} />
        <meta property="og:title" content={APP_CONFIG.name} />
        <meta property="og:description" content={APP_CONFIG.tagline} />
        <meta property="og:image" content="/og.svg" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      {/* Header (blanca) */}
      <Banda
        tono="blanca"
        contenedorClassName="flex items-center justify-between py-5"
      >
        <Wordmark size={24} />
        <Button
          component={Link}
          href="/login"
          color="sorteatelo"
          radius="md"
          visibleFrom="xs"
        >
          {HEADER_CTA}
        </Button>
      </Banda>

      <Perforacion />

      {/* Hero (azul) */}
      <Banda
        tono="azul"
        contenedorClassName="grid items-center gap-12 py-14 lg:grid-cols-[7fr_5fr] lg:gap-16 lg:py-20"
      >
        <div>
          <Etiqueta>{HERO.eyebrow}</Etiqueta>
          <Title order={1} c="white" mt={18} mb={20} style={{ ...TITULAR, fontSize: "clamp(36px, 4.8vw, 52px)", lineHeight: 1.04 }}>
            <Plumon>{HERO.vende}</Plumon>
            {HERO.entre}
            <Plumon variante="b">{HERO.sortea}</Plumon>
            {HERO.despues}
          </Title>
          <Text c="white" style={{ fontSize: 19, lineHeight: 1.55, maxWidth: "30em", opacity: 0.85 }}>
            {HERO.bajada}
          </Text>
          <Group mt="xl" gap="md">
            <Button component={Link} href="/login" color="amarillo" radius="md" size="md">
              {HERO.cta}
            </Button>
            <Button
              component={Link}
              href="/login"
              variant="white"
              radius="md"
              size="md"
              leftSection={<IconBrandGoogle className="size-[18px]" stroke={2} />}
            >
              {HERO.ctaGoogle}
            </Button>
          </Group>
          <Etiqueta className="mt-[18px] block">{HERO.nota}</Etiqueta>
        </div>
        <div className="flex justify-center pr-2 lg:justify-end lg:pr-4">
          <TelefonoTienda />
        </div>
      </Banda>

      {/* Cómo funciona (blanca) */}
      <Banda tono="blanca" contenedorClassName="py-16">
        <RevelarAlScroll>
          <Etiqueta>{COMO_FUNCIONA.eyebrow}</Etiqueta>
          <Title order={2} mt={12} mb={36} style={{ ...TITULAR, maxWidth: "22em" }}>
            {COMO_FUNCIONA.titulo}
          </Title>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PASOS.map((paso) => (
              <Card key={paso.numero}>
                <div style={{ padding: "22px 20px" }}>
                  <Text
                    c="sorteatelo"
                    ff="monospace"
                    fw={600}
                    style={{ fontSize: 30, letterSpacing: "-0.02em" }}
                  >
                    {paso.numero}
                  </Text>
                  <Text fw={600} mt={12} mb={6} style={{ fontSize: 17.5 }}>
                    {paso.titulo}
                  </Text>
                  <Text c="dimmed" style={{ fontSize: 14.5, lineHeight: 1.55 }}>
                    {paso.texto}
                  </Text>
                </div>
              </Card>
            ))}
          </div>
        </RevelarAlScroll>
      </Banda>

      {/* Momento clave (amarilla) */}
      <Banda tono="amarilla" contenedorClassName="py-16 lg:py-20">
        <RevelarAlScroll className="grid items-center gap-12 lg:grid-cols-[6fr_5fr] lg:gap-16">
          <div>
            <Etiqueta c="black">{MOMENTO.eyebrow}</Etiqueta>
            <Title order={2} c="black" mt={12} mb={14} style={{ ...TITULAR, maxWidth: "16em" }}>
              {MOMENTO.titulo}
            </Title>
            <Text c="black" style={{ fontSize: 17, lineHeight: 1.6, maxWidth: "30em", opacity: 0.8 }}>
              {MOMENTO.texto}
            </Text>
          </div>
          <div className="flex justify-center lg:justify-end">
            <div style={{ width: "100%", maxWidth: 380 }}>
              <TalonarioVivo />
            </div>
          </div>
        </RevelarAlScroll>
      </Banda>

      {/* Confianza (blanca) */}
      <Banda tono="blanca" contenedorClassName="py-16">
        <RevelarAlScroll>
          <Etiqueta>{CONFIANZA_INTRO.eyebrow}</Etiqueta>
          <Title order={2} mt={12} mb={10} style={{ ...TITULAR, maxWidth: "22em" }}>
            {CONFIANZA_INTRO.titulo}
          </Title>
          <Text c="dimmed" mb={36} style={{ fontSize: 17, lineHeight: 1.6, maxWidth: "38em" }}>
            {CONFIANZA_INTRO.bajada}
          </Text>
          <div className="grid gap-4 lg:grid-cols-3">
            {CONFIANZA.map((item, i) => {
              const Icono = CONFIANZA_ICONOS[i]!;
              return (
                <Card key={item.titulo}>
                  <div style={{ padding: "26px 24px" }}>
                    <Icono
                      className="size-8"
                      stroke={1.5}
                      color="var(--mantine-color-sorteatelo-6)"
                    />
                    <Text fw={600} mt={14} mb={8} style={{ fontSize: 18, lineHeight: 1.3 }}>
                      {item.titulo}
                    </Text>
                    <Text c="dimmed" style={{ fontSize: 15, lineHeight: 1.6 }}>
                      {item.texto}
                    </Text>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Testimonio piloto — atribución honesta (pendiente de autorización). */}
          <Card suave className="mt-5">
            <figure
              className="m-0 flex flex-wrap items-baseline gap-4"
              style={{ padding: "22px 26px" }}
            >
              <Text
                component="blockquote"
                fw={500}
                className="m-0 flex-[1_1_24em]"
                style={{ fontSize: 16.5, lineHeight: 1.55 }}
              >
                {TESTIMONIO.cita}
              </Text>
              <figcaption>
                <Etiqueta>{TESTIMONIO.atribucion}</Etiqueta>
              </figcaption>
            </figure>
          </Card>
        </RevelarAlScroll>
      </Banda>

      {/* FAQ (gris) */}
      <Banda tono="gris" contenedorClassName="py-16">
        <RevelarAlScroll>
          <Etiqueta>{FAQ_INTRO.eyebrow}</Etiqueta>
          <Title order={2} mt={12} mb={30} style={TITULAR}>
            {FAQ_INTRO.titulo}
          </Title>
          <Accordion variant="separated" radius="lg" className="max-w-3xl">
            {FAQ.map((item, i) => (
              <Accordion.Item key={item.pregunta} value={`faq-${i}`}>
                <Accordion.Control>
                  <Text fw={600} style={{ fontSize: 16 }}>
                    {item.pregunta}
                  </Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Text c="dimmed" style={{ fontSize: 15, lineHeight: 1.6 }}>
                    {item.respuesta}
                  </Text>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </RevelarAlScroll>
      </Banda>

      {/* CTA final (azul) — boleto con talón amarillo */}
      <Banda tono="azul" contenedorClassName="py-16">
        <RevelarAlScroll>
          <BoletoCta
            eyebrow={CTA_FINAL.eyebrow}
            titulo={CTA_FINAL.titulo}
            bajada={CTA_FINAL.bajada}
            numero={CTA_FINAL.numero}
            cta={
              <Button component={Link} href="/login" color="sorteatelo" radius="md">
                {CTA_FINAL.cta}
              </Button>
            }
          />
        </RevelarAlScroll>
      </Banda>

      {/* Footer (tinta) */}
      <Banda
        tono="tinta"
        contenedorClassName="flex flex-wrap items-center justify-between gap-3 py-8"
      >
        <Wordmark size={17} c="white" />
        <Etiqueta style={{ textTransform: "none", letterSpacing: "0.02em" }}>
          {FOOTER}
        </Etiqueta>
      </Banda>
    </>
  );
}
