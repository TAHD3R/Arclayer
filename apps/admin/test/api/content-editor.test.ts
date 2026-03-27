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
  getContentItemVersion,
  patchContentItemVersion,
  publishContentItemVersion,
  saveContentItemDraftVersion,
} from "@/api/content";
import type {
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

    await getContentItemVersion("ws-1", "item-1", 2);
    await saveContentItemDraftVersion("ws-1", "item-1", savePayload);
    await patchContentItemVersion("ws-1", "item-1", 3, patchPayload);
    await publishContentItemVersion("ws-1", "item-1", 3);

    expect(api.get).toHaveBeenCalledWith("/workspaces/ws-1/content/items/item-1/versions/2");
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
});
