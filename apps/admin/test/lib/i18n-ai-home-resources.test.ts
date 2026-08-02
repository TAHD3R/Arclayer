import { describe, expect, it } from "vitest";

import { i18nResources } from "@/lib/i18n/resources";

const REQUIRED_AI_HOME_KEYS = [
  "AI_CHAT_PLACEHOLDER_CREATE_SITE",
  "AI_CHAT_PLACEHOLDER_COMMAND_OR_SKILL",
  "AI_CHAT_HOME_PRODUCT_PROMISE",
  "AI_CHAT_HOME_STARTER_WEBSITE",
  "AI_CHAT_HOME_STARTER_WEBSITE_PROMPT_1",
  "AI_CHAT_MENTION_TITLE",
  "AI_CHAT_COMMAND_MENU_TITLE",
  "AI_CHAT_SKILL_MANAGE",
] as const;

const REQUIRED_AI_ERROR_KEYS = [
  "AI_CHAT_MODEL_LOAD_FAILED",
  "AI_CHAT_MODEL_EMPTY",
  "AI_CHAT_ERROR_GENERIC",
  "AI_CHAT_ERROR_AUTH_NO_KEY",
  "AI_CHAT_ERROR_AUTH_NOT_WORKSPACE_MEMBER",
  "AI_CHAT_ERROR_AGENT_PROJECT_CONTEXT_REQUIRED",
  "AI_CHAT_ERROR_AGENT_APPROVAL_PROJECT_CONTEXT_REQUIRED",
  "AI_CHAT_ERROR_SKILL_SELECTION_INVALID",
  "AI_CHAT_ERROR_WORKSPACE_ACTION_PLAN_MODE_READ_ONLY",
  "AI_CHAT_ERROR_WORKSPACE_ACTION_PROJECT_REQUIRED",
  "AI_CHAT_ERROR_MODEL_CATALOG_UNAVAILABLE",
  "AI_CHAT_ERROR_MODEL_CATALOG_MASTER_KEY_REQUIRED",
  "AI_CHAT_ERROR_MODEL_CATALOG_EMPTY",
  "AI_CHAT_ERROR_MODEL_CATALOG_LITELLM_UNREACHABLE",
  "AI_CHAT_ERROR_MODEL_CATALOG_RESPONSE_INVALID",
] as const;

const AI_UNAVAILABLE_ERROR_KEYS = [
  "AI_CHAT_MODEL_LOAD_FAILED",
  "AI_CHAT_MODEL_EMPTY",
  "AI_CHAT_ERROR_GENERIC",
  "AI_CHAT_ERROR_AUTH_NO_KEY",
  "AI_CHAT_ERROR_AUTH_NOT_WORKSPACE_MEMBER",
  "AI_CHAT_ERROR_MODEL_CATALOG_UNAVAILABLE",
  "AI_CHAT_ERROR_MODEL_CATALOG_MASTER_KEY_REQUIRED",
  "AI_CHAT_ERROR_MODEL_CATALOG_EMPTY",
  "AI_CHAT_ERROR_MODEL_CATALOG_LITELLM_UNREACHABLE",
  "AI_CHAT_ERROR_MODEL_CATALOG_RESPONSE_INVALID",
] as const;

const FORBIDDEN_PRODUCT_AI_ERROR_COPY =
  /LiteLLM|mock|System Settings|system settings|系统设置|平台管理|Platform (?:Console|administration|management)/i;

describe("AI Home i18n resources", () => {
  it.each(["zh-CN", "en-US"] as const)("contains visible copy for %s", (locale) => {
    const resources = i18nResources[locale].ai;

    for (const key of REQUIRED_AI_HOME_KEYS) {
      expect(resources[key]).toEqual(expect.any(String));
      expect(resources[key]).not.toBe(key);
    }
  });

  it.each(["zh-CN", "en-US"] as const)("keeps AI error copy product-facing for %s", (locale) => {
    const resources = i18nResources[locale].ai;

    for (const key of REQUIRED_AI_ERROR_KEYS) {
      expect(resources[key]).toEqual(expect.any(String));
      expect(resources[key]).not.toBe(key);
      expect(resources[key]).not.toMatch(FORBIDDEN_PRODUCT_AI_ERROR_COPY);
    }

    for (const key of AI_UNAVAILABLE_ERROR_KEYS) {
      const message = resources[key];
      expect(message).toContain(locale === "zh-CN" ? "当前工作区" : "this workspace");
      expect(message).toMatch(
        locale === "zh-CN" ? /稍后重试|联系支持/ : /Try again later|contact support/,
      );
    }
  });
});
