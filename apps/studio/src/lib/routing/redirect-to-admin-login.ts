import { normalizeOrigin, resolveAdminOrigin } from "./admin-origin";

const STUDIO_RETURN_COOKIE_NAME = "celestial:studio:return_to";

function resolveSharedCookieDomain(hostname: string): string | null {
  const explicit = import.meta.env.VITE_SHARED_COOKIE_DOMAIN;
  if (explicit) {
    const v = explicit.trim();
    if (!v) return null;
    return v.startsWith(".") ? v : `.${v}`;
  }

  if (hostname.endsWith(".celestial.localhost")) return ".celestial.localhost";
  return null;
}

function setStudioReturnToCookie(value: string): void {
  const hostname = window.location.hostname;
  const domain = resolveSharedCookieDomain(hostname);
  const attrs: string[] = ["path=/", "max-age=600", "samesite=lax"];

  if (window.location.protocol === "https:") attrs.push("secure");
  if (domain) attrs.push(`domain=${domain}`);

  document.cookie = `${STUDIO_RETURN_COOKIE_NAME}=${encodeURIComponent(value)}; ${attrs.join("; ")}`;
}

function safeReturnToPath(pathname: string, search: string, hash: string): string {
  const p = pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/";
  const s = typeof search === "string" ? search : "";
  const h = typeof hash === "string" ? hash : "";
  const searchStr = s.startsWith("?") ? s : s ? `?${s}` : "";
  const hashStr = h.startsWith("#") ? h : h ? `#${h}` : "";
  return `${p}${searchStr}${hashStr}`;
}

export function redirectToAdminLogin(): void {
  if (typeof window === "undefined") return;

  const { hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    // 本地开发推荐使用 Traefik 的 SaaS 模式；先跳到 Studio 子域名再进入登录流程。
    const target = `http://studio.celestial.localhost${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(target);
    return;
  }

  const returnTo = safeReturnToPath(
    window.location.pathname,
    window.location.search,
    window.location.hash,
  );
  setStudioReturnToCookie(returnTo);

  const adminOrigin = normalizeOrigin(resolveAdminOrigin(window.location.hostname));
  window.location.replace(`${adminOrigin}/login`);
}
