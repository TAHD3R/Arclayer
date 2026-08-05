import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

import {
  cancelProjectDesignSystemConceptGeneration,
  compareProjectDesignSystemVersions,
  createProjectDesignSystemConceptGeneration,
  createProjectDesignSystemVersion,
  forkProjectDesignSystem,
  getProjectDesignSystemAssignment,
  getProjectDesignSystemConceptGeneration,
  getProjectDesignSystemVersion,
  listProjectDesignSystemVersions,
  previewProjectDesignSystemImpact,
  recoverProjectDesignSystemConceptGenerations,
  setProjectDesignSystemAssignment,
  supersedeProjectDesignSystemVersion,
  validateProjectDesignSystemVersion,
} from "@/api/project-design-systems";
import { api } from "@/lib/http";

describe("api/project Design Systems contracts", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset().mockResolvedValue({});
    vi.mocked(api.post).mockReset().mockResolvedValue({});
    vi.mocked(api.put).mockReset().mockResolvedValue({});
  });

  it("encodes exact project identities and preserves command evidence", async () => {
    await getProjectDesignSystemAssignment("project/alpha");
    await forkProjectDesignSystem(
      "project/alpha",
      {
        sourceDesignSystemId: "system/source",
        sourceVersionId: "version/source",
        expectedSourceChecksum: `sha256:${"a".repeat(64)}`,
        validationFindingHash: `sha256:${"b".repeat(64)}`,
        name: "Project foundation",
        description: "Editable project Style Guide",
      },
      "fork-command",
    );
    await getProjectDesignSystemVersion("project/alpha", "system/fork", "version/one");
    await createProjectDesignSystemVersion(
      "project/alpha",
      "system/fork",
      {
        manifest: { name: "Candidate", themes: [{ key: "light", name: "Light", mode: "light" }] },
        parentVersionId: "version/one",
        expectedParentChecksum: `sha256:${"c".repeat(64)}`,
        source: "manual",
      },
      "version-command",
    );
    await validateProjectDesignSystemVersion(
      "project/alpha",
      "system/fork",
      "version/two",
      "validation-command",
    );
    await setProjectDesignSystemAssignment(
      "project/alpha",
      {
        designSystemId: "system/fork",
        versionId: "version/two",
        expectedManifestChecksum: `sha256:${"d".repeat(64)}`,
        validationFindingHash: `sha256:${"e".repeat(64)}`,
        expectedRevision: 3,
      },
      "assignment-command",
    );

    expect(api.get).toHaveBeenNthCalledWith(
      1,
      "/projects/project%2Falpha/design-system/assignment",
      { signal: undefined },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      1,
      "/projects/project%2Falpha/design-system/forks",
      expect.objectContaining({ sourceVersionId: "version/source" }),
      { headers: { "Idempotency-Key": "fork-command" } },
    );
    expect(api.get).toHaveBeenNthCalledWith(
      2,
      "/projects/project%2Falpha/design-system/system%2Ffork/versions/version%2Fone",
      { signal: undefined },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      "/projects/project%2Falpha/design-system/system%2Ffork/versions",
      expect.objectContaining({ parentVersionId: "version/one" }),
      { headers: { "Idempotency-Key": "version-command" } },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      3,
      "/projects/project%2Falpha/design-system/system%2Ffork/versions/version%2Ftwo/validations",
      { profile: "foundation", validatorVersion: 2 },
      { headers: { "Idempotency-Key": "validation-command" } },
    );
    expect(api.put).toHaveBeenCalledWith(
      "/projects/project%2Falpha/design-system/assignment",
      expect.objectContaining({ versionId: "version/two", expectedRevision: 3 }),
      { headers: { "Idempotency-Key": "assignment-command" } },
    );
  });

  it("paginates project version history and compares exact immutable versions", async () => {
    const controller = new AbortController();

    await listProjectDesignSystemVersions("project/alpha", "system/fork", {
      limit: 25,
      cursor: "version/two",
      signal: controller.signal,
    });
    await compareProjectDesignSystemVersions(
      "project/alpha",
      "system/fork",
      {
        fromVersionId: "version/one",
        toVersionId: "version/two",
      },
      controller.signal,
    );
    await previewProjectDesignSystemImpact(
      "project/alpha",
      "system/fork",
      {
        fromVersionId: "version/one",
        toVersionId: "version/two",
      },
      controller.signal,
    );
    await supersedeProjectDesignSystemVersion(
      "project/alpha",
      "system/fork",
      "version/one",
      {
        replacementVersionId: "version/two",
        expectedReplacementChecksum: `sha256:${"d".repeat(64)}`,
        expectedTargetStatus: "valid",
        expectedTargetStatusRevision: 1,
        expectedSystemRevision: 2,
      },
      "supersede-command",
    );

    expect(api.get).toHaveBeenCalledWith(
      "/projects/project%2Falpha/design-system/system%2Ffork/versions?limit=25&cursor=version%2Ftwo",
      { signal: controller.signal },
    );
    expect(api.post).toHaveBeenCalledWith(
      "/projects/project%2Falpha/design-system/system%2Ffork/comparisons",
      { fromVersionId: "version/one", toVersionId: "version/two" },
      { signal: controller.signal },
    );
    expect(api.post).toHaveBeenCalledWith(
      "/projects/project%2Falpha/design-system/system%2Ffork/impact-previews",
      { fromVersionId: "version/one", toVersionId: "version/two" },
      { signal: controller.signal },
    );
    expect(api.post).toHaveBeenCalledWith(
      "/projects/project%2Falpha/design-system/system%2Ffork/versions/version%2Fone/supersessions",
      expect.objectContaining({
        replacementVersionId: "version/two",
        expectedTargetStatusRevision: 1,
        expectedSystemRevision: 2,
      }),
      { headers: { "Idempotency-Key": "supersede-command" } },
    );
  });

  it("creates, reads, recovers, and cancels exact durable concept generations", async () => {
    const controller = new AbortController();
    const payload = {
      agentRunId: "agent-run/one",
      baseEtag: `sha256:${"a".repeat(64)}`,
      baseRevisionId: "revision/one",
      baseVersionId: "version/one",
      candidateCount: 2,
      expectedBaseChecksum: `sha256:${"b".repeat(64)}`,
      locale: "en-US",
      objective: "Create two editorial Style Guide directions.",
    };

    await createProjectDesignSystemConceptGeneration(
      "project/alpha",
      "system/fork",
      payload,
      "generation-command",
    );
    await getProjectDesignSystemConceptGeneration(
      "project/alpha",
      "system/fork",
      "generation/one",
      controller.signal,
    );
    await recoverProjectDesignSystemConceptGenerations(
      "project/alpha",
      "system/fork",
      controller.signal,
    );
    await cancelProjectDesignSystemConceptGeneration(
      "project/alpha",
      "system/fork",
      "generation/one",
      { reason: "Direction changed" },
    );

    expect(api.post).toHaveBeenNthCalledWith(
      1,
      "/projects/project%2Falpha/design-system/system%2Ffork/concept-generations",
      payload,
      { headers: { "Idempotency-Key": "generation-command" } },
    );
    expect(api.get).toHaveBeenCalledWith(
      "/projects/project%2Falpha/design-system/system%2Ffork/concept-generations/generation%2Fone",
      { signal: controller.signal },
    );
    expect(api.get).toHaveBeenCalledWith(
      "/projects/project%2Falpha/design-system/system%2Ffork/concept-generations/recovery",
      { signal: controller.signal },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      "/projects/project%2Falpha/design-system/system%2Ffork/concept-generations/generation%2Fone/cancel",
      { reason: "Direction changed" },
    );
  });
});
