import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/content", () => ({
  getContentItem: vi.fn(),
  getContentItemVersion: vi.fn(),
  getContentLibraryViews: vi.fn(),
  listAllContentItems: vi.fn(),
  listAllContentModels: vi.fn(),
  listContentItemVersions: vi.fn(),
}));

import {
  getContentItem,
  getContentItemVersion,
  getContentLibraryViews,
  listAllContentItems,
  listAllContentModels,
  listContentItemVersions,
} from "@/api/content";
import {
  CONTENT_LIBRARY_VERSION_HISTORY_PAGE_SIZE,
  buildContentLibraryArticleEditorRuntimeState,
  buildContentLibraryItemQueryKey,
  buildContentLibraryItemsQueryKey,
  buildContentLibraryModelsQueryKey,
  buildContentLibraryVersionHistoryQueryKey,
  buildContentLibraryViewsQueryKey,
  findArticleEditorPresentation,
  loadContentLibraryArticleEditorSnapshot,
  loadContentLibraryItemRuntime,
  loadContentLibraryItems,
  loadContentLibraryModels,
  loadContentLibraryVersionHistory,
  loadContentLibraryViewsState,
} from "@/pages/projects/content/library/runtime";
import type { AdminContentItem, AdminContentVersion } from "@/types/api";

