import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
  },
}));

import { api } from "@/lib/http";
import { getWorkspacePublishImpact } from "@/api/content-publish";

describe("api/content-publish wrappers", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("loads publish impact from canonical /publish/impact", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      missingRoutes: [],
      unresolvedRelations: [],
      unpublishedDependencies: [],
    });

    await getWorkspacePublishImpact("ws-1");

    expect(api.get).toHaveBeenCalledWith("/workspaces/ws-1/publish/impact");
  });
});
