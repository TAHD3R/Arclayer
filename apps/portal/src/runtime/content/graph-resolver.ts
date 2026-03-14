import { ApiError } from "@celestial/runtime/http";
import type { PortalResolveMode } from "@celestial/internal-types";

import { HttpError } from "@/runtime/http-error";
import {
  resolvePublishedGraphRouteFromApi,
  type PublishedGraphRouteResult,
} from "@/runtime/content/site-api";

function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) {
    return err;
  }
  if (err instanceof ApiError) {
    return new HttpError(err.status, err.message);
  }
  const message = err instanceof Error ? err.message : "Backend unavailable";
  return new HttpError(503, message);
}

export async function resolveRouteFromPublishedGraph(
  pathname: string,
  args: { siteId: string; mode: PortalResolveMode; token?: string },
): Promise<PublishedGraphRouteResult> {
  try {
    return await resolvePublishedGraphRouteFromApi(pathname, args.siteId, {
      mode: args.mode,
      ...(args.token ? { token: args.token } : {}),
    });
  } catch (err) {
    throw toHttpError(err);
  }
}
