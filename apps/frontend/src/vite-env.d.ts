/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Versioned API base, e.g. `http://api.localhost:3000/api/v1`. */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PUSHER_BEAMS_INSTANCE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
