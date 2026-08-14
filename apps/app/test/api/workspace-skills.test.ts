import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

import {
  createWorkspaceSkillGitHubImport,
  createWorkspaceSkillGitHubRefresh,
  createWorkspaceSkillInstallation,
  createWorkspaceSkillPackage,
  createWorkspaceSkillUpdatePreview,
  createWorkspaceSkillVersion,
  archiveWorkspaceSkillPackage,
  getOfficialSkillCatalogPackage,
  getWorkspaceSkillGitHubImport,
  getWorkspaceSkillInstallationImpact,
  getWorkspaceSkillPackageImpact,
  listOfficialSkillCatalog,
  listWorkspaceSkillGrantOptions,
  listWorkspaceSkillPackages,
  removeWorkspaceSkillInstallation,
  repinWorkspaceSkillInstallation,
  updateWorkspaceSkillInstallation,
  validateWorkspaceSkillVersion,
} from "@/api/workspace-skills";
import { api } from "@/lib/http";

describe("api/workspace skills contracts", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.delete).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.patch).mockReset();
    vi.mocked(api.get).mockResolvedValue({});
    vi.mocked(api.delete).mockResolvedValue({});
    vi.mocked(api.post).mockResolvedValue({});
    vi.mocked(api.patch).mockResolvedValue({});
  });

  it("sends an Idempotency-Key for package, version, validation, and installation commands", async () => {
    await createWorkspaceSkillPackage(
      "workspace/alpha",
      {
        slug: "editorial-planner",
        displayName: "Editorial Planner",
        description: "Plan evidence-led content.",
        instructions: "Use cited evidence.",
      },
      "package-command",
    );
    await createWorkspaceSkillVersion(
      "workspace/alpha",
      "package/one",
      { instructions: "Use cited evidence only." },
      "version-command",
    );
    await validateWorkspaceSkillVersion(
      "workspace/alpha",
      "package/one",
      "version/one",
      "validation-command",
    );
    await createWorkspaceSkillInstallation(
      "workspace/alpha",
      {
        packageScope: "workspace",
        packageId: "package/one",
        versionId: "version/one",
        expectedPackageChecksum: `sha256:${"a".repeat(64)}`,
        validationFindingHash: `sha256:${"b".repeat(64)}`,
      },
      "installation-command",
    );

    expect(api.post).toHaveBeenNthCalledWith(
      1,
      "/workspaces/workspace%2Falpha/skills/packages",
      expect.objectContaining({ slug: "editorial-planner" }),
      { headers: { "Idempotency-Key": "package-command" } },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      "/workspaces/workspace%2Falpha/skills/packages/package%2Fone/versions",
      { instructions: "Use cited evidence only." },
      { headers: { "Idempotency-Key": "version-command" } },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      3,
      "/workspaces/workspace%2Falpha/skills/packages/package%2Fone/versions/version%2Fone/validations",
      { policyVersion: 1 },
      { headers: { "Idempotency-Key": "validation-command" } },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      4,
      "/workspaces/workspace%2Falpha/skills/installations",
      expect.objectContaining({ packageId: "package/one", versionId: "version/one" }),
      { headers: { "Idempotency-Key": "installation-command" } },
    );
  });

  it("encodes ids, serializes meaningful filters, and sends optimistic revisions", async () => {
    const controller = new AbortController();
    await listWorkspaceSkillPackages("workspace/alpha", {
      q: "brand & voice",
      limit: 50,
      cursor: "",
      signal: controller.signal,
    });
    await listOfficialSkillCatalog("workspace/alpha", {
      q: "site map",
      limit: 20,
      signal: controller.signal,
    });
    await getOfficialSkillCatalogPackage("workspace/alpha", "official/one", controller.signal);
    await updateWorkspaceSkillInstallation("workspace/alpha", "install/one", {
      enabled: false,
      expectedRevision: 3,
    });

    expect(api.get).toHaveBeenCalledWith(
      "/workspaces/workspace%2Falpha/skills/packages?q=brand+%26+voice&limit=50",
      { signal: controller.signal },
    );
    expect(api.get).toHaveBeenCalledWith(
      "/workspaces/workspace%2Falpha/skills/catalog?q=site+map&limit=20",
      { signal: controller.signal },
    );
    expect(api.get).toHaveBeenCalledWith(
      "/workspaces/workspace%2Falpha/skills/catalog/official%2Fone",
      { signal: controller.signal },
    );
    expect(api.patch).toHaveBeenCalledWith(
      "/workspaces/workspace%2Falpha/skills/installations/install%2Fone",
      { enabled: false, expectedRevision: 3 },
    );
  });

  it("queues and reads durable GitHub import and refresh resources", async () => {
    const controller = new AbortController();
    await createWorkspaceSkillGitHubImport(
      "workspace/alpha",
      {
        repositoryUrl: "https://github.com/acme/site-skill",
      },
      "github-import-command",
    );
    await getWorkspaceSkillGitHubImport("workspace/alpha", "import/one", controller.signal);
    await createWorkspaceSkillGitHubRefresh(
      "workspace/alpha",
      "package/one",
      "github-refresh-command",
    );

    expect(api.post).toHaveBeenNthCalledWith(
      1,
      "/workspaces/workspace%2Falpha/skills/imports",
      expect.objectContaining({ repositoryUrl: "https://github.com/acme/site-skill" }),
      { headers: { "Idempotency-Key": "github-import-command" } },
    );
    expect(api.get).toHaveBeenCalledWith(
      "/workspaces/workspace%2Falpha/skills/imports/import%2Fone",
      { signal: controller.signal },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      "/workspaces/workspace%2Falpha/skills/packages/package%2Fone/refreshes",
      undefined,
      { headers: { "Idempotency-Key": "github-refresh-command" } },
    );
  });

  it("sends exact preview, atomic repin, impact, and removal contracts", async () => {
    const currentChecksum = `sha256:${"a".repeat(64)}`;
    const currentFindingHash = `sha256:${"b".repeat(64)}`;
    const candidateChecksum = `sha256:${"c".repeat(64)}`;
    const candidateFindingHash = `sha256:${"d".repeat(64)}`;
    const previewHash = `sha256:${"e".repeat(64)}`;
    const signal = new AbortController().signal;

    await createWorkspaceSkillUpdatePreview(
      "workspace/alpha",
      "install/one",
      {
        expectedRevision: 4,
        currentVersionId: "version/current",
        currentPackageChecksum: currentChecksum,
        currentValidationFindingHash: currentFindingHash,
        candidateVersionId: "version/candidate",
      },
      "preview-command",
    );
    await repinWorkspaceSkillInstallation(
      "workspace/alpha",
      "install/one",
      {
        previewId: "preview/one",
        previewHash,
        expectedRevision: 4,
        currentVersionId: "version/current",
        currentPackageChecksum: currentChecksum,
        currentValidationFindingHash: currentFindingHash,
        candidateVersionId: "version/candidate",
        candidatePackageChecksum: candidateChecksum,
        candidateValidationFindingHash: candidateFindingHash,
        acceptedRequiredTools: ["human.request_input"],
        acceptedPermissions: ["content:write"],
        acceptedDataEgress: ["https://example.com"],
      },
      "repin-command",
    );
    await getWorkspaceSkillInstallationImpact("workspace/alpha", "install/one", signal);
    await removeWorkspaceSkillInstallation("workspace/alpha", "install/one", 5, "remove-command");

    expect(api.post).toHaveBeenNthCalledWith(
      1,
      "/workspaces/workspace%2Falpha/skills/installations/install%2Fone/update-previews",
      expect.objectContaining({ expectedRevision: 4, candidateVersionId: "version/candidate" }),
      { headers: { "Idempotency-Key": "preview-command" } },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      "/workspaces/workspace%2Falpha/skills/installations/install%2Fone/updates",
      expect.objectContaining({ previewHash, candidatePackageChecksum: candidateChecksum }),
      { headers: { "Idempotency-Key": "repin-command" } },
    );
    expect(api.get).toHaveBeenCalledWith(
      "/workspaces/workspace%2Falpha/skills/installations/install%2Fone/impact",
      { signal },
    );
    expect(api.delete).toHaveBeenCalledWith(
      "/workspaces/workspace%2Falpha/skills/installations/install%2Fone?expectedRevision=5",
      { headers: { "Idempotency-Key": "remove-command" } },
    );
  });

  it("reads package archive impact and archives with exact revision evidence", async () => {
    const signal = new AbortController().signal;
    await getWorkspaceSkillPackageImpact("workspace/alpha", "package/one", signal);
    await archiveWorkspaceSkillPackage("workspace/alpha", "package/one", 7, "archive-command");

    expect(api.get).toHaveBeenCalledWith(
      "/workspaces/workspace%2Falpha/skills/packages/package%2Fone/impact",
      { signal },
    );
    expect(api.delete).toHaveBeenCalledWith(
      "/workspaces/workspace%2Falpha/skills/packages/package%2Fone?expectedRevision=7",
      { headers: { "Idempotency-Key": "archive-command" } },
    );
  });

  it("collects every governed installation and package page for Agent grants", async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      const url = String(path);
      if (url.includes("/installations") && url.includes("cursor=install-next")) {
        return { items: [{ id: "installation-2" }], nextCursor: null };
      }
      if (url.includes("/installations")) {
        return { items: [{ id: "installation-1" }], nextCursor: "install-next" };
      }
      if (url.includes("/catalog")) {
        return { items: [{ packageId: "official-package" }], nextCursor: null };
      }
      if (url.includes("/packages")) {
        return { items: [{ id: "workspace-package" }], nextCursor: null };
      }
      throw new Error(`Unexpected Workspace Skills request: ${url}`);
    });

    const result = await listWorkspaceSkillGrantOptions("workspace/alpha");

    expect(result.installations.map((item) => item.id)).toEqual([
      "installation-1",
      "installation-2",
    ]);
    expect(result.officialPackages.map((item) => item.packageId)).toEqual(["official-package"]);
    expect(result.workspacePackages.map((item) => item.id)).toEqual(["workspace-package"]);
    expect(api.get).toHaveBeenCalledTimes(4);
  });
});
