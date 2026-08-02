import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

import {
  applyGuidanceRestorePreview,
  getEffectiveGuidance,
  listGuidanceHistory,
  saveGuidanceDraft,
} from "@/api/workspace-guidance";
import { api } from "@/lib/http";

describe("api/workspace guidance contracts", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.put).mockReset();
    vi.mocked(api.get).mockResolvedValue({});
    vi.mocked(api.post).mockResolvedValue({});
    vi.mocked(api.put).mockResolvedValue({});
  });

  it("uses the canonical Workspace and Project guidance lifecycle paths", async () => {
    const signal = new AbortController().signal;
    await listGuidanceHistory(
      { workspaceId: "workspace/alpha", projectId: "project/one" },
      { limit: 25, cursor: "cursor/one", signal },
    );
    await getEffectiveGuidance("workspace/alpha", "project/one", signal);

    expect(api.get).toHaveBeenNthCalledWith(
      1,
      "/workspaces/workspace%2Falpha/guidance/projects/project%2Fone/history?limit=25&cursor=cursor%2Fone",
      { signal },
    );
    expect(api.get).toHaveBeenNthCalledWith(
      2,
      "/workspaces/workspace%2Falpha/guidance/effective?projectId=project%2Fone",
      { signal },
    );
  });

  it("sends idempotency keys for draft and impact-preview application commands", async () => {
    await saveGuidanceDraft(
      { workspaceId: "workspace/alpha" },
      { expectedRevision: 4, content: "Approved guidance" },
      "draft-key",
    );
    await saveGuidanceDraft(
      { workspaceId: "workspace/alpha", projectId: "project/one" },
      { expectedRevision: 4, content: "Project guidance", projectMode: "override" },
      "project-draft-key",
    );
    await applyGuidanceRestorePreview(
      { workspaceId: "workspace/alpha", projectId: "project/one" },
      "preview/one",
      { expectedGuidanceRevision: 5, expectedPreviewRevision: 2 },
      "apply-key",
    );

    expect(api.put).toHaveBeenCalledWith(
      "/workspaces/workspace%2Falpha/guidance/draft",
      { expectedRevision: 4, content: "Approved guidance" },
      { headers: { "Idempotency-Key": "draft-key" } },
    );
    expect(api.put).toHaveBeenCalledWith(
      "/workspaces/workspace%2Falpha/guidance/projects/project%2Fone",
      { expectedRevision: 4, content: "Project guidance", projectMode: "override" },
      { headers: { "Idempotency-Key": "project-draft-key" } },
    );
    expect(api.post).toHaveBeenCalledWith(
      "/workspaces/workspace%2Falpha/guidance/projects/project%2Fone/restore-previews/preview%2Fone/apply",
      { expectedGuidanceRevision: 5, expectedPreviewRevision: 2 },
      { headers: { "Idempotency-Key": "apply-key" } },
    );
  });
});
