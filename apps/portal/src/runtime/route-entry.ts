import { getTokenFromSearch } from "./url-helpers";
import { normalizePathname, resolvePortalRoute } from "./portal-route-resolver";
import { resolveEditorDocument as resolveEditorDocumentInternal } from "./editor/resolve-editor-document";

export { normalizePathname };

export type ParsedPortalMode =
  | { mode: "public"; pathname: string }
  | { mode: "preview"; pathname: string; siteId: string; token?: string }
  | { mode: "editor"; pathname: string; siteId: string; token?: string };

export function parseModeFromUrl(urlOriginal: string): ParsedPortalMode | null {
  const url = new URL(urlOriginal, "http://localhost");
  const pathname = normalizePathname(url.pathname);
  const token = getTokenFromSearch(url.searchParams);

  if (pathname === "/preview" || pathname.startsWith("/preview/")) {
    const parsed = parsePreviewPath(pathname);
    if (!parsed) return null;
    return {
      mode: "preview",
      siteId: parsed.siteId,
      pathname: parsed.pathname,
      ...(token ? { token } : {}),
    };
  }

  if (pathname.startsWith("/editor/site/")) {
    const parsed = parseEditorPath(pathname);
    if (!parsed) return null;
    return {
      mode: "editor",
      siteId: parsed.siteId,
      pathname: parsed.pathname,
      ...(token ? { token } : {}),
    };
  }

  return { mode: "public", pathname };
}

export async function resolvePublicDocument(args: { pathname: string; siteId: string }) {
  return resolvePortalRoute(normalizePathname(args.pathname), {
    siteId: args.siteId,
    mode: "public",
  });
}

export async function resolvePreviewDocument(args: {
  pathname: string;
  siteId: string;
  token?: string;
}) {
  return resolvePortalRoute(normalizePathname(args.pathname), {
    siteId: args.siteId,
    mode: "preview",
    ...(args.token ? { token: args.token } : {}),
  });
}

export async function resolveEditorDocument(args: {
  pathname: string;
  siteId: string;
  token?: string;
}) {
  return resolveEditorDocumentInternal(args);
}

function parsePreviewPath(pathnameRaw: string): { siteId: string; pathname: string } | null {
  const base = "/preview/site/";
  if (!pathnameRaw.startsWith(base)) return null;

  const rest = pathnameRaw.slice(base.length);
  if (!rest) return null;

  const [siteIdRaw, ...segments] = rest.split("/");
  if (!siteIdRaw) return null;

  const siteId = safeDecodeURIComponent(siteIdRaw);
  const pathname = segments.length ? "/" + segments.join("/") : "/";
  return { siteId, pathname: normalizePathname(pathname) };
}

function parseEditorPath(pathnameRaw: string): { siteId: string; pathname: string } | null {
  const base = "/editor/site/";
  if (!pathnameRaw.startsWith(base)) return null;
  const rest = pathnameRaw.slice(base.length);
  if (!rest) return null;
  const [siteIdRaw, ...segments] = rest.split("/");
  if (!siteIdRaw) return null;
  const siteId = safeDecodeURIComponent(siteIdRaw);
  const pathname = segments.length ? "/" + segments.join("/") : "/";
  return { siteId, pathname };
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
