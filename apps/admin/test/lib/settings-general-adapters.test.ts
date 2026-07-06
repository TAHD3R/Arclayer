import { describe, expect, it } from "vitest";

import { buildGeneralSettingsInitialValues } from "@/lib/settings/general/adapters";

describe("buildGeneralSettingsInitialValues", () => {
  it("maps website discovery defaults from project SEO settings", () => {
    const values = buildGeneralSettingsInitialValues({
      project: {
        namespace: "core",
        secrets: {},
        updatedAt: null,
        value: {
          seo: {
            robots_directive: "noindex,nofollow",
            sitemap_enabled: false,
          },
        },
      },
    });

    expect(values.seoIndexingEnabled).toBe(false);
    expect(values.seoSitemapEnabled).toBe(false);
  });

  it("keeps generated sites indexable and sitemap-ready by default", () => {
    const values = buildGeneralSettingsInitialValues({
      project: {
        namespace: "core",
        secrets: {},
        updatedAt: null,
        value: {},
      },
    });

    expect(values.seoIndexingEnabled).toBe(true);
    expect(values.seoSitemapEnabled).toBe(true);
  });
});
