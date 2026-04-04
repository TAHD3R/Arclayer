import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

import { api } from "@/lib/http";
import {
  getContentItem,
  getContentItemVersion,
  listContentItemVersions,
  patchContentItemVersion,
  publishContentItemVersion,
  saveContentItemDraftVersion,
} from "@/api/content";
import {
  findArticleEditorPresentation,
  loadContentLibraryArticleEditorSnapshot,
} from "@/pages/workspaces/content/library/article-editor/hooks/api";
import type {
  AdminContentItem,
  AdminContentPresentation,
  AdminContentVersion,
  PatchAdminContentVersionPayload,
  SaveAdminContentDraftVersionPayload,
} from "@/types/api";

describe("api/content editor version wrappers", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.patch).mockReset();
  });

  it("exposes version detail shapes needed by the article editor", () => {
    const richTextDocument: AdminContentPresentation = {
      kind: "rich_text_document",
      payload: {
        type: "doc",
        content: [{ type: "p", children: [{ text: "Hello world" }] }],
      },
    };

    const version: AdminContentVersion = {
      itemId: "item-1",
      versionNumber: 3,
      state: "draft",
      createdAt: "2026-03-27T12:00:00Z",
      createdByUserId: "user-1",
      lastTransitionByUserId: "user-1",
      fieldsSnapshot: {
        title: "Launch memo",
        summary: "Summary text",
      },
      presentations: [richTextDocument],
      changeSummary: "Initial article draft",
    };

    expect(version.fieldsSnapshot.title).toBe("Launch memo");
    expect(version.presentations[0]?.kind).toBe("rich_text_document");
  });

  it("calls the canonical version detail, draft save, patch, and publish endpoints", async () => {
    const savePayload: SaveAdminContentDraftVersionPayload = {
      expectedVersion: 2,
      changeSummary: "Create article draft",
      fieldsSnapshot: { title: "Launch memo" },
      presentations: [{ kind: "rich_text_document", payload: { type: "doc", content: [] } }],
    };
    const patchPayload: PatchAdminContentVersionPayload = {
      changeSummary: "Refine title",
      fieldsSnapshot: { title: "Launch memo v2" },
    };

    vi.mocked(api.get).mockResolvedValueOnce({ itemId: "item-1", versionNumber: 2 });
    vi.mocked(api.post).mockResolvedValueOnce({ itemId: "item-1", versionNumber: 3 });
    vi.mocked(api.patch).mockResolvedValueOnce({ itemId: "item-1", versionNumber: 3 });
    vi.mocked(api.post).mockResolvedValueOnce({ itemId: "item-1", versionNumber: 3 });

    await getContentItem("ws-1", "item-1");
    await getContentItemVersion("ws-1", "item-1", 2);
    await listContentItemVersions("ws-1", "item-1", { page: 2, size: 10 });
    await saveContentItemDraftVersion("ws-1", "item-1", savePayload);
    await patchContentItemVersion("ws-1", "item-1", 3, patchPayload);
    await publishContentItemVersion("ws-1", "item-1", 3);

    expect(api.get).toHaveBeenNthCalledWith(1, "/workspaces/ws-1/content/items/item-1");
    expect(api.get).toHaveBeenNthCalledWith(2, "/workspaces/ws-1/content/items/item-1/versions/2");
    expect(api.get).toHaveBeenNthCalledWith(
      3,
      "/workspaces/ws-1/content/items/item-1/versions?page=2&size=10",
    );
    expect(api.post).toHaveBeenNthCalledWith(
      1,
      "/workspaces/ws-1/content/items/item-1/versions/draft",
      savePayload,
    );
    expect(api.patch).toHaveBeenCalledWith(
      "/workspaces/ws-1/content/items/item-1/versions/3",
      patchPayload,
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      "/workspaces/ws-1/content/items/item-1/versions/3/publish",
    );
  });

  it("loads an editor snapshot from item detail plus active versions", async () => {
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
      bootstrapPresetKey: "post",
      bootstrapPresetState: "selected",
      capabilityPackIds: ["publishable", "rich_text_editable"],
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

    vi.mocked(api.get)
      .mockResolvedValueOnce(item)
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
  });

  it("finds the requested presentation kind from a version payload", () => {
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
});
