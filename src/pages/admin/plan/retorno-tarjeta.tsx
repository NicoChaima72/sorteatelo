import { Button, Loader, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconAlertTriangle, IconCircleCheck } from "@tabler/icons-react";
import { type GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

import { AdminLayout } from "~/components/admin/admin-layout";
import { PanelCard } from "~/components/admin/panel-card";
import { RUTA_PLAN } from "~/server/panel/restriccionFacturacion";
import { guardPaginaAdmin } from "~/server/panel/guardPaginaAdmin";
import { api } from "~/utils/api";

/**
 * Página de RETORNO del **cambio de tarjeta** (F10/D12, ADR-0026). Flow devuelve acá el navegador
 * con un `token` después de que el Pagador ingresó su tarjeta nueva.
 *
 * Es la hermana de `/admin/plan/retorno` y hace UNA sola cosa distinta: reemplazar la tarjeta, sin
 * activar ni publicar nada. Tienen páginas separadas justamente para eso —cada retorno es una
 * máquina de fases con un solo trabajo (frontend-conventions § «Salir de la app a un proveedor
 * externo y volver»)— y de paso evita depender de cómo Flow concatena el `token` sobre una
 * `url_return` que ya trajera query string.
 *
 * **El token NO prueba nada** (I3): esta página solo lo transporta a `confirmarCambioDeTarjeta`, que
 * lo verifica SERVER-SIDE contra `customer/getRegisterStatus` antes de escribir.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const guard = await guardPaginaAdmin(ctx);
  if (!("ok" in guard)) return guard;
  return { props: {} };
};

type Fase =
  | { estado: "confirmando" }
  | { estado: "listo"; marca: string | null; ultimos4: string | null }
  | { estado: "error"; mensaje: string };

export default function RetornoTarjetaPage() {
  const utils = api.useUtils();
  const router = useRouter();
  const [fase, setFase] = useState<Fase>({ estado: "confirmando" });
  // Una sola confirmación por token: sin esto, un re-render dispararía otra. La protección REAL es
  // que la escritura server-side es idempotente (escribe los mismos dos campos), no este ref.
  const disparado = useRef(false);

  const confirmar = api.panel.confirmarCambioDeTarjeta.useMutation();

  useEffect(() => {
    if (disparado.current || !router.isReady) return;

    const token =
      typeof router.query.token === "string" ? router.query.token : null;
    if (!token) {
      setFase({
        estado: "error",
        mensaje:
          "Flow no devolvió el registro de tu tarjeta. Vuelve a «Plan» e inténtalo otra vez.",
      });
      return;
    }
    disparado.current = true;

    void (async () => {
      try {
        const r = await confirmar.mutateAsync({ token });
        // El estado del plan cambió (la tarjeta se muestra en la página Plan) y el chrome lo lee
        // aparte: se invalidan los dos.
        await Promise.all([
          utils.panel.getEstadoPlan.invalidate(),
          utils.panel.getAvisoFacturacion.invalidate(),
        ]);
        setFase({ estado: "listo", marca: r.marca, ultimos4: r.ultimos4 });
      } catch (e) {
        setFase({
          estado: "error",
          mensaje:
            e instanceof Error
              ? e.message
              : "No pudimos cambiar tu tarjeta. Intenta de nuevo.",
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.token]);

  return (
    <AdminLayout title="Tu plan">
      <PanelCard>
        {fase.estado === "confirmando" ? (
          <Stack align="center" py="xl" gap="sm">
            <Loader size="sm" />
            <Text fw={600}>Estamos guardando tu tarjeta…</Text>
            <Text size="sm" c="dimmed" ta="center">
              No cierres esta página.
            </Text>
          </Stack>
        ) : fase.estado === "error" ? (
          <Stack align="center" py="xl" gap="sm">
            <ThemeIcon variant="light" color="red" radius="xl" size="lg">
              <IconAlertTriangle className="size-5" stroke={1.75} />
            </ThemeIcon>
            <Text fw={600}>No pudimos cambiar tu tarjeta</Text>
            <Text size="sm" c="dimmed" ta="center" maw={420}>
              {fase.mensaje}
            </Text>
            {/* Tu plan sigue como estaba: decirlo evita que alguien crea que además lo perdió. */}
            <Text size="sm" c="dimmed" ta="center" maw={420}>
              Tu plan sigue activo con la tarjeta anterior.
            </Text>
            <Button component={Link} href={RUTA_PLAN} variant="default" mt="xs">
              Volver a mi plan
            </Button>
          </Stack>
        ) : (
          <Stack align="center" py="xl" gap="sm">
            <ThemeIcon variant="light" color="exito" radius="xl" size="lg">
              <IconCircleCheck className="size-5" stroke={1.75} />
            </ThemeIcon>
            <Text fw={600}>Listo, cambiamos tu tarjeta</Text>
            <Text size="sm" c="dimmed" ta="center" maw={440}>
              {fase.ultimos4
                ? `Los próximos cobros van a la tarjeta ${fase.marca ?? ""} terminada en ${fase.ultimos4}.`
                : "Los próximos cobros van a tu tarjeta nueva."}
            </Text>
            <Button component={Link} href={RUTA_PLAN} mt="xs">
              Volver a mi plan
            </Button>
          </Stack>
        )}
      </PanelCard>
    </AdminLayout>
  );
}
