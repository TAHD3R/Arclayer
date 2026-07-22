import { describe, expect, it } from "vitest";

import { SETTINGS_WORKSPACE_NAV_ITEMS } from "@/constants/menu/settings";
import { SETTINGS_SCREENS } from "@/lib/settings/settings-screen";
import { WORKSPACE_SETTINGS_OVERLAY_ITEMS } from "@/pages/usercenter/shared/usercenter-overlay-registry";

describe("workspace settings screen registry", () => {
  it("keeps the Workspace Skills menu and overlay on the same typed screen", () => {
    expect(SETTINGS_SCREENS).toContain("workspace.skills");
    expect(
      SETTINGS_WORKSPACE_NAV_ITEMS.find((item) => item.screen === "workspace.skills"),
    ).toMatchObject({
      labelKey: "account:SETTINGS_NAV_WORKSPACE_SKILLS",
    });
    expect(
      WORKSPACE_SETTINGS_OVERLAY_ITEMS.find((item) => item.screen === "workspace.skills"),
    ).toMatchObject({
      titleKey: "settings:SETTINGS_WORKSPACE_SKILLS_TITLE",
      descriptionKey: "settings:SETTINGS_WORKSPACE_SKILLS_DESC",
    });
  });
});
