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

export function mergeRuntimeConfig(defaults: AppConfig, runtime?: Partial<AppConfig> | null): AppConfig {
  return runtime ? { ...defaults, ...runtime } : defaults;
}

export function readRuntimeConfig(defaults: AppConfig): AppConfig {
  const runtime = typeof window !== "undefined" ? window.__APP_CONFIG__ : undefined;
  return mergeRuntimeConfig(defaults, runtime);
}
