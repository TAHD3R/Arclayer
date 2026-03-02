/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string;
  readonly VITE_API_PREFIX?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_APP_BASE_PATH?: string;
  readonly VITE_ADMIN_ORIGIN?: string;
  readonly VITE_PORTAL_ORIGIN_TEMPLATE?: string;
  readonly VITE_PORTAL_ORIGIN?: string;
  readonly VITE_SHARED_COOKIE_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
