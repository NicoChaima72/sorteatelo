/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.js");

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,

  /**
   * If you are using `appDir` then you must comment the below `i18n` config out.
   *
   * @see https://github.com/vercel/next.js/issues/41980
   */
  i18n: {
    locales: ["en"],
    defaultLocale: "en",
  },
  transpilePackages: ["geist"],

  /**
   * Discovery OAuth del MCP del Organizador (ADR-0025 F02). Los clientes de IA piden estas dos
   * rutas EXACTAS (RFC 8414 / RFC 9728) para descubrir el AS sin configuración manual — es lo
   * que hace que `claude mcp add <url>` funcione solo.
   *
   * Hace falta un rewrite porque el pages router **no puede servir un directorio que empieza con
   * punto**: `src/pages/.well-known/` no se rutea. Los handlers viven en `api/well-known/*`.
   */
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/well-known/oauth-authorization-server",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/well-known/oauth-protected-resource",
      },
    ];
  },
};

export default config;
