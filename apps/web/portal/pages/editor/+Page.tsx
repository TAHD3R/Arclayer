import React from "react";
import { render } from "vike/abort";

import type { ViewerContext } from "@celestial/site-block-protocol";
import type { PortalRouteMatch } from "@celestial/web-types";

import { EditorSiteView } from "@/features/editor/editor-site-view";
import { ensurePortalRequestContext } from "@/runtime/request-context";
import { HttpError, toAbortStatus } from "@/runtime/http-error";
import { parseModeFromUrl, resolveEditorDocument } from "@/runtime/route-entry";

export { Page, onBeforeRender };

type EditorPageProps = {
  mode: "editor";
  document: unknown;
  match: PortalRouteMatch;
  viewerCtx: ViewerContext;
  pathname: string;
  siteId: string;
  token?: string;
};

async function onBeforeRender(pageContext: { urlOriginal: string }) {
  const { siteCtx, viewerCtx } = await ensurePortalRequestContext(pageContext);
  const parsed = parseModeFromUrl(pageContext.urlOriginal);
  if (!parsed || parsed.mode !== "editor") {
    throw render(404, "Editor route not found");
  }

  try {
    const resolved = await resolveEditorDocument(
      parsed.token
        ? {
            pathname: parsed.pathname,
            siteId: siteCtx.siteId,
            token: parsed.token,
          }
        : { pathname: parsed.pathname, siteId: siteCtx.siteId },
    );

    return {
      pageContext: {
        pageProps: {
          mode: "editor",
          document: resolved.document,
          match: resolved.match,
          viewerCtx,
          pathname: resolved.pathname,
          siteId: parsed.siteId,
          ...(parsed.token ? { token: parsed.token } : {}),
        } satisfies EditorPageProps,
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

function Page(props: EditorPageProps) {
  return (
    <EditorSiteView
      initialDocument={props.document}
      viewerCtx={props.viewerCtx}
      pathname={props.pathname}
      siteId={props.siteId}
    />
  );
}
