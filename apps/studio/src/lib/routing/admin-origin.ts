export function normalizeOrigin(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}

export function resolveAdminOrigin(hostname: string): string {
  const explicit = import.meta.env.VITE_ADMIN_ORIGIN;
  if (explicit) return normalizeOrigin(explicit);

  if (hostname === "studio.celestial.localhost") return "http://app.celestial.localhost";
  if (hostname === "app.celestial.localhost") return window.location.origin;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://app.celestial.localhost";
  }

  return window.location.origin;
}