describe("content-library runtime", () => {
  beforeEach(() => {
    vi.mocked(getContentItem).mockReset();
    vi.mocked(getContentItemVersion).mockReset();
    vi.mocked(getContentLibraryViews).mockReset();
    vi.mocked(listAllContentItems).mockReset();
    vi.mocked(listAllContentModels).mockReset();
    vi.mocked(listContentItemVersions).mockReset();
  });

  it("builds stable runtime query keys for content library surfaces", () => {
    expect(buildContentLibraryItemsQueryKey("ws-1")).toEqual([
      "content-library-runtime",
      "items",
      "all",
      "ws-1",
    ]);
    expect(buildContentLibraryModelsQueryKey("ws-1")).toEqual([
      "content-library-runtime",
      "models",
      "all",
      "ws-1",
    ]);
    expect(buildContentLibraryViewsQueryKey("ws-1")).toEqual([
      "content-library-runtime",
      "views",
      "ws-1",
    ]);
    expect(buildContentLibraryItemQueryKey("ws-1", "item-1")).toEqual([
      "content-library-runtime",
      "item",
      "ws-1",
      "item-1",
    ]);
    expect(buildContentLibraryVersionHistoryQueryKey("ws-1", "item-1")).toEqual([
      "content-library-runtime",
      "item",
      "ws-1",
      "item-1",
      "versions",
    ]);
  });

  it("routes loaders through the shared runtime API boundary", async () => {
    vi.mocked(listAllContentItems).mockResolvedValue([{ id: "item-1" }] as AdminContentItem[]);
    vi.mocked(listAllContentModels).mockResolvedValue([{ id: "model-1" }] as never[]);
    vi.mocked(getContentLibraryViews).mockResolvedValue({
      items: [],
      defaultViewId: null,
    } as never);
    vi.mocked(getContentItem).mockResolvedValue({ id: "item-1" } as AdminContentItem);
    vi.mocked(listContentItemVersions).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      size: CONTENT_LIBRARY_VERSION_HISTORY_PAGE_SIZE,
      pages: 0,
      next: null,
      prev: null,
    } as never);

    await expect(loadContentLibraryItems("ws-1")).resolves.toEqual([{ id: "item-1" }]);
    await expect(loadContentLibraryModels("ws-1")).resolves.toEqual([{ id: "model-1" }]);
    await expect(loadContentLibraryViewsState("ws-1")).resolves.toEqual({
      items: [],
      defaultViewId: null,
    });
    await expect(loadContentLibraryItemRuntime("ws-1", "item-1")).resolves.toEqual({
      id: "item-1",
    });
    await expect(loadContentLibraryVersionHistory("ws-1", "item-1")).resolves.toMatchObject({
      size: CONTENT_LIBRARY_VERSION_HISTORY_PAGE_SIZE,
    });

    expect(listAllContentItems).toHaveBeenCalledWith("ws-1");
    expect(listAllContentModels).toHaveBeenCalledWith("ws-1");
    expect(getContentLibraryViews).toHaveBeenCalledWith("ws-1");
    expect(getContentItem).toHaveBeenCalledWith("ws-1", "item-1");
    expect(listContentItemVersions).toHaveBeenCalledWith("ws-1", "item-1", {
      page: 1,
      size: CONTENT_LIBRARY_VERSION_HISTORY_PAGE_SIZE,
    });
  });

  it("assembles the editor snapshot from item runtime plus active versions", async () => {
    const item: AdminContentItem = {
      id: "item-1",
      workspaceId: "ws-1",
      siteId: "site-1",
      modelId: "model-1",
      modelKey: "article",
      slug: "launch-memo",
      title: "Launch memo",
      status: "draft",
      visibility: "public",
      locale: "en-US",
      bootstrapPresetState: "selected",
      capabilityPackIds: ["publishable"],
      derivedStatus: "changed",
      runtime: "text",
      context: "content_library",
      libraryGroup: "general-content",
      editWith: "writing",
      role: "article",
      draftVersion: 3,
      publishedVersion: 2,
      updatedAt: "2026-03-28T01:00:00Z",
    };
    const publishedVersion: AdminContentVersion = {
      itemId: "item-1",
      versionNumber: 2,
      state: "published",
      createdAt: "2026-03-27T10:00:00Z",
      fieldsSnapshot: { title: "Launch memo" },
      presentations: [],
      changeSummary: "Published",
    };
    const draftVersion: AdminContentVersion = {
      itemId: "item-1",
      versionNumber: 3,
      state: "draft",
      createdAt: "2026-03-28T01:00:00Z",
      fieldsSnapshot: { title: "Launch memo", summary: "Body summary" },
      presentations: [
        { kind: "form_data", payload: { title: "Launch memo" } },
        {
          kind: "rich_text_document",
          payload: { type: "doc", content: [{ type: "p", children: [{ text: "Hello" }] }] },
        },
      ],
      changeSummary: "Working draft",
    };

    vi.mocked(getContentItem).mockResolvedValue(item);
    vi.mocked(getContentItemVersion)
      .mockResolvedValueOnce(draftVersion)
      .mockResolvedValueOnce(publishedVersion);

    const snapshot = await loadContentLibraryArticleEditorSnapshot("ws-1", "item-1");

    expect(snapshot.item).toEqual(item);
    expect(snapshot.draftVersion).toEqual(draftVersion);
    expect(snapshot.publishedVersion).toEqual(publishedVersion);
    expect(snapshot.bodyPresentation?.kind).toBe("rich_text_document");
    expect(snapshot.bodyPresentation?.payload).toEqual({
      type: "doc",
      content: [{ type: "p", children: [{ text: "Hello" }] }],
    });
    expect(getContentItemVersion).toHaveBeenNthCalledWith(1, "ws-1", "item-1", 3);
    expect(getContentItemVersion).toHaveBeenNthCalledWith(2, "ws-1", "item-1", 2);
  });

  it("finds the requested editor presentation kind", () => {
    const version: AdminContentVersion = {
      itemId: "item-1",
      versionNumber: 1,
      state: "draft",
      createdAt: "2026-03-28T00:00:00Z",
      fieldsSnapshot: {},
      presentations: [
        { kind: "form_data", payload: { title: "Launch memo" } },
        { kind: "rich_text_document", payload: { type: "doc", content: [] } },
      ],
      changeSummary: null,
    };

    expect(findArticleEditorPresentation(version, "rich_text_document")?.payload).toEqual({
      type: "doc",
      content: [],
    });
    expect(findArticleEditorPresentation(version, "seo")).toBeNull();
  });

  it("builds unified article editor runtime state from document runtime truth", () => {
    const runtime = buildContentLibraryArticleEditorRuntimeState({
      autosave: {
        enabled: true,
        intervalSec: 10,
        saveOnBlur: true,
      },
      draftVersionNumber: 5,
      draftVersionState: "draft",
      hasUnsavedChanges: true,
      isLoading: false,
      isPublishing: false,
      item: {
        bootstrapPresetState: "customized",
        derivedStatus: "changed",
        publishedVersion: 3,
        shapeState: "ready",
        status: "draft",
        visibility: "public",
      },
      publishedVersionNumber: 3,
      saveError: null,
      saveState: "saved",
    });

    expect(runtime.currentView).toBe("draft");
    expect(runtime.hasPublishableVersion).toBe(true);
    expect(runtime.version).toEqual({
      draftNumber: 5,
      draftState: "draft",
      publishedNumber: 3,
    });
    expect(runtime.badges.map((item) => item.id)).toEqual([
      "changed",
      "has-draft",
      "bootstrap-customized",
      "shape-ready",
    ]);
    expect(runtime.diagnostics.map((item) => item.id)).toEqual([
      "shape-ready",
      "has-draft",
      "bootstrap-customized",
    ]);
  });
});
