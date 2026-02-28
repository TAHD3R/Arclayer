import { ApiError } from "./errors";
import type { ResponseModel } from "./types";

export type UnauthorizedHandler = (ctx: {
  url: string;
  status: number;
  error?: string;
  message: string;
}) => void;

export interface ApiClientOptions {
  getApiBaseUrl: () => string;
  getApiPrefix: () => string;
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  /**
   * Called after refresh succeeded. The implementation decides where to store tokens.
   */
  setTokens: (tokens: unknown) => void;
  /**
   * Locale headers to send with each request.
   * Keep it flexible: different apps may have different preference semantics.
   */
  getLocaleHeaders?: () => { "accept-language"?: string; "x-locale"?: string };
  onUnauthorized?: UnauthorizedHandler | null;
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: {
    skipRefresh?: boolean;
    retried?: boolean;
  };
}

export interface ApiClient {
  request: <T>(path: string, options?: ApiRequestOptions) => Promise<T>;
  get: <T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) => Promise<T>;
  post: <T>(
    path: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, "method" | "body">,
  ) => Promise<T>;
  put: <T>(
    path: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, "method" | "body">,
  ) => Promise<T>;
  patch: <T>(
    path: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, "method" | "body">,
  ) => Promise<T>;
  delete: <T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) => Promise<T>;
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  let refreshInFlight: Promise<boolean> | null = null;

  async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const { auth, body: bodyInput, ...requestInit } = options;
    const url = buildApiUrl(path, opts);
    const headers = toHeaders(requestInit.headers);
    headers.set("accept", "application/json");

    const localeHeaders = opts.getLocaleHeaders?.();
    if (localeHeaders?.["accept-language"]) headers.set("accept-language", localeHeaders["accept-language"]);
    if (localeHeaders?.["x-locale"]) headers.set("x-locale", localeHeaders["x-locale"]);

    const token = opts.getAccessToken();
    const hadAccessToken = !!token;
    if (token) headers.set("authorization", normalizeToken(token));

    const body = normalizeBody(bodyInput, headers);

    const doFetch = async (): Promise<Response> => {
      try {
        // With `exactOptionalPropertyTypes`, we must not set `body: undefined`.
        const init: RequestInit = {
          ...requestInit,
          headers,
          ...(body !== undefined ? { body } : {}),
        };
        return await fetch(url, init);
      } catch (err) {
        throw new ApiError({
          status: 0,
          message: err instanceof Error ? err.message : "Network error",
        });
      }
    };

    let res = await doFetch();
    const parsed: unknown = isJsonResponse(res) ? await res.json().catch(() => null) : await res.text();

    if (res.ok) {
      if (parsed && typeof parsed === "object" && "timestamp" in parsed && "message" in parsed) {
        const payload = parsed as ResponseModel<T>;
        if (payload.error) {
          const errArgs: { status: number; message: string; error?: string; meta?: unknown } = {
            status: res.status,
            message: payload.message || "Request failed",
          };
          if (payload.error) errArgs.error = payload.error;
          if (payload.meta !== undefined) errArgs.meta = payload.meta;
          throw new ApiError(errArgs);
        }
        return payload.data as T;
      }
      return parsed as T;
    }

    const attemptRefresh = async (): Promise<boolean> => {
      if (auth?.skipRefresh) return false;
      if (auth?.retried) return false;
      const refreshToken = opts.getRefreshToken();
      if (!refreshToken) return false;

      if (!refreshInFlight) {
        refreshInFlight = refreshAccessToken(refreshToken, opts).finally(() => {
          refreshInFlight = null;
        });
      }
      return await refreshInFlight;
    };

    if (res.status === 401) {
      const refreshed = await attemptRefresh();
      if (refreshed) {
        return request<T>(path, {
          ...options,
          auth: { ...auth, retried: true },
        });
      }
    }

    if (parsed && typeof parsed === "object" && "message" in parsed) {
      const payload = parsed as ResponseModel<unknown>;
      const message = payload.message || "Request failed";
      const error = payload.error;

      if (res.status === 401 && hadAccessToken) {
        if (error) {
          opts.onUnauthorized?.({ url, status: res.status, error, message });
        } else {
          opts.onUnauthorized?.({ url, status: res.status, message });
        }
      }

      const errArgs: { status: number; message: string; error?: string; meta?: unknown } = {
        status: res.status,
        message,
      };
      if (error) errArgs.error = error;
      if (payload.meta !== undefined) errArgs.meta = payload.meta;
      throw new ApiError(errArgs);
    }

    if (res.status === 401 && hadAccessToken) {
      opts.onUnauthorized?.({ url, status: res.status, message: "Unauthorized" });
    }

    throw new ApiError({
      status: res.status,
      message: typeof parsed === "string" && parsed ? parsed : `Request failed (${res.status})`,
    });
  }

  return {
    request,
    get: (path, options) => request(path, { ...options, method: "GET" }),
    post: (path, body, options) => request(path, { ...options, method: "POST", body }),
    put: (path, body, options) => request(path, { ...options, method: "PUT", body }),
    patch: (path, body, options) => request(path, { ...options, method: "PATCH", body }),
    delete: (path, options) => request(path, { ...options, method: "DELETE" }),
  } as const;
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

function buildApiUrl(path: string, opts: ApiClientOptions): string {
  const apiBaseUrl = opts.getApiBaseUrl();
  const apiPrefix = opts.getApiPrefix();
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
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

function normalizeBody(input: unknown, headers: Headers): BodyInit | undefined {
  if (input instanceof FormData) return input;
  if (input === undefined || input === null) return undefined;
  if (typeof input === "string" || input instanceof Blob) return input;

  headers.set("content-type", "application/json");
  return JSON.stringify(input);
}

async function refreshAccessToken(refreshToken: string, opts: ApiClientOptions): Promise<boolean> {
  const url = buildApiUrl("/auth/refresh", opts);
  const headers = new Headers();
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");

  const localeHeaders = opts.getLocaleHeaders?.();
  if (localeHeaders?.["accept-language"]) headers.set("accept-language", localeHeaders["accept-language"]);
  if (localeHeaders?.["x-locale"]) headers.set("x-locale", localeHeaders["x-locale"]);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const parsed: unknown = isJsonResponse(res) ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) return false;

  if (parsed && typeof parsed === "object" && "timestamp" in parsed && "message" in parsed) {
    const payload = parsed as ResponseModel<unknown>;
    if (payload.error) return false;

    const data = payload.data;
    if (!data || typeof data !== "object") return false;
    opts.setTokens(data);
    return true;
  }

  return false;
}
