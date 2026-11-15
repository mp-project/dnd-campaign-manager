import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

export default defineConfig((env) =>
  mergeConfig(viteConfig(env), {
    test: {
      environment: "jsdom",
      include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
      css: false,
      // Absolute, whatever the local .env says: Node's Request (jsdom has none) can't take the
      // relative "/api/v1" the browser resolves against the page.
      env: { VITE_API_BASE_URL: "http://app.localhost/api/v1" },
    },
  }),
);
