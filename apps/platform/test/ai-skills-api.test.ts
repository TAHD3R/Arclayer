import {
  platformArchivePlatformSkill,
  platformCreatePlatformSkill,
  platformCreatePlatformSkillVersion,
  platformGetPlatformSkill,
  platformGetPlatformSkillCapabilities,
  platformImportPlatformSkillGithub,
  platformImportPlatformSkillZip,
  platformListPlatformSkills,
  platformReplacePlatformSkill,
  platformUpdatePlatformSkill,
} from "@arclayer/platform-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  archivePlatformSkill,
  createPlatformSkill,
  createPlatformSkillVersion,
  getPlatformSkill,
  getPlatformSkillCapabilities,
  importPlatformSkillFromGitHub,
  importPlatformSkillZip,
  listPlatformSkills,
  PlatformAiSkillsApiError,
  replacePlatformSkill,
  updatePlatformSkill,
} from "@/ai/ai-skills-api";
import { platformApiClient } from "@/api/client";

vi.mock("@arclayer/platform-openapi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arclayer/platform-openapi")>();
  return {
    ...actual,
    platformArchivePlatformSkill: vi.fn(),
    platformCreatePlatformSkill: vi.fn(),
    platformCreatePlatformSkillVersion: vi.fn(),
    platformGetPlatformSkill: vi.fn(),
    platformGetPlatformSkillCapabilities: vi.fn(),
    platformImportPlatformSkillGithub: vi.fn(),
    platformImportPlatformSkillZip: vi.fn(),
    platformListPlatformSkills: vi.fn(),
    platformReplacePlatformSkill: vi.fn(),
    platformUpdatePlatformSkill: vi.fn(),
  };
});

function result(data: unknown, path: string) {
  return {
    data: { data, message: "OK", timestamp: 1 },
    request: new Request(`https://platform.test${path}`),
    response: new Response(null, { status: 200 }),
  } as never;
}

const createPayload = {
  capabilityTags: ["content.editorial"],
  dataEgress: [],
  description: "Reviews content against editorial standards.",
  displayName: "Editorial review",
  instructions: "Review every claim.",
  permissions: [],
  references: [],
  requiredTools: [],
  semanticVersion: "1.0.0",
  slug: "editorial-review",
};

