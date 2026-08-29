import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  SkillInstallationImpactOut,
  SkillInstallationOut,
  SkillUpdatePreviewOut,
} from "@arclayer/openapi";

const apiMocks = vi.hoisted(() => ({
  preview: vi.fn(),
  repin: vi.fn(),
  impact: vi.fn(),
  remove: vi.fn(),
  packageImpact: vi.fn(),
  archivePackage: vi.fn(),
  success: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number; status?: string }) => {
      if (values?.count !== undefined) return `${key}:${values.count}`;
      if (values?.status !== undefined) return `${key}:${values.status}`;
      return key;
    },
  }),
}));

vi.mock("@/api/workspace-skills", () => ({
  WORKSPACE_SKILLS_QUERY_KEY: ["workspace", "skills"],
  createWorkspaceSkillUpdatePreview: (...args: unknown[]) => apiMocks.preview(...args),
  repinWorkspaceSkillInstallation: (...args: unknown[]) => apiMocks.repin(...args),
  getWorkspaceSkillInstallationImpact: (...args: unknown[]) => apiMocks.impact(...args),
  removeWorkspaceSkillInstallation: (...args: unknown[]) => apiMocks.remove(...args),
  getWorkspaceSkillPackageImpact: (...args: unknown[]) => apiMocks.packageImpact(...args),
  archiveWorkspaceSkillPackage: (...args: unknown[]) => apiMocks.archivePackage(...args),
}));

vi.mock("@/lib/notifications", () => ({
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "error"),
  notifySuccessText: (...args: unknown[]) => apiMocks.success(...args),
}));

import { WorkspaceSkillRemovalAction } from "@/pages/workspaces/settings/workspace/skills/workspace-skill-removal-action";
import { WorkspaceSkillPackageArchiveAction } from "@/pages/workspaces/settings/workspace/skills/workspace-skill-package-archive-action";
import {
  WorkspaceSkillUpdateAction,
  type WorkspaceSkillUpdateCandidate,
} from "@/pages/workspaces/settings/workspace/skills/workspace-skill-update-action";

const installation: SkillInstallationOut = {
  id: "installation-1",
  workspaceId: "workspace-1",
  packageScope: "workspace",
  packageId: "package-1",
  versionId: "version-1",
  packageChecksum: `sha256:${"a".repeat(64)}`,
  validationFindingHash: `sha256:${"b".repeat(64)}`,
  status: "enabled",
  acceptedRequiredTools: [],
  acceptedPermissions: [],
  acceptedDataEgress: [],
  installedByUserId: "user-1",
  updatedByUserId: "user-1",
  safeReasonCode: null,
  metadataRevision: 4,
  createdAt: "2026-07-20T00:00:00Z",
  updatedAt: "2026-07-20T00:00:00Z",
};

const candidate: WorkspaceSkillUpdateCandidate = {
  id: "version-2",
  versionNumber: 2,
  semanticVersion: "2.0.0",
  packageChecksum: `sha256:${"c".repeat(64)}`,
  validationFindingHash: `sha256:${"d".repeat(64)}`,
  manifest: {
    manifestVersion: 1,
    skillId: "workspace.editorial-planner",
    name: "Editorial Planner",
    description: "Plans governed content.",
    publisher: { id: "workspace:workspace-1", name: "Workspace", verified: false },
    compatibility: { agentProtocol: 1, arclayerRange: ">=1" },
    instructionsEntrypoint: "SKILL.md",
    resources: [],
    requiredTools: [
      {
        toolId: "human.request_input",
        intendedUse: "Ask the user for a publishing decision.",
        versionRange: ">=1",
      },
    ],
    permissions: [{ action: "content:write", purpose: "Save an approved draft." }],
    dataEgress: [
      {
        destination: "https://analytics.example.com",
        purpose: "Measure published content.",
        dataClasses: ["aggregate-metrics"],
      },
    ],
    capabilityTags: ["content.editorial"],
    checksum: `sha256:${"c".repeat(64)}`,
  },
};

