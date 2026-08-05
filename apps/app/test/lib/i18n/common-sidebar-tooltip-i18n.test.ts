import { beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";

beforeAll(async () => {
  await initI18n(DEFAULT_LOCALE);
});

describe("common sidebar rail tooltip i18n", () => {
  it("uses localized rail tooltip copy in zh-CN and en-US", async () => {
    expect(i18n.t("common:SIDEBAR_RAIL_TOOLTIP")).toBe("展开或收起侧边栏");
    expect(i18n.t("common:SIDEBAR_RAIL_TOOLTIP_SHORTCUT", { shortcut: "Ctrl+B" })).toBe(
      "点击或 Ctrl+B",
    );

    await i18n.changeLanguage("en-US");
    expect(i18n.t("common:SIDEBAR_RAIL_TOOLTIP")).toBe("Collapse or expand the sidebar");
    expect(i18n.t("common:SIDEBAR_RAIL_TOOLTIP_SHORTCUT", { shortcut: "⌘B" })).toBe("Click or ⌘B");
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });
});
