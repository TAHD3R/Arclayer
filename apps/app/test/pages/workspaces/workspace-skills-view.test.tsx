import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAIComposerDirectiveStore } from "@/components/ai/ai-composer-directives";
import { WorkspaceSkillsView } from "@/pages/workspaces/settings/workspace/skills/workspace-skills-view";

const mocks = vi.hoisted(() => ({
  capabilities: vi.fn(),
  listPackages: vi.fn(),
  getPackage: vi.fn(),
  listVersions: vi.fn(),
  getVersion: vi.fn(),
  listValidations: vi.fn(),
  listInstallations: vi.fn(),
  validate: vi.fn(),
  githubImport: vi.fn(),
  getGitHubImport: vi.fn(),
  githubRefresh: vi.fn(),
  updatePreview: vi.fn(),
  repin: vi.fn(),
  impact: vi.fn(),
  remove: vi.fn(),
  packageImpact: vi.fn(),
  archivePackage: vi.fn(),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyError: vi.fn(),
  notifyErrorText: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number; version?: number; status?: string }) => {
      if (values?.count !== undefined) return `${key}:${values.count}`;
      if (values?.version !== undefined) return `${key}:${values.version}`;
      if (values?.status !== undefined) return `${key}:${values.status}`;
      return key;
    },
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/api/workspace-skills", () => ({
  WORKSPACE_SKILLS_QUERY_KEY: ["workspace", "skills"],
  getWorkspaceSkillsCapabilities: (...args: unknown[]) => mocks.capabilities(...args),
  listWorkspaceSkillPackages: (...args: unknown[]) => mocks.listPackages(...args),
  getWorkspaceSkillPackage: (...args: unknown[]) => mocks.getPackage(...args),
  listWorkspaceSkillVersions: (...args: unknown[]) => mocks.listVersions(...args),
  getWorkspaceSkillVersion: (...args: unknown[]) => mocks.getVersion(...args),
  listWorkspaceSkillValidationResults: (...args: unknown[]) => mocks.listValidations(...args),
  listWorkspaceSkillInstallations: (...args: unknown[]) => mocks.listInstallations(...args),
  validateWorkspaceSkillVersion: (...args: unknown[]) => mocks.validate(...args),
  createWorkspaceSkillGitHubImport: (...args: unknown[]) => mocks.githubImport(...args),
  getWorkspaceSkillGitHubImport: (...args: unknown[]) => mocks.getGitHubImport(...args),
  createWorkspaceSkillGitHubRefresh: (...args: unknown[]) => mocks.githubRefresh(...args),
  createWorkspaceSkillPackage: vi.fn(),
  createWorkspaceSkillVersion: vi.fn(),
  createWorkspaceSkillInstallation: vi.fn(),
  createWorkspaceSkillUpdatePreview: (...args: unknown[]) => mocks.updatePreview(...args),
  repinWorkspaceSkillInstallation: (...args: unknown[]) => mocks.repin(...args),
  getWorkspaceSkillInstallationImpact: (...args: unknown[]) => mocks.impact(...args),
  removeWorkspaceSkillInstallation: (...args: unknown[]) => mocks.remove(...args),
  getWorkspaceSkillPackageImpact: (...args: unknown[]) => mocks.packageImpact(...args),
  archiveWorkspaceSkillPackage: (...args: unknown[]) => mocks.archivePackage(...args),
  updateWorkspaceSkillInstallation: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "error"),
  notifySuccessText: (...args: unknown[]) => mocks.notifySuccess(...args),
  notifyInfoText: (...args: unknown[]) => mocks.notifyInfo(...args),
  notifyError: (...args: unknown[]) => mocks.notifyError(...args),
  notifyErrorText: (...args: unknown[]) => mocks.notifyErrorText(...args),
}));

