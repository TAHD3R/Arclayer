import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemPlatformOverviewPage } from "@/pages/system/overview/page";

const { overviewHook, trendHook } = vi.hoisted(() => ({
  overviewHook: vi.fn(),
  trendHook: vi.fn(),
}));

vi.mock("@/pages/system/observability/hooks", () => ({
  useSystemObservabilityOverview: (...args: unknown[]) => overviewHook(...args),
  useSystemObservabilityTrend: (...args: unknown[]) => trendHook(...args),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({
    title,
    description,
    action,
    children,
  }: {
    title?: React.ReactNode;
    description?: React.ReactNode;
    action?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {action}
      {children}
    </main>
  ),
}));
vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({
    loading,
    error,
    children,
  }: {
    loading: boolean;
    error?: unknown;
    children?: React.ReactNode;
  }) =>
    loading ? <div>overview loading</div> : error ? <div>overview error</div> : <>{children}</>,
}));
vi.mock("@/pages/system/observability/components/period-select", () => ({
  ObservabilityPeriodSelect: ({ value }: { value: number }) => <div>period:{value}</div>,
}));
vi.mock("@/pages/system/observability/components/system-summary-metrics", () => ({
  SystemSummaryMetrics: ({
    overview,
  }: {
    overview: { resources: { activeWorkspaces: number } };
  }) => <div>summary-workspaces:{overview.resources.activeWorkspaces}</div>,
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
      trend:{title}:{points?.[0]?.value}
    </div>
  ),
}));

const METRIC_VALUES: Record<string, number> = {
  httpRequests: 101,
  requests: 202,
  cost: 303,
  auditEvents: 404,
};

function queryResult(data: unknown) {
  return {
    data,
    error: null,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn().mockResolvedValue(undefined),
  };
}

describe("SystemPlatformOverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    overviewHook.mockReturnValue(queryResult({ resources: { activeWorkspaces: 17 } }));
    trendHook.mockImplementation((_days: number, metric: string) =>
      queryResult({ points: [{ date: "2026-07-12", value: METRIC_VALUES[metric] }] }),
    );
  });

  it("combines the live overview with every commercial and operational trend", () => {
    render(<SystemPlatformOverviewPage />);

    expect(overviewHook).toHaveBeenCalledWith(30);
    expect(trendHook.mock.calls).toEqual([
      [30, "httpRequests"],
      [30, "requests"],
      [30, "cost"],
      [30, "auditEvents"],
    ]);
    expect(screen.getByText("summary-workspaces:17")).toBeInTheDocument();
    expect(screen.getByText("trend:TREND_HTTP_REQUESTS:101")).toBeInTheDocument();
    expect(screen.getByText("trend:TREND_REQUESTS:202")).toBeInTheDocument();
    expect(screen.getByText("trend:TREND_COST:303")).toBeInTheDocument();
    expect(screen.getByText("trend:TREND_AUDIT_EVENTS:404")).toBeInTheDocument();
  });

  it("keeps overview loading and error states explicit", () => {
    overviewHook.mockReturnValueOnce({ ...queryResult(undefined), isLoading: true });
    const { rerender } = render(<SystemPlatformOverviewPage />);
    expect(screen.getByText("overview loading")).toBeInTheDocument();

    overviewHook.mockReturnValueOnce({ ...queryResult(undefined), error: new Error("network") });
    rerender(<SystemPlatformOverviewPage />);
    expect(screen.getByText("overview error")).toBeInTheDocument();
  });
});
