import enFeatureAccess from "@locales/en-US/featureAccess.json";
import zhFeatureAccess from "@locales/zh-CN/featureAccess.json";
import { describe, expect, it } from "vitest";

import { I18N_NAMESPACES, i18nResources } from "@/lib/i18n/resources";

const REQUIRED_KEYS = [
  "USAGE",
  "UNLIMITED",
  "ASSIGN",
  "REVOKE",
  "NOT_ASSIGNED_TITLE",
  "NOT_ASSIGNED_DESCRIPTION",
] as const;

describe("feature access resources", () => {
  it("registers the namespace with exact locale parity and canonical copy", () => {
    expect(I18N_NAMESPACES).toContain("featureAccess");
    expect(i18nResources["zh-CN"].featureAccess).toBe(zhFeatureAccess);
    expect(i18nResources["en-US"].featureAccess).toBe(enFeatureAccess);
    expect(Object.keys(zhFeatureAccess).sort()).toEqual(Object.keys(enFeatureAccess).sort());

    for (const key of REQUIRED_KEYS) {
      expect(zhFeatureAccess[key]).toEqual(expect.any(String));
      expect(enFeatureAccess[key]).toEqual(expect.any(String));
    }
  });

  it("uses customer language instead of internal commercial or access-control terms", () => {
    const copy = [...Object.values(zhFeatureAccess), ...Object.values(enFeatureAccess)].join(" ");

    expect(copy).not.toMatch(/\b(?:RBAC|Entitlement|seat|permission code)\b/i);
    expect(copy).not.toContain("状态机");
    expect(copy).not.toContain("协议");
    expect(copy).not.toContain("受限恢复模式");
  });
});
