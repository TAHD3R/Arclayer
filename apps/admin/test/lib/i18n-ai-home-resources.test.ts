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

describe("AI Home i18n resources", () => {
  it.each(["zh-CN", "en-US"] as const)("contains visible copy for %s", (locale) => {
    const resources = i18nResources[locale].ai;

    for (const key of REQUIRED_AI_HOME_KEYS) {
      expect(resources[key]).toEqual(expect.any(String));
      expect(resources[key]).not.toBe(key);
    }
  });
});
