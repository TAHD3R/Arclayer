import { isPageBlueprint } from "@celestial/renderer";
import type { DesignRenderDataSourcesV1 } from "@celestial/renderer";
import type {
  ContentRefIncludesMap,
  PageBlueprint,
  ResolveWarningV1,
} from "@celestial/block-protocol";
import type { PortalResolveMode, PortalRouteMatch } from "@celestial/internal-types";

import {
  buildPortalApiFetchInput,
  getPortalApiPrefix,
  getRecordField,
  getResponseData,
  parsePortalRouteMatch,
  toApiError,
} from "@/runtime/site-api";

type PageMeta = { title?: string; description?: string };

export type PublishedGraphRouteResult =
  | {
      kind: "page";
      document: PageBlueprint;
      match: PortalRouteMatch;
      pageMeta?: PageMeta;
      dataSources?: DesignRenderDataSourcesV1;
      includes?: ContentRefIncludesMap;
      warnings?: ResolveWarningV1[];
    }
  | { kind: "redirect"; to: string; status: 301 | 302 }
  | { kind: "not_found" };

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parsePageMeta(data: unknown): PageMeta | undefined {
  const pageMeta = getRecordField(data, "pageMeta") ?? getRecordField(data, "page_meta");
  const title = readTrimmedString(getRecordField(pageMeta, "title"));
  const description = readTrimmedString(getRecordField(pageMeta, "description"));
  if (!title && !description) {
    return undefined;
  }
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
  };
}

function parsePageDocument(data: unknown): PageBlueprint {
  const graph = getRecordField(data, "graph");
  const document = getRecordField(graph, "document");
  if (!isPageBlueprint(document)) {
    throw new Error("Published graph document missing or invalid.");
  }
  return document;
}

function parsePageRouteResult(data: unknown, match: PortalRouteMatch): PublishedGraphRouteResult {
  const pageMeta = parsePageMeta(data);
  return {
    kind: "page",
    document: parsePageDocument(data),
    match,
    ...(pageMeta ? { pageMeta } : {}),
  };
}

export async function resolvePublishedGraphRouteFromApi(
  pathname: string,
  siteId: string,
  opts: { mode: PortalResolveMode; token?: string },
): Promise<PublishedGraphRouteResult> {
  const apiPrefix = getPortalApiPrefix();
  const requestPath = `${apiPrefix}/sites/${encodeURIComponent(siteId)}/published-graph/resolve`;
  const url = new URL(requestPath, "http://localhost");
  url.searchParams.set("path", pathname);
  url.searchParams.set("mode", opts.mode);
  if (opts.token) {
    url.searchParams.set("token", opts.token);
  }

  const response = await fetch(buildPortalApiFetchInput(url), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw await toApiError(
      response,
      `Failed to resolve published graph route (${response.status})`,
    );
  }

  const payload: unknown = await response.json();
  const data = getResponseData(payload);
  const match = parsePortalRouteMatch(getRecordField(data, "match"));

  if (match.kind === "not_found") {
    return { kind: "not_found" };
  }
  if (match.kind === "redirect") {
    if (!match.redirectTo || !match.redirectStatus) {
      throw new Error("Published graph redirect payload is invalid.");
    }
    return {
      kind: "redirect",
      to: match.redirectTo,
      status: match.redirectStatus,
    };
  }

  return parsePageRouteResult(data, match);
}
