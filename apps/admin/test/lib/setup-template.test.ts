import { describe, expect, test } from "vitest";

import { applyWorkspaceTemplatePreset } from "@/lib/setup-template";

describe("applyWorkspaceTemplatePreset", () => {
  test("applies blog template defaults", () => {
    const next = applyWorkspaceTemplatePreset({
      templateKey: "blog",
      displayName: "Acme",
      siteUrl: "https://demo.local",
      t: (key, params) => {
        const map: Record<string, string> = {
          "setup:SETUP_TEMPLATE_BLOG_DESC": "Blog default description",
        };
        if (key === "setup:SETUP_DEFAULT_WORKSPACE_NAME") {
          return `${String(params?.username || "")}'s Workspace`;
        }
        if (key === "setup:SETUP_DEFAULT_SITE_NAME") {
          return `${String(params?.username || "")}'s Site`;
        }
        return map[key] || key;
      },
    });

    expect(next.templateKey).toBe("blog");
    expect(next.workspaceName).toBe("Acme's Workspace");
    expect(next.siteName).toBe("Acme's Site");
    expect(next.siteUrl).toBe("https://demo.local");
    expect(next.siteDescription).toBe("Blog default description");
  });

  test("applies blank template defaults", () => {
    const next = applyWorkspaceTemplatePreset({
      templateKey: "blank",
      displayName: "Celestial",
      siteUrl: "https://demo.local",
      t: (key, params) => {
        const map: Record<string, string> = {
          "setup:SETUP_TEMPLATE_BLANK_DESC": "",
        };
        if (key === "setup:SETUP_DEFAULT_WORKSPACE_NAME") {
          return `${String(params?.username || "")}'s Workspace`;
        }
        if (key === "setup:SETUP_DEFAULT_SITE_NAME") {
          return `${String(params?.username || "")}'s Site`;
        }
        return map[key] || key;
      },
    });

    expect(next.templateKey).toBe("blank");
    expect(next.workspaceName).toBe("Celestial's Workspace");
    expect(next.siteName).toBe("Celestial's Site");
    expect(next.siteDescription).toBe("");
  });
});