vi.mock("@/pages/workspaces/settings/workspace/skills/workspace-skill-authoring-dialog", () => ({
  WorkspaceSkillPackageCreateDialog: () => null,
  WorkspaceSkillVersionCreateDialog: () => null,
}));
vi.mock("@/pages/workspaces/settings/workspace/skills/workspace-skill-install-dialog", () => ({
  WorkspaceSkillInstallDialog: () => null,
}));
vi.mock("@/pages/workspaces/settings/workspace/skills/workspace-official-skills-catalog", () => ({
  WorkspaceOfficialSkillsCatalog: () => <div data-testid="official-skills-table" />,
}));
vi.mock("@/components/ai/ai-composer-skill-menu", () => ({
  useEnabledAIComposerSkills: () => ({
    isLoading: false,
    skills: [
      {
        id: "installation-skill-creator",
        slug: "skill-creator",
        label: "Skill Creator",
        description: "Create reusable Skills",
        command: "skill-creator",
      },
    ],
  }),
}));

const packageSummary = {
  id: "package-1",
  workspaceId: "workspace-1",
  slug: "editorial-planner",
  displayName: "Editorial Planner",
  description: "Plans evidence-led articles.",
  sourceKind: "inline",
  trustLevel: "workspace_authored",
  publisherId: "workspace:workspace-1",
  publisherName: "Workspace",
  status: "active",
  latestValidVersionId: "version-1",
  metadataRevision: 1,
  versionCount: 1,
  createdByUserId: "user-1",
  updatedByUserId: "user-1",
  createdAt: "2026-07-20T00:00:00Z",
  updatedAt: "2026-07-20T00:00:00Z",
};

const versionSummary = {
  id: "version-1",
  packageId: "package-1",
  workspaceId: "workspace-1",
  versionNumber: 1,
  semanticVersion: "1.0.0",
  packageChecksum: `sha256:${"a".repeat(64)}`,
  status: "valid",
  validationPolicyVersion: 1,
  createdByUserId: "user-1",
  createdAt: "2026-07-20T00:00:00Z",
};

const versionDetail = {
  ...versionSummary,
  manifest: {
    manifestVersion: 1 as const,
    skillId: "workspace.editorial-planner",
    name: "Editorial Planner",
    description: "Plans evidence-led articles.",
    publisher: { id: "workspace:workspace-1", name: "Workspace", verified: false },
    compatibility: { agentProtocol: 1 as const, arclayerRange: ">=1" },
    instructionsEntrypoint: "SKILL.md",
    resources: [
      {
        path: "SKILL.md",
        role: "instructions" as const,
        mimeType: "text/markdown",
        byteSize: 20,
        digest: `sha256:${"b".repeat(64)}`,
      },
    ],
    requiredTools: [],
    permissions: [],
    dataEgress: [],
    capabilityTags: ["content.editorial"],
    checksum: `sha256:${"a".repeat(64)}`,
  },
  resources: [
    {
      path: "SKILL.md",
      role: "instructions",
      mimeType: "text/markdown",
      byteSize: 20,
      digest: `sha256:${"b".repeat(64)}`,
      content: "Use approved evidence.",
    },
  ],
  sourceProvenance: { kind: "inline" },
};

const validation = {
  id: "validation-1",
  versionId: "version-1",
  workspaceId: "workspace-1",
  policyVersion: 1,
  status: "valid",
  findings: [],
  findingHash: `sha256:${"c".repeat(64)}`,
  actorUserId: "user-1",
  createdAt: "2026-07-20T00:01:00Z",
};

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceSkillsView workspaceId="workspace-1" />
    </QueryClientProvider>,
  );
}

