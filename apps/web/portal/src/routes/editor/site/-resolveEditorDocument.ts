import { getEditorTokenOrThrow } from "@/router/namespaces";
import { HttpError } from "@/router/routerFallbacks";
import { resolvePortalRoute } from "@/runtime/portal-route-resolver";
import type { PortalRouteMatch } from "@celestial/web-types";

export async function resolveEditorDocument(args: {
  pathname: string;
  context: { siteCtx: { siteId: string } };
  locationSearch: unknown;
}): Promise<{ document: unknown; pathname: string; match: PortalRouteMatch }> {
  let token: string;
  try {
    token = getEditorTokenOrThrow(args.locationSearch);
  } catch {
    throw new HttpError(403, "Preview token required");
  }

  const resolved = await resolvePortalRoute(args.pathname, {
    siteId: args.context.siteCtx.siteId,
    mode: "preview",
    token,
  });

  if (resolved.kind === "redirect") {
    // Editor mode should never follow redirects implicitly.
    // Instead, surface as an error so the host can decide what to do.
    throw new HttpError(409, `Unexpected redirect in editor mode: ${resolved.to}`);
  }
  if (resolved.kind === "not_found") {
    throw new HttpError(404, `Editor page not found: ${args.pathname}`);
  }

  return { document: resolved.document, pathname: args.pathname, match: resolved.match };
}
