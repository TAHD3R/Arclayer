import staticAppConfig from "virtual:arclayer-app-config";
import type { AppConfig } from "@arclayer/web/config";

declare global {
  interface Window {
    __hideAppLoading?: () => void;
  }
}

export function getAppConfig(): AppConfig {
  return staticAppConfig;
}
