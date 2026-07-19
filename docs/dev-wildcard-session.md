# Dev: sesión sin login (page builder F08/F09/F09c, ADR-0019)

Cómo tener sesión en dev para probar el banner "Editar mi tienda" (F09), el header de sesión del
storefront (F09c) y el editor (`/editor`) — **sin pasar por Google OAuth en cada arranque**.

Hay **dos caminos**; el primario es `configSession`.

## 1. `configSession` — impersonación de dev (CAMINO PRIMARIO, F09c)

Switch estilo `datawalt-app`: con un flag prendido, la sesión de un usuario existe **en todas partes
sin login ni cookies** — server (contexto tRPC, `getServerSideProps`) y cliente (`useSession()`).

### Prender / apagar

`src/configSession.ts`:

```ts
export const sessionFake = {
  email: "nikochaima72@gmail.com", // el User a impersonar (debe existir en la DB)
  expires: "2999-01-01T00:00:00.000Z",
  enabled: true, // ← el switch. `false` ⇒ auth normal (Google).
};
```

### Qué hace

- **Server**: `getFinalSession` (`src/server/auth.ts`) reemplaza a `getServerAuthSession` en los
  call-sites que respetan el switch (contexto tRPC, `getPropsEditor`, `requireSession`). Con el fake
  activo resuelve el **`User` REAL por email** en la DB (cacheado) y devuelve una sesión con su **`id`
  real**. Así se falsea la **autenticación**, NUNCA la **autorización**: `TenantMembership`/Operador
  siguen decidiendo permisos de verdad (I1/I7).
- **Cliente**: el interceptor de `src/pages/api/auth/[...nextauth].ts` responde la sesión fake ante un
  `GET /api/auth/session` (mismo shape que NextAuth) ⇒ `useSession()` ve al usuario. Login/logout/OAuth
  siguen intactos para cuando el fake esté apagado.

### Cómo se ve

- `http://autora.localhost:3001/` ⇒ post-hidratación aparece **"Editar mi página"** en el header
  (F09c) y el banner de dueña — sin haber tocado un login.
- `http://autora.localhost:3001/editor` ⇒ responde **200 sin cookie** (el gate SSR resuelve la sesión
  fake). El SSR público de la home sigue siendo **anónimo** (I5): la acción de sesión monta solo
  client-side, así el HTML cacheable no varía por sesión.
- El `email` es el **Operador de plataforma** (`PLATFORM_OPERATOR_EMAILS`) ⇒ god-mode: `puedoEditar`
  da `true` en cualquier tienda. Para impersonar a un Organizador común, poné su email (y que tenga
  `TenantMembership`).

### Producción: INERTE por diseño

El guard `sesionFakeAplica` exige `NODE_ENV === "development"`. Aunque `enabled` quede en `true`, en
prod **jamás aplica** ⇒ manda la autenticación real. Cubierto por test
(`src/__tests__/configSession.test.ts` — `enabled + production ⇒ false`). Vercel siempre corre en prod.

> **No comparte cookies porque no usa cookies**: `configSession` bypasea el mecanismo de cookie por
> completo. Es lo que lo hace funcionar en `*.localhost` (que NO comparte cookies entre subdominios).

## 2. `/api/dev/login` — sesión de DB con cookie wildcard (ALTERNATIVA, F08/R3)

Cuando querés probar el **mecanismo real de la cookie al wildcard** (no la impersonación): un endpoint
dev-only crea una `Session` de DB y setea la cookie con `Domain=.<apex>`. Como `*.localhost` no comparte
cookies, esto **requiere `lvh.me`** (dominio público que resuelve a `127.0.0.1`, con subdominios).

### Setup

1. En `.env`: `NEXT_PUBLIC_PLATFORM_DOMAIN="lvh.me"` (⇒ `lvh.me` = apex, `autora.lvh.me` = tienda
   `autora`; la cookie sale con `Domain=.lvh.me`). Reiniciar el dev server (una sola instancia, `:3001`).
2. `GET http://lvh.me:3001/api/dev/login?slug=autora` — crea la `Session` de DB del **dueño** de
   `autora` y setea la cookie wildcard. Acepta `?callbackUrl=/editor` (ruta RELATIVA validada por
   `esRutaRelativaSegura`, F09c) y redirige ahí en un click; sin él, responde JSON.
3. Abrir `http://autora.lvh.me:3001/` ⇒ la sesión se ve (cookie compartida) ⇒ banner + "Editar mi página".

- **Dev-only**: `404` con `NODE_ENV=production`; solo `GET`.
- Requiere que la Tienda tenga dueño (`npm run otorgar:membresia`).

> **Nota** (REVISABLE, Bitácora de `tasks/26-07-17-page-builder.md`): ADR-0019 proponía un
> `CredentialsProvider` de NextAuth, incompatible con el adapter de DB (fuerza JWT). El endpoint
> preserva la intención creando la `Session` de DB directamente. Pendiente: addendum en ADR-0019.

## 3. HTTPS local (`dev:ssl`) — para el OAuth real de Google

Cuando querés probar el **flujo Google real** con https (callback + cookies `__Secure-`):

```
npm run dev:ssl   # next dev :3002 + local-ssl-proxy https :3001 → :3002
```

`concurrently` levanta `next dev` en `:3002` y `local-ssl-proxy` expone https en `:3001`. El `dev`
normal (`next dev`, http) queda igual. Con https, `NEXTAUTH_URL` pasa a https ⇒ la cookie de sesión es
`__Secure-` + `secure` (alineado con `useSecureCookies` de NextAuth). Alternativa histórica: túnel
**cloudflared** al apex (memoria `flow-sandbox-e2e`).
