import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "VITE_");
  const proxyTarget =
    environment.VITE_DEV_API_PROXY_TARGET ?? "http://127.0.0.1:3000";

  assertHttpUrl("VITE_DEV_API_PROXY_TARGET", proxyTarget);

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      css: true,
    },
  };
});

function assertHttpUrl(name: string, value: string): void {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return;
    }
  } catch {
    // El mensaje deliberadamente no incluye el valor recibido.
  }

  throw new Error(
    `Configuracion web invalida: ${name} debe ser una URL HTTP/HTTPS absoluta.`,
  );
}
