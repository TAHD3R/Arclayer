import { ApiError } from "@celestial/runtime/http";
import type { PortalResolveMode, PortalRouteMatch } from "@celestial/internal-types";
import type { PageBlueprint } from "@celestial/block-protocol";
import type { DesignRenderDataSourcesV1 } from "@celestial/renderer";
import type { ContentRefIncludesMap, ResolveWarningV1 } from "@celestial/block-protocol";

import { HttpError } from "@/runtime/http-error";
import {
  fetchContentEntryRevision,
  resolveRouteFromApi,
  type ContentEntryRevisionSnapshot,
  type ContentEntryRevisionState,
} from "./site-api";

export type ResolvedPortalRoute =
  | {
      kind: "page";
      document: PageBlueprint;
      match: PortalRouteMatch;
      pageMeta?: { title?: string; description?: string };
      dataSources?: DesignRenderDataSourcesV1;
      includes?: ContentRefIncludesMap;
      warnings?: ResolveWarningV1[];
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

export async function loadContentEntryDocument(args: {
  workspaceId: string;
  entryId: string;
  state?: ContentEntryRevisionState;
}): Promise<{
  document: PageBlueprint;
  dataSources: DesignRenderDataSourcesV1;
  snapshot: ContentEntryRevisionSnapshot;
}> {
  try {
    const state = args.state ?? "draft";
    const snapshot = await fetchContentEntryRevision(args.workspaceId, args.entryId, state);

    const dataSources: DesignRenderDataSourcesV1 = {
      primaryEntry: {
        id: args.entryId,
        data: { fields: snapshot.field_values as unknown as Record<string, unknown> },
      },
    };

    return {
      document: snapshot.page_blueprint,
      dataSources,
      snapshot,
    };
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
