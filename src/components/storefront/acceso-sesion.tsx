import { Anchor, Group, Text } from "@mantine/core";
import {
  IconLayoutDashboard,
  IconLogin,
  IconPencil,
} from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import {
  accionSesionStorefront,
  type AccionSesion,
} from "~/lib/pagebuilder/accionSesion";
import { hrefApex } from "~/lib/urlApex";
import { api } from "~/utils/api";

/**
 * Acción de sesión del HEADER del storefront (F09c). El usuario VETÓ el footer-only de F09b: la sesión
 * debe verse arriba, junto al carrito. Tres estados resueltos por la máquina PURA `accionSesionStorefront`:
 *  - anónimo ⇒ "Iniciar sesión" → apex `/login?callbackUrl=<tienda actual>` (F08 valida el callback).
 *  - dueña de ESTA tienda (`puedoEditar`, autz server-side) ⇒ "Editar mi página" → `/editor` (misma tienda).
 *  - logueada NO dueña ⇒ "Mi panel" → apex `/admin`.
 *
 * Chrome NEUTRO de PLATAFORMA (`c="dimmed"`, D13): NO usa el color de marca del tenant (que tiñe el
 * resto del storefront). Monta POST-HIDRATACIÓN (`montado`): en SSR y hasta hidratar la acción es
 * `oculto` ⇒ el HTML anónimo es idéntico con/sin cookie ⇒ CDN-cacheable (I5/R5). La query de autz
 * corre SOLO cuando hay sesión (`enabled`), para no pegarle a la DB por el 99% de visitantes anónimos.
 *
 * Con `configSession` (F09c) activo esto aparece SOLO sin login: el interceptor de `/api/auth/session`
 * hace que `useSession()` vea al usuario, y `puedoEditar` (contexto tRPC con la sesión fake) resuelve.
 */
export function AccesoSesion({ slug }: { slug: string }) {
  const [montado, setMontado] = useState(false);
  const { status } = useSession();
  const autz = api.pagebuilder.puedoEditar.useQuery(undefined, {
    enabled: montado && status === "authenticated",
    retry: false,
  });
  useEffect(() => setMontado(true), []);

  const accion = accionSesionStorefront({
    montado,
    estadoSesion: status,
    puedeEditar: autz.data?.puedeEditar,
  });

  if (accion.tipo === "oculto") return null;

  const { href, Icon, label } = enlaceDeAccion(accion, slug);
  return (
    <Anchor
      href={href}
      c="dimmed"
      underline="never"
      aria-label={label}
      className="shrink-0"
    >
      <Group gap={6} wrap="nowrap">
        <Icon className="size-4" stroke={1.75} />
        {/* Texto solo en ≥sm (mobile-first: el header se aprieta en móvil ⇒ ícono-only con aria-label). */}
        <Text size="sm" fw={500} visibleFrom="sm">
          {label}
        </Text>
      </Group>
    </Anchor>
  );
}

/** Traduce el estado resuelto a su enlace/ícono/label. `oculto` no llega acá (se corta antes). */
function enlaceDeAccion(
  accion: Exclude<AccionSesion, { tipo: "oculto" }>,
  slug: string,
): { href: string; Icon: typeof IconLogin; label: string } {
  switch (accion.tipo) {
    case "editar":
      // Misma tienda: ruta RELATIVA al subdominio (el gate SSR de `/editor` autoriza de nuevo).
      return { href: "/editor", Icon: IconPencil, label: "Editar mi página" };
    case "login":
      return {
        href: hrefApex({ path: "/login", slug, callbackUrl: window.location.href }),
        Icon: IconLogin,
        label: "Iniciar sesión",
      };
    case "panel":
      return {
        href: hrefApex({ path: "/admin", slug }),
        Icon: IconLayoutDashboard,
        label: "Mi panel",
      };
  }
}
