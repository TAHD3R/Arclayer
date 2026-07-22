import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemObservabilityOverviewPage } from "@/pages/system/observability/overview/page";

const { overviewHook, trendHook } = vi.hoisted(() => ({
  overviewHook: vi.fn(),
  trendHook: vi.fn(),
}));

vi.mock("@/pages/system/observability/hooks", () => ({
  useSystemObservabilityOverview: (...args: unknown[]) => overviewHook(...args),
  useSystemObservabilityTrend: (...args: unknown[]) => trendHook(...args),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));
vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({ action, children }: { action?: React.ReactNode; children?: React.ReactNode }) => (
    <main>
      {action}
      {children}
    </main>
  ),
}));
vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/pages/system/observability/components/page-controls", () => ({
  ObservabilityPageControls: ({ days, onRefresh }: { days: number; onRefresh: () => void }) => (
    <button onClick={onRefresh}>refresh:{days}</button>
  ),
}));
vi.mock("@/pages/system/observability/components/dashboard-layout", () => ({
  ConfigurableDashboard: ({
    widgets,
    ariaLabel,
  }: {
    widgets: Array<{ id: string; content: React.ReactNode }>;
    ariaLabel: string;
  }) => (
    <section aria-label={ariaLabel}>
      {widgets.map((widget) => (
        <div key={widget.id}>{widget.content}</div>
      ))}
    </section>
  ),
}));
vi.mock("@/pages/system/observability/components/metric-card", () => ({
  ObservabilityMetricCard: ({ label, value }: { label: string; value: string }) => (
    <div>
      {label}:{value}
    </div>
  ),
}));
vi.mock("@/pages/system/observability/components/trend-card", () => ({
  ObservabilityTrendCard: ({
    title,
    points,
  }: {
    title: string;
    points?: Array<{ value: number }>;
  }) => (
    <div>
      trend:{title}:{points?.[0]?.value ?? "none"}
    </div>
  ),
}));

const OVERVIEW = {
  http: { errorRate: 0.02, avgLatencyMs: 120 },
  ai: { errorRate: 0.03, p95LatencyMs: 800, costMicros: 2_500_000 },
  operations: { openFeedback: 7, activeSubscriptions: 11 },
  resources: { activeWorkspaces: 12 },
};

function queryResult(data: unknown, refetch = vi.fn().mockResolvedValue(undefined)) {
  return {
    data,
    error: null,
    isLoading: false,
    isFetching: false,
    refetch,
  };
}

describe("SystemObservabilityOverviewPage", () => {
  const overviewRefetch = vi.fn().mockResolvedValue(undefined);
  const trendRefetches = new Map<string, ReturnType<typeof vi.fn>>();

  beforeEach(() => {
    vi.clearAllMocks();
    trendRefetches.clear();
    overviewHook.mockReturnValue(queryResult(OVERVIEW, overviewRefetch));
    trendHook.mockImplementation((_days: number, metric: string) => {
      const refetch = vi.fn().mockResolvedValue(undefined);
      trendRefetches.set(metric, refetch);
      return queryResult(
        metric === "auditEvents" ? undefined : { points: [{ date: "2026-07-12", value: 1 }] },
        refetch,
      );
    });
  });

  it("combines health and commercial widgets with four live trends", () => {
    render(<SystemObservabilityOverviewPage />);

    expect(overviewHook).toHaveBeenCalledWith(30);
    expect(trendHook.mock.calls).toEqual([
      [30, "httpErrors"],
      [30, "errors"],
      [30, "cost"],
      [30, "auditEvents"],
    ]);
    expect(
      screen.getByRole("region", { name: "OBSERVABILITY_OVERVIEW_TITLE" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/METRIC_OPEN_FEEDBACK:7/)).toBeInTheDocument();
    expect(screen.getByText("trend:TREND_HTTP_ERRORS:1")).toBeInTheDocument();
    expect(screen.getByText("trend:TREND_ERRORS:1")).toBeInTheDocument();
    expect(screen.getByText("trend:TREND_COST:1")).toBeInTheDocument();
    expect(screen.getByText("trend:TREND_AUDIT_EVENTS:none")).toBeInTheDocument();
  });

  it("refreshes the overview and every trend query together", async () => {
    const user = userEvent.setup();
    render(<SystemObservabilityOverviewPage />);

    await user.click(screen.getByRole("button", { name: "refresh:30" }));

    await waitFor(() => {
      expect(overviewRefetch).toHaveBeenCalledOnce();
      expect([...trendRefetches.values()]).toHaveLength(4);
      for (const refetch of trendRefetches.values()) expect(refetch).toHaveBeenCalledOnce();
    });
  });
});
