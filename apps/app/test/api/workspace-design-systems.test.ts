import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

import {
  createWorkspaceDesignSystem,
  createWorkspaceDesignSystemVersion,
  listWorkspaceDesignSystems,
  listWorkspaceDesignSystemComponentCatalogs,
  setWorkspaceDesignSystemDefault,
  validateWorkspaceDesignSystemVersion,
} from "@/api/workspace-design-systems";
import { api } from "@/lib/http";

describe("api/workspace Design Systems contracts", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset().mockResolvedValue({});
    vi.mocked(api.post).mockReset().mockResolvedValue({});
    vi.mocked(api.put).mockReset().mockResolvedValue({});
  });

  it("encodes identities and preserves exact idempotent command payloads", async () => {
    await createWorkspaceDesignSystem(
      "workspace/alpha",
      { name: "Editorial Contrast", description: "Visitor foundation" },
      "system-command",
    );
    await createWorkspaceDesignSystemVersion(
      "workspace/alpha",
      "system/one",
      {
        manifest: { name: "Foundation", themes: [{ key: "light", name: "Light", mode: "light" }] },
        parentVersionId: "version/one",
        expectedParentChecksum: `sha256:${"a".repeat(64)}`,
        source: "manual",
      },
      "version-command",
    );
    await validateWorkspaceDesignSystemVersion(
      "workspace/alpha",
      "system/one",
      "version/two",
      "validation-command",
    );
    await setWorkspaceDesignSystemDefault(
      "workspace/alpha",
      {
        designSystemId: "system/one",
        versionId: "version/two",
        expectedManifestChecksum: `sha256:${"b".repeat(64)}`,
        validationFindingHash: `sha256:${"c".repeat(64)}`,
        expectedRevision: 3,
      },
      "default-command",
    );

    expect(api.post).toHaveBeenNthCalledWith(
      1,
      "/workspaces/workspace%2Falpha/design-systems",
      expect.objectContaining({ name: "Editorial Contrast" }),
      { headers: { "Idempotency-Key": "system-command" } },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      "/workspaces/workspace%2Falpha/design-systems/system%2Fone/versions",
      expect.objectContaining({ parentVersionId: "version/one" }),
      { headers: { "Idempotency-Key": "version-command" } },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      3,
      "/workspaces/workspace%2Falpha/design-systems/system%2Fone/versions/version%2Ftwo/validations",
      { profile: "foundation", validatorVersion: 2 },
      { headers: { "Idempotency-Key": "validation-command" } },
    );
    expect(api.put).toHaveBeenCalledWith(
      "/workspaces/workspace%2Falpha/design-systems/default-assignment",
      expect.objectContaining({ versionId: "version/two", expectedRevision: 3 }),
      { headers: { "Idempotency-Key": "default-command" } },
    );
  });

  it("serializes search without empty cursors", async () => {
    const controller = new AbortController();
    await listWorkspaceDesignSystems("workspace/alpha", {
      q: "brand & voice",
      limit: 50,
      cursor: "",
      signal: controller.signal,
    });

    expect(api.get).toHaveBeenCalledWith(
      "/workspaces/workspace%2Falpha/design-systems?q=brand+%26+voice&limit=50",
      { signal: controller.signal },
    );
  });

  it("reads the registered component catalogs for Design System authoring", async () => {
    const controller = new AbortController();
    await listWorkspaceDesignSystemComponentCatalogs("workspace/alpha", controller.signal);

    expect(api.get).toHaveBeenCalledWith(
      "/workspaces/workspace%2Falpha/design-systems/component-catalogs",
      { signal: controller.signal },
    );
  });
});
