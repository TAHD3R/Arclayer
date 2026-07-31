import { describe, expect, it } from "vitest";

import { SETTINGS_WORKSPACE_NAV_ITEMS } from "@/constants/menu/settings";
import { SETTINGS_SCREENS } from "@/lib/settings/settings-screen";
import { WORKSPACE_SETTINGS_OVERLAY_ITEMS } from "@/pages/usercenter/shared/usercenter-overlay-registry";

describe("workspace settings screen registry", () => {
  it("keeps customization out of Workspace Administration", () => {
    const customizationScreens = [
      "workspace.knowledge",
      "workspace.skills",
      "workspace.design-systems",
    ];

    expect(SETTINGS_SCREENS).toEqual([
      "personal.profile",
      "personal.preferences",
      "personal.notifications",
      "workspace.general",
      "workspace.plan-usage",
      "workspace.members",
      "workspace.invitations",
      "workspace.roles",
    ]);
    expect(
      SETTINGS_WORKSPACE_NAV_ITEMS.some((item) => customizationScreens.includes(item.screen)),
    ).toBe(false);
    expect(
      WORKSPACE_SETTINGS_OVERLAY_ITEMS.some((item) => customizationScreens.includes(item.screen)),
    ).toBe(false);
  });
});
