import React from "react";
import { redirect, render } from "vike/abort";

import type { CoreDocumentIR } from "@celestial/site-renderer-core";
import type { ViewerContext } from "@celestial/site-block-protocol";
import type { PortalRouteMatch } from "@celestial/web-types";

import { PortalDocumentPage } from "@/views/portal-document-page";
import { ensurePortalRequestContext } from "@/runtime/request-context";
import { normalizePathname, resolvePublicDocument } from "@/runtime/route-entry";
import { HttpError, toAbortStatus } from "@/runtime/http-error";

export { Page, onBeforeRender };

type PortalPageProps = {
  mode: "public";
  document: CoreDocumentIR;
  match: PortalRouteMatch;
  viewerCtx: ViewerContext;
  pathname: string;
  showHydration: boolean;
};

async function onBeforeRender(pageContext: { urlOriginal: string }) {
  const { siteCtx, viewerCtx } = await ensurePortalRequestContext(pageContext);
  const pathname = normalizePathname(
    new URL(pageContext.urlOriginal, "http://localhost").pathname || "/",
  );

  try {
    const resolved = await resolvePublicDocument({ pathname, siteId: siteCtx.siteId });

    if (resolved.kind === "redirect") {
      throw redirect(resolved.to, resolved.status);
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
          viewerCtx,
          pathname,
          showHydration: pathname === "/",
        } satisfies PortalPageProps,
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

function Page(props: PortalPageProps) {
  return (
    <PortalDocumentPage
      document={props.document}
      match={props.match}
      viewerCtx={props.viewerCtx}
      showHydration={props.showHydration}
    />
  );
}
