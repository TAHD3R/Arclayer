import { ApiError } from "@/lib/http/errors";
import { type ResponseModel } from "@/lib/http/types";
import { getAppConfig } from "@/app/app-config";
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
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const url = buildApiUrl(path);
  const headers = toHeaders(options.headers);

  headers.set("accept", "application/json");

  const locale = usePreferencesStore.getState().locale;
  headers.set("x-locale", locale);
  headers.set("accept-language", locale);

  const token = useAuthStore.getState().accessToken;
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

  let res: Response;
  try {
    res = await fetch(url, {
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

  // Error response
  if (parsed && typeof parsed === "object" && "message" in parsed) {
    const payload = parsed as ResponseModel<unknown>;
    const message = payload.message || "请求失败";
    const error = payload.error;

    if (res.status === 401) {
      unauthorizedHandler?.({ url, status: res.status, error, message });
    }

    throw new ApiError({
      status: res.status,
      message,
      error,
      meta: payload.meta,
    });
  }

  if (res.status === 401) {
    unauthorizedHandler?.({ url, status: res.status, message: "未授权" });
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
