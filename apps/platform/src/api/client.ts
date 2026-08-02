import { createApiClient } from "@arclayer/platform-openapi";

import { clearPlatformSession, getPlatformAccessToken } from "@/auth/platform-session";
import { getPlatformAppConfig } from "@/lib/app-config";

const config = getPlatformAppConfig();
const DEFAULT_PLATFORM_CSRF_COOKIE_NAME = "platform_csrf_token";
const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const platformApiClient = createApiClient({
  auth: () => getPlatformAccessToken(),
  baseUrl: config.apiBaseUrl || undefined,
  credentials: "include",
});

platformApiClient.interceptors.request.use(attachPlatformCsrfToken);

platformApiClient.interceptors.response.use((response, request) => {
  if (response.status === 401 && request.headers.has("Authorization")) {
    clearPlatformSession("revoked");
  }
  return response;
});

export function attachPlatformCsrfToken(request: Request): Request {
  if (CSRF_SAFE_METHODS.has(request.method.toUpperCase())) return request;

  const token = readPlatformCookie(platformCsrfCookieName());
  if (!token) return request;

  const headers = new Headers(request.headers);
  headers.set("X-CSRF-Token", token);
  return new Request(request, { headers });
}

function platformCsrfCookieName(): string {
  return (
    import.meta.env.VITE_PLATFORM_CSRF_COOKIE_NAME?.trim() || DEFAULT_PLATFORM_CSRF_COOKIE_NAME
  );
}

function readPlatformCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const prefix = `${encodeURIComponent(name)}=`;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}
