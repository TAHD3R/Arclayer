import { describe, expect, test, vi } from "vitest";

const contentEntriesApi = vi.hoisted(() => ({
  getWorkspaceContentEntry: vi.fn(),
  getWorkspaceContentEntryRevision: vi.fn(),
  publishWorkspaceContentEntry: vi.fn(),
  saveWorkspaceContentEntryDraft: vi.fn(),
  unpublishWorkspaceContentEntry: vi.fn(),
}));

vi.mock("@/api/content-entries", () => contentEntriesApi);

import {
  getWorkspacePresentation,
  getWorkspacePresentationRevision,
  publishWorkspacePresentation,
  saveWorkspacePresentationDraft,
  unpublishWorkspacePresentation,
} from "@/api/content/presentations";
import {
  buildLegacyBlockRoutePath,
  buildStudioPresentationRoutePath,
  resolveLegacyEntryIdFromPresentation,
} from "@/lib/presentations";
import { resolveStudioPresentationId } from "@/lib/routing/admin-handoff";
import { Route as PresentationRoute } from "@/routes/w/$workspaceId/presentations/$presentationId/index";

describe("presentation editor identity", () => {
  test("routes and helpers use presentationId as primary identity", () => {
    expect(PresentationRoute).toBeTruthy();
    expect(
      buildStudioPresentationRoutePath({
        workspaceId: "workspace a",
        presentationId: "pres/1",
      }),
    ).toBe("/w/workspace%20a/presentations/pres%2F1/");
    expect(
      buildLegacyBlockRoutePath({
        workspaceId: "workspace a",
        entryId: "pres/1",
      }),
    ).toBe("/w/workspace%20a/blocks/pres%2F1/");
  });

  test("supports migration shims when resolving presentation identity", () => {
    expect(resolveStudioPresentationId({ presentationId: "pres-1" })).toBe("pres-1");
    expect(resolveStudioPresentationId({ pageId: "page-1" })).toBe("page-1");
    expect(resolveLegacyEntryIdFromPresentation({ pageId: "page-2" })).toBe("page-2");
    expect(() => resolveLegacyEntryIdFromPresentation({})).toThrow("PRESENTATION_ID_REQUIRED");
  });
});

describe("presentation api adapter", () => {
  test("delegates reads and writes through presentation identity", async () => {
    contentEntriesApi.getWorkspaceContentEntry.mockResolvedValue({ id: "pres-1" });
    contentEntriesApi.getWorkspaceContentEntryRevision.mockResolvedValue({
      entryId: "pres-1",
      state: "draft",
      revision: 1,
      createdAtMs: 1,
      snapshot: {},
    });
    contentEntriesApi.saveWorkspaceContentEntryDraft.mockResolvedValue({
      entryId: "pres-1",
      revision: 2,
      savedAtMs: 2,
    });
    contentEntriesApi.publishWorkspaceContentEntry.mockResolvedValue({
      entryId: "pres-1",
      revision: 2,
      publishedAtMs: 3,
    });
    contentEntriesApi.unpublishWorkspaceContentEntry.mockResolvedValue({
      entryId: "pres-1",
      unpublishedAtMs: 4,
    });

    await getWorkspacePresentation("ws-1", "pres-1");
    await getWorkspacePresentationRevision("ws-1", "pres-1", "draft");
    await saveWorkspacePresentationDraft("ws-1", "pres-1", { pageBlueprint: null });
    await publishWorkspacePresentation("ws-1", "pres-1", { revision: 2 });
    await unpublishWorkspacePresentation("ws-1", "pres-1");

    expect(contentEntriesApi.getWorkspaceContentEntry).toHaveBeenCalledWith("ws-1", "pres-1");
    expect(contentEntriesApi.getWorkspaceContentEntryRevision).toHaveBeenCalledWith(
      "ws-1",
      "pres-1",
      "draft",
    );
    expect(contentEntriesApi.saveWorkspaceContentEntryDraft).toHaveBeenCalledWith(
      "ws-1",
      "pres-1",
      {
        pageBlueprint: null,
      },
    );
    expect(contentEntriesApi.publishWorkspaceContentEntry).toHaveBeenCalledWith("ws-1", "pres-1", {
      revision: 2,
    });
    expect(contentEntriesApi.unpublishWorkspaceContentEntry).toHaveBeenCalledWith("ws-1", "pres-1");
  });
});
