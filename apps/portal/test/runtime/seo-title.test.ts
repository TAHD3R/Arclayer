import { describe, expect, it } from "vitest";

import { resolvePortalTitle } from "@/runtime/seo-title";

describe("Portal SEO title helpers", () => {
  it("resolvePortalTitle() composes page SEO title using the title policy (does not short-circuit)", () => {
    const title = resolvePortalTitle({
      policy: {
        parts: [
          { kind: "token", value: "pageTitle" },
          { kind: "literal", value: " - " },
          { kind: "token", value: "siteName" },
        ],
        homeMode: "siteOnly",
        dedupe: true,
      },
      pathnameNoLocale: "/test",
      pageSeoTitle: "关于我们",
      siteName: "我的站点",
    });
    expect(title).toBe("关于我们 - 我的站点");
  });

  it("resolvePortalTitle() uses homeMode=siteOnly on home page", () => {
    const title = resolvePortalTitle({
      policy: {
        parts: [
          { kind: "token", value: "pageTitle" },
          { kind: "literal", value: " - " },
          { kind: "token", value: "siteName" },
        ],
        homeMode: "siteOnly",
      },
      pathnameNoLocale: "/",
      pageSeoTitle: "首页",
      siteName: "我的站点",
    });
    expect(title).toBe("我的站点");
  });

  it("resolvePortalTitle() dedupes when pageTitle equals siteName", () => {
    const title = resolvePortalTitle({
      policy: {
        parts: [
          { kind: "token", value: "pageTitle" },
          { kind: "literal", value: " - " },
          { kind: "token", value: "siteName" },
        ],
        homeMode: "policy",
        dedupe: true,
      },
      pathnameNoLocale: "/about",
      pageSeoTitle: "My Site",
      siteName: "My Site",
    });
    expect(title).toBe("My Site");
  });
});
