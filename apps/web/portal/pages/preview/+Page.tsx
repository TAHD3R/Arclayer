import React from "react";
import { redirect, render } from "vike/abort";

import type { CoreDocumentIR } from "@celestial/site-renderer-core";
import type { ViewerContext } from "@celestial/site-block-protocol";
import type { PortalRouteMatch } from "@celestial/web-types";

import { PortalDocumentPage } from "@/features/portal-document-page";
import { ensurePortalRequestContext } from "@/runtime/request-context";
import { HttpError, toAbortStatus } from "@/runtime/http-error";
import { buildPreviewHref } from "@/runtime/url-helpers";
import { parseModeFromUrl, resolvePreviewDocument } from "@/runtime/route-entry";

export { Page, onBeforeRender };

type PreviewPageProps = {
  mode: "preview";
  document: CoreDocumentIR;
  match: PortalRouteMatch;
  viewerCtx: ViewerContext;
  pathname: string;
  token?: string;
};

async function onBeforeRender(pageContext: { urlOriginal: string }) {
  const { siteCtx, viewerCtx } = await ensurePortalRequestContext(pageContext);
  const parsed = parseModeFromUrl(pageContext.urlOriginal);
  if (!parsed || parsed.mode !== "preview") {
    throw render(404, "Preview route not found");
  }
  const pathname = parsed.pathname;

  try {
    const resolved = await resolvePreviewDocument(
      parsed.token
        ? {
            pathname,
            siteId: siteCtx.siteId,
            token: parsed.token,
          }
        : { pathname, siteId: siteCtx.siteId },
    );

    if (resolved.kind === "redirect") {
      throw redirect(buildPreviewHref(resolved.to, parsed.token), resolved.status);
    }
    if (resolved.kind === "not_found") {
      throw render(404, "Preview page not found: " + pathname);
    }

    return {
      pageContext: {
        pageProps: {
          mode: "preview",
          document: resolved.document,
          match: resolved.match,
          viewerCtx,
          pathname,
          ...(parsed.token ? { token: parsed.token } : {}),
        } satisfies PreviewPageProps,
        siteCtx,
        viewerCtx,
      },
    };
  } catch (err) {
    if (err instanceof HttpError) {
      throw render(toAbortStatus(err.status), err.message);
    }
    throw err;
  }
}

function Page(props: PreviewPageProps) {
  return (
    <PortalDocumentPage document={props.document} match={props.match} viewerCtx={props.viewerCtx} />
  );
}
