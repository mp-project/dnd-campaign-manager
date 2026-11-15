import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const frontendHost = env.FRONTEND_HOST ?? "localhost";
  const frontendPort = Number(env.FRONTEND_PORT ?? "5173");

  return {
    plugins: [vue(), tailwindcss()],
    define: {
      // vue-i18n: Composition API only, so the legacy API and the global $t components drop out of the bundle.
      __VUE_I18N_FULL_INSTALL__: false,
      __VUE_I18N_LEGACY_API__: false,
      __INTLIFY_PROD_DEVTOOLS__: false,
    },
    server: {
      host: frontendHost,
      port: Number.isFinite(frontendPort) ? frontendPort : 5173,
      strictPort: true,
      // The API under the app's own origin: browsers treat app.localhost and api.localhost as
      // different sites, so the session cookies (SameSite=Lax) would not be sent across.
      proxy: {
        "/api": { target: env.API_PROXY_TARGET ?? "http://api.localhost:3000", changeOrigin: true },
      },
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  };
});
