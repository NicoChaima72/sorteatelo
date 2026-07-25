import { BarChart, type BarChartSeries } from "@mantine/charts";
import { Button, Group, Image, Skeleton, Table, Text } from "@mantine/core";
import {
  IconArrowRight,
  IconChartBar,
  IconGift,
  IconShoppingCart,
  IconTicket,
  IconTrendingDown,
  IconTrendingUp,
} from "@tabler/icons-react";
import { type GetServerSideProps } from "next";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { type ReactNode, useEffect, useState } from "react";

import { AdminLayout } from "~/components/admin/admin-layout";
import { ChecklistPublicacion } from "~/components/admin/checklist-publicacion";
import { EmptyState } from "~/components/admin/empty-state";
import { EstadoBadge } from "~/components/admin/estado-badge";
import { EstadoTiendaBadge } from "~/components/admin/estado-tienda-badge";
import { PanelCard } from "~/components/admin/panel-card";
import { clp, diaMes, fecha, fechaHora, num } from "~/lib/formato";
import { requireSession } from "~/server/auth";
import { api, type RouterOutputs } from "~/utils/api";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const guard = await requireSession(ctx);
  if ("redirect" in guard) return { redirect: guard.redirect };
  return { props: {} };
};

type DeltaServer = RouterOutputs["panel"]["getResumenTienda"]["deltas"]["ventas"];
type SorteoPanel = RouterOutputs["panel"]["getSorteo"]["sorteo"];
type PuntoSerie = RouterOutputs["panel"]["getSerieVentasDiaria"][number];

/** Traduce el delta del server (`{pct,dir}|null`) al prop del `StatCard` (`{value,dir}`). */
function deltaProp(d: DeltaServer): { value: string; dir: "up" | "down" } | undefined {
  if (!d) return undefined;
  return { value: `${d.dir === "up" ? "+" : "−"}${d.pct}%`, dir: d.dir };
}

/**
 * Overline: etiqueta de sección en mayúscula + tracking + dimmed (look «SaaS plano» adaptado del
 * dashboard de Grillos v2 a la marca de Sortéatelo). Reemplaza los títulos de card en negrita.
 */
function Overline({ children }: { children: ReactNode }) {
  return (
    <Text
      component="div"
      fz={11}
      fw={600}
      c="dimmed"
      tt="uppercase"
      style={{ letterSpacing: "0.06em" }}
    >
      {children}
    </Text>
  );
}

/** Delta ▲/▼ compacto para la tira de KPIs (verde exito / ladrillo). */
function DeltaInline({ delta }: { delta: { value: string; dir: "up" | "down" } }) {
  const Icon = delta.dir === "up" ? IconTrendingUp : IconTrendingDown;
  return (
    <Text
      span
      fz="xs"
      fw={600}
      c={delta.dir === "up" ? "exito" : "red"}
      className="inline-flex items-center gap-0.5"
    >
      <Icon className="size-3.5" stroke={2} />
      {delta.value}
    </Text>
  );
}

/** Fila de KPIs como TIRA dividida por hairlines (patrón Grillos): un PanelCard, celdas con
 * separadores de 1px logrados con `gap:1px` sobre fondo de color de borde. */
