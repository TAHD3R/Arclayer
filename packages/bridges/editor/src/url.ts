/**
 * URL helpers for Portal editor mode.
 *
 * We keep these helpers framework-agnostic (no React dependency) so both Admin and Portal
 * can reuse them without duplicating string concatenation logic.
 */

export function normalizePathname(pathnameRaw: string): string {
  const pathname = pathnameRaw.startsWith("/") ? pathnameRaw : `/${pathnameRaw}`;
  if (pathname === "/") return "/";
  // Normalize trailing slash for deterministic matching.
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function assertSafePathnameForEditorEmbedding(pathname: string): void {
  // We don't allow query/hash fragments as part of pathname: the caller should pass them separately.
  if (pathname.includes("?") || pathname.includes("#")) {
    throw new Error("Invalid pathname: must not contain '?' or '#'");
  }
  // Avoid Windows path separators and other oddities.
  if (pathname.includes("\\")) {
    throw new Error("Invalid pathname: must not contain backslashes");
  }
  // Control characters should never appear in a pathname.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(pathname)) {
    throw new Error("Invalid pathname: contains control characters");
  }
}

function encodePathnameForEditorEmbedding(pathnameRaw: string): string {
  const pathname = normalizePathname(pathnameRaw);
  assertSafePathnameForEditorEmbedding(pathname);

  if (pathname === "/") return "/";

  // Ensure path traversal is impossible regardless of the caller input.
  // Also reject double slashes to avoid ambiguous matching between host and iframe.
  const segments = pathname.split("/").slice(1);
  for (const seg of segments) {
    if (!seg) {
      throw new Error("Invalid pathname: must not contain empty segments ('//')");
    }
    if (seg === "." || seg === "..") {
      throw new Error("Invalid pathname: dot segments are not allowed");
    }
  }

  return `/${segments.map((seg) => encodeURIComponent(seg)).join("/")}`;
}

export function buildEditorIframeHref(args: {
  /**
   * External Portal origin (e.g. http://localhost:3100). If omitted, the href is relative.
   */
  portalOrigin?: string;
  /**
   * Site id used in the editor URL segment: /editor/site/:siteId
   */
  siteId: string;
  /**
   * Page pathname inside the site (e.g. /about). "/" maps to the site root.
   */
  pathname: string;
  /**
   * Preview token (required by editor mode).
   */
  token: string;
  /**
   * Optional parent origin for cross-origin embeds (Penpal restriction).
   */
  parentOrigin?: string;
}): string {
  const pathname = encodePathnameForEditorEmbedding(args.pathname);
  const basePath = `/editor/site/${encodeURIComponent(args.siteId)}`;
  const pathPart = pathname === "/" ? "" : pathname;

  const url = new URL(basePath + pathPart, args.portalOrigin ?? "http://localhost");
  url.searchParams.set("token", args.token);
  if (args.parentOrigin) {
    url.searchParams.set("parentOrigin", args.parentOrigin);
  }
  return args.portalOrigin ? url.toString() : url.pathname + url.search;
}
