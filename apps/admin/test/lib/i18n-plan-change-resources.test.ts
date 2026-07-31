import enPlanChange from "@locales/en-US/planChange.json";
import zhPlanChange from "@locales/zh-CN/planChange.json";
import { describe, expect, it } from "vitest";

import { I18N_NAMESPACES, i18nResources } from "@/lib/i18n/resources";

describe("plan change resources", () => {
  it("registers the namespace with exact locale parity", () => {
    expect(I18N_NAMESPACES).toContain("planChange");
    expect(i18nResources["zh-CN"].planChange).toBe(zhPlanChange);
    expect(i18nResources["en-US"].planChange).toBe(enPlanChange);
    expect(Object.keys(zhPlanChange).sort()).toEqual(Object.keys(enPlanChange).sort());
  });

  it("keeps primary copy in product language", () => {
    const copy = [...Object.values(zhPlanChange), ...Object.values(enPlanChange)].join(" ");
    expect(copy).not.toMatch(/\b(?:RBAC|Entitlement|seat|provider)\b/i);
    expect(copy).not.toContain("状态机");
    expect(copy).not.toContain("协议");
  });
});
