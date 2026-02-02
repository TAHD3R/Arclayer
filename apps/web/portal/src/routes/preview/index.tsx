import React from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DocumentRenderer } from "@celestial/site-renderer-core";

import { resolvePortalRoute } from "@/runtime/hardcoded-site";
import { HttpError } from "@/router/routerFallbacks";
import { ApiError } from "@celestial/web-core/http";

export const Route = createFileRoute("/preview/")({
  loader: async ({ context, location }) => {
    const token = getTokenFromSearch(location.search);

    let resolved;
    try {
      resolved = await resolvePortalRoute("/", {
        siteId: context.siteCtx.siteId,
        mode: "preview",
        token,
      });
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err instanceof ApiError) throw new HttpError(err.status, err.message);
      throw new HttpError(503, err instanceof Error ? err.message : "Backend unavailable");
    }

    if (resolved.kind === "redirect") {
      throw redirect({ href: toPreviewHref(resolved.to, token), statusCode: resolved.status });
    }
    if (resolved.kind === "not_found") {
      throw new HttpError(404, "Preview page not found.");
    }

    return { document: resolved.document };
  },
  component: PreviewIndexPage,
});

function PreviewIndexPage() {
  const { document } = Route.useLoaderData();
  const { viewerCtx } = Route.useRouteContext();
  return <DocumentRenderer document={document} ctx={viewerCtx} />;
}

function getTokenFromSearch(search: unknown): string | undefined {
  const s = search as { token?: unknown } | undefined;
  return typeof s?.token === "string" && s.token.trim() ? s.token : undefined;
}

function toPreviewHref(pathname: string, token: string | undefined): string {
  const base = pathname === "/" ? "/__preview" : "/__preview" + pathname;
  if (!token) return base;
  const url = new URL(base, "http://localhost");
  url.searchParams.set("token", token);
  return url.pathname + url.search;
}