const preview: SkillUpdatePreviewOut = {
  id: "preview-1",
  installationId: installation.id,
  expectedRevision: installation.metadataRevision,
  previewHash: `sha256:${"e".repeat(64)}`,
  risk: "data_egress",
  riskCategories: ["content", "permission", "data_egress"],
  current: {
    versionId: installation.versionId,
    versionNumber: 1,
    semanticVersion: "1.0.0",
    packageChecksum: installation.packageChecksum,
    validationFindingHash: installation.validationFindingHash,
    validationPolicyVersion: 1,
    validationStatus: "valid",
  },
  candidate: {
    versionId: candidate.id,
    versionNumber: candidate.versionNumber,
    semanticVersion: candidate.semanticVersion ?? null,
    packageChecksum: candidate.packageChecksum,
    validationFindingHash: candidate.validationFindingHash,
    validationPolicyVersion: 1,
    validationStatus: "warning",
  },
  diff: {
    currentCompatibility: { agentProtocol: 1, arclayerRange: ">=1" },
    candidateCompatibility: { agentProtocol: 1, arclayerRange: ">=1" },
    instructionsChanged: true,
    compatibilityChanged: false,
    sourceProvenanceChanged: false,
    validationFindingsChanged: true,
    resourceChanges: [
      { path: "SKILL.md", changeType: "modified", beforeDigest: "a", afterDigest: "b" },
    ],
    requiredToolChanges: [
      {
        toolId: "human.request_input",
        changeType: "added",
        before: null,
        after: candidate.manifest.requiredTools?.[0] ?? null,
      },
    ],
    permissionChanges: [
      {
        action: "content:write",
        changeType: "added",
        before: null,
        after: candidate.manifest.permissions?.[0] ?? null,
      },
    ],
    dataEgressChanges: [
      {
        destination: "https://analytics.example.com",
        changeType: "added",
        before: null,
        after: candidate.manifest.dataEgress?.[0] ?? null,
      },
    ],
    capabilityTagsAdded: ["content.editorial"],
    capabilityTagsRemoved: [],
    currentValidationFindings: [],
    candidateValidationFindings: [
      {
        code: "REVIEW_DATA_EGRESS",
        message: "Review the analytics destination.",
        messageKey: "REVIEW_DATA_EGRESS",
        severity: "warning",
        resourcePath: null,
      },
    ],
  },
  createdByUserId: "user-1",
  createdAt: "2026-07-20T00:00:00Z",
};

