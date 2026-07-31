import {
  getTrustedCapabilityModule,
  OPERATIONS_INBOX_DESTINATION,
  type PlatformCapabilityModule,
  type PlatformDestination,
} from "@/capabilities/module-registry";
import type { PlatformCapabilityOut } from "@arclayer/platform-openapi";

export type CapabilityProjectionRecord = Readonly<
  Pick<
    PlatformCapabilityOut,
    "capabilityId" | "routeTarget" | "navigationCandidate" | "navigationTargets"
  >
>;

export type CapabilityNavigationItem = Readonly<{
  capabilityId: string;
  module: PlatformCapabilityModule;
  destinations: readonly PlatformDestination[];
}>;

export type CapabilityNavigationProjection = Readonly<{
  destinations: readonly PlatformDestination[];
  capabilityItems: readonly CapabilityNavigationItem[];
  omittedRouteTargets: readonly string[];
  isPartial: boolean;
}>;

export function projectCapabilityNavigation(
  records: readonly CapabilityProjectionRecord[],
): CapabilityNavigationProjection {
  const capabilityItems: CapabilityNavigationItem[] = [];
  const omittedRouteTargets: string[] = [];
  const seenTargets = new Set<string>();

  for (const record of records) {
    if (!record.navigationCandidate) continue;
    const module = getTrustedCapabilityModule(record.routeTarget);
    if (!module) {
      omittedRouteTargets.push(record.routeTarget);
      continue;
    }
    const destinations = record.navigationTargets.flatMap((target) => {
      if (seenTargets.has(target.routeTarget)) {
        throw new Error(`Duplicate Platform navigation target: ${target.routeTarget}`);
      }
      seenTargets.add(target.routeTarget);
      const destination = module.destinations.find(
        (candidate) => candidate.routeTarget === target.routeTarget,
      );
      if (destination) return [destination];
      omittedRouteTargets.push(target.routeTarget);
      return [];
    });
    if (destinations.length === 0) continue;
    capabilityItems.push({
      capabilityId: record.capabilityId,
      module,
      destinations,
    });
  }

  return {
    destinations: [
      OPERATIONS_INBOX_DESTINATION,
      ...capabilityItems.flatMap((item) => item.destinations),
    ],
    capabilityItems,
    omittedRouteTargets,
    isPartial: omittedRouteTargets.length > 0,
  };
}

export function resolveCapabilityBreadcrumbKey(
  pathname: string,
  projection: CapabilityNavigationProjection,
): string | null {
  if (pathname === "/") return OPERATIONS_INBOX_DESTINATION.labelKey;
  const item = projection.capabilityItems.find(({ destinations }) =>
    destinations.some(
      (destination) => pathname === destination.path || pathname.startsWith(`${destination.path}/`),
    ),
  );
  return item?.module.domainLabelKey ?? null;
}
