import { describe, expect, test } from "vitest";

import { buildContentLibraryRows } from "@/pages/projects/content/library/utils";

describe("content-library-no-heuristics", () => {
  test("trusts backend workbench payload even when model metadata points somewhere else", () => {
    const rows = buildContentLibraryRows(
      [
        {
          id: "item-1",
          workspaceId: "ws-1",
          siteId: "site-1",
          modelId: "model-page",
          modelKey: "page",
          slug: "homepage",
          title: "Homepage",
          status: "draft",
          visibility: "public",
          locale: "en-US",
          bootstrapPresetKey: "page",
          bootstrapPresetState: "selected",
          capabilityPackIds: ["publishable", "layout_bound"],
          resolvedRole: "page",
          resolvedSurface: "canvas",
          derivedStatus: "changed",
          runtime: "text",
          context: "custom",
          libraryGroup: "general-content",
          editWith: "writing",
          role: "article",
          draftVersion: 3,
          publishedVersion: 2,
          updatedAt: "2026-04-04T08:00:00Z",
        },
      ],
      [
        {
          id: "model-page",
          workspaceId: "ws-1",
          siteId: "site-1",
          key: "page",
          name: "Page",
          description: "Visual page model",
          category: "site_builder",
          capabilities: ["visual_editable", "publishable", "routable"],
          defaultEditor: "visual",
        },
      ],
    );

    expect(rows).toMatchObject([
      {
        id: "item-1",
        modelName: "Page",
        modelDescription: "Visual page model",
        modelCategory: "site_builder",
        modelCapabilities: ["visual_editable", "publishable", "routable"],
        derivedStatus: "changed",
        runtime: "text",
        context: "custom",
        libraryGroup: "general-content",
        editWith: "writing",
        role: "article",
      },
    ]);
  });
});
