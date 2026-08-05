import { getAppConfig } from "@/lib/config/app-config";

export function buildApiUrl(path: string): string {
  const config = getAppConfig();
  const urlPath = `${config.apiPrefix || ""}${path}`;
  return config.apiBaseUrl ? `${config.apiBaseUrl}${urlPath}` : urlPath;
}
