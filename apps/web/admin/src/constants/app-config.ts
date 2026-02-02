import { readRuntimeConfig, type AppConfig } from "@celestial/web-core/config";

declare global {
  interface Window {
    __hideAppLoading?: () => void;
  }
}

const DEFAULTS: AppConfig = {
  title: import.meta.env.VITE_APP_TITLE || "Celestial",
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "",
  apiPrefix: import.meta.env.VITE_API_PREFIX || "/api/v1",
};

export function getAppConfig(): AppConfig {
  return readRuntimeConfig(DEFAULTS);
}
