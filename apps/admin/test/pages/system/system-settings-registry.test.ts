import { describe, expect, it } from "vitest";

import { SYSTEM_SETTINGS_ITEMS } from "@/pages/system/components/system-settings-registry";

describe("system settings registry", () => {
  it("indexes all agent settings sections for settings search", () => {
    const agentItemIds = SYSTEM_SETTINGS_ITEMS.filter((item) => item.page === "agents").map(
      (item) => item.id,
    );

    expect(agentItemIds).toEqual([
      "agent-effective-posture",
      "agent-usage-governance",
      "agent-runtime",
      "agent-modes-skills",
      "agent-write-approvals",
      "agent-langgraph",
    ]);
  });
});
