import { describe, expect, test } from "vitest";

import { GLOBAL_NAV_ITEMS } from "@/constants/menu/global";

describe("global nav regression", () => {
  test("keeps settings as a disabled placeholder without a route target", () => {
    const settingsItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.settings");

    expect(settingsItem).toMatchObject({
      key: "global.settings",
      label: "Settings",
      disabled: true,
    });
    expect(settingsItem?.to).toBeUndefined();
  });
});
