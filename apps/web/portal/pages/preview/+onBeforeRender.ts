import { redirect, render } from "vike/abort";

import { ApiError } from "@celestial/web-core/http";

import { ensurePortalRequestContext } from "@/runtime/request-context";
import { HttpError, toAbortStatus } from "@/runtime/http-error";
import { buildPreviewHref } from "@/runtime/url-helpers";
import { parseModeFromUrl, resolvePreviewDocument } from "@/runtime/route-entry";

type PortalPreviewPageContextLike = {
  urlOriginal: string;
  headers?: Record<string, string> | null;
};

export async function onBeforeRender(pageContext: PortalPreviewPageContextLike) {
  const parsed = parseModeFromUrl(pageContext.urlOriginal);
  if (!parsed || parsed.mode !== "preview") {
    throw render(404, "Preview route not found");
  }

  try {
    // Preview mode: resolve site by ID from URL (multi-site safe).
    const { siteCtx, viewerCtx } = await ensurePortalRequestContext(pageContext, {
      siteId: parsed.siteId,
      // Used for basic link prefixing in blocks; token preservation is handled by buildPreviewHref().
      basePath: `/preview/site/${parsed.siteId}`,
    });

    const resolved = await resolvePreviewDocument(
      parsed.token
        ? {
            pathname: parsed.pathname,
            siteId: siteCtx.siteId,
            token: parsed.token,
          }
        : { pathname: parsed.pathname, siteId: siteCtx.siteId },
    );

    if (resolved.kind === "redirect") {
      throw redirect(buildPreviewHref(resolved.to, parsed.token, parsed.siteId), resolved.status);
    }
    if (resolved.kind === "not_found") {
      throw render(404, "Preview page not found: " + parsed.pathname);
    }

    return {
      pageContext: {
        pageProps: {
          mode: "preview",
          document: resolved.document,
          match: resolved.match,
          dataSources: resolved.dataSources,
          viewerCtx,
          pathname: parsed.pathname,
          ...(parsed.token ? { token: parsed.token } : {}),
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
