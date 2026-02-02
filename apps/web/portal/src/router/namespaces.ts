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

export function isEditorPathname(pathname: string): boolean {
  return (
    pathname === PORTAL_NAMESPACES.editor.external ||
    pathname.startsWith(PORTAL_NAMESPACES.editor.external + "/") ||
    pathname === PORTAL_NAMESPACES.editor.internal ||
    pathname.startsWith(PORTAL_NAMESPACES.editor.internal + "/")
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
  const tokenRaw = url.searchParams.get("token") || undefined;

  // Both `/__preview/*` and `/__editor/*` require preview authorization.
  if (isPreviewPathname(pathname) || isEditorPathname(pathname)) {
    // Dev-only escape hatch is only for editor mode (keep preview strict).
    const token = isEditorPathname(pathname)
      ? (tokenRaw ?? getDevFallbackPreviewTokenIfAllowed(tokenRaw))
      : tokenRaw;
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

export function getEditorTokenOrThrow(search: unknown): string {
  const tokenRaw = getTokenFromLocationSearch(search);
  const token = tokenRaw ?? getDevFallbackPreviewTokenIfAllowed(tokenRaw);
  if (token) return token;
  // Editor mode is private by default: require a preview token.
  throw new Error("Missing editor token");
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

function getDevFallbackPreviewTokenIfAllowed(currentToken: string | undefined): string | undefined {
  if (currentToken) return currentToken;
  if (!import.meta.env.DEV) return undefined;

  // Dev-only escape hatch: allow omitting token for local testing by auto-injecting a known stub token.
  // This is gated by an explicit env var so it doesn't accidentally hide auth issues during development.
  const allowMissingToken = String(
    import.meta.env.VITE_PORTAL_DEV_ALLOW_EDITOR_NO_TOKEN || "",
  ).toLowerCase();
  if (allowMissingToken !== "1" && allowMissingToken !== "true") return undefined;

  const token = String(import.meta.env.VITE_PORTAL_DEV_PREVIEW_TOKEN || "").trim();
  return token || "demo";
}
