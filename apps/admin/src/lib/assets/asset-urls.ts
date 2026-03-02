import { getAppConfig } from "@/constants/app-config";

function normalizeBaseUrl(baseUrl: string): string {
  const s = (baseUrl || "").trim();
  if (!s) return "";
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

function isAbsoluteUrl(value: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * 解析“公共资源（/assets/*）”的 URL。
 *
 * 关键点：
 * - 后端会返回相对路径（例如 `/assets/<id>/thumb`）。
 * - 本地开发时，前端通常通过 Vite proxy 代理 `/api/*` 来绕过 CORS；
 *   但 `<img>` 访问 `/assets/*` 不走 `fetch`，且我们不希望再去代理 `/assets`。
 * - 因此：当 `apiBaseUrl` 为空（proxy 模式）时，优先用 `VITE_API_PROXY_TARGET` 作为公共资源域名。
 *   这样 `<img src>` 会直接请求后端（跨域展示图片不需要 CORS）。
 */
export function resolvePublicAssetUrlPath(
  pathOrUrl: string | null | undefined,
): string | undefined {
  const raw = (pathOrUrl || "").trim();
  if (!raw) return undefined;

  if (isAbsoluteUrl(raw)) return raw;

  const { apiBaseUrl } = getAppConfig();
  const normalizedApiBaseUrl = normalizeBaseUrl(apiBaseUrl);
  if (normalizedApiBaseUrl) {
    return new URL(raw, normalizedApiBaseUrl).toString();
  }

  const proxyTarget = normalizeBaseUrl(
    (import.meta.env.VITE_API_PROXY_TARGET as string | undefined) || "http://127.0.0.1:8000",
  );

  // 仅在开发环境启用 proxyTarget 兜底；生产环境通常是同源部署，保留相对路径即可。
  if (import.meta.env.DEV && proxyTarget) {
    return new URL(raw, proxyTarget).toString();
  }

  return raw;
}

/**
 * 将相对 URL（例如 `/assets/...`）转为“可分享/可复制”的绝对 URL。
 * - 优先基于 public assets 的解析策略（解决 dev 下复制出来指向 5173 的问题）
 * - 其次退回到当前站点 origin（解决生产同源部署）
 */
export function toShareableAbsoluteUrl(urlOrPath: string): string {
  const raw = (urlOrPath || "").trim();
  if (!raw) return raw;
  if (isAbsoluteUrl(raw)) return raw;

  const resolved = resolvePublicAssetUrlPath(raw);
  if (resolved && isAbsoluteUrl(resolved)) return resolved;

  if (typeof window === "undefined") return raw;
  return new URL(raw, window.location.origin).toString();
}

function isUuidLike(value: string): boolean {
  // Accept UUIDs with hyphens; keep it strict to avoid accidental matches.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isPublicIdLike(value: string): boolean {
  // Public ids are base64url of 16 bytes => 22 chars without padding.
  return /^[A-Za-z0-9_-]{22}$/.test(value);
}

/**
 * Resolve an "asset reference" to a public URL.
 *
 * Supported inputs:
 * - absolute URL: https://...
 * - relative path: /assets/<id>...
 * - bare asset id (public id or uuid): <id>
 */
export function resolveAssetRefToPublicUrlPath(ref: string | null | undefined): string | undefined {
  const raw = (ref || "").trim();
  if (!raw) return undefined;
  if (isUuidLike(raw)) return resolvePublicAssetUrlPath(`/assets/${raw}`);
  if (isPublicIdLike(raw)) return resolvePublicAssetUrlPath(`/assets/${raw}`);
  return resolvePublicAssetUrlPath(raw);
}
