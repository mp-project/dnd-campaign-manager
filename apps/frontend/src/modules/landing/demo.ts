/**
 * Address of the public demo (the clickdummy, served by its own container on a subdomain), set at
 * build time with `VITE_DEMO_URL`. Only absolute http(s) addresses count; without one the start
 * page leaves the demo links out.
 */
export function demoUrl(value: string | undefined = import.meta.env.VITE_DEMO_URL): string | null {
  const url = value?.trim();
  return url && /^https?:\/\/[^\s]+$/i.test(url) ? url : null;
}

/**
 * A screen of the demo: the clickdummy routes with the hash (`#/kampagne/...`), so a screen is the
 * demo's address with that hash. Null without a demo.
 */
export function demoScreenUrl(path: string, value?: string): string | null {
  const base = demoUrl(value ?? import.meta.env.VITE_DEMO_URL);
  if (!base) return null;
  const url = new URL(base);
  url.hash = path;
  return url.href;
}
