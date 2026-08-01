import { describe, expect, it } from "vitest";

import {
  projectCapabilityNavigation,
  resolveCapabilityBreadcrumbKey,
  type CapabilityProjectionRecord,
} from "@/capabilities/navigation-projection";
import type {
  PlatformCapabilityNavigationTargetOut,
  PlatformPermissionCode,
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

function operationsSignalsRecord(
  requiredViewPermissions: PlatformCapabilityNavigationTargetOut["requiredViewPermissions"] = [
    "platform:operations-signals:read",
  ],
): CapabilityProjectionRecord {
  return {
    capabilityId: "operations-signals",
    routeTarget: "operations.signals",
    navigationCandidate: true,
    navigationTargets: [
      {
        routeTarget: "operations.signals",
        requiredViewPermissions,
        viewPermissionMatch: "all",
      },
    ],
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
      "overview",
      "workspace-workspaces",
    ]);
    expect(projection.omittedRouteTargets).toEqual(["https://attacker.invalid/component.js"]);
    expect(projection.isPartial).toBe(true);
  });

  it("keeps the Workspace directory authority exact", () => {
    const projection = projectCapabilityNavigation([
      capabilityRecord("tenants.workspaces", ["tenants.workspaces"]),
    ]);

    expect(projection.capabilityItems[0]?.destinations.map(({ id }) => id)).toEqual([
      "workspace-workspaces",
    ]);
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

    expect(projection.destinations.map(({ id }) => id)).toEqual(["overview", "access-team"]);
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
    expect(resolveCapabilityBreadcrumbKey("/users", projection)).toBeNull();
  });

  it("marks ready backend candidates without a registered module as partial", () => {
    const projection = projectCapabilityNavigation([
      capabilityRecord("commerce.subscriptions", ["commerce.subscriptions"]),
    ]);

    expect(projection.destinations.map(({ id }) => id)).toEqual(["overview"]);
    expect(projection.omittedRouteTargets).toEqual(["commerce.subscriptions"]);
    expect(projection.isPartial).toBe(true);
  });

  it("does not project non-ready backend capabilities whose routes are absent", () => {
    const projection = projectCapabilityNavigation([
      capabilityRecord("commerce.subscriptions", ["commerce.subscriptions"], false),
    ]);

    expect(projection.destinations.map(({ id }) => id)).toEqual(["overview"]);
    expect(projection.omittedRouteTargets).toEqual([]);
    expect(projection.isPartial).toBe(false);
  });

  it("does not expose Needs attention without the operations-signals capability", () => {
    const projection = projectCapabilityNavigation([
      capabilityRecord("tenants.workspaces", ["tenants.workspaces"]),
    ]);

    expect(projection.destinations.map(({ id }) => id)).toEqual([
      "overview",
      "workspace-workspaces",
    ]);
    expect(resolveCapabilityBreadcrumbKey("/attention", projection)).toBeNull();
    expect(projection.primaryDestinations.map(({ id }) => id)).toEqual(["overview"]);
  });

  it("projects Needs attention only for the operations-signals read capability", () => {
    const projection = projectCapabilityNavigation([operationsSignalsRecord()]);

    expect(projection.destinations.map(({ id }) => id)).toEqual(["overview", "needs-attention"]);
    expect(resolveCapabilityBreadcrumbKey("/attention", projection)).toBe(
      "navigation:NEEDS_ATTENTION",
    );
    expect(projection.primaryDestinations.map(({ id }) => id)).toEqual([
      "overview",
      "needs-attention",
    ]);
  });

  it("marks an incomplete operations-signals candidate as partial", () => {
    const projection = projectCapabilityNavigation([
      operationsSignalsRecord([
        "platform:operations-signals:claim",
      ] satisfies PlatformPermissionCode[]),
    ]);

    expect(projection.destinations.map(({ id }) => id)).toEqual(["overview"]);
    expect(projection.omittedRouteTargets).toEqual(["operations.signals"]);
    expect(projection.isPartial).toBe(true);
  });

  it("rejects duplicate navigation targets instead of silently merging authority", () => {
    expect(() =>
      projectCapabilityNavigation([
        capabilityRecord("tenants.workspaces", ["tenants.workspaces"]),
        capabilityRecord("tenants.workspaces", ["tenants.workspaces"]),
      ]),
    ).toThrow("Duplicate Platform navigation target: tenants.workspaces");
  });
});
