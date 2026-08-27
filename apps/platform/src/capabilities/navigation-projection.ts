import {
  getTrustedCapabilityModule,
  isRegisteredCapabilityDestinationPath,
  NEEDS_ATTENTION_DESTINATION,
  OVERVIEW_DESTINATION,
  PLATFORM_CAPABILITY_DOMAIN_ORDER,
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

export type CapabilityBreadcrumbCrumb = Readonly<{
  labelKey: string;
  linkPath?: PlatformDestination["path"];
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

  const domainOrder = new Map(
    PLATFORM_CAPABILITY_DOMAIN_ORDER.map((routeTarget, index) => [routeTarget, index]),
  );
  capabilityItems.sort(
    (left, right) =>
      (domainOrder.get(left.module.routeTarget) ?? PLATFORM_CAPABILITY_DOMAIN_ORDER.length) -
      (domainOrder.get(right.module.routeTarget) ?? PLATFORM_CAPABILITY_DOMAIN_ORDER.length),
  );

  return {
    primaryDestinations,
    destinations: [...primaryDestinations, ...capabilityItems.flatMap((item) => item.destinations)],
    capabilityItems,
    omittedRouteTargets: [],
    isPartial: false,
  };
}

function isDestinationPathMatch(pathname: string, destination: PlatformDestination): boolean {
  return pathname === destination.path || pathname.startsWith(`${destination.path}/`);
}

function firstPathSegment(pathname: string): string {
  return `/${pathname.split("/")[1] ?? ""}`;
}

type ResolvedNavigationMatch = Readonly<{
  item: CapabilityNavigationItem;
  destination: PlatformDestination | null;
}>;

// Resolve the authorized navigation item for a route. Detail routes that live
// under a domain path (for example /extensions/{pluginId}) resolve through the
// domain-prefix fallback with destination null; a registered destination path
// that the projection did not authorize stays rejected instead of leaking
// sibling-destination authority.
function resolveNavigationMatch(
  pathname: string,
  projection: CapabilityNavigationProjection,
): ResolvedNavigationMatch | null {
  const direct = projection.capabilityItems.find(({ destinations }) =>
    destinations.some((destination) => isDestinationPathMatch(pathname, destination)),
  );
  if (direct) {
    return {
      item: direct,
      destination:
        direct.destinations.find((destination) => isDestinationPathMatch(pathname, destination)) ??
        null,
    };
  }
  if (isRegisteredCapabilityDestinationPath(pathname)) return null;
  const segment = firstPathSegment(pathname);
  const fallback = projection.capabilityItems.find(({ module }) =>
    module.destinations.some((destination) => firstPathSegment(destination.path) === segment),
  );
  return fallback ? { item: fallback, destination: null } : null;
}

function resolvePrimaryBreadcrumbKey(
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
  return null;
}

export function resolveCapabilityBreadcrumbTrail(
  pathname: string,
  projection: CapabilityNavigationProjection,
): readonly CapabilityBreadcrumbCrumb[] | null {
  const primaryKey = resolvePrimaryBreadcrumbKey(pathname, projection);
  if (primaryKey) return [{ labelKey: primaryKey }];

  const match = resolveNavigationMatch(pathname, projection);
  if (!match) return null;
  const domainCrumb: CapabilityBreadcrumbCrumb = { labelKey: match.item.module.domainLabelKey };
  if (!match.destination || match.item.destinations.length === 1) return [domainCrumb];
  const defaultDestination = match.item.destinations[0];
  if (isDestinationPathMatch(pathname, defaultDestination)) {
    return [domainCrumb, { labelKey: defaultDestination.labelKey }];
  }
  return [
    { ...domainCrumb, linkPath: defaultDestination.path },
    { labelKey: match.destination.labelKey },
  ];
}

export function resolveCapabilityBreadcrumbKey(
  pathname: string,
  projection: CapabilityNavigationProjection,
): string | null {
  const primaryKey = resolvePrimaryBreadcrumbKey(pathname, projection);
  if (primaryKey) return primaryKey;
  return resolveNavigationMatch(pathname, projection)?.item.module.domainLabelKey ?? null;
}
