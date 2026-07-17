import { signIn } from "next-auth/react";
import { useRouter } from "next/router";

import { Button } from "~/components/ui/button";

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
      <div className="text-center">
        <h1 className="text-lg font-semibold">Panel de administración</h1>
        <p className="text-sm text-muted-foreground">
          Ingresa con tu cuenta de Google para continuar.
        </p>
      </div>

      {mensajeError && (
        <p role="alert" className="text-sm text-destructive">
          {mensajeError}
        </p>
      )}

      <Button onClick={() => void signIn("google", { callbackUrl: "/admin" })}>
        Entrar con Google
      </Button>
    </main>
  );
}
