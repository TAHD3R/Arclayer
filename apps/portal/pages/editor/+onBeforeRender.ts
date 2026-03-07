import { render } from "vike/abort";

import { ApiError } from "@celestial/runtime/http";

import { ensurePortalRequestContext } from "@/runtime/request-context";
import { HttpError, toAbortStatus } from "@/runtime/http-error";
import { getPortalRuntimeConfigForSite } from "@/runtime/runtime-config";
import { parseModeFromUrl, resolveEditorDocument } from "@/runtime/route-entry";

type PortalEditorPageContextLike = {
  urlOriginal: string;
  headers?: Record<string, string> | null;
};

export async function onBeforeRender(pageContext: PortalEditorPageContextLike) {
  const parsed = parseModeFromUrl(pageContext.urlOriginal);
  if (!parsed || parsed.mode !== "editor") {
    throw render(404, "Editor route not found");
  }

  try {
    // Editor mode: resolve site by ID from URL, not by host.
    const { siteCtx, viewerCtx } = await ensurePortalRequestContext(pageContext, {
      siteId: parsed.siteId,
      basePath: `/editor/site/${parsed.siteId}`,
    });

    const resolved = await resolveEditorDocument(
      parsed.token
        ? {
            pathname: parsed.pathname,
            siteId: siteCtx.siteId,
            token: parsed.token,
          }
        : { pathname: parsed.pathname, siteId: siteCtx.siteId },
    );
    const runtimeConfig = await getPortalRuntimeConfigForSite(
      siteCtx.siteId,
      parsed.token
        ? { mode: "preview", token: parsed.token, locale: viewerCtx.locale }
        : { mode: "preview", locale: viewerCtx.locale },
    );

    return {
      pageContext: {
        pageProps: {
          mode: "editor",
          document: resolved.document,
          match: resolved.match,
          ...(resolved.pageMeta ? { pageMeta: resolved.pageMeta } : {}),
          runtimeConfig,
          viewerCtx,
          pathname: resolved.pathname,
          siteId: parsed.siteId,
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
