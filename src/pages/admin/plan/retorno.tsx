import { Button, Group, Loader, Stack, Text, ThemeIcon } from "@mantine/core";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconRosetteDiscountCheck,
} from "@tabler/icons-react";
import { type GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

import { AdminLayout } from "~/components/admin/admin-layout";
import { PanelCard } from "~/components/admin/panel-card";
import { guardPaginaAdmin } from "~/server/panel/guardPaginaAdmin";
import { api } from "~/utils/api";

/**
 * Página de RETORNO del registro de tarjeta (F03/D12, ADR-0026). Flow devuelve acá el navegador con
 * un `token` después de que el Pagador ingresó su tarjeta.
 *
 * **El token NO es una prueba de nada** (I3): esta página solo lo transporta a
 * `activarPlanTrasRegistro`, que lo verifica SERVER-SIDE contra `customer/getRegisterStatus` antes de
 * crear la suscripción. Mismo principio que el retorno del checkout (ADR-0001): el navegador nunca
 * confirma dinero.
 *
 * Corre en el subdominio de la Tienda (ADR-0022) y está gateada por `guardPaginaAdmin` como el resto
 * del panel. Tras activar, publica la Tienda reusando `publicarTienda` — el gate de publicación
 * sigue siendo el mismo y se recomputa server-side (I2).
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const guard = await guardPaginaAdmin(ctx);
  if (!("ok" in guard)) return guard;
  return { props: {} };
};

type Fase =
  | { estado: "activando" }
  | { estado: "publicando" }
  | { estado: "listo"; publicada: boolean; aviso?: string }
  | { estado: "error"; mensaje: string };

export default function RetornoPlanPage() {
  const router = useRouter();
  const utils = api.useUtils();
  const [fase, setFase] = useState<Fase>({ estado: "activando" });
  // El efecto corre una sola vez por token: sin esto, un re-render dispararía otra activación.
  const disparado = useRef(false);

  const invalidar = () =>
    Promise.all([
      utils.panel.getEstadoPlan.invalidate(),
      utils.panel.getEstadoPublicacion.invalidate(),
      utils.panel.getAccesoActual.invalidate(),
    ]);

  const publicar = api.panel.publicarTienda.useMutation();
  const activar = api.panel.activarPlanTrasRegistro.useMutation();

  useEffect(() => {
    if (disparado.current || !router.isReady) return;

    const token = typeof router.query.token === "string" ? router.query.token : null;
    if (!token) {
      setFase({
        estado: "error",
        mensaje:
          "Flow no devolvió el registro de tu tarjeta. Vuelve al inicio e intenta activar tu plan otra vez.",
      });
      return;
    }
    disparado.current = true;

    void (async () => {
      try {
        await activar.mutateAsync({ token });
      } catch (e) {
        setFase({
          estado: "error",
          mensaje:
            e instanceof Error
              ? e.message
              : "No pudimos activar tu plan. Intenta de nuevo.",
        });
        return;
      }

      // Plan activo: se intenta completar la publicación. Si algún otro requisito del checklist
      // se cayó en el medio, el plan queda activo igual y el Organizador publica desde el inicio —
      // no se pierde nada, y el gate no se duplica acá.
      setFase({ estado: "publicando" });
      try {
        await publicar.mutateAsync();
        await invalidar();
        setFase({ estado: "listo", publicada: true });
      } catch (e) {
        await invalidar();
        setFase({
          estado: "listo",
          publicada: false,
          aviso: e instanceof Error ? e.message : undefined,
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.token]);

  return (
    <AdminLayout title="Tu plan">
      <PanelCard>
        {fase.estado === "activando" || fase.estado === "publicando" ? (
          <Stack align="center" py="xl" gap="sm">
            <Loader size="sm" />
            <Text fw={600}>
              {fase.estado === "activando"
                ? "Estamos activando tu plan…"
                : "Publicando tu tienda…"}
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              No cierres esta página.
            </Text>
          </Stack>
        ) : fase.estado === "error" ? (
          <Stack align="center" py="xl" gap="sm">
            <ThemeIcon variant="light" color="red" radius="xl" size="lg">
              <IconAlertTriangle className="size-5" stroke={1.75} />
            </ThemeIcon>
            <Text fw={600}>No pudimos activar tu plan</Text>
            <Text size="sm" c="dimmed" ta="center" maw={420}>
              {fase.mensaje}
            </Text>
            <Button component={Link} href="/admin" variant="default" mt="xs">
              Volver al inicio
            </Button>
          </Stack>
        ) : (
          <Stack align="center" py="xl" gap="sm">
            <ThemeIcon variant="light" color="exito" radius="xl" size="lg">
              {fase.publicada ? (
                <IconRosetteDiscountCheck className="size-5" stroke={1.75} />
              ) : (
                <IconCircleCheck className="size-5" stroke={1.75} />
              )}
            </ThemeIcon>
            <Text fw={600}>
              {fase.publicada
                ? "¡Tu plan está activo y tu tienda publicada!"
                : "Tu plan está activo"}
            </Text>
            <Text size="sm" c="dimmed" ta="center" maw={440}>
              {fase.publicada
                ? "Ya puedes compartir la dirección de tu tienda y empezar a vender."
                : (fase.aviso ??
                  "Falta un paso del checklist para publicar tu tienda.")}
            </Text>
            <Group gap="sm" mt="xs">
              <Button component={Link} href="/admin">
                Ir al inicio
              </Button>
            </Group>
          </Stack>
        )}
      </PanelCard>
    </AdminLayout>
  );
}
