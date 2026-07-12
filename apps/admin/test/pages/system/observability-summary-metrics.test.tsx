import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SystemObservabilityOverview } from "@/api/platform-observability";
import { SystemSummaryMetrics } from "@/pages/system/observability/components/system-summary-metrics";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (values?.attributed !== undefined && values?.total !== undefined) {
        return `${key}:${values.attributed}/${values.total}`;
      }
      return key;
    },
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

const OVERVIEW: SystemObservabilityOverview = {
  period: { startDate: "2026-06-13", endDate: "2026-07-12", days: 30 },
  resources: { activeWorkspaces: 12, activeProjects: 34, activeUsers: 56 },
  http: {
    requests: 1200,
    errorRequests: 12,
    errorRate: 0.01,
    avgLatencyMs: 150,
    maxLatencyMs: 900,
  },
  ai: {
    requests: 300,
    errorRequests: 9,
    errorRate: 0.03,
    p50LatencyMs: 250,
    p95LatencyMs: 800,
    p99LatencyMs: 1300,
    promptTokens: 10_000,
    completionTokens: 15_000,
    totalTokens: 25_000,
    costMicros: 12_345_600,
  },
  operations: { auditEvents: 456, openFeedback: 7, activeSubscriptions: 11 },
  dataAvailability: {
    httpProjectAttribution: {
      supported: true,
      attributedRecords: 900,
      totalRecords: 1200,
      coverageRate: 0.75,
    },
    aiProjectAttribution: {
      supported: true,
      attributedRecords: 0,
      totalRecords: 0,
      coverageRate: 0,
    },
    auditProjectAttribution: {
      supported: true,
      attributedRecords: 228,
      totalRecords: 456,
      coverageRate: 0.5,
    },
  },
};

describe("SystemSummaryMetrics", () => {
  it("renders exact live platform, reliability, cost, and operations values", () => {
    render(<SystemSummaryMetrics overview={OVERVIEW} />);

    const scale = screen.getByRole("region", { name: "SECTION_PLATFORM_SCALE" });
    expect(within(scale).getByText("12")).toBeInTheDocument();
    expect(within(scale).getByText("34")).toBeInTheDocument();
    expect(within(scale).getByText("56")).toBeInTheDocument();

    const http = screen.getByRole("region", { name: "SECTION_HTTP_RELIABILITY" });
    expect(within(http).getByText("1.2K")).toBeInTheDocument();
    expect(within(http).getByText("1%")).toBeInTheDocument();
    expect(within(http).getByText("150 ms")).toBeInTheDocument();
    expect(within(http).getByText("900 ms")).toBeInTheDocument();

    const ai = screen.getByRole("region", { name: "SECTION_AI_EFFICIENCY" });
    expect(within(ai).getByText("3%")).toBeInTheDocument();
    expect(within(ai).getByText("25K")).toBeInTheDocument();
    expect(within(ai).getByText("$12.3456")).toBeInTheDocument();

    const operations = screen.getByRole("region", { name: "SECTION_OPERATIONS" });
    expect(within(operations).getByText("456")).toBeInTheDocument();
    expect(within(operations).getByText("7")).toBeInTheDocument();
    expect(within(operations).getByText("11")).toBeInTheDocument();
  });

  it("shows project attribution coverage and distinguishes a true no-sample period", () => {
    render(<SystemSummaryMetrics overview={OVERVIEW} />);
    const attribution = screen.getByRole("region", { name: "SECTION_PROJECT_ATTRIBUTION" });

    expect(within(attribution).getByText("75%")).toBeInTheDocument();
    expect(
      within(attribution).getByText("METRIC_ATTRIBUTION_COVERAGE_DETAIL:900/1,200"),
    ).toBeInTheDocument();
    expect(within(attribution).getByText("METRIC_NO_SAMPLES")).toBeInTheDocument();
    expect(
      within(attribution).getByText("METRIC_ATTRIBUTION_COVERAGE_DETAIL:0/0"),
    ).toBeInTheDocument();
    expect(within(attribution).getByText("50%")).toBeInTheDocument();
    expect(
      within(attribution).getByText("METRIC_ATTRIBUTION_COVERAGE_DETAIL:228/456"),
    ).toBeInTheDocument();
  });
});
