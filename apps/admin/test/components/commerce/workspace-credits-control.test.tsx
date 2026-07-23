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
    t: (key: string, values?: { count?: string; plan?: string }) =>
      `${key}${values?.count ? `:${values.count}` : ""}${values?.plan ? `:${values.plan}` : ""}`,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

function createOverview() {
  return {
    billingMode: "external_checkout",
    billingProvider: "stripe",
    checkoutEnabled: true,
    plan: {
      id: "plan-1",
      code: "premium",
      tier: "premium" as const,
      name: "Premium",
      description: "Professional plan",
      creditGrantAmount: 10_000,
      creditRefreshInterval: "monthly" as const,
      creditValueMicros: 1_000,
      priceMonthlyMicros: 19_000_000,
      priceYearlyMicros: 190_000_000,
      currency: "USD",
      features: [],
      isActive: true,
      isDefault: false,
      sortOrder: 20,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    },
    subscription: {
      id: "subscription-1",
      status: "active" as const,
      billingInterval: "monthly" as const,
      currentPeriodStart: "2026-07-01T00:00:00Z",
      currentPeriodEnd: "2026-08-01T00:00:00Z",
      cancelAtPeriodEnd: false,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    },
    credits: {
      balance: 8_000,
      reserved: 250,
      available: 7_750,
      lifetimeGranted: 20_000,
      lifetimeSpent: 12_000,
      periodGranted: 10_000,
      periodSpent: 2_000,
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

function renderControl(compactOnMobile = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsScreenProvider>
        <WorkspaceCreditsControl compactOnMobile={compactOnMobile} />
        <SettingsStateProbe />
      </SettingsScreenProvider>
    </QueryClientProvider>,
  );
}

function SettingsStateProbe() {
  const settings = useSettingsScreen();
  return settings.state.open ? (
    <div data-testid="settings-screen">{settings.state.screen}</div>
  ) : null;
}

describe("WorkspaceCreditsControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      lastWorkspaceId: "workspace-1",
    });
  });

  it("renders nothing and does not request commerce data without a workspace", () => {
    useWorkspaceStore.setState({
      currentWorkspaceId: null,
      lastWorkspaceId: null,
      currentProjectId: null,
      lastProjectId: null,
    });

    const { container } = renderControl();

    expect(container).toBeEmptyDOMElement();
    expect(getWorkspaceCommerceOverview).not.toHaveBeenCalled();
  });

  it("renders a loading skeleton while the workspace credit summary is pending", () => {
    vi.mocked(getWorkspaceCommerceOverview).mockReturnValue(new Promise(() => undefined));
    renderControl();

    expect(screen.getByLabelText("commerce:CREDITS_LOADING")).toBeInTheDocument();
  });

  it("keeps the Header control icon-only on mobile when explicitly requested", async () => {
    vi.mocked(getWorkspaceCommerceOverview).mockResolvedValue(createOverview());
    renderControl(true);

    const trigger = await screen.findByLabelText("commerce:CREDITS_BUTTON_LABEL:7,750");
    expect(trigger).toHaveClass(
      "max-[768px]:[&>span:not(.sr-only)]:hidden",
      "max-[768px]:[&_[data-slot=separator]]:hidden",
    );
  });

  it("shows available credits, hover details, and opens the unified Plan & Usage screen", async () => {
    const user = userEvent.setup();
    vi.mocked(getWorkspaceCommerceOverview).mockResolvedValue(createOverview());
    renderControl();

    const trigger = await screen.findByLabelText("commerce:CREDITS_BUTTON_LABEL:7,750");
    expect(trigger.tagName).toBe("DIV");
    expect(trigger).toHaveAttribute("tabindex", "0");
    expect(trigger).toHaveAccessibleName("commerce:CREDITS_BUTTON_LABEL:7,750");
    expect(trigger).not.toHaveAccessibleName(/commerce:PLAN_UPGRADE_ACTION/);
    await user.click(trigger);
    expect(screen.queryByTestId("settings-screen")).not.toBeInTheDocument();
    await user.hover(trigger);
    expect(await screen.findByText("Premium")).toBeInTheDocument();
    expect(screen.getByText("commerce:CREDITS_BALANCE")).toBeInTheDocument();
    expect(screen.getByText("commerce:CREDITS_RESERVED")).toBeInTheDocument();
    expect(screen.getByText("commerce:CREDITS_PERIOD_SPENT")).toBeInTheDocument();
    expect(screen.getByText("8,000")).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.getByText("2,000")).toBeInTheDocument();
    expect(screen.getByText("commerce:CREDITS_PERIOD_GRANT_VALUE:10,000")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "commerce:LEDGER_VIEW_ACTION" }));
    expect(screen.getByTestId("settings-screen")).toHaveTextContent("workspace.plan-usage");
  });

  it("shows the upgrade affordance only for the Free plan", async () => {
    vi.mocked(getWorkspaceCommerceOverview).mockResolvedValue({
      ...createOverview(),
      plan: {
        ...createOverview().plan,
        code: "free",
        tier: "free",
        name: "Free",
      },
    });
    renderControl();

    const trigger = await screen.findByLabelText("commerce:CREDITS_BUTTON_LABEL:7,750");
    expect(trigger).toHaveAccessibleName("commerce:CREDITS_BUTTON_LABEL:7,750");
  });

  it("surfaces the request error and keeps an explicit retry action", async () => {
    const user = userEvent.setup();
    vi.mocked(getWorkspaceCommerceOverview)
      .mockRejectedValueOnce(new Error("commerce unavailable"))
      .mockResolvedValueOnce(createOverview());
    renderControl();

    const trigger = await screen.findByLabelText("commerce:CREDITS_UNAVAILABLE");
    await user.hover(trigger);
    expect(await screen.findByText("commerce unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "commerce:CREDITS_RETRY" }));
    await waitFor(() => expect(getWorkspaceCommerceOverview).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Premium")).toBeInTheDocument();
  });
});
