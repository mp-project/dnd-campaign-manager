/**
 * Photographs the preview pictures of the public pages (Open Graph, 1200 × 630) from the
 * development page `/_vorschaubild/<variant>` into `public/og`. Needs the dev server
 * (`npm run dev`); the address is the first argument or `OG_BASE_URL`, else http://localhost:5173.
 *
 *   npm run og:images --workspace @dnd/frontend -- http://app.localhost:5173
 */
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const base = (process.argv[2] ?? process.env.OG_BASE_URL ?? "http://localhost:5173").replace(/\/+$/, "");
const out = fileURLToPath(new URL("../public/og/", import.meta.url));
const pictures = [
  { file: "start-de.jpg", path: "/_vorschaubild/start?lang=de" },
  { file: "start-en.jpg", path: "/_vorschaubild/start?lang=en" },
  { file: "seite.jpg", path: "/_vorschaubild/seite?lang=de" },
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, reducedMotion: "reduce" });
  for (const picture of pictures) {
    await page.goto(`${base}${picture.path}`, { waitUntil: "networkidle" });
    const card = page.locator("[data-og-image]");
    await card.waitFor();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
    });
    await card.screenshot({ path: `${out}${picture.file}`, type: "jpeg", quality: 86 });
    console.log(`og: ${picture.file}`);
  }
} finally {
  await browser.close();
}
