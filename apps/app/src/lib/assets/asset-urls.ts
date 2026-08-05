import { getAppConfig } from "@/lib/config/app-config";

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
 * - 本地开发时，当 `apiBaseUrl` 为空时，Admin 依赖 Vite proxy 代理 `/api/*` 和 `/assets/*`。
 * - 这时需要保留同源相对路径，避免浏览器把图片请求直接发到后端 origin；
 *   后端公共资源响应带有 `Cross-Origin-Resource-Policy: same-origin`，跨 origin 会被浏览器拦截。
 */
export function resolvePublicAssetUrlPath(
  pathOrUrl: string | null | undefined,
): string | undefined {
  const raw = (pathOrUrl || "").trim();
  if (!raw) return undefined;

  if (isAbsoluteUrl(raw)) return raw;

  const { apiBaseUrl } = getAppConfig();
  const normalizedApiBaseUrl = normalizeBaseUrl(apiBaseUrl);
  if (!normalizedApiBaseUrl && import.meta.env.DEV) return raw;
  if (normalizedApiBaseUrl) return new URL(raw, normalizedApiBaseUrl).toString();

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
