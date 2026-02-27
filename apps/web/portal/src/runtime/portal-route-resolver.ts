import { ApiError } from "@celestial/web-core/http";
import type { PortalResolveMode, PortalRouteMatch } from "@celestial/web-types";
import type { DesignDocumentV1 } from "@celestial/site-block-protocol";
import type { DesignRenderDataSourcesV1 } from "@celestial/site-renderer-core";

import { HttpError } from "@/runtime/http-error";
import { resolveRouteFromApi } from "./site-api";

export type ResolvedPortalRoute =
  | {
      kind: "page";
      document: DesignDocumentV1;
      match: PortalRouteMatch;
      dataSources?: DesignRenderDataSourcesV1;
    }
  | { kind: "redirect"; to: string; status: 301 | 302 }
  | { kind: "not_found" };

export async function resolvePortalRoute(
  pathnameRaw: string,
  args: { siteId: string; mode: PortalResolveMode; token?: string },
): Promise<ResolvedPortalRoute> {
  const pathname = normalizePathname(pathnameRaw);

  try {
    const opts: { mode: PortalResolveMode; token?: string } = { mode: args.mode };
    if (args.token) opts.token = args.token;
    return await resolveRouteFromApi(pathname, args.siteId, opts);
  } catch (err) {
    throw toHttpError(err);
  }
}

export function normalizePathname(pathnameRaw: string): string {
  const pathname = pathnameRaw.startsWith("/") ? pathnameRaw : `/${pathnameRaw}`;
  if (pathname === "/") return "/";
  // Normalize trailing slash for deterministic matching.
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof ApiError) return new HttpError(err.status, err.message);
  const msg = err instanceof Error ? err.message : "Backend unavailable";
  return new HttpError(503, msg);
}
