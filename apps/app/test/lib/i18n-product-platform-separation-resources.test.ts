import { describe, expect, it } from "vitest";

import { i18nResources } from "@/lib/i18n/resources";

const REQUIRED_COPY = {
  account: ["OPEN_PLATFORM_CONSOLE", "ACCOUNT_MENU_PLATFORM_CONFIGURATION_ERROR"],
  nav: [
    "NAV_SECTION_CUSTOMIZATION",
    "NAV_CUSTOMIZATION_KNOWLEDGE",
    "NAV_CUSTOMIZATION_SKILLS",
    "NAV_CUSTOMIZATION_DESIGN_SYSTEMS",
  ],
  settings: [
    "CUSTOMIZATION_KNOWLEDGE_TITLE",
    "CUSTOMIZATION_SKILLS_TITLE",
    "CUSTOMIZATION_DESIGN_SYSTEMS_TITLE",
    "CUSTOMIZATION_WORKSPACE_REQUIRED_TITLE",
  ],
  workspaceAccess: [
    "FIXED_MEMBER_ACCESS",
    "ROLES_PAID_FEATURE_TITLE",
    "ROLES_PAID_FEATURE_DESCRIPTION",
    "OWNER_AUTHORITY_DESCRIPTION",
    "ROLES_ELIGIBLE_PLAN_BADGE",
  ],
} as const;
const FORBIDDEN_PRODUCT_ERROR_KEY = /^(?:PLATFORM_|SYS_)/;

describe("Product and Platform separation copy", () => {
  it.each(["zh-CN", "en-US"] as const)("contains stable visible copy for %s", (locale) => {
    const resources = i18nResources[locale];

    for (const [namespace, keys] of Object.entries(REQUIRED_COPY)) {
      const messages = resources[namespace as keyof typeof REQUIRED_COPY];
      for (const key of keys) {
        expect(messages[key as keyof typeof messages]).toEqual(expect.any(String));
        expect(messages[key as keyof typeof messages]).not.toBe(key);
      }
    }
  });

  it.each(["zh-CN", "en-US"] as const)(
    "does not bundle Platform or System error copy for %s",
    (locale) => {
      const forbiddenKeys = Object.keys(i18nResources[locale].errors).filter((key) =>
        FORBIDDEN_PRODUCT_ERROR_KEY.test(key),
      );

      expect(forbiddenKeys).toEqual([]);
    },
  );
});