function renderWithQueryClient(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

describe("Workspace Skill lifecycle actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.preview.mockResolvedValue(preview);
    apiMocks.repin.mockResolvedValue({
      previewId: preview.id,
      installation: { ...installation, versionId: candidate.id, metadataRevision: 5 },
    });
  });

  it("requires every candidate declaration before atomically repinning exact evidence", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <WorkspaceSkillUpdateAction
        workspaceId="workspace-1"
        installation={installation}
        candidate={candidate}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_SKILLS_UPDATE_REVIEW_ACTION",
      }),
    );
    expect(
      await screen.findByText("SETTINGS_WORKSPACE_SKILLS_UPDATE_RISK_DATA_EGRESS"),
    ).toBeInTheDocument();
    const confirm = screen.getByRole("button", {
      name: "settings:SETTINGS_WORKSPACE_SKILLS_UPDATE_CONFIRM_ACTION",
    });
    expect(confirm).toBeDisabled();

    for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(apiMocks.repin).toHaveBeenCalledTimes(1));
    expect(apiMocks.repin).toHaveBeenCalledWith(
      "workspace-1",
      installation.id,
      expect.objectContaining({
        previewId: preview.id,
        previewHash: preview.previewHash,
        currentVersionId: installation.versionId,
        candidateVersionId: candidate.id,
        candidatePackageChecksum: candidate.packageChecksum,
        acceptedRequiredTools: ["human.request_input"],
        acceptedPermissions: ["content:write"],
        acceptedDataEgress: ["https://analytics.example.com"],
      }),
      expect.any(String),
    );
  });

  it("retries preview creation with the same idempotency key", async () => {
    apiMocks.preview.mockRejectedValueOnce(new Error("preview unavailable"));
    const user = userEvent.setup();
    renderWithQueryClient(
      <WorkspaceSkillUpdateAction
        workspaceId="workspace-1"
        installation={installation}
        candidate={candidate}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_SKILLS_UPDATE_REVIEW_ACTION",
      }),
    );
    await screen.findByText("preview unavailable");
    await user.click(screen.getByRole("button", { name: "common:RETRY" }));
    await screen.findByText("SETTINGS_WORKSPACE_SKILLS_UPDATE_RISK_DATA_EGRESS");

    expect(apiMocks.preview).toHaveBeenCalledTimes(2);
    expect(apiMocks.preview.mock.calls[0]?.[3]).toBe(apiMocks.preview.mock.calls[1]?.[3]);
  });

  it("blocks removal while Agent, Assignment, or retained Run references exist", async () => {
    apiMocks.impact.mockResolvedValue(impactResult(false));
    renderWithQueryClient(
      <WorkspaceSkillRemovalAction
        onOpenChange={vi.fn()}
        open
        installation={installation}
        workspaceId="workspace-1"
      />,
    );

    expect(
      await screen.findByText("SETTINGS_WORKSPACE_SKILLS_REMOVE_BLOCKED_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_SKILLS_REMOVE_CONFIRM_ACTION",
      }),
    ).toBeDisabled();
    expect(apiMocks.remove).not.toHaveBeenCalled();
  });

  it("removes an unreferenced installation with the reviewed revision", async () => {
    const impact = impactResult(true);
    apiMocks.impact.mockResolvedValue(impact);
    apiMocks.remove.mockResolvedValue({
      installationId: installation.id,
      impact,
      removed: true,
      removedAt: "2026-07-20T01:00:00Z",
    });
    const user = userEvent.setup();
    renderWithQueryClient(
      <WorkspaceSkillRemovalAction
        onOpenChange={vi.fn()}
        open
        installation={installation}
        workspaceId="workspace-1"
      />,
    );

    await screen.findByText("SETTINGS_WORKSPACE_SKILLS_REMOVE_READY_TITLE");
    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_SKILLS_REMOVE_CONFIRM_ACTION",
      }),
    );

    await waitFor(() => expect(apiMocks.remove).toHaveBeenCalledTimes(1));
    expect(apiMocks.remove).toHaveBeenCalledWith(
      "workspace-1",
      installation.id,
      installation.metadataRevision,
      expect.any(String),
    );
  });

  it("keeps package archive disabled while governed references remain", async () => {
    apiMocks.packageImpact.mockResolvedValue(packageImpact(false));
    renderWithQueryClient(
      <WorkspaceSkillPackageArchiveAction
        metadataRevision={3}
        onOpenChange={vi.fn()}
        open
        packageId="package-1"
        workspaceId="workspace-1"
      />,
    );

    expect(
      await screen.findByText("SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_BLOCKED_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_CONFIRM_ACTION",
      }),
    ).toBeDisabled();
    expect(apiMocks.archivePackage).not.toHaveBeenCalled();
  });

  it("archives an unreferenced package with the reviewed revision", async () => {
    const impact = packageImpact(true);
    apiMocks.packageImpact.mockResolvedValue(impact);
    apiMocks.archivePackage.mockResolvedValue({
      packageId: "package-1",
      archived: true,
      status: "archived",
      metadataRevision: 4,
      impact,
      archivedAt: "2026-07-20T02:00:00Z",
    });
    const user = userEvent.setup();
    renderWithQueryClient(
      <WorkspaceSkillPackageArchiveAction
        metadataRevision={3}
        onOpenChange={vi.fn()}
        open
        packageId="package-1"
        workspaceId="workspace-1"
      />,
    );

    await screen.findByText("SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_READY_TITLE");
    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_CONFIRM_ACTION",
      }),
    );

    await waitFor(() => expect(apiMocks.archivePackage).toHaveBeenCalledTimes(1));
    expect(apiMocks.archivePackage).toHaveBeenCalledWith(
      "workspace-1",
      "package-1",
      3,
      expect.any(String),
    );
  });
});

function impactResult(canRemove: boolean): SkillInstallationImpactOut {
  return {
    installationId: installation.id,
    metadataRevision: installation.metadataRevision,
    status: installation.status,
    agentVersionCount: canRemove ? 0 : 2,
    publishedAgentVersionCount: canRemove ? 0 : 1,
    assignmentCount: canRemove ? 0 : 1,
    enabledAssignmentCount: canRemove ? 0 : 1,
    retainedRunCount: canRemove ? 0 : 3,
    blockers: canRemove ? [] : ["agent_versions", "assignments", "retained_runs"],
    canRemove,
  };
}

function packageImpact(canArchive: boolean) {
  return {
    packageId: "package-1",
    metadataRevision: 3,
    status: "active",
    versionCount: 2,
    resourceCount: 4,
    validationCount: 2,
    installationCount: canArchive ? 0 : 1,
    enabledInstallationCount: canArchive ? 0 : 1,
    agentVersionCount: canArchive ? 0 : 1,
    publishedAgentVersionCount: canArchive ? 0 : 1,
    assignmentCount: canArchive ? 0 : 1,
    enabledAssignmentCount: canArchive ? 0 : 1,
    retainedRunCount: canArchive ? 0 : 1,
    activeGithubOperationCount: canArchive ? 0 : 1,
    blockers: canArchive
      ? []
      : [
          "installations",
          "agent_versions",
          "assignments",
          "retained_runs",
          "active_github_operations",
        ],
    canArchive,
  };
}
