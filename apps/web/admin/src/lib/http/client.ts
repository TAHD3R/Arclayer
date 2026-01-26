import { ApiError } from "@/lib/http/errors";
import { type ResponseModel } from "@/lib/http/types";
import { getAppConfig } from "@/core/config/app-config";
import { useAuthStore } from "@/stores/auth.store";
import { usePreferencesStore } from "@/stores/preferences.store";

type UnauthorizedHandler = (ctx: {
  url: string;
  status: number;
  error?: string;
  message: string;
}) => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

function joinPath(a: string, b: string): string {
  const left = a.endsWith("/") ? a.slice(0, -1) : a;
  const right = b.startsWith("/") ? b : `/${b}`;
  return `${left}${right}`;
}

function joinUrl(base: string, path: string): string {
  if (!base) return path;
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmed}${path}`;
}

function buildApiUrl(path: string): string {
  const { apiBaseUrl, apiPrefix } = getAppConfig();
  const fullPath = path.startsWith("/api/") || path === "/api" ? path : joinPath(apiPrefix, path);
  return joinUrl(apiBaseUrl, fullPath);
}

function isJsonResponse(res: Response): boolean {
  const type = res.headers.get("content-type") || "";
  return type.includes("application/json") || type.includes("+json");
}

function toHeaders(input?: HeadersInit): Headers {
  if (input instanceof Headers) return new Headers(input);
  return new Headers(input);
}

function normalizeToken(token: string): string {
  // Backend expects standard Authorization header; keep it flexible for future token formats.
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  apiPrefix?: string;
  auth?: {
    /** Do not attempt token refresh on 401 (used internally for refresh endpoint). */
    skipRefresh?: boolean;
    /** Internal guard to avoid infinite retry loops. */
    retried?: boolean;
  };
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const url = buildApiUrl(path);
  const headers = toHeaders(options.headers);

  headers.set("accept", "application/json");

  const locale = usePreferencesStore.getState().locale;
  headers.set("x-locale", locale);
  headers.set("accept-language", locale);

  const token = useAuthStore.getState().accessToken;
  const hadAccessToken = !!token;
  if (token) headers.set("authorization", normalizeToken(token));

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body === undefined || options.body === null) {
    body = undefined;
  } else if (typeof options.body === "string" || options.body instanceof Blob) {
    body = options.body;
  } else {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }

  const doFetch = async (): Promise<Response> => {
    try {
      return await fetch(url, {
        ...options,
        headers,
        body,
      });
    } catch (err) {
      throw new ApiError({
        status: 0,
        message: err instanceof Error ? err.message : "网络错误",
      });
    }
  };

  let res = await doFetch();

  const parsed: unknown = isJsonResponse(res)
    ? await res.json().catch(() => null)
    : await res.text();

  if (res.ok) {
    // Our backend always wraps in ResponseModel; keep a soft fallback for future endpoints.
    if (parsed && typeof parsed === "object" && "timestamp" in parsed && "message" in parsed) {
      const payload = parsed as ResponseModel<T>;
      if (payload.error) {
        throw new ApiError({
          status: res.status,
          message: payload.message || "请求失败",
          error: payload.error,
          meta: payload.meta,
        });
      }
      return payload.data as T;
    }
    return parsed as T;
  }

  const attemptRefresh = async (): Promise<boolean> => {
    if (options.auth?.skipRefresh) return false;
    if (options.auth?.retried) return false;

    const refreshToken = useAuthStore.getState().refreshToken;
    if (!refreshToken) return false;

    // Singleflight refresh: avoid refresh storms when multiple requests 401 together.
    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken(refreshToken).finally(() => {
        refreshInFlight = null;
      });
    }

    const ok = await refreshInFlight;
    return ok;
  };

  // Error response (401 may be recoverable via refresh).
  if (res.status === 401) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      return apiRequest<T>(path, {
        ...options,
        auth: { ...options.auth, retried: true },
      });
    }
  }

  if (parsed && typeof parsed === "object" && "message" in parsed) {
    const payload = parsed as ResponseModel<unknown>;
    const message = payload.message || "请求失败";
    const error = payload.error;

    if (res.status === 401) {
      // Avoid redirect loops / duplicate UX on public auth endpoints (e.g. invalid credentials).
      // Only treat as "session unauthorized" when we had a token.
      if (hadAccessToken) unauthorizedHandler?.({ url, status: res.status, error, message });
    }

    throw new ApiError({
      status: res.status,
      message,
      error,
      meta: payload.meta,
    });
  }

  if (res.status === 401) {
    if (hadAccessToken) unauthorizedHandler?.({ url, status: res.status, message: "未授权" });
  }

  throw new ApiError({
    status: res.status,
    message: typeof parsed === "string" && parsed ? parsed : `请求失败 (${res.status})`,
  });
}

export const api = {
  get: <T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "DELETE" }),
} as const;

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(refreshToken: string): Promise<boolean> {
  const url = buildApiUrl("/auth/refresh");
  const headers = new Headers();
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");

  const locale = usePreferencesStore.getState().locale;
  headers.set("x-locale", locale);
  headers.set("accept-language", locale);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const parsed: unknown = isJsonResponse(res)
    ? await res.json().catch(() => null)
    : await res.text();
  if (!res.ok) return false;

  if (parsed && typeof parsed === "object" && "timestamp" in parsed && "message" in parsed) {
    const payload = parsed as ResponseModel<unknown>;
    // If backend returned an error wrapper, treat as refresh failed.
    if (payload.error) return false;

    // `apiRequest` unwraps `data`; do the same here to avoid circular deps.
    const data = payload.data as any;
    if (!data || typeof data !== "object") return false;
    const hasSnake = "access_token" in data && "refresh_token" in data;
    const hasCamel = "accessToken" in data && "refreshToken" in data;
    if (!hasSnake && !hasCamel) return false;

    useAuthStore.getState().setTokens(data);
    return true;
  }

  return false;
}
