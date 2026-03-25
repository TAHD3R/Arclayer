import { describe, expect, test } from "vitest";

import {
  buildContentLibraryEditWithFacetOptions,
  buildContentLibraryRows,
  buildContentLibraryRoleFacetOptions,
  contentLibrarySavedViewsStorageKey,
  buildContentLibrarySystemViews,
  contentLibraryViewStorageKey,
  contentHasAddress,
  deleteContentLibrarySavedView,
  moveContentLibrarySavedView,
  parseContentLibraryViewState,
  readPersistedContentLibrarySavedViews,
  renameContentLibrarySavedView,
  readPersistedContentLibraryViewState,
  serializeContentLibraryViewState,
  togglePinnedContentLibrarySavedView,
  writePersistedContentLibrarySavedViews,
  writePersistedContentLibraryViewState,
} from "@/pages/workspaces/content/library/utils";

describe("content-library-utils", () => {
  test("exposes the agreed system preset views for the workbench", () => {
    expect(buildContentLibrarySystemViews()).toMatchObject([
      { id: "all" },
      { id: "site-content" },
      { id: "draft" },
      { id: "published" },
      { id: "needs-attention" },
    ]);
  });

  test("serializes the active workbench view for URL persistence", () => {
    const serialized = serializeContentLibraryViewState({ kind: "system", viewId: "site-content" });
    const savedSerialized = serializeContentLibraryViewState({
      kind: "saved",
      viewId: "saved-view-1",
    });

    expect(serialized).toBe("site-content");
    expect(savedSerialized).toBe("saved:saved-view-1");
    expect(parseContentLibraryViewState(serialized)).toMatchObject({
      kind: "system",
      viewId: "site-content",
    });
    expect(parseContentLibraryViewState(savedSerialized)).toMatchObject({
      kind: "saved",
      viewId: "saved-view-1",
    });
  });

  test("reads and writes persisted workbench view state", () => {
    const storageKey = contentLibraryViewStorageKey("ws-1");

    window.localStorage.removeItem(storageKey);
    expect(readPersistedContentLibraryViewState("ws-1")).toMatchObject({
      kind: "system",
      viewId: "all",
    });

    writePersistedContentLibraryViewState("ws-1", { kind: "saved", viewId: "saved-view-1" });

    expect(window.localStorage.getItem(storageKey)).toBe("saved:saved-view-1");
    expect(readPersistedContentLibraryViewState("ws-1")).toMatchObject({
      kind: "saved",
      viewId: "saved-view-1",
    });
  });

  test("reads and writes persisted saved views and supports management operations", () => {
    const storageKey = contentLibrarySavedViewsStorageKey("ws-1");

    window.localStorage.removeItem(storageKey);
    expect(readPersistedContentLibrarySavedViews("ws-1")).toEqual([]);

    writePersistedContentLibrarySavedViews("ws-1", [
      {
        id: "view-draft",
        name: "Draft pages",
        baseViewId: "draft",
        query: "home",
        filters: { modelKey: "page", role: "page", editWith: "canvas" },
        pinned: true,
      },
      {
        id: "view-published",
        name: "Published articles",
        baseViewId: "published",
        query: "launch",
        filters: { modelKey: "article", role: "article", editWith: "writing" },
        pinned: false,
      },
    ]);

    expect(readPersistedContentLibrarySavedViews("ws-1")).toMatchObject([
      {
        id: "view-draft",
        name: "Draft pages",
        pinned: true,
        filters: { role: "page", editWith: "canvas" },
      },
      {
        id: "view-published",
        name: "Published articles",
        pinned: false,
        filters: { role: "article", editWith: "writing" },
      },
    ]);

    const renamed = renameContentLibrarySavedView(
      readPersistedContentLibrarySavedViews("ws-1"),
      "view-published",
      "Published stories",
    );
    const moved = moveContentLibrarySavedView(renamed, "view-published", "up");
    const pinned = togglePinnedContentLibrarySavedView(moved, "view-published");
    const deleted = deleteContentLibrarySavedView(pinned, "view-draft");

    expect(deleted).toMatchObject([
      {
        id: "view-published",
        name: "Published stories",
        pinned: true,
      },
    ]);
  });

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
      libraryGroup: "general-content",
      editWith: "structured",
    });
  });

  test("derives libraryGroup and editWith from model metadata", () => {
    const rows = buildContentLibraryRows(
      [
        {
          id: "item-page",
          workspaceId: "ws-1",
          siteId: "site-1",
          modelId: "model-page",
          modelKey: "page",
          slug: "homepage",
          title: "Homepage",
          status: "published",
          visibility: "public",
          locale: "zh-CN",
          bootstrapPresetKey: "page",
          bootstrapPresetState: "selected",
          capabilityPackIds: ["publishable", "layout_bound"],
          draftVersion: 2,
          publishedVersion: 2,
          updatedAt: "2026-03-19T00:00:00Z",
        },
        {
          id: "item-article",
          workspaceId: "ws-1",
          siteId: "site-1",
          modelId: "model-article",
          modelKey: "article",
          slug: "launch-note",
          title: "Launch note",
          status: "draft",
          visibility: "private",
          locale: "en-US",
          bootstrapPresetKey: "post",
          bootstrapPresetState: "selected",
          capabilityPackIds: ["publishable"],
          draftVersion: 1,
          updatedAt: "2026-03-20T00:00:00Z",
        },
        {
          id: "item-person",
          workspaceId: "ws-1",
          siteId: "site-1",
          modelId: "model-person",
          modelKey: "person",
          slug: "jane-doe",
          title: "Jane Doe",
          status: "draft",
          visibility: "private",
          locale: "en-US",
          bootstrapPresetState: "none",
          capabilityPackIds: ["has_relations"],
          draftVersion: 1,
          updatedAt: "2026-03-21T00:00:00Z",
        },
      ],
      [
        {
          id: "model-page",
          workspaceId: "ws-1",
          siteId: "site-1",
          key: "page",
          name: "Page",
          category: "site_builder",
          capabilities: ["visual_editable", "publishable", "routable"],
          defaultEditor: "visual",
        },
        {
          id: "model-article",
          workspaceId: "ws-1",
          siteId: "site-1",
          key: "article",
          name: "Article",
          category: "content_library",
          capabilities: ["rich_text_editable", "publishable"],
          defaultEditor: "rich_text",
        },
        {
          id: "model-person",
          workspaceId: "ws-1",
          siteId: "site-1",
          key: "person",
          name: "Person",
          category: "custom",
          capabilities: ["queryable", "has_relations"],
          defaultEditor: "form",
        },
      ],
    );

    expect(rows).toMatchObject([
      {
        id: "item-page",
        libraryGroup: "site-content",
        editWith: "canvas",
        role: "page",
      },
      {
        id: "item-article",
        libraryGroup: "general-content",
        editWith: "writing",
        role: "article",
      },
      {
        id: "item-person",
        libraryGroup: "structured-content",
        editWith: "structured",
        role: "person",
      },
    ]);
  });

  test("exposes grouped facet options for editing surfaces and roles", () => {
    expect(buildContentLibraryEditWithFacetOptions()).toMatchObject([
      { id: "writing", labelKey: "CONTENT_LIBRARY_EDIT_WITH_WRITING" },
      { id: "canvas", labelKey: "CONTENT_LIBRARY_EDIT_WITH_CANVAS" },
      { id: "structured", labelKey: "CONTENT_LIBRARY_EDIT_WITH_STRUCTURED" },
    ]);

    expect(buildContentLibraryRoleFacetOptions()).toMatchObject([
      { id: "page", labelKey: "CONTENT_LIBRARY_ROLE_PAGE" },
      { id: "article", labelKey: "CONTENT_LIBRARY_ROLE_ARTICLE" },
      { id: "reusable-section", labelKey: "CONTENT_LIBRARY_ROLE_REUSABLE_SECTION" },
      { id: "taxonomy", labelKey: "CONTENT_LIBRARY_ROLE_TAXONOMY" },
      { id: "person", labelKey: "CONTENT_LIBRARY_ROLE_PERSON" },
      { id: "settings", labelKey: "CONTENT_LIBRARY_ROLE_SETTINGS" },
      { id: "data", labelKey: "CONTENT_LIBRARY_ROLE_DATA" },
    ]);
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
