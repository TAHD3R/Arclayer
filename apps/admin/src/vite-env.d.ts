/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string;
  readonly VITE_API_PREFIX?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_HMR_HOST?: string;
  readonly VITE_HMR_PROTOCOL?: string;
  readonly VITE_HMR_PORT?: string;
  readonly VITE_HMR_CLIENT_PORT?: string;
  readonly VITE_SITE_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "virtual:arclayer-app-config" {
  import type { AppConfig } from "@arclayer/web/config";

  export const appConfig: AppConfig;
  export default appConfig;
}
