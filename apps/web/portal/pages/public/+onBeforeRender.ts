import { redirect, render } from "vike/abort";

import { ApiError } from "@celestial/web-core/http";

import { ensurePortalRequestContext } from "@/runtime/request-context";
import { HttpError, toAbortStatus } from "@/runtime/http-error";
import { normalizePathname, resolvePublicDocument } from "@/runtime/route-entry";

type PortalPublicPageContextLike = {
  urlOriginal: string;
  headers?: Record<string, string> | null;
};

export async function onBeforeRender(pageContext: PortalPublicPageContextLike) {
  const url = new URL(pageContext.urlOriginal, "http://localhost");
  const fullPathname = normalizePathname(url.pathname || "/");

  const parsed = parseWorkspacePublicPath(fullPathname);
  const workspaceSlug = parsed?.workspaceSlug;
  const pathname = parsed?.pathname ?? fullPathname;
  const basePath = parsed?.basePath;

  try {
    const { siteCtx, viewerCtx } = await ensurePortalRequestContext(pageContext, {
      ...(workspaceSlug ? { workspaceSlug } : {}),
      ...(basePath ? { basePath } : {}),
    });

    const resolved = await resolvePublicDocument({ pathname, siteId: siteCtx.siteId });

    if (resolved.kind === "redirect") {
      throw redirect(applyBasePath(basePath, resolved.to), resolved.status);
    }
    if (resolved.kind === "not_found") {
      throw render(404, "Page not found: " + pathname);
    }

    return {
      pageContext: {
        pageProps: {
          mode: "public",
          document: resolved.document,
          match: resolved.match,
          dataSources: resolved.dataSources,
          viewerCtx,
          pathname,
          showHydration: pathname === "/",
        },
        siteCtx,
        viewerCtx,
      },
    };
  } catch (err) {
    if (err instanceof HttpError) {
      throw render(toAbortStatus(err.status), err.message);
    }
    if (err instanceof ApiError) {
      throw render(toAbortStatus(err.status), err.message);
    }
    throw err;
  }
}

function parseWorkspacePublicPath(pathnameRaw: string): {
  workspaceSlug: string;
  pathname: string;
  basePath: string;
} | null {
  const pathname = normalizePathname(pathnameRaw);
  const base = "/w/";
  if (!pathname.startsWith(base)) return null;

  const rest = pathname.slice(base.length);
  if (!rest) return null;

  const [slugRaw, ...segments] = rest.split("/");
  if (!slugRaw) return null;
  const workspaceSlug = safeDecodeURIComponent(slugRaw).trim();
  if (!workspaceSlug) return null;

  const sitePathname = segments.length ? "/" + segments.join("/") : "/";
  return {
    workspaceSlug,
    pathname: normalizePathname(sitePathname),
    basePath: "/w/" + workspaceSlug,
  };
}

function applyBasePath(basePath: string | undefined, pathname: string): string {
  const target = normalizePathname(pathname);
  if (!basePath) return target;
  return normalizePathname(basePath + target);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
