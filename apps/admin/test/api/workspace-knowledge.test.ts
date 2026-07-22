import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

import {
  createKnowledgeBase,
  createKnowledgeSource,
  createManualKnowledgeSourceVersion,
  listKnowledgeBases,
} from "@/api/workspace-knowledge";
import { api } from "@/lib/http";

describe("api/workspace knowledge contracts", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.patch).mockReset();
    vi.mocked(api.get).mockResolvedValue({});
    vi.mocked(api.post).mockResolvedValue({});
  });

  it("sends an Idempotency-Key for every create command", async () => {
    const workspaceId = "workspace/alpha";
    const baseId = "base/one";
    const sourceId = "source/one";

    await createKnowledgeBase(workspaceId, { name: "Product truth" }, "base-command");
    await createKnowledgeSource(
      workspaceId,
      baseId,
      {
        displayName: "Core positioning",
        locator: { kind: "manual", documentKey: "positioning" },
      },
      "source-command",
    );
    await createManualKnowledgeSourceVersion(
      workspaceId,
      baseId,
      sourceId,
      { content: "Approved source content." },
      "version-command",
    );

    expect(api.post).toHaveBeenNthCalledWith(
      1,
      "/workspaces/workspace%2Falpha/knowledge-bases",
      { name: "Product truth" },
      { headers: { "Idempotency-Key": "base-command" } },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      "/workspaces/workspace%2Falpha/knowledge-bases/base%2Fone/sources",
      {
        displayName: "Core positioning",
        locator: { kind: "manual", documentKey: "positioning" },
      },
      { headers: { "Idempotency-Key": "source-command" } },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      3,
      "/workspaces/workspace%2Falpha/knowledge-bases/base%2Fone/sources/source%2Fone/versions",
      { content: "Approved source content." },
      { headers: { "Idempotency-Key": "version-command" } },
    );
  });

  it("encodes workspace ids and serializes only meaningful list filters", async () => {
    const controller = new AbortController();

    await listKnowledgeBases("workspace/alpha", {
      q: "brand & product",
      limit: 50,
      cursor: "",
      signal: controller.signal,
    });

    expect(api.get).toHaveBeenCalledWith(
      "/workspaces/workspace%2Falpha/knowledge-bases?q=brand+%26+product&limit=50",
      { signal: controller.signal },
    );
  });
});
