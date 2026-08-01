import type {
  PageDataOperationalSignalOut,
  PlatformCapabilityCatalogOut,
} from "@arclayer/platform-openapi";

import { getPlatformCapabilityCatalog } from "@/capabilities/catalog-api";
import { listOperationalSignals } from "@/operations/operations-api";

export type OverviewSource<T> =
  | Readonly<{ status: "ready"; data: T }>
  | Readonly<{ status: "error"; error: unknown }>;

export type PlatformOverview = Readonly<{
  catalog: OverviewSource<PlatformCapabilityCatalogOut>;
  attention: OverviewSource<PageDataOperationalSignalOut>;
  recovered: OverviewSource<PageDataOperationalSignalOut>;
  loadedAt: string;
}>;

function source<T>(result: PromiseSettledResult<T>): OverviewSource<T> {
  return result.status === "fulfilled"
    ? { status: "ready", data: result.value }
    : { status: "error", error: result.reason };
}

export async function loadPlatformOverview(signal?: AbortSignal): Promise<PlatformOverview> {
  const results = await Promise.allSettled([
    getPlatformCapabilityCatalog(),
    listOperationalSignals(
      { sourceLifecycle: "unresolved", includeReminded: false, page: 1, size: 5 },
      signal,
    ),
    listOperationalSignals(
      { sourceLifecycle: "resolved", includeReminded: true, page: 1, size: 5 },
      signal,
    ),
  ] as const);

  if (results.every((result) => result.status === "rejected")) {
    throw new AggregateError(
      results.map((result) => (result.status === "rejected" ? result.reason : undefined)),
      "PLATFORM_OVERVIEW_UNAVAILABLE",
    );
  }

  return {
    catalog: source(results[0]),
    attention: source(results[1]),
    recovered: source(results[2]),
    loadedAt: new Date().toISOString(),
  };
}
