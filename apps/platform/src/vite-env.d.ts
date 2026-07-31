/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRODUCT_APP_ORIGIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __hideAppLoading?: () => void;
}

declare module "virtual:arclayer-app-config" {
  import type { StaticAppConfig } from "@arclayer/vite-plugin";

  export const appConfig: StaticAppConfig;
  export default appConfig;
}
