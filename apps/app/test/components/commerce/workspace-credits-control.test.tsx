import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWorkspaceCommerceOverview } from "@/api/commerce";
import { WorkspaceCreditsControl } from "@/components/commerce/workspace-credits-control";
import {
  SettingsScreenProvider,
  useSettingsScreen,
} from "@/components/layout/settings-screen-provider";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

vi.mock("@/api/commerce", () => ({ getWorkspaceCommerceOverview: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}:${Object.values(values).join(":")}` : key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

function createOverview() {
  return {
    planRevision: {
      id: "revision-1",
      planId: "plan-1",
      planCode: "premium",
      sequence: 2,
      nameI18NKey: "commerce:PLAN_PREMIUM_NAME",
      descriptionI18NKey: "commerce:PLAN_PREMIUM_DESCRIPTION",
      entitlements: [],
      prices: [],
      resourceAllowances: [],
      creditGrantAmount: 10_000,
      creditRefreshInterval: "monthly" as const,
      creditValueMicros: 1_000,
      currency: "USD",
      isSelling: true,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    },
    subscription: {
      id: "subscription-1",
      planRevisionId: "revision-1",
      subscriptionRevision: 1,
      status: "active" as const,
      billingCycle: "monthly" as const,
      currentPeriodStart: "2026-07-01T00:00:00Z",
      currentPeriodEnd: "2026-08-01T00:00:00Z",
      cancelAtPeriodEnd: false,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    },
    credits: {
      accountRevision: 1,
      balance: 8_000,
      reserved: 250,
      available: 7_750,
      periodStart: "2026-07-01T00:00:00Z",
      periodEnd: "2026-08-01T00:00:00Z",
      nextRefreshAt: "2026-08-01T00:00:00Z",
    },
    usage: {
      periodCostMicros: 2_000_000,
      requests: 24,
      promptTokens: 1_000,
      completionTokens: 500,
    },
  };
}

function SettingsStateProbe() {
  const settings = useSettingsScreen();
  return settings.state.open ? (
    <div data-testid="settings-screen">{settings.state.screen}</div>
  ) : null;
}

function renderControl(compactOnMobile = false) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SettingsScreenProvider>
        <WorkspaceCreditsControl compactOnMobile={compactOnMobile} />
        <SettingsStateProbe />
      </SettingsScreenProvider>
    </QueryClientProvider>,
  );
}

describe("WorkspaceCreditsControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      lastWorkspaceId: "workspace-1",
    });
  });

  it("does not request commerce data without a workspace", () => {
    useWorkspaceStore.setState({ currentWorkspaceId: null, lastWorkspaceId: null });
    expect(renderControl().container).toBeEmptyDOMElement();
    expect(getWorkspaceCommerceOverview).not.toHaveBeenCalled();
  });

  it("renders a loading skeleton while pending", () => {
    vi.mocked(getWorkspaceCommerceOverview).mockReturnValue(new Promise(() => undefined));
    renderControl();
    expect(screen.getByLabelText("commerce:CREDITS_LOADING")).toBeInTheDocument();
  });

  it("shows typed credit balances and opens Plan & Usage", async () => {
    const user = userEvent.setup();
    vi.mocked(getWorkspaceCommerceOverview).mockResolvedValue(createOverview());
    renderControl(true);
    const trigger = await screen.findByLabelText("commerce:CREDITS_BUTTON_LABEL:7,750");
    expect(trigger).toHaveClass("max-[768px]:[&>span:not(.sr-only)]:hidden");
    await user.hover(trigger);
    expect(await screen.findByText("commerce:PLAN_PREMIUM_NAME")).toBeInTheDocument();
    expect(screen.getByText("commerce:CREDITS_BALANCE")).toBeInTheDocument();
    expect(screen.getByText("commerce:CREDITS_RESERVED")).toBeInTheDocument();
    expect(screen.getByText("8,000")).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "commerce:LEDGER_VIEW_ACTION" }));
    expect(screen.getByTestId("settings-screen")).toHaveTextContent("workspace.plan-usage");
  });

  it("keeps an explicit retry action after a failed request", async () => {
    const user = userEvent.setup();
    vi.mocked(getWorkspaceCommerceOverview)
      .mockRejectedValueOnce(new Error("commerce unavailable"))
      .mockResolvedValueOnce(createOverview());
    renderControl();
    const trigger = await screen.findByLabelText("commerce:CREDITS_UNAVAILABLE");
    await user.hover(trigger);
    await user.click(await screen.findByRole("button", { name: "commerce:CREDITS_RETRY" }));
    await waitFor(() => expect(getWorkspaceCommerceOverview).toHaveBeenCalledTimes(2));
  });
});
