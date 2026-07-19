/**
 * configSession — switch de IMPERSONACIÓN de DEV (estilo datawalt-app, F09c).
 *
 * ⚠️ SOLO afecta DEVELOPMENT. Con `enabled: true` y `NODE_ENV=development`, la sesión del usuario
 * `email` existe EN TODAS PARTES sin login ni cookies: server (contexto tRPC, `getServerSideProps`) y
 * cliente (`useSession()`). Es puro DX para iterar sin pasar por Google OAuth en cada arranque.
 *
 * Lo que se falsea es la AUTENTICACIÓN, NUNCA la AUTORIZACIÓN: el wrapper `getFinalSession` resuelve el
 * `User` REAL por este `email` en la DB y usa su `id` real, así `TenantMembership`/Operador siguen
 * decidiendo permisos de verdad (I1/I7). Si el email no está en la DB ⇒ sesión nula (anónimo).
 *
 * En PRODUCCIÓN es INERTE por diseño: el guard `sesionFakeAplica` exige `nodeEnv === "development"`,
 * así que aunque `enabled` quedara en `true`, en prod jamás aplica (cubierto por test). Es el único
 * archivo que hay que tocar para prender/apagar la impersonación.
 */
export const sessionFake = {
  /** Email del `User` a impersonar. Debe existir en la DB (lo crea el login Google real una vez). */
  email: "nikochaima72@gmail.com",
  /** Expiración de la sesión fake (ISO, lejana): la sesión de dev no caduca en una jornada de trabajo. */
  expires: "2999-01-01T00:00:00.000Z",
  /** Switch maestro. `true` + `NODE_ENV=development` ⇒ sesión sin login/cookies. `false` ⇒ auth normal. */
  enabled: true,
};

/**
 * Guard PURO de la impersonación de dev — testeable sin manosear `process.env`. Devuelve `true` SOLO
 * si el switch está prendido Y el runtime es `development`. En cualquier otro `nodeEnv` (production,
 * test) es `false`: garantiza que el mecanismo es inerte fuera de dev (la autenticación real manda).
 */
export function sesionFakeAplica({
  enabled,
  nodeEnv,
}: {
  enabled: boolean;
  nodeEnv: string | undefined;
}): boolean {
  return enabled && nodeEnv === "development";
}
