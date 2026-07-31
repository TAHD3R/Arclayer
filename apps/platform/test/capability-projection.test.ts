import { describe, expect, it } from "vitest";

import {
  projectCapabilityNavigation,
  resolveCapabilityBreadcrumbKey,
  type CapabilityProjectionRecord,
} from "@/capabilities/navigation-projection";
import type {
  PlatformCapabilityNavigationTargetOut,
  PlatformCapabilityRouteTarget,
} from "@arclayer/platform-openapi";

function navigationTarget(
  routeTarget: PlatformCapabilityRouteTarget,
): PlatformCapabilityNavigationTargetOut {
  return { routeTarget, requiredViewPermissions: [], viewPermissionMatch: "all" };
}

function capabilityRecord(
  routeTarget: PlatformCapabilityRouteTarget,
  navigationTargets: readonly PlatformCapabilityRouteTarget[],
  navigationCandidate = true,
): CapabilityProjectionRecord {
  return {
    capabilityId: routeTarget,
    routeTarget,
    navigationCandidate,
    navigationTargets: navigationTargets.map(navigationTarget),
  };
}

describe("trusted Platform capability projection", () => {
  it("projects only server-authorized build-registered destinations", () => {
    const projection = projectCapabilityNavigation([
      capabilityRecord("tenants.workspaces", ["tenants.workspaces"]),
      capabilityRecord("monitoring.requests", ["monitoring.requests"], false),
      {
        capabilityId: "future-module",
        routeTarget: "https://attacker.invalid/component.js",
        navigationCandidate: true,
        navigationTargets: [],
      } as never,
    ]);

    expect(projection.destinations.map(({ id }) => id)).toEqual([
      "operations-inbox",
      "tenant-workspaces",
    ]);
    expect(projection.omittedRouteTargets).toEqual(["https://attacker.invalid/component.js"]);
    expect(projection.isPartial).toBe(true);
  });

  it.each([
    [["tenants.workspaces"], ["tenant-workspaces"]],
    [["tenants.users"], ["tenant-users"]],
    [["tenants.projects"], ["tenant-projects"]],
  ] as const)("keeps Tenant Governance peer authority exact for %j", (targets, expected) => {
    const projection = projectCapabilityNavigation([
      capabilityRecord("tenants.workspaces", targets),
    ]);

    expect(projection.capabilityItems[0]?.destinations.map(({ id }) => id)).toEqual(expected);
  });

  it.each([
    [
      ["monitoring.requests", "monitoring.performance", "monitoring.ai-usage"],
      ["monitoring-requests", "monitoring-performance", "monitoring-ai-usage"],
    ],
    [
      ["monitoring.activity", "monitoring.audit"],
      ["monitoring-activity", "monitoring-audit"],
    ],
  ] as const)("keeps Monitoring & Audit peer authority exact for %j", (targets, expected) => {
    const projection = projectCapabilityNavigation([
      capabilityRecord("monitoring.requests", targets),
    ]);

    expect(projection.capabilityItems[0]?.destinations.map(({ id }) => id)).toEqual(expected);
  });

  it("projects the build-registered Platform team destination", () => {
    const projection = projectCapabilityNavigation([
      capabilityRecord("access.team", ["access.team"]),
    ]);

    expect(projection.destinations.map(({ id }) => id)).toEqual([
      "operations-inbox",
      "access-team",
    ]);
    expect(projection.isPartial).toBe(false);
  });

  it("derives breadcrumb and route authority from the same authorized destinations", () => {
    const projection = projectCapabilityNavigation([
      capabilityRecord("tenants.workspaces", ["tenants.workspaces"]),
      capabilityRecord("monitoring.requests", ["monitoring.audit"]),
    ]);

    expect(resolveCapabilityBreadcrumbKey("/monitoring/audit", projection)).toBe(
      "navigation:MONITORING_AUDIT",
    );
    expect(resolveCapabilityBreadcrumbKey("/monitoring/audit/events/evt-1", projection)).toBe(
      "navigation:MONITORING_AUDIT",
    );
    expect(resolveCapabilityBreadcrumbKey("/monitoring/requests", projection)).toBeNull();
    expect(resolveCapabilityBreadcrumbKey("/tenants/users", projection)).toBeNull();
  });

  it("marks a trusted target outside its registered module as partial", () => {
    const projection = projectCapabilityNavigation([
      capabilityRecord("access.team", ["tenants.users"]),
    ]);

    expect(projection.destinations.map(({ id }) => id)).toEqual(["operations-inbox"]);
    expect(projection.omittedRouteTargets).toEqual(["tenants.users"]);
    expect(projection.isPartial).toBe(true);
  });

  it("rejects duplicate navigation targets instead of silently merging authority", () => {
    expect(() =>
      projectCapabilityNavigation([
        capabilityRecord("tenants.workspaces", ["tenants.users"]),
        capabilityRecord("tenants.workspaces", ["tenants.users"]),
      ]),
    ).toThrow("Duplicate Platform navigation target: tenants.users");
  });
});
