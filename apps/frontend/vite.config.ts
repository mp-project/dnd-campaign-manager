import { fileURLToPath, URL } from "node:url";

import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const frontendHost = env.FRONTEND_HOST ?? "localhost";
  const frontendPort = Number(env.FRONTEND_PORT ?? "5173");
  /** Public address of the site; index.html takes it for its default preview picture. */
  const siteUrl = (env.VITE_SITE_URL ?? "").trim().replace(/\/+$/, "");
  /**
   * With a Sentry auth token (a build secret, never committed) the build writes hidden source maps,
   * uploads them to the frontend project and deletes them, so stack traces in Sentry are readable
   * while the site serves no maps. Without it there are no maps at all.
   */
  const sentryAuthToken = (env.SENTRY_AUTH_TOKEN ?? "").trim();
  const release = (env.VITE_APP_RELEASE ?? "").trim();

  return {
    plugins: [
      vue(),
      tailwindcss(),
      ...(sentryAuthToken
        ? [
            sentryVitePlugin({
              org: env.SENTRY_ORG || "questaria",
              project: env.SENTRY_PROJECT || "questaria-frontend",
              authToken: sentryAuthToken,
              release: release ? { name: release } : { create: false, inject: false },
              sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
              telemetry: false,
            }),
          ]
        : []),
      {
        // Vite would leave `%VITE_SITE_URL%` as it is when the variable is not set.
        name: "site-url-in-index-html",
        transformIndexHtml: (html) => html.replaceAll("%SITE_URL%", siteUrl),
      },
      {
        // The build writes robots.txt and sitemap.xml (scripts/seo-files.ts); the dev server answers
        // them from the same builders, with the site address or else its own.
        name: "seo-files-in-dev",
        apply: "serve",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const path = req.url?.split("?")[0];
            if (path !== "/robots.txt" && path !== "/sitemap.xml") return next();
            const site = siteUrl || `http://${req.headers.host ?? `${frontendHost}:${frontendPort}`}`;
            Promise.all([server.ssrLoadModule("/src/core/seo/seoFiles.ts"), server.ssrLoadModule("/src/core/seo/publicPages.ts")])
              .then(([files, pages]) => {
                const robots = path === "/robots.txt";
                res.setHeader("Content-Type", robots ? "text/plain; charset=utf-8" : "application/xml; charset=utf-8");
                res.end(robots ? files.robotsTxt(site) : files.sitemapXml(site, pages.PUBLIC_PAGES));
              })
              .catch(next);
          });
        },
      },
    ],
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
        // The realtime gateway, a process of its own (`npm run realtime`).
        "/realtime": {
          target: env.REALTIME_PROXY_TARGET ?? "http://api.localhost:3001",
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      sourcemap: sentryAuthToken ? "hidden" : false,
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  };
});
