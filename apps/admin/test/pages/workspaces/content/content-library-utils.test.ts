import { describe, expect, test } from "vitest";

import {
  buildContentLibraryRows,
  buildContentSidebarCounts,
  contentHasAddress,
} from "@/pages/workspaces/content/library/utils";

describe("content-library-utils", () => {
  test("keeps model-less content rows valid for the library surface", () => {
    const rows = buildContentLibraryRows(
      [
        {
          id: "item-1",
          workspaceId: "ws-1",
          siteId: "site-1",
          slug: "formless-draft",
          title: "Formless draft",
          status: "draft",
          visibility: "private",
          locale: "en-US",
          bootstrapPresetState: "none",
          capabilityPackIds: [],
          draftVersion: 1,
          updatedAt: "2026-03-19T00:00:00Z",
        },
      ],
      [],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.modelKey).toBeUndefined();
    expect(rows[0]).toMatchObject({
      modelName: null,
      derivedStatus: "draft",
      archiveVersionNumber: 1,
    });
  });

  test("sidebar model counts ignore formless drafts", () => {
    const counts = buildContentSidebarCounts([
      {
        id: "item-1",
        workspaceId: "ws-1",
        siteId: "site-1",
        slug: "formless-draft",
        title: "Formless draft",
        status: "draft",
        visibility: "private",
        locale: "en-US",
        bootstrapPresetState: "none",
        capabilityPackIds: [],
        draftVersion: 1,
        updatedAt: new Date().toISOString(),
        name: "Formless draft",
        modelName: null,
        modelDescription: null,
        modelCapabilities: [],
        derivedStatus: "draft",
        archiveVersionNumber: 1,
        runtime: "unknown",
        context: "standalone",
      },
      {
        id: "item-2",
        workspaceId: "ws-1",
        siteId: "site-1",
        modelKey: "landing_page",
        slug: "landing-page",
        title: "Landing page",
        status: "published",
        visibility: "public",
        locale: "en-US",
        bootstrapPresetState: "selected",
        capabilityPackIds: ["routable", "publishable"],
        draftVersion: 2,
        publishedVersion: 2,
        updatedAt: new Date().toISOString(),
        name: "Landing page",
        modelName: "Landing page",
        modelDescription: null,
        modelCapabilities: ["routable", "publishable"],
        derivedStatus: "published",
        archiveVersionNumber: 2,
        runtime: "visual",
        context: "site_builder",
      },
    ]);

    expect(counts.all).toBe(2);
    expect(counts.statuses.draft).toBe(1);
    expect(counts.statuses.published).toBe(1);
    expect(counts.models).toEqual({ landing_page: 1 });
  });

  test("derives runtime and context from model metadata", () => {
    const rows = buildContentLibraryRows(
      [
        {
          id: "item-1",
          workspaceId: "ws-1",
          siteId: "site-1",
          modelId: "model-1",
          modelKey: "homepage",
          slug: "homepage",
          title: "Homepage",
          status: "published",
          visibility: "public",
          locale: "zh-CN",
          bootstrapPresetState: "selected",
          capabilityPackIds: ["publishable", "layout_bound"],
          draftVersion: 2,
          publishedVersion: 2,
          updatedAt: "2026-03-19T00:00:00Z",
        },
      ],
      [
        {
          id: "model-1",
          workspaceId: "ws-1",
          siteId: "site-1",
          key: "homepage",
          name: "Homepage",
          category: "site_builder",
          capabilities: ["visual_editable", "publishable"],
          defaultEditor: "visual",
        },
      ],
    );

    expect(rows[0]).toMatchObject({
      runtime: "visual",
      context: "site_builder",
      modelCategory: "site_builder",
    });
  });

  test("treats routable content as addressable", () => {
    expect(
      contentHasAddress({
        slug: "homepage",
        modelCapabilities: ["routable"],
        capabilityPackIds: [],
      }),
    ).toBe(true);
    expect(
      contentHasAddress({
        slug: "homepage",
        modelCapabilities: [],
        capabilityPackIds: [],
      }),
    ).toBe(false);
  });
});
