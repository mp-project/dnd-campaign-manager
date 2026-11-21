/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Versioned API base, e.g. `http://api.localhost:3000/api/v1`. */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PUSHER_BEAMS_INSTANCE_ID?: string;
  /** Absolute address of the public demo (the clickdummy on its own subdomain); empty hides the demo links. */
  readonly VITE_DEMO_URL?: string;
  /** Public address of the site (`https://<domain>`) for canonical links, previews and the sitemap; empty = the current origin. */
  readonly VITE_SITE_URL?: string;
  /** Cookiebot domain group id (public); empty = no consent banner and nothing optional starts. */
  readonly VITE_COOKIEBOT_ID?: string;
  /** Clerk's publishable key (`pk_…`); without it nobody can sign in. */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  /** Development only, without Cookiebot: `statistics` grants that consent (Faro) locally. */
  readonly VITE_DEV_CONSENT?: string;
  /** Grafana Faro collector address; empty = no frontend observability. */
  readonly VITE_FARO_URL?: string;
  /** Lowest level of the app's log lines sent to Faro: debug, info, warn, error. */
  readonly VITE_LOG_REMOTE_LEVEL?: string;
  /** development, stage or production; Faro's environment (else the Vite mode). */
  readonly VITE_APP_ENV?: string;
  /** Sentry DSN of the frontend project; empty = no error reporting. */
  readonly VITE_SENTRY_DSN?: string;
  /** Share of sessions recorded by Session Replay (only with consent), 0..1; default 0.1. */
  readonly VITE_SENTRY_REPLAY_SAMPLE_RATE?: string;
  /** Share of sessions with an error recorded by Session Replay (only with consent), 0..1; default 1. */
  readonly VITE_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE?: string;
  /** Release (git SHA) for Faro and Sentry; else `dev`. */
  readonly VITE_APP_RELEASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
