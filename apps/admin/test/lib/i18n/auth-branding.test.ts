import { beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, initI18n, i18n } from "@/lib/i18n";

beforeAll(async () => {
  await initI18n(DEFAULT_LOCALE);
});

describe("auth branding i18n", () => {
  it("uses localized slogan copy for zh-CN and en-US", async () => {
    expect(i18n.t("auth:SLOGAN_TITLE")).toBe("Arclayer");
    expect(i18n.t("auth:SLOGAN_SUBTITLE")).toBe("结构化内容，可视化构建。");

    await i18n.changeLanguage("en-US");
    expect(i18n.t("auth:SLOGAN_TITLE")).toBe("Arclayer");
    expect(i18n.t("auth:SLOGAN_SUBTITLE")).toBe("Structured content, visually built.");
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });
});
