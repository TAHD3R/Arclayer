import {
  getTrustedCapabilityModule,
  NEEDS_ATTENTION_DESTINATION,
  OVERVIEW_DESTINATION,
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
  primaryDestinations: readonly PlatformDestination[];
  destinations: readonly PlatformDestination[];
  capabilityItems: readonly CapabilityNavigationItem[];
  omittedRouteTargets: readonly string[];
  isPartial: boolean;
}>;

const OPERATIONS_SIGNALS_CAPABILITY_ID = "operations-signals";
const OPERATIONS_SIGNALS_READ_PERMISSION = "platform:operations-signals:read";

function hasNeedsAttentionAccess(record: CapabilityProjectionRecord): boolean {
  return record.navigationTargets.some((target) =>
    target.requiredViewPermissions.includes(OPERATIONS_SIGNALS_READ_PERMISSION),
  );
}

export function projectCapabilityNavigation(
  records: readonly CapabilityProjectionRecord[],
): CapabilityNavigationProjection {
  const capabilityItems: CapabilityNavigationItem[] = [];
  const omittedRouteTargets: string[] = [];
  const seenTargets = new Set<string>();
  let hasNeedsAttentionDestination = false;

  for (const record of records) {
    if (!record.navigationCandidate) continue;
    if (record.capabilityId === OPERATIONS_SIGNALS_CAPABILITY_ID) {
      if (!hasNeedsAttentionAccess(record)) {
        omittedRouteTargets.push(record.routeTarget);
        continue;
      }
      if (hasNeedsAttentionDestination) {
        throw new Error(
          `Duplicate Platform navigation target: ${NEEDS_ATTENTION_DESTINATION.path}`,
        );
      }
      hasNeedsAttentionDestination = true;
      continue;
    }
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

  const primaryDestinations = [
    OVERVIEW_DESTINATION,
    ...(hasNeedsAttentionDestination ? [NEEDS_ATTENTION_DESTINATION] : []),
  ];

  return {
    primaryDestinations,
    destinations: [...primaryDestinations, ...capabilityItems.flatMap((item) => item.destinations)],
    capabilityItems,
    omittedRouteTargets,
    isPartial: omittedRouteTargets.length > 0,
  };
}

export function resolveCapabilityBreadcrumbKey(
  pathname: string,
  projection: CapabilityNavigationProjection,
): string | null {
  if (pathname === "/") return OVERVIEW_DESTINATION.labelKey;
  if (
    pathname === NEEDS_ATTENTION_DESTINATION.path &&
    projection.destinations.includes(NEEDS_ATTENTION_DESTINATION)
  ) {
    return NEEDS_ATTENTION_DESTINATION.labelKey;
  }
  const item = projection.capabilityItems.find(({ destinations }) =>
    destinations.some(
      (destination) => pathname === destination.path || pathname.startsWith(`${destination.path}/`),
    ),
  );
  return item?.module.domainLabelKey ?? null;
}
