import { describe, expect, it } from "vitest";

import {
  CAPABILITY_NAVIGATION_CONTRACT_ERROR_CODE,
  CapabilityNavigationContractError,
  projectCapabilityNavigation,
  resolveCapabilityBreadcrumbKey,
  type CapabilityProjectionRecord,
} from "@/capabilities/navigation-projection";

function navigationTarget(routeTarget: string) {
  return { routeTarget, requiredViewPermissions: [], viewPermissionMatch: "all" };
}

function capabilityRecord(
  routeTarget: string,
  navigationTargets: readonly string[],
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
  requiredViewPermissions: readonly string[] = ["platform:operations-signals:read"],
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
  it("rejects a server candidate without a build-registered target", () => {
    expect(() =>
      projectCapabilityNavigation([
        capabilityRecord("tenants.workspaces", ["tenants.workspaces"]),
        capabilityRecord("https://attacker.invalid/component.js", []),
      ]),
    ).toThrow(CapabilityNavigationContractError);
    expect(() =>
      projectCapabilityNavigation([capabilityRecord("https://attacker.invalid/component.js", [])]),
    ).toThrow(
      `Unregistered Platform capability route target: https://attacker.invalid/component.js`,
    );
    try {
      projectCapabilityNavigation([capabilityRecord("https://attacker.invalid/component.js", [])]);
    } catch (error) {
      expect(error).toMatchObject({ code: CAPABILITY_NAVIGATION_CONTRACT_ERROR_CODE });
    }
  });

  it("keeps the Workspace directory authority exact", () => {
    const projection = projectCapabilityNavigation([
      capabilityRecord("tenants.workspaces", [
        "tenants.workspaces",
        "tenants.users",
        "tenants.projects",
      ]),
    ]);

    expect(projection.capabilityItems[0]?.destinations.map(({ id }) => id)).toEqual([
      "workspace-workspaces",
      "workspace-users",
      "workspace-projects",
    ]);
  });

  it.each([
    [
      "access.team",
      ["access.team", "access.roles", "access.sign-in"],
      ["access-team", "access-roles", "access-sign-in"],
    ],
    [
      "ai.tasks",
      ["ai.tasks", "ai.providers", "ai.assistants", "ai.skills", "ai.policies"],
      ["ai-tasks", "ai-providers", "ai-assistants", "ai-skills", "ai-policies"],
    ],
    [
      "site-delivery.issues",
      [
        "site-delivery.issues",
        "site-delivery.domains",
        "site-delivery.storage",
        "site-delivery.policies",
      ],
      ["hosting-issues", "hosting-domains", "hosting-storage", "hosting-policies"],
    ],
    [
      "communications.feedback",
      [
        "communications.feedback",
        "communications.deliveries",
        "communications.campaigns",
        "communications.templates",
        "communications.email",
      ],
      [
        "messages-feedback",
        "messages-deliveries",
        "messages-campaigns",
        "messages-templates",
        "messages-email",
      ],
    ],
    [
      "extensions.installed",
      [
        "extensions.installed",
        "extensions.catalog",
        "extensions.connections",
        "extensions.history",
      ],
      [
        "extensions-installed",
        "extensions-catalog",
        "extensions-connections",
        "extensions-history",
      ],
    ],
    [
      "commerce.subscriptions",
      [
        "commerce.subscriptions",
        "commerce.plans",
        "commerce.payments",
        "commerce.credits",
        "commerce.configuration",
      ],
      [
        "billing-subscriptions",
        "billing-plans",
        "billing-payments",
        "billing-credits",
        "billing-configuration",
      ],
    ],
    [
      "monitoring.requests",
      ["monitoring.requests", "monitoring.performance", "monitoring.ai-usage"],
      ["monitoring-requests", "monitoring-performance", "monitoring-ai-usage"],
    ],
    [
      "monitoring.requests",
      ["monitoring.activity", "monitoring.audit"],
      ["monitoring-activity", "monitoring-audit"],
    ],
  ] as const)(
    "keeps canonical destination authority exact for %s",
    (routeTarget, targets, expected) => {
      const projection = projectCapabilityNavigation([capabilityRecord(routeTarget, targets)]);

      expect(projection.capabilityItems[0]?.destinations.map(({ id }) => id)).toEqual(expected);
    },
  );

  it("derives breadcrumb and route authority from the same authorized destinations", () => {
    const projection = projectCapabilityNavigation([
      capabilityRecord("tenants.workspaces", [
        "tenants.workspaces",
        "tenants.users",
        "tenants.projects",
      ]),
      capabilityRecord("monitoring.requests", ["monitoring.audit"]),
    ]);

    expect(resolveCapabilityBreadcrumbKey("/users", projection)).toBe("navigation:WORKSPACES");
    expect(resolveCapabilityBreadcrumbKey("/projects", projection)).toBe("navigation:WORKSPACES");
    expect(resolveCapabilityBreadcrumbKey("/monitoring/audit", projection)).toBe(
      "navigation:MONITORING_AUDIT",
    );
    expect(resolveCapabilityBreadcrumbKey("/monitoring/audit/events/evt-1", projection)).toBe(
      "navigation:MONITORING_AUDIT",
    );
    expect(resolveCapabilityBreadcrumbKey("/attention/signal-1", projection)).toBeNull();
    expect(resolveCapabilityBreadcrumbKey("/monitoring/requests", projection)).toBeNull();
    expect(resolveCapabilityBreadcrumbKey("/operations/jobs", projection)).toBeNull();
    expect(resolveCapabilityBreadcrumbKey("/settings", projection)).toBe(
      "common:SYSTEM_SETTINGS_TITLE",
    );
  });

  it("rejects a missing trusted peer target instead of returning partial navigation", () => {
    expect(() =>
      projectCapabilityNavigation([
        capabilityRecord("commerce.subscriptions", ["commerce.unknown"]),
      ]),
    ).toThrow("Unregistered Platform capability navigation target: commerce.unknown");
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
    expect(resolveCapabilityBreadcrumbKey("/attention/signal-1", projection)).toBe(
      "navigation:NEEDS_ATTENTION",
    );
    expect(projection.primaryDestinations.map(({ id }) => id)).toEqual([
      "overview",
      "needs-attention",
    ]);
  });

  it("rejects an operations-signals candidate without its read authority", () => {
    expect(() =>
      projectCapabilityNavigation([operationsSignalsRecord(["platform:operations-signals:claim"])]),
    ).toThrow(
      "Platform capability operations-signals is missing its required trusted target permission",
    );
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
