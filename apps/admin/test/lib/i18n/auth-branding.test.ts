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

  it("uses localized separator copy for the auth oauth divider", async () => {
    expect(i18n.t("auth:OAUTH_ACCOUNT_DIVIDER")).toBe("或使用以下方式登录");

    await i18n.changeLanguage("en-US");
    expect(i18n.t("auth:OAUTH_ACCOUNT_DIVIDER")).toBe("Or continue with");
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });

  it("uses plain-language login and two-step verification copy", async () => {
    expect(i18n.t("auth:LOGIN_PAGE_TITLE")).toBe("欢迎回来");
    expect(i18n.t("auth:FIELD_EMAIL_LABEL")).toBe("电子邮箱");
    expect(i18n.t("auth:TWO_FACTOR_CODE_LABEL")).toBe("身份验证器验证码");
    expect(i18n.t("auth:TWO_FACTOR_REQUIRED")).toBe("请完成两步验证后继续。");

    await i18n.changeLanguage("en-US");
    expect(i18n.t("auth:LOGIN_PAGE_TITLE")).toBe("Welcome back");
    expect(i18n.t("auth:FIELD_EMAIL_LABEL")).toBe("Email address");
    expect(i18n.t("auth:TWO_FACTOR_CODE_LABEL")).toBe("Authenticator code");
    expect(i18n.t("auth:TWO_FACTOR_REQUIRED")).toBe("Complete two-step verification to continue.");
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });
});
