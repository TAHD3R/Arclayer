import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ObservabilityTrendCard } from "@/pages/system/observability/components/trend-card";

const { reducedMotion } = vi.hoisted(() => ({ reducedMotion: { value: false } }));

vi.mock("@/hooks/use-prefers-reduced-motion", () => ({
  usePrefersReducedMotion: () => reducedMotion.value,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (typeof values?.title === "string") return `${key}:${values.title}`;
      if (typeof values?.date === "string") return `${key}:${values.date}`;
      if (typeof values?.current === "number" && typeof values?.total === "number") {
        return `${key}:${values.current}/${values.total}`;
      }
      return key;
    },
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));
vi.mock("@arclayer/ui/skeleton", () => ({
  Skeleton: () => <div role="status">trend loading</div>,
}));
vi.mock("@arclayer/ui/chart", () => ({
  AreaChart: ({
    children,
    animationDuration,
    yDomainTween,
  }: {
    children?: React.ReactNode;
    animationDuration?: number;
    yDomainTween?: boolean;
  }) => (
    <div
      data-testid="trend-chart"
      data-animation-duration={animationDuration}
      data-y-domain-tween={String(yDomainTween)}
    >
      {children}
    </div>
  ),
  Area: ({ animate }: { animate?: boolean }) => (
    <div data-testid="trend-area" data-animate={String(animate)} />
  ),
  Grid: () => null,
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
  XAxis: () => null,
}));

const BASE_PROPS = {
  title: "Requests",
  description: "Last 30 days",
  loading: false,
  error: null,
  onRetry: vi.fn(),
  valueKind: "count" as const,
  expectedBucketCount: 30,
};

describe("ObservabilityTrendCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reducedMotion.value = false;
  });

  it("renders explicit loading, error retry, and empty states", async () => {
    const { rerender } = render(<ObservabilityTrendCard {...BASE_PROPS} loading />);
    expect(screen.getByRole("status")).toHaveTextContent("trend loading");

    const retry = vi.fn();
    rerender(
      <ObservabilityTrendCard {...BASE_PROPS} error={new Error("network")} onRetry={retry} />,
    );
    expect(screen.getByText("common:REQUEST_FAILED")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "common:RETRY" }));
    expect(retry).toHaveBeenCalledTimes(1);

    rerender(<ObservabilityTrendCard {...BASE_PROPS} points={[]} />);
    expect(screen.getByText("TREND_EMPTY_TITLE")).toBeInTheDocument();
  });

  it("publishes exact live points as an accessible data table and chart", () => {
    render(
      <ObservabilityTrendCard
        {...BASE_PROPS}
        points={[
          { date: "2026-07-01", value: 1234 },
          { date: "2026-07-02", value: 9876 },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "Requests. TREND_OPEN_DETAIL" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "TREND_TABLE_CAPTION:Requests" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("Jul 1");
    expect(rows[1]).toHaveTextContent("1,234");
    expect(rows[2]).toHaveTextContent("9,876");
  });

  it("opens exact point detail from the keyboard", async () => {
    const user = userEvent.setup();
    render(
      <ObservabilityTrendCard
        {...BASE_PROPS}
        points={[
          { date: "2026-07-01", value: 12 },
          { date: "2026-07-02", value: 34 },
        ]}
      />,
    );

    const chart = screen.getByRole("button", { name: "Requests. TREND_OPEN_DETAIL" });
    chart.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Jul 2");
    expect(dialog).toHaveTextContent("34");
    expect(dialog).toHaveTextContent("TREND_DETAIL_NEARBY_POINTS");
    expect(dialog).toHaveTextContent("TREND_DETAIL_PERIOD_SUMMARY");
    expect(dialog).toHaveTextContent("TREND_DETAIL_PREVIOUS_VALUE");
    expect(dialog).toHaveTextContent("TREND_DETAIL_CHANGE");
    expect(dialog).toHaveTextContent("TREND_DETAIL_COVERAGE_VALUE:2/30");
  });

  it("explains zero baselines and omits meaningless latency totals", async () => {
    const user = userEvent.setup();
    render(
      <ObservabilityTrendCard
        {...BASE_PROPS}
        valueKind="latency"
        expectedBucketCount={14}
        points={[
          { date: "2026-07-01", value: 0 },
          { date: "2026-07-02", value: 24 },
        ]}
      />,
    );

    const chart = screen.getByRole("button", { name: "Requests. TREND_OPEN_DETAIL" });
    chart.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("TREND_DETAIL_ZERO_BASELINE");
    expect(dialog).toHaveTextContent("TREND_DETAIL_COVERAGE_VALUE:2/14");
    expect(within(dialog).queryByText("TREND_DETAIL_TOTAL")).not.toBeInTheDocument();
  });

  it("disables chart motion when reduced motion is requested", () => {
    reducedMotion.value = true;
    const { rerender } = render(
      <ObservabilityTrendCard {...BASE_PROPS} points={[{ date: "2026-07-01", value: 1 }]} />,
    );
    expect(screen.getByTestId("trend-chart")).toHaveAttribute("data-animation-duration", "0");
    expect(screen.getByTestId("trend-chart")).toHaveAttribute("data-y-domain-tween", "false");
    expect(screen.getByTestId("trend-area")).toHaveAttribute("data-animate", "false");

    reducedMotion.value = false;
    rerender(
      <ObservabilityTrendCard {...BASE_PROPS} points={[{ date: "2026-07-01", value: 1 }]} />,
    );
    expect(screen.getByTestId("trend-chart")).toHaveAttribute("data-animation-duration", "180");
    expect(screen.getByTestId("trend-chart")).toHaveAttribute("data-y-domain-tween", "true");
    expect(screen.getByTestId("trend-area")).toHaveAttribute("data-animate", "true");
  });
});
