import { Accordion, Button, Group, Stack, Text, Title } from "@mantine/core";
import {
  IconBrandGoogle,
  IconBuildingBank,
  IconCalendarOff,
  IconCheck,
  IconCodeOff,
  IconFileCertificate,
  IconLockSquareRounded,
  IconReceiptOff,
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
  HAZLO_TU_MISMO,
  HEADER_CTA,
  HERO,
  MOMENTO,
  PASOS,
  PRECIO,
  TESTIMONIO,
} from "./copy";
import { Etiqueta } from "./etiqueta";
import s from "./landing.module.css";
import { Perforacion } from "./perforacion";
import { Plumon } from "./plumon";
import {
  BLOQUES_JSON_LD,
  DESCRIPCION_SEO,
  KEYWORDS_SEO,
  LOCALE_SEO,
  TITULO_SEO,
  URL_CANONICA,
  URL_OG_IMAGEN,
} from "./seo";
import { RevelarAlScroll } from "./revelar-al-scroll";
import { TalonarioVivo } from "./talonario-vivo";
import { TelefonoTienda } from "./telefono-tienda";

/**
 * Landing oficial de la plataforma «El Talonario». Reemplaza el `PlaceholderPlataforma` del apex
 * (`src/pages/index.tsx`) SIN tocar el despacho por zona/tenant (I2/I6). 100% Mantine + la gramática
 * talonario encapsulada; CTAs a `/login`; indexable (sin `noindex`), metadata desde `APP_CONFIG`.
 *
 * **Secuencia de bandas — 9, reposicionamiento sorteo-first D8** (`docs/design.md` §9 la registra):
 * AZUL (hero) → BLANCA (cómo funciona) → AMARILLA (momento clave + talonario) → BLANCA (hazlo tú
 * mismo) → AMARILLA (precio) → BLANCA (confianza) → GRIS (FAQ) → AZUL (boleto CTA) → TINTA (footer).
 * Regla dura del usuario: **dos blancas nunca adyacentes** — por eso las secciones nuevas entran
 * intercaladas y NINGUNA sección existente se recolorea. Mover una sección obliga a re-verificar la
 * alternancia y a actualizar design.md §9.
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

/** Íconos «sin X» de la banda hazlo-tú-mismo (cotización / programador / espera). */
const HAZLO_ICONOS: Icon[] = [IconReceiptOff, IconCodeOff, IconCalendarOff];

