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

  it("routes storage actions to the rendered profiles section", () => {
    const storageAnchors = SYSTEM_SETTINGS_ITEMS.filter((item) => item.page === "storage").map(
      (item) => [item.id, item.anchorId ?? item.id],
    );

    expect(storageAnchors).toEqual([
      ["default-profile", "profiles"],
      ["profiles", "profiles"],
      ["create-profile", "profiles"],
      ["upload-limits", "upload-limits"],
    ]);
  });

  it("indexes only rendered notification settings sections", () => {
    const notificationItemIds = SYSTEM_SETTINGS_ITEMS.filter(
      (item) => item.page === "notifications",
    ).map((item) => item.anchorId ?? item.id);

    expect(notificationItemIds).toEqual(["notification-policy", "global-notification-broadcast"]);
  });
});
