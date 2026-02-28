import {
  createApiClient,
  type ApiRequestOptions,
  type UnauthorizedHandler,
} from "@celestial/web-runtime/http";

import { getAppConfig } from "@/constants/app-config";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

function getLocaleHeaders(): { "accept-language"?: string; "x-locale"?: string } {
  const prefs = usePreferencesStore.getState();
  const headers: { "accept-language"?: string; "x-locale"?: string } = {};

  // Always send Accept-Language for best-effort; only send X-Locale when user explicitly chose.
  headers["accept-language"] = prefs.locale;
  if (prefs.localePreference) {
    headers["x-locale"] = prefs.localePreference;
  }

  return headers;
}

const client = createApiClient({
  getApiBaseUrl: () => getAppConfig().apiBaseUrl,
  getApiPrefix: () => getAppConfig().apiPrefix,
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  setTokens: (tokens) => useAuthStore.getState().setTokens(tokens),
  getLocaleHeaders,
  onUnauthorized: (ctx) => unauthorizedHandler?.(ctx),
});

export type { ApiRequestOptions };

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return client.request<T>(path, options);
}

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
