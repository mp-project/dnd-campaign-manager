/**
 * The public address of the site (`VITE_SITE_URL`, e.g. `https://chronik.example`) for canonical
 * links, `og:url`, preview images and the sitemap: they must name the real domain also when the
 * page is rendered somewhere else (prerendering at build time). Without it, the current origin.
 */
export function siteUrl(): string {
  const configured = import.meta.env.VITE_SITE_URL?.trim();
  return (configured || location.origin).replace(/\/+$/, "");
}

/** An absolute address on the site for a path starting with `/`. */
export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path}`;
}
