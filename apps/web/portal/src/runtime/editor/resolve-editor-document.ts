import { resolvePortalRoute } from "@/runtime/portal-route-resolver";
import { HttpError } from "@/runtime/http-error";
import type { PortalRouteMatch } from "@celestial/portal-types";

export async function resolveEditorDocument(args: {
  pathname: string;
  siteId: string;
  token?: string;
}): Promise<{ document: unknown; pathname: string; match: PortalRouteMatch }> {
  const token = args.token;
  if (!token) throw new HttpError(403, "Preview token required");

  const resolved = await resolvePortalRoute(args.pathname, {
    siteId: args.siteId,
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
