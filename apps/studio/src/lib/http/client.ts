import {
  createApiClient,
  type ApiRequestOptions,
  type UnauthorizedHandler,
} from "@celestial/runtime/http";

import { getAppConfig } from "@/constants/app-config";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preferences-store";

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

function getRequestCredentials(): RequestCredentials {
  const { apiBaseUrl } = getAppConfig();
  const locationOrigin = (globalThis as unknown as { location?: { origin?: string } }).location
    ?.origin;

  // In non-browser environments, fall back to fetch default behavior (same-origin cookies only).
  if (!locationOrigin) return "same-origin";
  if (!apiBaseUrl) return "same-origin";

  try {
    const apiOrigin = new URL(apiBaseUrl, locationOrigin).origin;
    return apiOrigin === locationOrigin ? "same-origin" : "include";
  } catch {
    return "same-origin";
  }
}

function getLocaleHeaders(): { "accept-language"?: string; "x-locale"?: string } {
  const { locale } = usePreferencesStore.getState();
  return { "accept-language": locale };
}

const client = createApiClient({
  getApiBaseUrl: () => getAppConfig().apiBaseUrl,
  getApiPrefix: () => getAppConfig().apiPrefix,
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  getCredentials: getRequestCredentials,
  setTokens: (tokens) => useAuthStore.getState().setTokens(tokens),
  getLocaleHeaders,
  onUnauthorized: (ctx) => unauthorizedHandler?.(ctx),
});

export type { ApiRequestOptions };

export const api = {
  get: <T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    client.get<T>(path, options),
  post: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    client.post<T>(path, body, options),
  put: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    client.put<T>(path, body, options),
  patch: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    client.patch<T>(path, body, options),
  delete: <T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    client.delete<T>(path, options),
} as const;
