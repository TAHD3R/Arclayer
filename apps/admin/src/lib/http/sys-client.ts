import { createApiClient, type ApiRequestOptions } from "@celestial/web-runtime/http";

import { getAppConfig } from "@/constants/app-config";
import { getLocaleHeaders, getRequestCredentials } from "@/lib/http/request-context";
import { useSysAuthStore } from "@/stores/use-sys-auth-store";

const sysClient = createApiClient({
  getApiBaseUrl: () => getAppConfig().apiBaseUrl,
  getApiPrefix: () => getAppConfig().apiPrefix,
  getAccessToken: () => useSysAuthStore.getState().sysAccessToken,
  // Sys step-up token must never be refreshed automatically.
  getRefreshToken: () => null,
  getCredentials: getRequestCredentials,
  setTokens: () => {
    // No-op: sys token lifecycle is managed explicitly by the sys console UI.
  },
  getLocaleHeaders,
  onUnauthorized: null,
});

export type { ApiRequestOptions };

export const sysApi = {
  get: <T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    sysClient.get<T>(path, options),
  post: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    sysClient.post<T>(path, body, options),
  put: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    sysClient.put<T>(path, body, options),
  patch: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    sysClient.patch<T>(path, body, options),
  delete: <T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    sysClient.delete<T>(path, options),
} as const;
