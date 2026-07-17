import { Button, Stack, Text, Title } from "@mantine/core";
import { signIn } from "next-auth/react";
import { useRouter } from "next/router";

/**
 * Login del panel admin — página throwaway SIN marca (F05). La identidad visual
 * está PENDIENTE (`docs/design.md`); el pulido llega con F06/F07. Solo dispara el
 * OAuth de Google y, si NextAuth redirige con `?error`, muestra un mensaje mínimo.
 * Página pública: no exporta guard (ver backend-conventions § Guard).
 */
export default function LoginPage() {
  const router = useRouter();
  const error = Array.isArray(router.query.error)
    ? router.query.error[0]
    : router.query.error;

  const mensajeError = error
    ? "No se pudo iniciar sesión. Intenta de nuevo."
    : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <Stack align="center" gap={4}>
        <Title order={1} fz="lg">
          Panel de administración
        </Title>
        <Text size="sm" c="dimmed">
          Ingresa con tu cuenta de Google para continuar.
        </Text>
      </Stack>

      {mensajeError && (
        <Text role="alert" size="sm" c="red">
          {mensajeError}
        </Text>
      )}

      <Button onClick={() => void signIn("google", { callbackUrl: "/admin" })}>
        Entrar con Google
      </Button>
    </main>
  );
}
