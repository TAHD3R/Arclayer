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

export function buildEditorIframeHref(args: {
  /**
   * External Portal origin (e.g. http://localhost:3100). If omitted, the href is relative.
   */
  portalOrigin?: string;
  /**
   * Site id used in the editor URL segment: /__editor/site/:siteId
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
  const pathname = normalizePathname(args.pathname);
  const basePath = `/__editor/site/${encodeURIComponent(args.siteId)}`;
  const pathPart = pathname === "/" ? "" : pathname;

  const url = new URL(basePath + pathPart, args.portalOrigin ?? "http://localhost");
  url.searchParams.set("token", args.token);
  if (args.parentOrigin) {
    url.searchParams.set("parentOrigin", args.parentOrigin);
  }
  return args.portalOrigin ? url.toString() : url.pathname + url.search;
}
