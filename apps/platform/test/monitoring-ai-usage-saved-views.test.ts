import { describe, expect, it } from "vitest";

import { createMonitoringAiUsageSavedState } from "@/pages/monitoring-ai-usage";
import { validateMonitoringAiUsageSearch } from "@/routes/_authenticated/monitoring/ai-usage";
import { SAVED_VIEW_DEFINITIONS } from "@/saved-views/saved-view-contracts";

describe("AI usage monitoring Saved Views", () => {
  it("validates its typed URL search state", () => {
    expect(
      validateMonitoringAiUsageSearch({
        q: " gpt ",
        provider: " openai ",
        workspaceId: " workspace-id ",
        projectId: " project-id ",
        days: 90,
        page: "2",
      }),
    ).toEqual({
      q: "gpt",
      provider: "openai",
      workspaceId: "workspace-id",
      projectId: "project-id",
      days: 90,
      page: 2,
    });
    expect(validateMonitoringAiUsageSearch({ days: 14, page: 0, q: "   " })).toEqual({
      q: undefined,
      provider: undefined,
      workspaceId: undefined,
      projectId: undefined,
      days: undefined,
      page: undefined,
    });
  });

  it("persists only catalog-supported filters and ordering", () => {
    expect(SAVED_VIEW_DEFINITIONS.monitoringAiUsage).toMatchObject({
      capabilityId: "monitoring.ai-usage-groups",
      defaultState: { ordering: { code: "cost_micros", direction: "desc" } },
    });

    expect(
      createMonitoringAiUsageSavedState({
        q: "transient search",
        page: 3,
        days: 7,
        provider: "openai",
        workspaceId: "workspace-id",
        projectId: "project-id",
      }).filters,
    ).toEqual([
      { code: "days", value: 7 },
      { code: "provider", value: "openai" },
      { code: "workspace_id", value: "workspace-id" },
      { code: "project_id", value: "project-id" },
    ]);
  });
});
