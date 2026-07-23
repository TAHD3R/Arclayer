import { Gauge } from "lucide-react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ObservabilityMetricCard } from "@/pages/system/observability/components/metric-card";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === "METRIC_OPEN_DETAIL") return `Open ${values?.label}`;
      if (key === "METRIC_DETAIL_PERIOD_VALUE") {
        return `${values?.start} to ${values?.end}; ${values?.days} days`;
      }
      return key;
    },
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

describe("ObservabilityMetricCard", () => {
  it("opens a domain detail Drawer with period, interpretation, coverage, and related facts", async () => {
    const user = userEvent.setup();
    render(
      <ObservabilityMetricCard
        label="HTTP P99 latency"
        value="842 ms"
        icon={Gauge}
        detail={{
          definition: "99 percent of retained requests completed within this duration.",
          period: { startDate: "2026-07-01", endDate: "2026-07-14", days: 14 },
          interpretation: "P99 is 4.2 times the average latency.",
          coverage: "Based on 12,480 retained request records.",
          source: "Sanitized request records and retained raw durations.",
          relatedFacts: [
            { label: "HTTP requests", value: "12.5K" },
            { label: "Average latency", value: "200 ms" },
          ],
        }}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Open HTTP P99 latency" });
    trigger.focus();
    await user.keyboard("{Enter}");

    const drawer = await screen.findByRole("dialog");
    expect(drawer).toHaveTextContent("HTTP P99 latency");
    expect(drawer).toHaveTextContent("842 ms");
    expect(drawer).toHaveTextContent(
      "99 percent of retained requests completed within this duration.",
    );
    expect(drawer).toHaveTextContent("Jul 1, 2026 to Jul 14, 2026; 14 days");
    expect(drawer).toHaveTextContent("P99 is 4.2 times the average latency.");
    expect(drawer).toHaveTextContent("Based on 12,480 retained request records.");
    expect(drawer).toHaveTextContent("Sanitized request records and retained raw durations.");
    expect(within(drawer).getByText("12.5K")).toBeInTheDocument();
    expect(within(drawer).getByText("200 ms")).toBeInTheDocument();
    expect(drawer).not.toHaveTextContent("METRIC_CURRENT_VALUE");
  });
});
