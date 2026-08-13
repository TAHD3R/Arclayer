import { beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, initI18n, i18n } from "@/lib/i18n";

beforeAll(async () => {
  await initI18n(DEFAULT_LOCALE);
});

describe("auth branding i18n", () => {
  it("uses localized slogan copy for zh-CN and en-US", async () => {
    expect(i18n.t("auth:SLOGAN_TITLE")).toBe("Arclayer");
    expect(i18n.t("auth:SLOGAN_SUBTITLE")).toBe("登录后创建和管理你的站点。");
    expect(i18n.t("auth:LOGIN_SLOGAN_HEADLINE")).toBe("让想法成为作品");
    expect(i18n.t("auth:LOGIN_SLOGAN_PROMISE")).toBe("用 AI 构建内容与网站");

    await i18n.changeLanguage("en-US");
    expect(i18n.t("auth:SLOGAN_TITLE")).toBe("Arclayer");
    expect(i18n.t("auth:SLOGAN_SUBTITLE")).toBe("Sign in to create and manage your sites.");
    expect(i18n.t("auth:LOGIN_SLOGAN_HEADLINE")).toBe("Bring your ideas to life");
    expect(i18n.t("auth:LOGIN_SLOGAN_PROMISE")).toBe("Build content and websites with AI");
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });

  it("uses localized copy for login-method actions and dividers", async () => {
    expect(i18n.t("auth:OAUTH_ACCOUNT_DIVIDER")).toBe("或使用以下方式登录");
    expect(i18n.t("auth:OAUTH_REGISTER_DIVIDER")).toBe("或使用以下方式注册");
    expect(i18n.t("auth:OAUTH_METHOD_DIVIDER")).toBe("或");
    expect(i18n.t("auth:LOGIN_CONTINUE_EMAIL")).toBe("使用邮箱登录");
    expect(i18n.t("auth:LOGIN_BACK_TO_METHODS")).toBe("返回");
    expect(i18n.t("auth:CREATE_ACCOUNT")).toBe("注册");

    await i18n.changeLanguage("en-US");
    expect(i18n.t("auth:OAUTH_ACCOUNT_DIVIDER")).toBe("Or continue with");
    expect(i18n.t("auth:OAUTH_REGISTER_DIVIDER")).toBe("Or sign up with");
    expect(i18n.t("auth:OAUTH_METHOD_DIVIDER")).toBe("OR");
    expect(i18n.t("auth:LOGIN_CONTINUE_EMAIL")).toBe("Continue with email");
    expect(i18n.t("auth:LOGIN_BACK_TO_METHODS")).toBe("Go Back");
    expect(i18n.t("auth:CREATE_ACCOUNT")).toBe("Sign up");
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