describe("WorkspaceSkillsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAIComposerDirectiveStore.getState().clearDirectives("home");
    mocks.capabilities.mockResolvedValue({
      inlineAuthoringAvailable: true,
      immutableVersions: true,
      officialCatalogAvailable: false,
      githubImportAvailable: true,
      validationAvailable: true,
      installationAvailable: true,
      agentSkillGrantsAvailable: true,
    });
    mocks.listPackages.mockResolvedValue({ items: [packageSummary], nextCursor: null });
    mocks.getPackage.mockResolvedValue({ ...packageSummary, latestVersion: versionSummary });
    mocks.listVersions.mockResolvedValue({ items: [versionSummary], nextCursor: null });
    mocks.getVersion.mockResolvedValue(versionDetail);
    mocks.listValidations.mockResolvedValue([validation]);
    mocks.listInstallations.mockResolvedValue({ items: [], nextCursor: null });
    mocks.validate.mockResolvedValue(validation);
    mocks.githubImport.mockResolvedValue({
      importId: "import-1",
      jobId: "job-1",
      operation: "initial",
      status: "queued",
    });
    mocks.githubRefresh.mockResolvedValue({
      importId: "import-refresh-1",
      jobId: "job-refresh-1",
      operation: "refresh",
      status: "queued",
    });
    mocks.getGitHubImport.mockResolvedValue({
      id: "import-refresh-1",
      workspaceId: "workspace-1",
      packageId: "package-1",
      versionId: null,
      operation: "refresh",
      status: "queued",
      repositoryUrl: "https://github.com/acme/editorial-planner",
      requestedRef: "main",
      subpath: "",
      requestRevision: `sha256:${"d".repeat(64)}`,
      resolvedCommit: null,
      resolvedTree: null,
      jobId: "job-refresh-1",
      safeErrorCode: null,
      safeErrorMessage: null,
      actorUserId: "user-1",
      createdAt: "2026-07-20T00:02:00Z",
      updatedAt: "2026-07-20T00:02:00Z",
    });
  });

  it("renders the authored, validated, and exact-install lifecycle without stale Agent gates", async () => {
    renderView();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Editorial Planner" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("SETTINGS_WORKSPACE_SKILLS_LIFECYCLE_AUTHORED"),
    ).toBeInTheDocument();
    expect(screen.getByText("SETTINGS_WORKSPACE_SKILLS_LIFECYCLE_VALIDATED")).toBeInTheDocument();
    expect(screen.getByText("SETTINGS_WORKSPACE_SKILLS_LIFECYCLE_INSTALLED")).toBeInTheDocument();
    expect(screen.queryByText("SETTINGS_WORKSPACE_SKILLS_GATED")).not.toBeInTheDocument();
    expect(screen.getByText("SETTINGS_WORKSPACE_SKILLS_VALIDATION_PASSED")).toBeInTheDocument();
  });

  it("sends search text to the package query contract", async () => {
    renderView();
    fireEvent.change(
      await screen.findByLabelText("settings:SETTINGS_WORKSPACE_SKILLS_SEARCH_LABEL"),
      { target: { value: "editorial" } },
    );

    await waitFor(() => {
      expect(mocks.listPackages).toHaveBeenCalledWith(
        "workspace-1",
        expect.objectContaining({ q: "editorial", limit: 100 }),
      );
    });
  });

  it("shows workspace and Arclayer Skills together with a compact add menu", async () => {
    const user = userEvent.setup();
    renderView();

    expect(
      await screen.findByRole("heading", {
        name: "settings:SETTINGS_WORKSPACE_SKILLS_TAB_WORKSPACE",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "settings:SETTINGS_WORKSPACE_SKILLS_TAB_OFFICIAL",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("official-skills-table")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "SETTINGS_WORKSPACE_SKILLS_ADD_ACTION" }));
    expect(
      await screen.findByRole("menuitem", {
        name: "SETTINGS_WORKSPACE_SKILLS_BUILD_WITH_ARCLAYER",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("SETTINGS_WORKSPACE_SKILLS_BUILD_WITH_ARCLAYER_DESC"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("menuitem", {
        name: "SETTINGS_WORKSPACE_SKILLS_BUILD_WITH_ARCLAYER",
      }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/",
      search: {
        prompt: ":skill[Skill Creator]{name=installation-skill-creator} ",
      },
    });
    expect(useAIComposerDirectiveStore.getState().directivesByScope.home).toEqual([
      {
        type: "skill",
        id: "installation-skill-creator",
        label: "Skill Creator",
        command: "skill-creator",
      },
    ]);
  });

  it("runs a real validation command and refreshes the governed projection", async () => {
    renderView();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "SETTINGS_WORKSPACE_SKILLS_VALIDATE_ACTION",
      }),
    );

    await waitFor(() => expect(mocks.validate).toHaveBeenCalledTimes(1));
    expect(mocks.notifySuccess).toHaveBeenCalledWith("SETTINGS_WORKSPACE_SKILLS_VALIDATED");
  });

  it("refreshes GitHub packages through the durable source operation instead of inline authoring", async () => {
    const githubPackage = {
      ...packageSummary,
      sourceKind: "github",
      trustLevel: "imported_unverified",
    };
    mocks.listPackages.mockResolvedValue({ items: [githubPackage], nextCursor: null });
    mocks.getPackage.mockResolvedValue({ ...githubPackage, latestVersion: versionSummary });
    mocks.getVersion.mockResolvedValue({
      ...versionDetail,
      sourceProvenance: {
        kind: "github",
        repositoryUrl: "https://github.com/acme/editorial-planner",
        requestedRef: "main",
        subpath: "",
        resolvedCommit: "a".repeat(40),
      },
    });
    renderView();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "SETTINGS_WORKSPACE_SKILLS_GITHUB_REFRESH_ACTION",
      }),
    );

    await waitFor(() => {
      expect(mocks.githubRefresh).toHaveBeenCalledWith(
        "workspace-1",
        "package-1",
        expect.any(String),
      );
    });
    expect(
      screen.queryByRole("button", { name: "SETTINGS_WORKSPACE_SKILLS_VERSION_CREATE_ACTION" }),
    ).not.toBeInTheDocument();
    expect(mocks.notifyInfo).toHaveBeenCalledWith(
      "SETTINGS_WORKSPACE_SKILLS_GITHUB_REFRESH_QUEUED",
    );
  });

  it("keeps GitHub operation IDs internal and reconciles a completed refresh", async () => {
    const githubPackage = {
      ...packageSummary,
      sourceKind: "github",
      trustLevel: "imported_unverified",
    };
    mocks.listPackages.mockResolvedValue({ items: [githubPackage], nextCursor: null });
    mocks.getPackage.mockResolvedValue({ ...githubPackage, latestVersion: versionSummary });
    mocks.getGitHubImport.mockResolvedValue({
      id: "import-refresh-1",
      workspaceId: "workspace-1",
      packageId: "package-1",
      versionId: "version-2",
      operation: "refresh",
      status: "succeeded",
      repositoryUrl: "https://github.com/acme/editorial-planner",
      requestedRef: "main",
      subpath: "",
      requestRevision: `sha256:${"d".repeat(64)}`,
      resolvedCommit: "e".repeat(40),
      resolvedTree: "f".repeat(40),
      jobId: "job-refresh-1",
      safeErrorCode: null,
      safeErrorMessage: null,
      actorUserId: "user-1",
      createdAt: "2026-07-20T00:02:00Z",
      updatedAt: "2026-07-20T00:03:00Z",
    });
    renderView();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "SETTINGS_WORKSPACE_SKILLS_GITHUB_REFRESH_ACTION",
      }),
    );

    expect(screen.queryByText("import-refresh-1")).not.toBeInTheDocument();
    expect(screen.queryByText("job-refresh-1")).not.toBeInTheDocument();
    expect(screen.queryByText("e".repeat(40))).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.notifySuccess).toHaveBeenCalledWith(
        "SETTINGS_WORKSPACE_SKILLS_GITHUB_REFRESHED",
      ),
    );
  });
});
