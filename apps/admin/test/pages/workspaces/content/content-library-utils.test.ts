import { describe, expect, test } from "vitest";

import {
  buildContentLibraryRows,
  buildContentSidebarCounts,
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
      },
    ]);

    expect(counts.all).toBe(2);
    expect(counts.statuses.draft).toBe(1);
    expect(counts.statuses.published).toBe(1);
    expect(counts.models).toEqual({ landing_page: 1 });
  });
});
