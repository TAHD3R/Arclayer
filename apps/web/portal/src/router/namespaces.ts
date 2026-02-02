/**
 * Portal URL namespaces.
 *
 * We keep `__` prefixes in the public URL space (e.g. `/__preview/*`) because they are explicit
 * and help avoid clashes with user-defined routes.
 *
 * But TanStack Router reserves `__` for special file names (e.g. `__root`), therefore our
 * internal route tree uses non-`__` pathnames (e.g. `/preview/*`) and we rewrite at the edge.
 */
export const PORTAL_NAMESPACES = {
  editorHost: { external: "/__editor-host", internal: "/editor-host" },
  editor: { external: "/__editor", internal: "/editor" },
  preview: { external: "/__preview", internal: "/preview" },
} as const;

export type PortalMode = "public" | "preview";

export function isPreviewPathname(pathname: string): boolean {
  return (
    pathname === PORTAL_NAMESPACES.preview.external ||
    pathname.startsWith(PORTAL_NAMESPACES.preview.external + "/") ||
    pathname === PORTAL_NAMESPACES.preview.internal ||
    pathname.startsWith(PORTAL_NAMESPACES.preview.internal + "/")
  );
}

export function parsePortalRequest(urlOriginal: string): { mode: PortalMode; token?: string } {
  let url: URL;
  try {
    url = new URL(urlOriginal, "http://localhost");
  } catch {
    return { mode: "public" };
  }

  const pathname = url.pathname;
  const token = url.searchParams.get("token") || undefined;

  if (isPreviewPathname(pathname)) {
    // With exactOptionalPropertyTypes, we omit the key if token is missing.
    return token ? { mode: "preview", token } : { mode: "preview" };
  }
  return { mode: "public" };
}

export function getTokenFromLocationSearch(search: unknown): string | undefined {
  // TanStack Router provides `location.search` as an object rather than a string.
  const s = search as { token?: unknown } | undefined;
  const token = typeof s?.token === "string" ? s.token.trim() : "";
  return token ? token : undefined;
}

export function toExternalPreviewHref(pathnameRaw: string, token: string | undefined): string {
  const pathname = normalizePathname(pathnameRaw);
  const base =
    pathname === "/"
      ? PORTAL_NAMESPACES.preview.external
      : PORTAL_NAMESPACES.preview.external + pathname;

  if (!token) return base;

  // Use URL for safe query composition.
  const url = new URL(base, "http://localhost");
  url.searchParams.set("token", token);
  return url.pathname + url.search;
}

function normalizePathname(pathnameRaw: string): string {
  const pathname = pathnameRaw.startsWith("/") ? pathnameRaw : `/${pathnameRaw}`;
  if (pathname === "/") return "/";
  // Normalize trailing slash for deterministic matching.
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}
