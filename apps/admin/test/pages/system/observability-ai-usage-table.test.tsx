import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listSystemAIUsageGroups } from "@/api/platform-observability";
import { AIUsageGroupsTable } from "@/pages/system/observability/ai-usage/ai-usage-groups-table";
import type { AIUsageGroup } from "@arclayer/openapi/admin-types";

vi.mock("@/api/platform-observability", () => ({ listSystemAIUsageGroups: vi.fn() }));
vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({ formatDateTime: (value: string) => `date:${value}` }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

function renderTable(onSelect?: (group: AIUsageGroup) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AIUsageGroupsTable days={30} onSelect={onSelect} />
    </QueryClientProvider>,
  );
}

describe("system observability AI usage table", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listSystemAIUsageGroups).mockResolvedValue({
      items: [
        {
          provider: "openai",
          model: "gpt-5",
          requests: 10,
          errorRequests: 1,
          errorRate: 0.1,
          promptTokens: 1_200,
          completionTokens: 800,
          totalTokens: 2_000,
          costMicros: 3_000_000,
          avgLatencyMs: 248.75,
          lastSeenAt: "2026-07-13T02:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      size: 20,
      pages: 1,
      next: null,
      prev: null,
    });
  });

  it("renders persisted provider/model aggregates with truncation and numeric alignment", async () => {
    const user = userEvent.setup();
    renderTable();

    expect(await screen.findByText("openai")).toBeVisible();
    expect(screen.getByText("gpt-5")).toHaveClass("truncate");
    expect(screen.getByText("2,000")).toHaveClass("tabular-nums");
    expect(screen.getByText("$3.00")).toHaveClass("tabular-nums");

    await user.type(
      screen.getByRole("textbox", { name: "platform:AI_USAGE_SEARCH_PLACEHOLDER" }),
      "gpt",
    );
    await waitFor(() => {
      expect(listSystemAIUsageGroups).toHaveBeenLastCalledWith(
        expect.objectContaining({ days: 30, q: "gpt" }),
      );
    });
  });

  it("opens the selected aggregate from the table row", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderTable(onSelect);

    await user.click(await screen.findByText("gpt-5"));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "openai", model: "gpt-5" }),
    );
  });
});
