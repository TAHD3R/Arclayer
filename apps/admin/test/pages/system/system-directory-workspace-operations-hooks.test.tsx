import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  systemWorkspaceCommerceQueryKey,
  useSetSystemWorkspaceSubscription,
  useSystemWorkspaceCommerce,
} from "@/pages/system/directory/workspaces/workspace-operations-hooks";
import type { WorkspaceCommerceOverview } from "@/api/commerce";

const mocks = vi.hoisted(() => ({
  getOverview: vi.fn(),
  setSubscription: vi.fn(),
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/api/activity", () => ({ listSystemActivity: vi.fn() }));
vi.mock("@/api/system-directory", () => ({ listSystemDirectoryProjects: vi.fn() }));
vi.mock("@/api/commerce", () => ({
  getSystemWorkspaceCommerceOverview: mocks.getOverview,
  listSystemCommercePlans: vi.fn(),
  setSystemWorkspaceSubscription: mocks.setSubscription,
}));
vi.mock("@/lib/notifications", () => ({
  notifyError: mocks.notifyError,
  notifySuccessText: mocks.notifySuccessText,
}));

function overview(planCode = "free"): WorkspaceCommerceOverview {
  return {
    billingMode: "external_checkout",
    billingProvider: "stripe",
    checkoutEnabled: true,
    plan: {
      id: "plan-1",
      code: planCode,
      tier: planCode === "free" ? "free" : "premium",
      name: planCode === "free" ? "Free" : "Premium",
      description: "Plan",
      creditGrantAmount: planCode === "free" ? 100 : 1_000,
      creditRefreshInterval: "monthly",
      creditValueMicros: 1_000,
      priceMonthlyMicros: 0,
      priceYearlyMicros: 0,
      currency: "USD",
      features: [],
      isActive: true,
      isDefault: planCode === "free",
      sortOrder: 1,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    },
    subscription: {
      id: "subscription-1",
      status: "active",
      billingInterval: "monthly",
      currentPeriodStart: "2026-07-01T00:00:00Z",
      currentPeriodEnd: "2026-08-01T00:00:00Z",
      cancelAtPeriodEnd: false,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    },
    credits: {
      balance: 100,
      reserved: 0,
      available: 100,
      lifetimeGranted: 100,
      lifetimeSpent: 0,
      periodGranted: 100,
      periodSpent: 0,
      periodStart: "2026-07-01T00:00:00Z",
      periodEnd: "2026-08-01T00:00:00Z",
      nextRefreshAt: "2026-08-01T00:00:00Z",
    },
    usage: { periodCostMicros: 0, requests: 0, promptTokens: 0, completionTokens: 0 },
  };
}

describe("system workspace commerce hooks", () => {
  let queryClient: QueryClient;
  let wrapper: (props: { children: ReactNode }) => ReactNode;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  });

  it("loads the authoritative system workspace commerce overview", async () => {
    const current = overview();
    mocks.getOverview.mockResolvedValue(current);

    const { result } = renderHook(() => useSystemWorkspaceCommerce("workspace-1", true), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual(current));
    expect(mocks.getOverview).toHaveBeenCalledWith("workspace-1", expect.any(AbortSignal));
  });

  it("writes the mutation result into system and workspace commerce caches immediately", async () => {
    const changed = overview("premium");
    mocks.setSubscription.mockResolvedValue(changed);
    const { result } = renderHook(() => useSetSystemWorkspaceSubscription(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        workspaceId: "workspace-1",
        planCode: "premium",
        status: "active",
        billingInterval: "yearly",
        cancelAtPeriodEnd: false,
      });
    });

    expect(mocks.setSubscription).toHaveBeenCalledWith("workspace-1", {
      planCode: "premium",
      status: "active",
      billingInterval: "yearly",
      cancelAtPeriodEnd: false,
    });
    expect(queryClient.getQueryData(systemWorkspaceCommerceQueryKey("workspace-1"))).toEqual(
      changed,
    );
    expect(queryClient.getQueryData(["commerce", "workspace", "workspace-1", "overview"])).toEqual(
      changed,
    );
    expect(mocks.notifySuccessText).toHaveBeenCalledWith("commerce:API_WORKSPACE_PLAN_UPDATED");
  });
});
