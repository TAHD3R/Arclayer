import { beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, initI18n, i18n } from "@/lib/i18n";

beforeAll(async () => {
  await initI18n(DEFAULT_LOCALE);
});

describe("i18n resources", () => {
  it("loads nav namespace so blocked menu tooltips do not show raw keys", async () => {
    const key = "nav:MENU_BLOCKED_GENERIC";
    expect(i18n.t(key)).not.toBe("MENU_BLOCKED_GENERIC");

    const msg = i18n.t("nav:MENU_BLOCKED_MISSING_PERMISSION", {
      permissionName: "插件管理",
    });
    expect(msg).toContain("插件管理");
    expect(msg).not.toContain("MENU_BLOCKED_MISSING_PERMISSION");

    const fallback = i18n.t("nav:MENU_BLOCKED_MISSING_PERMISSION_FALLBACK");
    expect(fallback).not.toBe("MENU_BLOCKED_MISSING_PERMISSION_FALLBACK");
  });

  it("supports switching to en-US for nav blocked-menu translations", async () => {
    await i18n.changeLanguage("en-US");
    expect(i18n.t("nav:MENU_BLOCKED_GENERIC")).toBeTruthy();
    expect(i18n.t("nav:MENU_BLOCKED_GENERIC")).not.toBe("MENU_BLOCKED_GENERIC");
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });
});
