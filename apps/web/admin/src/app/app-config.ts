export interface AppConfig {
  title: string;
  apiBaseUrl: string;
  apiPrefix: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: Partial<AppConfig>;
  }
}

const DEFAULTS: AppConfig = {
  title: import.meta.env.VITE_APP_TITLE || "Celestial Admin",
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "",
  apiPrefix: import.meta.env.VITE_API_PREFIX || "/api/v1",
};

export function getAppConfig(): AppConfig {
  const runtime = typeof window !== "undefined" ? window.__APP_CONFIG__ : undefined;
  return runtime ? { ...DEFAULTS, ...runtime } : DEFAULTS;
}
