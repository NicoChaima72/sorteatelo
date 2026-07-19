import path from "path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
  // JSX automático (React 17+ runtime): la app entera usa el automatic runtime (sin `import React`).
  // Necesario para que los tests que renderizan componentes .tsx (p.ej. SSR de `animar.tsx`, F03) no
  // fallen con "React is not defined" bajo el transform de esbuild de vitest.
  esbuild: { jsx: "automatic" },
  test: {
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
    environment: "node",
    // La DB de integración es Supabase remota (~1-2s por roundtrip); los tests
    // de dominio hacen varias queries secuenciales y el default de 5s no alcanza.
    testTimeout: 30_000,
    // Los afterAll de los tests de integración limpian varias tablas por varios
    // users de prueba (deleteMany secuenciales contra la DB remota); el default de
    // 10s no alcanza. Misma razón que testTimeout.
    hookTimeout: 30_000,
    env: {
      // Carga el .env local (prefijo "" = todas las vars, no solo VITE_*) para que
      // los tests de integración que dependen de secretos locales (p.ej.
      // FLOW_API_KEY, claves del storage de PDFs) los vean — y se skipeen
      // limpio en máquinas donde no existen.
      ...loadEnv(mode, process.cwd(), ""),
      // Los tests no tienen por qué tener TODAS las env vars reales (DATABASE_URL,
      // las del provider OAuth, etc.). Importar módulos del server arrastra src/env.js, que las
      // valida; saltamos esa validación en el entorno de test (patrón estándar T3).
      SKIP_ENV_VALIDATION: "1",
    },
  },
}));
