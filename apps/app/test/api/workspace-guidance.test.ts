import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

import { getEffectiveGuidance, publishGuidance, saveGuidanceDraft } from "@/api/workspace-guidance";
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

  it("uses the canonical project guidance paths", async () => {
    const signal = new AbortController().signal;
    await getEffectiveGuidance("workspace/alpha", "project/one", signal);

    expect(api.get).toHaveBeenCalledWith(
      "/workspaces/workspace%2Falpha/guidance/effective?projectId=project%2Fone",
      { signal },
    );
  });

  it("sends idempotency keys for save and publish commands", async () => {
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
    await publishGuidance(
      { workspaceId: "workspace/alpha" },
      { expectedRevision: 5, revisionId: "revision/one" },
      "publish-key",
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
      "/workspaces/workspace%2Falpha/guidance/publish",
      { expectedRevision: 5, revisionId: "revision/one" },
      { headers: { "Idempotency-Key": "publish-key" } },
    );
  });
});
