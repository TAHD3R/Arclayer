import { beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, initI18n, i18n } from "@/lib/i18n";

beforeAll(async () => {
  await initI18n(DEFAULT_LOCALE);
});

describe("assets i18n", () => {
  it("uses a localized zh-CN label for the display name field", async () => {
    expect(i18n.t("assets:ASSET_EDIT_ALT_NAME")).toBe("显示名称");
    expect(i18n.t("assets:ASSET_EDIT_ALT_NAME_HELP")).toBe(
      "添加清晰的显示名称，方便在搭建页面或管理内容时找到此资源。",
    );
    expect(i18n.t("assets:ASSET_EDIT_ALT_NAME_TOOLTIP")).toBe(
      "原文件名通常来自上传文件。显示名称可帮助编辑者在选择、替换或插入资源时快速识别它。",
    );
    expect(i18n.t("assets:ASSET_PURPOSE_ARTICLE_COVER")).toBe("内容封面");

    await i18n.changeLanguage("en-US");
    expect(i18n.t("assets:ASSET_EDIT_ALT_NAME")).toBe("Display name");
    expect(i18n.t("assets:ASSET_EDIT_ALT_NAME_HELP")).toBe(
      "Add a clear display name so this asset is easier to find when people build pages or manage content.",
    );
    expect(i18n.t("assets:ASSET_EDIT_ALT_NAME_TOOLTIP")).toBe(
      "Original filenames usually come from the uploaded file. The display name helps editors identify this asset when they choose, replace, or insert it.",
    );
    expect(i18n.t("assets:ASSET_PURPOSE_ARTICLE_COVER")).toBe("Content cover");
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });
});
