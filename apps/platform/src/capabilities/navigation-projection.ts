import {
  getTrustedCapabilityModule,
  NEEDS_ATTENTION_DESTINATION,
  OVERVIEW_DESTINATION,
  type PlatformCapabilityModule,
  type PlatformDestination,
} from "@/capabilities/module-registry";

export type CapabilityProjectionRecord = Readonly<{
  capabilityId: string;
  routeTarget: string;
  navigationCandidate: boolean;
  navigationTargets: readonly Readonly<{
    routeTarget: string;
    requiredViewPermissions: readonly string[];
    viewPermissionMatch: string;
  }>[];
}>;

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
const OPERATIONS_SIGNALS_ROUTE_TARGET = "operations.signals";
const OPERATIONS_SIGNALS_READ_PERMISSION = "platform:operations-signals:read";
export const CAPABILITY_NAVIGATION_CONTRACT_ERROR_CODE =
  "PLATFORM_CAPABILITY_NAVIGATION_CONTRACT_ERROR";

export class CapabilityNavigationContractError extends Error {
  readonly code = CAPABILITY_NAVIGATION_CONTRACT_ERROR_CODE;

  constructor(message: string) {
    super(message);
    this.name = "CapabilityNavigationContractError";
  }
}

function contractError(message: string): CapabilityNavigationContractError {
  return new CapabilityNavigationContractError(message);
}

function hasNeedsAttentionAccess(record: CapabilityProjectionRecord): boolean {
  return (
    record.routeTarget === OPERATIONS_SIGNALS_ROUTE_TARGET &&
    record.navigationTargets.some(
      (target) =>
        target.routeTarget === OPERATIONS_SIGNALS_ROUTE_TARGET &&
        target.requiredViewPermissions.includes(OPERATIONS_SIGNALS_READ_PERMISSION),
    )
  );
}

export function projectCapabilityNavigation(
  records: readonly CapabilityProjectionRecord[],
): CapabilityNavigationProjection {
  const capabilityItems: CapabilityNavigationItem[] = [];
  const seenTargets = new Set<string>();
  let hasNeedsAttentionDestination = false;

  for (const record of records) {
    if (!record.navigationCandidate) continue;
    if (record.capabilityId === OPERATIONS_SIGNALS_CAPABILITY_ID) {
      if (!hasNeedsAttentionAccess(record)) {
        throw contractError(
          `Platform capability ${record.capabilityId} is missing its required trusted target permission`,
        );
      }
      if (hasNeedsAttentionDestination) {
        throw contractError(
          `Duplicate Platform navigation target: ${NEEDS_ATTENTION_DESTINATION.path}`,
        );
      }
      hasNeedsAttentionDestination = true;
      continue;
    }
    const module = getTrustedCapabilityModule(record.routeTarget);
    if (!module) {
      throw contractError(`Unregistered Platform capability route target: ${record.routeTarget}`);
    }
    const destinations = record.navigationTargets.map((target) => {
      if (seenTargets.has(target.routeTarget)) {
        throw contractError(`Duplicate Platform navigation target: ${target.routeTarget}`);
      }
      seenTargets.add(target.routeTarget);
      const destination = module.destinations.find(
        (candidate) => candidate.routeTarget === target.routeTarget,
      );
      if (destination) return destination;
      throw contractError(
        `Unregistered Platform capability navigation target: ${target.routeTarget}`,
      );
    });
    if (destinations.length === 0) {
      throw contractError(
        `Platform capability ${record.capabilityId} has no trusted navigation target`,
      );
    }
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
    omittedRouteTargets: [],
    isPartial: false,
  };
}

export function resolveCapabilityBreadcrumbKey(
  pathname: string,
  projection: CapabilityNavigationProjection,
): string | null {
  if (pathname === "/") return OVERVIEW_DESTINATION.labelKey;
  if (pathname === "/settings") return "common:SYSTEM_SETTINGS_TITLE";
  if (
    (pathname === NEEDS_ATTENTION_DESTINATION.path ||
      pathname.startsWith(`${NEEDS_ATTENTION_DESTINATION.path}/`)) &&
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
