/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Versioned API base, e.g. `http://api.localhost:3000/api/v1`. */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PUSHER_BEAMS_INSTANCE_ID?: string;
  /** Absolute address of the public demo (the clickdummy on its own subdomain); empty hides the demo links. */
  readonly VITE_DEMO_URL?: string;
  /** Public address of the site (`https://<domain>`) for canonical links, previews and the sitemap; empty = the current origin. */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
