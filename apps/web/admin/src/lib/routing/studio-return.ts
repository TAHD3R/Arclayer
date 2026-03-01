const STUDIO_RETURN_COOKIE_NAME = "celestial:studio:return_to";

function normalizeOrigin(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}

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

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie || "";
  const parts = raw.split("; ");
  for (const part of parts) {
    if (!part) continue;
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx);
    if (k !== name) continue;
    const v = part.slice(idx + 1);
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return null;
}

function clearCookie(name: string): void {
  if (typeof document === "undefined") return;
  const hostname = window.location.hostname;
  const domain = resolveSharedCookieDomain(hostname);
  const attrs: string[] = ["path=/", "max-age=0", "samesite=lax"];
  if (window.location.protocol === "https:") attrs.push("secure");
  if (domain) attrs.push(`domain=${domain}`);
  document.cookie = `${name}=; ${attrs.join("; ")}`;
}

export function consumeStudioReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  const value = readCookie(STUDIO_RETURN_COOKIE_NAME);
  if (!value) return null;

  clearCookie(STUDIO_RETURN_COOKIE_NAME);

  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export function resolveStudioOrigin(): string {
  const explicit = import.meta.env.VITE_STUDIO_ORIGIN;
  if (explicit) return normalizeOrigin(explicit);

  if (typeof window === "undefined") return "http://studio.celestial.localhost";

  const { origin, hostname } = window.location;

  if (hostname === "app.celestial.localhost") return "http://studio.celestial.localhost";
  if (hostname.startsWith("app.") && hostname.endsWith(".celestial.localhost")) {
    return normalizeOrigin(origin.replace("//app.", "//studio."));
  }

  return "http://studio.celestial.localhost";
}