describe("Platform AI Skills API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the generated SDK for the complete package and immutable-version lifecycle", async () => {
    const page = { items: [], page: 1, pages: 0, size: 100, total: 0 };
    const skill = { id: "package-1", metadataRevision: 3 };
    const version = { id: "version-2", versionNumber: 2 };
    vi.mocked(platformListPlatformSkills).mockResolvedValue(result(page, "/skills"));
    vi.mocked(platformGetPlatformSkill).mockResolvedValue(result(skill, "/skills/package-1"));
    const capabilities = {
      supportedTools: [
        {
          id: "human.request_input",
          label: "Human input",
          description: "Pause a run and ask the operator for an answer.",
          risk: "medium" as const,
          available: true,
        },
      ],
      permissions: [],
      egressDestinations: [],
      dataClasses: [],
      capabilityTags: [],
      referenceMimeTypes: [],
    };
    vi.mocked(platformGetPlatformSkillCapabilities).mockResolvedValue(
      result(capabilities, "/skills/capabilities"),
    );
    vi.mocked(platformCreatePlatformSkill).mockResolvedValue(result(skill, "/skills"));
    vi.mocked(platformUpdatePlatformSkill).mockResolvedValue(result(skill, "/skills/package-1"));
    vi.mocked(platformReplacePlatformSkill).mockResolvedValue(result(skill, "/skills/package-1"));
    vi.mocked(platformImportPlatformSkillGithub).mockResolvedValue(
      result(skill, "/skills/imports"),
    );
    vi.mocked(platformImportPlatformSkillZip).mockResolvedValue(
      result(skill, "/skills/imports/zip"),
    );
    vi.mocked(platformCreatePlatformSkillVersion).mockResolvedValue(
      result(version, "/skills/package-1/versions"),
    );
    vi.mocked(platformArchivePlatformSkill).mockResolvedValue(result(skill, "/skills/package-1"));

    await expect(
      listPlatformSkills({ page: 1, q: "editorial", size: 100, status: "active" }),
    ).resolves.toEqual(page);
    expect(platformListPlatformSkills).toHaveBeenCalledWith({
      client: platformApiClient,
      query: { page: 1, q: "editorial", size: 100, status: "active" },
    });

    await expect(getPlatformSkill("package-1")).resolves.toEqual(skill);
    expect(platformGetPlatformSkill).toHaveBeenCalledWith({
      client: platformApiClient,
      path: { package_id: "package-1" },
    });

    await expect(getPlatformSkillCapabilities()).resolves.toEqual(capabilities);
    expect(platformGetPlatformSkillCapabilities).toHaveBeenCalledWith({
      client: platformApiClient,
    });

    await expect(createPlatformSkill(createPayload, "create-key")).resolves.toEqual(skill);
    expect(platformCreatePlatformSkill).toHaveBeenCalledWith({
      body: createPayload,
      client: platformApiClient,
      headers: { "Idempotency-Key": "create-key" },
    });

    const updatePayload = {
      description: "Updated description.",
      displayName: "Editorial review",
      expectedRevision: 3,
    };
    await expect(updatePlatformSkill("package-1", updatePayload)).resolves.toEqual(skill);
    expect(platformUpdatePlatformSkill).toHaveBeenCalledWith({
      body: updatePayload,
      client: platformApiClient,
      path: { package_id: "package-1" },
    });

    const replacePayload = { ...createPayload, expectedRevision: 3 };
    await expect(replacePlatformSkill("package-1", replacePayload, "replace-key")).resolves.toEqual(
      skill,
    );
    expect(platformReplacePlatformSkill).toHaveBeenCalledWith({
      body: replacePayload,
      client: platformApiClient,
      headers: { "Idempotency-Key": "replace-key" },
      path: { package_id: "package-1" },
    });

    const githubPayload = {
      description: "Review accessibility issues.",
      displayName: "Accessibility review",
      repositoryUrl: "https://github.com/arclayer/accessibility-review",
      requestedRef: "main",
      slug: "accessibility-review",
    };
    await expect(importPlatformSkillFromGitHub(githubPayload, "github-key")).resolves.toEqual(
      skill,
    );
    expect(platformImportPlatformSkillGithub).toHaveBeenCalledWith({
      body: githubPayload,
      client: platformApiClient,
      headers: { "Idempotency-Key": "github-key" },
    });

    const archive = new File(["archive"], "skill.zip", { type: "application/zip" });
    await expect(importPlatformSkillZip(archive, "zip-key")).resolves.toEqual(skill);
    expect(platformImportPlatformSkillZip).toHaveBeenCalledWith({
      body: { package: archive },
      client: platformApiClient,
      headers: { "Idempotency-Key": "zip-key" },
    });

    const versionPayload = {
      ...createPayload,
      description: undefined,
      displayName: undefined,
      slug: undefined,
      semanticVersion: "1.1.0",
    };
    delete versionPayload.description;
    delete versionPayload.displayName;
    delete versionPayload.slug;
    await expect(
      createPlatformSkillVersion("package-1", versionPayload, "version-key"),
    ).resolves.toEqual(version);
    expect(platformCreatePlatformSkillVersion).toHaveBeenCalledWith({
      body: versionPayload,
      client: platformApiClient,
      headers: { "Idempotency-Key": "version-key" },
      path: { package_id: "package-1" },
    });

    await expect(archivePlatformSkill("package-1", 3)).resolves.toEqual(skill);
    expect(platformArchivePlatformSkill).toHaveBeenCalledWith({
      client: platformApiClient,
      path: { package_id: "package-1" },
      query: { expectedRevision: 3 },
    });
  });

  it("preserves stable API error codes and status for product feedback", async () => {
    vi.mocked(platformGetPlatformSkill).mockResolvedValue({
      data: { data: null, error: "PLATFORM_SKILL_NOT_FOUND" },
      error: { detail: "missing" },
      request: new Request("https://platform.test/skills/missing"),
      response: new Response(null, { status: 404 }),
    } as never);

    await expect(getPlatformSkill("missing")).rejects.toEqual(
      new PlatformAiSkillsApiError("PLATFORM_SKILL_NOT_FOUND", 404),
    );
  });
});
