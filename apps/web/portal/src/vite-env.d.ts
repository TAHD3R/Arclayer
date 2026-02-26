/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_PREFIX?: string;
  // Backwards-compatible fallback (older Portal-only naming).
  readonly VITE_PORTAL_API_PREFIX?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