/** Color de acento de los íconos de la landing (token del theme, cero hex). */
const COLOR_ICONO = "var(--mantine-color-sorteatelo-6)";

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
        <title>{TITULO_SEO}</title>
        <meta name="description" content={DESCRIPCION_SEO} />
        {/* Única superficie (junto al `keywords` del JSON-LD) donde "rifa" está permitida — D13.
            Su valor de ranking es ≈0 y se pone a sabiendas; ver `seo.ts`. */}
        <meta name="keywords" content={KEYWORDS_SEO} />
        <link rel="canonical" href={URL_CANONICA} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={APP_CONFIG.name} />
        <meta property="og:locale" content={LOCALE_SEO} />
        <meta property="og:url" content={URL_CANONICA} />
        <meta property="og:title" content={TITULO_SEO} />
        <meta property="og:description" content={DESCRIPCION_SEO} />
        {/* PNG absoluto: los crawlers sociales no rasterizan SVG ni resuelven rutas relativas. */}
        <meta property="og:image" content={URL_OG_IMAGEN} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      {/* JSON-LD en el BODY, no dentro de `next/head`: Google acepta `application/ld+json` en el
          body (es la forma que documenta el propio Next para el pages router) y así no se depende
          del manejo especial que `next/head` hace de los `<script>`. Los bloques se DERIVAN del copy
          (I10) — nunca se escriben a mano acá. */}
      {BLOQUES_JSON_LD.map((bloque) => (
        <script
          key={String(bloque["@type"])}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(bloque) }}
        />
      ))}

      {/* Header + Hero = una sola región AZUL, con curva inferior derecha (scoop) */}
      {/* Header (azul, integrado al hero, sticky) */}
      <Banda
        tono="azul"
        className="sticky top-0 z-50"
        contenedorClassName="flex items-center justify-between py-5"
      >
        <Wordmark size={24} invertido />
        <Button
          component={Link}
          href="/login"
          color="amarillo"
          radius="md"
          visibleFrom="xs"
        >
          {HEADER_CTA}
        </Button>
      </Banda>

      {/* Hero (azul, cierra la región con la curva inferior derecha) */}
      <Banda
        tono="azul"
        curvaInferior
        contenedorClassName="grid items-center gap-12 py-14 lg:grid-cols-[7fr_5fr] lg:gap-16 lg:py-20"
      >
        <div>
          <Etiqueta>{HERO.eyebrow}</Etiqueta>
          <Title order={1} c="white" mt={18} mb={20} style={{ ...TITULAR, fontSize: "clamp(36px, 4.8vw, 52px)", lineHeight: 1.04 }}>
            {HERO.monta}
            <Plumon>{HERO.sorteo}</Plumon>
            {HERO.online}
            <Plumon variante="b">{HERO.hoy}</Plumon>
            {HERO.mismo}
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
          {/* Remate del «en un día»: la promesa se dice al final de los pasos, no en el titular. El
              plumón lo separa del tratamiento de los títulos de card (fw 600 / 17.5) — sin él se leía
              como un 5º paso huérfano bajo la grilla. */}
          <Text fw={700} mt={30} style={{ fontSize: 20 }}>
            {COMO_FUNCIONA.remate}
            <Plumon>{COMO_FUNCIONA.remateDestacado}</Plumon>
          </Text>
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

      {/* Hazlo tú mismo (blanca) — el diferenciador vs. encargarle el sorteo a una agencia.
          A propósito SIN cards: la sección va entre dos que sí las usan (pasos y confianza), y
          repetir la card por tercera vez aplanaba el ritmo de la página. */}
      <Banda tono="blanca" contenedorClassName="py-16">
        <RevelarAlScroll>
          <Etiqueta>{HAZLO_TU_MISMO.eyebrow}</Etiqueta>
          <Title order={2} mt={12} mb={24} style={{ ...TITULAR, maxWidth: "18em" }}>
            {HAZLO_TU_MISMO.titulo}
          </Title>
          <Perforacion className="mb-9" />
          <div className="grid gap-8 lg:grid-cols-3 lg:gap-10">
            {HAZLO_TU_MISMO.items.map((item, i) => {
              const Icono = HAZLO_ICONOS[i]!;
              return (
                <div key={item.titulo}>
                  <Icono className="size-8" stroke={1.5} color={COLOR_ICONO} />
                  <Text fw={600} mt={14} mb={8} style={{ fontSize: 18, lineHeight: 1.3 }}>
                    {item.titulo}
                  </Text>
                  <Text c="dimmed" style={{ fontSize: 15, lineHeight: 1.6 }}>
                    {item.texto}
                  </Text>
                </div>
              );
            })}
          </div>
        </RevelarAlScroll>
      </Banda>

      {/* Precio (amarilla) — el modelo comercial impreso completo. El amarillo lotería es el color
          del momento que importa; acá el momento es saber cuánto cuesta, sin cotizar. */}
      <Banda tono="amarilla" contenedorClassName="py-16 lg:py-20">
        <RevelarAlScroll className="grid items-center gap-10 lg:grid-cols-[6fr_5fr] lg:gap-16">
          <div>
            <Etiqueta c="black">{PRECIO.eyebrow}</Etiqueta>
            <Title order={2} c="black" mt={12} mb={14} style={{ ...TITULAR, maxWidth: "14em" }}>
              {PRECIO.titulo}
            </Title>
            <Text c="black" style={{ fontSize: 17, lineHeight: 1.6, maxWidth: "28em", opacity: 0.8 }}>
              {PRECIO.gratis}
            </Text>
            <Text c="black" fw={600} mt={14} style={{ fontSize: 17, lineHeight: 1.5 }}>
              {PRECIO.comision}
            </Text>
            <Text c="black" fw={700} mt={20} style={{ fontSize: 20 }}>
              <Plumon variante="b">{PRECIO.remate}</Plumon>
            </Text>
            <Text c="black" mt={14} style={{ fontSize: 15, lineHeight: 1.55, opacity: 0.75 }}>
              {PRECIO.multiTienda}
            </Text>
          </div>
          <div className="flex justify-center lg:justify-end">
            <Card className="w-full max-w-[380px]">
              <div style={{ padding: "30px 30px 26px" }}>
                <Group align="baseline" gap={10}>
                  <Text
                    ff="monospace"
                    fw={600}
                    className="tabular-nums"
                    style={{
                      fontSize: "clamp(38px, 5vw, 48px)",
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                    }}
                  >
                    {PRECIO.monto}
                  </Text>
                  <Text fw={600} style={{ fontSize: 17 }}>
                    {PRECIO.periodo}
                  </Text>
                </Group>
                <Etiqueta className="mt-[10px] block">{PRECIO.nota}</Etiqueta>
                <Perforacion className="my-5" />
                <Stack gap={12}>
                  {PRECIO.incluye.map((item) => (
                    <Group key={item} gap={10} wrap="nowrap" align="flex-start">
                      <IconCheck
                        className="size-[18px] shrink-0"
                        stroke={2.5}
                        color={COLOR_ICONO}
                        style={{ marginTop: 2 }}
                      />
                      <Text style={{ fontSize: 15, lineHeight: 1.5 }}>{item}</Text>
                    </Group>
                  ))}
                </Stack>
              </div>
            </Card>
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
                    <Icono className="size-8" stroke={1.5} color={COLOR_ICONO} />
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
        <Wordmark size={17} invertido />
        <Etiqueta style={{ textTransform: "none", letterSpacing: "0.02em" }}>
          {FOOTER}
        </Etiqueta>
      </Banda>
    </>
  );
}
