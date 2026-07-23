import {
  ApiError,
  createApiClient,
  type ApiRequestOptions,
  type UnauthorizedHandler,
} from "@arclayer/web/http";

import { getAppConfig } from "@/lib/config/app-config";
import { getLocaleHeaders, getRequestCredentials } from "@/lib/http/request-context";
import { useAuthStore } from "@/stores/use-auth-store";

let unauthorizedHandler: UnauthorizedHandler | null = null;
export type ApiErrorContext = {
  path: string;
  method: string;
  error: ApiError;
};
export type ApiErrorHandler = (context: ApiErrorContext) => void;
let apiErrorHandler: ApiErrorHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

export function setApiErrorHandler(handler: ApiErrorHandler | null) {
  apiErrorHandler = handler;
}

const client = createApiClient({
  getApiBaseUrl: () => getAppConfig().apiBaseUrl,
  getApiPrefix: () => getAppConfig().apiPrefix,
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  getCredentials: getRequestCredentials,
  getCsrfToken: () => readAdminCookie("csrf_token"),
  setTokens: (tokens) => useAuthStore.getState().setTokens(tokens),
  getLocaleHeaders,
  onUnauthorized: (ctx) => unauthorizedHandler?.(ctx),
});

export type { ApiRequestOptions };

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return observeApiError(path, options.method ?? "GET", client.request<T>(path, options));
}

export const api = {
  get: <T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    observeApiError(path, "GET", client.get<T>(path, options)),
  post: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    observeApiError(path, "POST", client.post<T>(path, body, options)),
  put: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    observeApiError(path, "PUT", client.put<T>(path, body, options)),
  patch: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    observeApiError(path, "PATCH", client.patch<T>(path, body, options)),
  delete: <T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    observeApiError(path, "DELETE", client.delete<T>(path, options)),
} as const;

async function observeApiError<T>(path: string, method: string, request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof ApiError && error.status !== 304) {
      apiErrorHandler?.({ path, method, error });
    }
    throw error;
  }
}

function readAdminCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const prefix = `${encodeURIComponent(name)}=`;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!match) return null;

  return decodeURIComponent(match.slice(prefix.length));
}