function KpiStrip({
  celdas,
}: {
  celdas: {
    label: string;
    value: string;
    hint: string;
    delta?: { value: string; dir: "up" | "down" };
  }[];
}) {
  return (
    <PanelCard padding={0} className="overflow-hidden">
      <div
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
        style={{ gap: 1, background: "var(--mantine-color-default-border)" }}
      >
        {celdas.map((c) => (
          <div
            key={c.label}
            className="px-5 py-4"
            style={{ background: "var(--mantine-color-body)" }}
          >
            <Overline>{c.label}</Overline>
            <Text
              fw={700}
              fz="1.55rem"
              lh={1.15}
              ff="monospace"
              className="tabular-nums"
              mt={8}
            >
              {c.value}
            </Text>
            <Group gap={8} mt={6} align="center" wrap="nowrap">
              {c.delta && <DeltaInline delta={c.delta} />}
              <Text span size="xs" c="dimmed">
                {c.hint}
              </Text>
            </Group>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}

/**
 * Gráfico de ventas de 14 días (F03, design.md §6). `BarChart` de `@mantine/charts` con la barra de
 * "hoy" en amarillo y el resto en cobalto — como `getBarColor` colorea por VALOR (no por posición),
 * el truco es una serie apilada de dos: cada día pone su conteo en `ventas` (cobalto) salvo el
 * último, que lo pone en `hoy` (amarillo); la otra queda en 0. Leyenda oculta (serie efectiva única).
 */
function GraficoVentas({
  serie,
  isLoading,
  isError,
  onRetry,
}: {
  serie: PuntoSerie[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const hayVentas = serie.some((d) => d.ventas > 0);
  const data = serie.map((d, i) => {
    const esHoy = i === serie.length - 1;
    return {
      dia: diaMes(d.fecha),
      ventas: esHoy ? 0 : d.ventas,
      hoy: esHoy ? d.ventas : 0,
    };
  });
  const series: BarChartSeries[] = [
    { name: "ventas", label: "Ventas", color: "sorteatelo.6" },
    { name: "hoy", label: "Hoy", color: "amarillo.6" },
  ];

  return (
    <PanelCard>
      <Overline>Ventas de los últimos 14 días</Overline>
      <Text size="sm" c="dimmed" mt={4}>
        Órdenes pagadas por día
      </Text>
      <div className="mt-4">
        {isLoading ? (
          <Skeleton height={240} radius="sm" />
        ) : isError ? (
          <div className="py-10 text-center">
            <Text size="sm" c="red">
              No pudimos cargar la serie de ventas.
            </Text>
            <Button variant="default" size="xs" mt="sm" onClick={onRetry}>
              Reintentar
            </Button>
          </div>
        ) : !hayVentas ? (
          <EmptyState
            icon={IconChartBar}
            title="Todavía no hay ventas que graficar"
            description="Cuando vendas, verás acá tu ritmo de ventas de las últimas dos semanas."
          />
        ) : (
          <BarChart
            h={240}
            data={data}
            dataKey="dia"
            type="stacked"
            series={series}
            withLegend={false}
            gridAxis="y"
            tickLine="y"
            strokeDasharray="3 3"
            barProps={{ radius: 3 }}
            xAxisProps={{ interval: 1 }}
          />
        )}
      </div>
    </PanelCard>
  );
}

/** Card "Tu sorteo": countdown a `fechaFin` (client-side) + conteo de tickets (F03). */
function CardSorteo({
  sorteo,
  isLoading,
  isError,
  onRetry,
}: {
  sorteo: SorteoPanel;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <PanelCard>
      <Group justify="space-between" align="center" mb="md" wrap="nowrap">
        <Overline>Tu sorteo</Overline>
        <Button
          component={Link}
          href="/admin/sorteo"
          variant="subtle"
          size="xs"
          rightSection={<IconArrowRight className="size-4" />}
        >
          Ver sorteo
        </Button>
      </Group>

      {isLoading ? (
        <Skeleton height={220} radius="sm" />
      ) : isError ? (
        <div className="py-10 text-center">
          <Text size="sm" c="red">
            No pudimos cargar tu sorteo.
          </Text>
          <Button variant="default" size="xs" mt="sm" onClick={onRetry}>
            Reintentar
          </Button>
        </div>
      ) : !sorteo ? (
        <EmptyState
          icon={IconTicket}
          title="Todavía no tienes un sorteo"
          description="Crea un sorteo para que tus compradores participen con cada compra."
          action={
            <Button
              component={Link}
              href="/admin/sorteo"
              variant="light"
              size="xs"
              rightSection={<IconArrowRight className="size-3.5" />}
            >
              Crear sorteo
            </Button>
          }
        />
      ) : (
        <>
          {sorteo.premioImageUrl ? (
            <Image
              src={sorteo.premioImageUrl}
              alt={sorteo.premio}
              h={140}
              radius="md"
              fit="cover"
            />
          ) : (
            <div
              className="flex h-[140px] items-center justify-center"
              style={{
                backgroundColor: "var(--mantine-color-sorteatelo-0)",
                borderRadius: "var(--mantine-radius-md)",
              }}
            >
              <IconGift
                className="size-10"
                stroke={1.5}
                color="var(--mantine-primary-color-filled)"
              />
            </div>
          )}

          <Text fw={600} mt="md" lineClamp={1}>
            {sorteo.nombre}
          </Text>
          <Text size="sm" c="dimmed" lineClamp={2}>
            {sorteo.premio}
          </Text>

          <div className="mt-4">
            <Countdown fechaFin={sorteo.fechaFin} />
          </div>

          <Group gap={6} mt="md" align="center" wrap="nowrap">
            <IconTicket
              className="size-4"
              stroke={1.75}
              color="var(--mantine-primary-color-filled)"
            />
            <Text span fw={600} ff="monospace" className="tabular-nums">
              {num(sorteo.totalParticipaciones)}
            </Text>
            <Text span size="sm" c="dimmed">
              {sorteo.totalParticipaciones === 1 ? "ticket" : "tickets"}
            </Text>
          </Group>
          {/* Fuera de alcance (sin datos en el modelo, D10/I7): número secuencial «Nº 312»,
              barra de progreso a-meta «312/500» y "De dónde llegan" (ventas por canal). */}
        </>
      )}
    </PanelCard>
  );
}

/** Countdown calmo a `fechaFin` (client-only; sin segundos parpadeantes — §8 evita urgencia). */
function Countdown({ fechaFin }: { fechaFin: Date }) {
  const [restante, setRestante] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setRestante(fechaFin.getTime() - Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [fechaFin]);

  if (restante === null) return null; // primer paint client: evita cualquier mismatch
  if (restante <= 0) {
    return (
      <Text size="sm" c="dimmed">
        El sorteo cerró el {fecha(fechaFin)}.
      </Text>
    );
  }

  const dias = Math.floor(restante / 86_400_000);
  const horas = Math.floor((restante % 86_400_000) / 3_600_000);
  const minutos = Math.floor((restante % 3_600_000) / 60_000);
  const bloques: Array<{ n: number; label: string }> = [
    { n: dias, label: dias === 1 ? "día" : "días" },
    { n: horas, label: "h" },
    { n: minutos, label: "min" },
  ];

  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" style={{ letterSpacing: "0.03em" }}>
        Cierra en
      </Text>
      <Group gap="lg" mt={4} align="flex-end">
        {bloques.map((b) => (
          <div key={b.label}>
            <Text ff="monospace" fz="1.5rem" fw={700} lh={1.1} className="tabular-nums">
              {b.n}
            </Text>
            <Text size="xs" c="dimmed">
              {b.label}
            </Text>
          </div>
        ))}
      </Group>
    </div>
  );
}

export default function AdminDashboard() {
  const { data: session } = useSession();
  const resumen = api.panel.getResumenTienda.useQuery(undefined, {
    retry: false,
  });
  const serie = api.panel.getSerieVentasDiaria.useQuery(undefined, {
    retry: false,
  });
  const ventas = api.panel.listarVentas.useQuery(
    { cursor: null },
    { retry: false },
  );
  const sorteo = api.panel.getSorteo.useQuery(undefined, { retry: false });
  const estadoPub = api.panel.getEstadoPublicacion.useQuery(undefined, {
    retry: false,
  });

  const primerNombre = session?.user?.name?.trim().split(/\s+/)[0] ?? "";
  const saludo = primerNombre ? `Hola, ${primerNombre}` : "Hola";
  const kpis = resumen.data;
  const serieData = serie.data ?? [];
  const ultimas = (ventas.data?.items ?? []).slice(0, 5);

  return (
    <AdminLayout
      title={saludo}
      description="Una mirada rápida a cómo va tu tienda."
      actions={
        estadoPub.data ? (
          <EstadoTiendaBadge estado={estadoPub.data.estado} />
        ) : undefined
      }
    >
      {/* Publica tu tienda: el funnel de publicación (se auto-colapsa a un banner cuando ya
          está publicada). Componente compartido — conserva su gramática propia. */}
      <div className="mb-4">
        <ChecklistPublicacion />
      </div>

      {resumen.isLoading ? (
        <Skeleton height={108} radius="lg" />
      ) : resumen.isError || !kpis ? (
        <div className="py-10 text-center">
          <Text size="sm" c="red">
            No pudimos cargar los indicadores.
          </Text>
          <Button
            variant="default"
            size="xs"
            mt="sm"
            onClick={() => void resumen.refetch()}
          >
            Reintentar
          </Button>
        </div>
      ) : (
        <KpiStrip
          celdas={[
            {
              label: "Ventas pagadas",
              value: num(kpis.ventasPagadas),
              hint: "últimos 14 días",
              delta: deltaProp(kpis.deltas.ventas),
            },
            {
              label: "Ingresos",
              value: clp(kpis.ingresos),
              hint: "total cobrado (bruto)",
              delta: deltaProp(kpis.deltas.ingresos),
            },
            {
              label: "Pendientes",
              value: num(kpis.ordenesPendientes),
              hint: "órdenes sin pagar",
            },
            {
              label: "Productos activos",
              value: num(kpis.productosActivos),
              hint: "a la venta",
            },
          ]}
        />
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-4">
          <GraficoVentas
            serie={serieData}
            isLoading={serie.isLoading}
            isError={serie.isError}
            onRetry={() => void serie.refetch()}
          />

          <PanelCard>
            <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
              <div>
                <Overline>Últimas ventas</Overline>
                <Text size="sm" c="dimmed" mt={4}>
                  Las compras más recientes
                </Text>
              </div>
              <Button
                component={Link}
                href="/admin/ventas"
                variant="subtle"
                size="xs"
                rightSection={<IconArrowRight className="size-4" />}
              >
                Ver todas
              </Button>
            </Group>

            <Table.ScrollContainer minWidth={480}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Cliente</Table.Th>
                    <Table.Th className="hidden md:table-cell">Productos</Table.Th>
                    <Table.Th className="hidden sm:table-cell">Fecha</Table.Th>
                    <Table.Th className="text-right">Total</Table.Th>
                    <Table.Th>Estado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {ventas.isLoading ? (
                    [0, 1, 2].map((i) => (
                      <Table.Tr key={i}>
                        <Table.Td>
                          <Skeleton height={16} width={160} />
                        </Table.Td>
                        <Table.Td className="hidden md:table-cell">
                          <Skeleton height={16} width={128} />
                        </Table.Td>
                        <Table.Td className="hidden sm:table-cell">
                          <Skeleton height={16} width={96} />
                        </Table.Td>
                        <Table.Td className="text-right">
                          <Skeleton height={16} width={64} className="ml-auto" />
                        </Table.Td>
                        <Table.Td>
                          <Skeleton height={20} width={80} />
                        </Table.Td>
                      </Table.Tr>
                    ))
                  ) : ventas.isError ? (
                    <Table.Tr>
                      <Table.Td colSpan={5} className="py-10 text-center">
                        <Text size="sm" c="red">
                          No pudimos cargar las ventas.
                        </Text>
                        <Button
                          variant="default"
                          size="xs"
                          mt="sm"
                          onClick={() => void ventas.refetch()}
                        >
                          Reintentar
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ) : ultimas.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={5}>
                        <EmptyState
                          icon={IconShoppingCart}
                          title="Todavía no vendes nada — y está bien"
                          description="Cuando alguien compre en tu tienda, sus compras aparecerán acá."
                          action={
                            <Button
                              component={Link}
                              href="/admin/productos"
                              variant="light"
                              size="xs"
                              rightSection={<IconArrowRight className="size-3.5" />}
                            >
                              Crear tu primer producto
                            </Button>
                          }
                        />
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    ultimas.map((o) => (
                      <Table.Tr key={o.id}>
                        <Table.Td c="dimmed">{o.email}</Table.Td>
                        <Table.Td className="hidden max-w-[240px] truncate md:table-cell">
                          {o.productos.join(", ")}
                        </Table.Td>
                        <Table.Td className="hidden whitespace-nowrap sm:table-cell" c="dimmed">
                          {fechaHora(o.createdAt)}
                        </Table.Td>
                        <Table.Td className="text-right tabular-nums">
                          {clp(o.total)}
                        </Table.Td>
                        <Table.Td>
                          <EstadoBadge estado={o.estado} />
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </PanelCard>
        </div>

        <CardSorteo
          sorteo={sorteo.data?.sorteo ?? null}
          isLoading={sorteo.isLoading}
          isError={sorteo.isError}
          onRetry={() => void sorteo.refetch()}
        />
      </div>
    </AdminLayout>
  );
}
