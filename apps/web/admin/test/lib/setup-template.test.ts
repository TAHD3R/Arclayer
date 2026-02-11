import { describe, expect, test } from "vitest";

import { applyWorkspaceTemplatePreset } from "@/lib/setup-template";

describe("applyWorkspaceTemplatePreset", () => {
  test("applies blog template defaults", () => {
    const next = applyWorkspaceTemplatePreset({
      templateKey: "blog",
      organizationName: "Acme",
      siteUrl: "https://demo.local",
      t: (key) => {
        const map: Record<string, string> = {
          "setup:SETUP_TEMPLATE_BLOG_WORKSPACE": "Acme Blog Workspace",
          "setup:SETUP_TEMPLATE_BLOG_SITE": "Acme Blog",
          "setup:SETUP_TEMPLATE_BLOG_DESC": "Blog default description",
        };
        return map[key] || key;
      },
    });

    expect(next.templateKey).toBe("blog");
    expect(next.workspaceName).toBe("Acme Blog Workspace");
    expect(next.siteName).toBe("Acme Blog");
    expect(next.siteUrl).toBe("https://demo.local");
    expect(next.siteDescription).toBe("Blog default description");
  });

  test("applies blank template defaults", () => {
    const next = applyWorkspaceTemplatePreset({
      templateKey: "blank",
      organizationName: "Celestial",
      siteUrl: "https://demo.local",
      t: (key) => {
        const map: Record<string, string> = {
          "setup:SETUP_TEMPLATE_BLANK_WORKSPACE": "Celestial Workspace",
          "setup:SETUP_TEMPLATE_BLANK_SITE": "Celestial Site",
          "setup:SETUP_TEMPLATE_BLANK_DESC": "",
        };
        return map[key] || key;
      },
    });

    expect(next.templateKey).toBe("blank");
    expect(next.workspaceName).toBe("Celestial Workspace");
    expect(next.siteName).toBe("Celestial Site");
    expect(next.siteDescription).toBe("");
  });
});
