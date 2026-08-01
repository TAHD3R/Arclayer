import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

vi.mock("@/setup/setup-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/setup/setup-api")>();
  return {
    ...actual,
    getPlatformSetupState: vi.fn().mockResolvedValue({ status: "ready", repairReason: null }),
  };
});

vi.mock("@/capabilities/catalog-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/capabilities/catalog-api")>();
  return {
    ...actual,
    getPlatformCapabilityCatalog: vi.fn().mockResolvedValue({
      items: [
        {
          activationAvailable: false,
          canManage: true,
          capabilityId: "access",
          descriptionI18nKey: "access:PLATFORM_TEAM_DESCRIPTION",
          domain: "access",
          enablementState: "enabled",
          managePermissionMatch: "any",
          missingPrerequisiteCodes: [],
          nameI18nKey: "navigation:ACCESS_SECURITY",
          navigationCandidate: true,
          navigationTargets: [
            {
              requiredViewPermissions: ["platform:access-team:read"],
              routeTarget: "access.team",
              viewPermissionMatch: "all",
            },
          ],
          readinessState: "ready",
          requiredManagePermissions: [],
          requiredViewPermissions: ["platform:access-team:read"],
          routeTarget: "access.team",
          runtimeHealth: "not_reported",
          supportState: "supported",
          viewPermissionMatch: "all",
        },
        {
          activationAvailable: false,
          canManage: true,
          capabilityId: "tenant-governance",
          descriptionI18nKey: "tenants:WORKSPACES_DESCRIPTION",
          domain: "tenant_governance",
          enablementState: "enabled",
          managePermissionMatch: "all",
          missingPrerequisiteCodes: [],
          nameI18nKey: "navigation:WORKSPACES",
          navigationCandidate: true,
          navigationTargets: [
            {
              requiredViewPermissions: ["platform:tenant-workspaces:read"],
              routeTarget: "tenants.workspaces",
              viewPermissionMatch: "all",
            },
            {
              requiredViewPermissions: ["platform:tenant-users:read"],
              routeTarget: "tenants.users",
              viewPermissionMatch: "all",
            },
            {
              requiredViewPermissions: ["platform:tenant-projects:read"],
              routeTarget: "tenants.projects",
              viewPermissionMatch: "all",
            },
          ],
          readinessState: "ready",
          requiredManagePermissions: ["platform:tenant-workspaces:manage"],
          requiredViewPermissions: ["platform:tenant-workspaces:read"],
          routeTarget: "tenants.workspaces",
          runtimeHealth: "not_reported",
          supportState: "supported",
          viewPermissionMatch: "all",
        },
        {
          activationAvailable: false,
          canManage: false,
          capabilityId: "monitoring-audit",
          descriptionI18nKey: "monitoring:REQUESTS_DESCRIPTION",
          domain: "monitoring_audit",
          enablementState: "enabled",
          managePermissionMatch: "all",
          missingPrerequisiteCodes: [],
          nameI18nKey: "navigation:MONITORING_AUDIT",
          navigationCandidate: true,
          navigationTargets: [
            {
              requiredViewPermissions: ["platform:monitoring-requests:read"],
              routeTarget: "monitoring.requests",
              viewPermissionMatch: "all",
            },
            {
              requiredViewPermissions: ["platform:monitoring-requests:read"],
              routeTarget: "monitoring.performance",
              viewPermissionMatch: "all",
            },
            {
              requiredViewPermissions: ["platform:monitoring-requests:read"],
              routeTarget: "monitoring.ai-usage",
              viewPermissionMatch: "all",
            },
            {
              requiredViewPermissions: ["platform:monitoring-audit:read"],
              routeTarget: "monitoring.activity",
              viewPermissionMatch: "all",
            },
            {
              requiredViewPermissions: ["platform:monitoring-audit:read"],
              routeTarget: "monitoring.audit",
              viewPermissionMatch: "all",
            },
          ],
          readinessState: "ready",
          requiredManagePermissions: [],
          requiredViewPermissions: ["platform:monitoring-requests:read"],
          routeTarget: "monitoring.requests",
          runtimeHealth: "not_reported",
          supportState: "supported",
          viewPermissionMatch: "all",
        },
      ],
    }),
  };
});

vi.mock("@/operations/operations-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/operations/operations-api")>();
  return {
    ...actual,
    assignOperationalSignal: vi.fn(),
    claimOperationalSignal: vi.fn(),
    getOperationalSignal: vi.fn(),
    listOperationalSignalEligibleAssignees: vi.fn().mockResolvedValue([]),
    listOperationalSignals: vi.fn().mockResolvedValue({
      items: [],
      next: null,
      page: 1,
      pages: 1,
      prev: null,
      size: 20,
      total: 0,
    }),
    markOperationalSignalInProgress: vi.fn(),
    markOperationalSignalNeedsAttention: vi.fn(),
    remindOperationalSignalLater: vi.fn(),
  };
});

class TestResizeObserver implements ResizeObserver {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  writable: true,
  value: TestResizeObserver,
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => undefined,
});

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => undefined;
}

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
}

afterEach(() => {
  cleanup();
});
