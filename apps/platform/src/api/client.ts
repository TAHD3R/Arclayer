import { createApiClient } from "@arclayer/platform-openapi";

import { clearPlatformSession, getPlatformAccessToken } from "@/auth/platform-session";
import { getPlatformAppConfig } from "@/lib/app-config";

const config = getPlatformAppConfig();

export const platformApiClient = createApiClient({
  auth: () => getPlatformAccessToken(),
  baseUrl: config.apiBaseUrl || undefined,
  credentials: "include",
});

platformApiClient.interceptors.response.use((response, request) => {
  if (response.status === 401 && request.headers.has("Authorization")) {
    clearPlatformSession("revoked");
  }
  return response;
});
