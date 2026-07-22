import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentCatalogControlPlane } from "@/pages/system/agents/agent-catalog-control-plane";

const mocks = vi.hoisted(() => ({
  createAssignment: vi.fn(),
  createDefinition: vi.fn(),
  createVersion: vi.fn(),
  getCapabilities: vi.fn(),
  getDefinition: vi.fn(),
  listProjects: vi.fn(),
  listDefinitions: vi.fn(),
  listSkillGrantOptions: vi.fn(),
  listWorkspaces: vi.fn(),
  notifySuccess: vi.fn(),
  retireVersion: vi.fn(),
  updateAssignment: vi.fn(),
  updateDefinition: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/api/system-agents", () => ({
  SYSTEM_AGENT_CAPABILITIES_QUERY_KEY: ["system", "agents", "capabilities"],
  SYSTEM_AGENT_DEFINITIONS_QUERY_KEY: ["system", "agents", "definitions"],
  createSystemAgentAssignment: (...args: unknown[]) => mocks.createAssignment(...args),
  createSystemAgentDefinition: (...args: unknown[]) => mocks.createDefinition(...args),
  createSystemAgentVersion: (...args: unknown[]) => mocks.createVersion(...args),
  getSystemAgentCapabilities: (...args: unknown[]) => mocks.getCapabilities(...args),
  getSystemAgentDefinition: (...args: unknown[]) => mocks.getDefinition(...args),
  listSystemAgentDefinitions: (...args: unknown[]) => mocks.listDefinitions(...args),
  retireSystemAgentVersion: (...args: unknown[]) => mocks.retireVersion(...args),
  updateSystemAgentAssignment: (...args: unknown[]) => mocks.updateAssignment(...args),
  updateSystemAgentDefinition: (...args: unknown[]) => mocks.updateDefinition(...args),
}));

vi.mock("@/api/system-directory", () => ({
  listSystemDirectoryProjects: (...args: unknown[]) => mocks.listProjects(...args),
  listSystemDirectoryWorkspaces: (...args: unknown[]) => mocks.listWorkspaces(...args),
}));

vi.mock("@/api/workspace-skills", () => ({
  WORKSPACE_SKILLS_QUERY_KEY: ["workspace", "skills"],
  listWorkspaceSkillGrantOptions: (...args: unknown[]) => mocks.listSkillGrantOptions(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifySuccessText: (...args: unknown[]) => mocks.notifySuccess(...args),
}));

vi.mock("@arclayer/ui/setting-dialog", () => ({
  SettingDialog: ({
    open,
    title,
    description,
    children,
    footer,
  }: {
    open: boolean;
    title?: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={typeof title === "string" ? title : undefined}>
        {title ? <h3>{title}</h3> : null}
        {description ? <p>{description}</p> : null}
        {children}
        {footer}
      </div>
    ) : null,
}));

vi.mock("@arclayer/ui/setting-dialog-field", () => ({
  SettingDialogFields: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SettingDialogField: ({
    title,
    description,
    children,
  }: {
    title?: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <label>
      {title ? <span>{title}</span> : null}
      {children}
      {description ? <span>{description}</span> : null}
    </label>
  ),
}));

const version = {
  id: "version-1",
  definitionId: "agent-1",
  versionNumber: 1,
  state: "published" as const,
  instructions: "Build evidence-backed plans.",
  modelPolicy: { routingPolicy: "workspace_default" as const },
  supportedExecutionModes: ["plan", "build"] as Array<"plan" | "build">,
  toolGrants: ["human.request_input"],
  skillGrantWorkspaceId: null,
  skillInstallationIds: [],
  knowledgeBaseIds: [],
  delegationDefinitionIds: [],
  approvalProfile: { profileId: "human-input-v1" },
  compatibility: { agentRuntimeProtocol: 1 as const },
  provenance: { kind: "system_custom" as const },
  contentChecksum: "a".repeat(64),
  publishedAt: "2026-07-20T00:00:00Z",
  createdByUserId: "user-1",
  createdAt: "2026-07-20T00:00:00Z",
  updatedAt: "2026-07-20T00:00:00Z",
};

const summary = {
  id: "agent-1",
  stableKey: "system:research-editor",
  scope: "system" as const,
  workspaceId: null,
  slug: "research-editor",
  displayName: "Research Editor",
  nameI18NKey: null,
  role: "content_research",
  roleI18NKey: null,
  description: "Turns workspace evidence into cited plans.",
  descriptionI18NKey: null,
  avatarUrl: null,
  lifecycleState: "active" as const,
  isOfficial: false,
  createdByUserId: "user-1",
  latestVersion: version,
  versionCount: 1,
  assignmentCount: 0,
  enabledAssignmentCount: 0,
  createdAt: "2026-07-20T00:00:00Z",
  updatedAt: "2026-07-20T00:00:00Z",
};

const detail = {
  ...summary,
  versions: [version],
  assignments: [],
};

function renderControlPlane() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgentCatalogControlPlane />
    </QueryClientProvider>,
  );
}

describe("AgentCatalogControlPlane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listDefinitions.mockResolvedValue({
      items: [summary],
      total: 1,
      page: 1,
      size: 100,
      pages: 1,
    });
    mocks.getDefinition.mockResolvedValue(detail);
    mocks.getCapabilities.mockResolvedValue({
      supportedToolGrants: ["human.request_input"],
      skillGrantsAvailable: true,
      knowledgeGrantsAvailable: false,
      modelRoutingPolicies: ["workspace_default"],
      agentRuntimeProtocol: 1,
      hardDeleteSupported: false,
      constraints: {},
    });
    mocks.createDefinition.mockResolvedValue(detail);
    mocks.createVersion.mockResolvedValue({
      ...version,
      id: "version-2",
      versionNumber: 2,
    });
    mocks.listProjects.mockResolvedValue({ items: [], total: 0 });
    mocks.listWorkspaces.mockResolvedValue({
      items: [
        {
          workspaceId: "workspace-1",
          name: "Design Workspace",
          isActive: true,
          isArchived: false,
          memberCount: 3,
          projectCount: 1,
        },
      ],
      total: 1,
      page: 1,
      size: 100,
      pages: 1,
    });
    mocks.listSkillGrantOptions.mockResolvedValue({
      installations: [
        {
          id: "installation-1",
          workspaceId: "workspace-1",
          packageScope: "workspace",
          packageId: "package-1",
          versionId: "skill-version-1",
          packageChecksum: `sha256:${"a".repeat(64)}`,
          validationFindingHash: `sha256:${"b".repeat(64)}`,
          acceptedRequiredTools: ["human.request_input"],
          acceptedPermissions: [],
          acceptedDataEgress: [],
          status: "enabled",
          safeReasonCode: null,
          metadataRevision: 1,
          installedByUserId: "user-1",
          updatedByUserId: "user-1",
          createdAt: "2026-07-20T00:00:00Z",
          updatedAt: "2026-07-20T00:00:00Z",
        },
      ],
      officialPackages: [],
      workspacePackages: [
        {
          id: "package-1",
          workspaceId: "workspace-1",
          slug: "sitemap-planner",
          displayName: "Sitemap Planner",
          description: "Plans a reviewable sitemap.",
          publisherId: "workspace-1",
          publisherName: "Design Workspace",
          trustLevel: "workspace",
          sourceKind: "inline",
          status: "active",
          latestValidVersionId: "skill-version-1",
          metadataRevision: 1,
          createdByUserId: "user-1",
          createdAt: "2026-07-20T00:00:00Z",
          updatedAt: "2026-07-20T00:00:00Z",
        },
      ],
    });
    mocks.retireVersion.mockResolvedValue({ ...version, state: "retired" });
  });

  it("renders the Definition to Version to Assignment relationship", async () => {
    renderControlPlane();

    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_AGENT_STAGE_DEFINITION"),
    ).toBeInTheDocument();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_AGENT_STAGE_VERSION")).toBeInTheDocument();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_AGENT_STAGE_ASSIGNMENT")).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_AGENT_KNOWLEDGE_GRANTS_PENDING_DESC"),
    ).toBeInTheDocument();
  });

  it("queries the server catalog using the entered search term", async () => {
    const user = userEvent.setup();
    renderControlPlane();

    await user.type(
      await screen.findByLabelText("settings:SETTINGS_SYSTEM_AGENT_SEARCH_LABEL"),
      "research",
    );

    await waitFor(() => {
      expect(mocks.listDefinitions).toHaveBeenCalledWith(
        expect.objectContaining({ q: "research", page: 1, size: 100 }),
      );
    });
  });

  it("creates a Definition and immutable initial Version as one payload", async () => {
    const user = userEvent.setup();
    renderControlPlane();
    await screen.findByText("Research Editor");

    await user.click(
      screen.getByRole("button", { name: "settings:SETTINGS_SYSTEM_AGENT_CREATE_ACTION" }),
    );
    await user.type(
      screen.getByLabelText("settings:SETTINGS_SYSTEM_AGENT_NAME_LABEL"),
      "Editorial Planner",
    );
    await user.type(
      screen.getByLabelText("settings:SETTINGS_SYSTEM_AGENT_ROLE_LABEL"),
      "editorial_planning",
    );
    await user.type(
      screen.getByLabelText("settings:SETTINGS_SYSTEM_AGENT_DESCRIPTION_LABEL"),
      "Creates reviewable editorial plans.",
    );
    await user.type(
      screen.getByLabelText(/SETTINGS_SYSTEM_AGENT_INSTRUCTIONS_LABEL/),
      "Use cited workspace evidence.",
    );
    await user.click(
      screen.getAllByRole("button", { name: "settings:SETTINGS_SYSTEM_AGENT_CREATE_ACTION" })[1],
    );

    await waitFor(() => {
      expect(mocks.createDefinition.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          displayName: "Editorial Planner",
          slug: "editorial-planner",
          role: "editorial_planning",
          initialVersion: expect.objectContaining({
            instructions: "Use cited workspace evidence.",
            supportedExecutionModes: ["plan", "build"],
            toolGrants: ["human.request_input"],
            skillGrantWorkspaceId: null,
          }),
        }),
      );
    });
  });

  it("requires confirmation before retiring an immutable Version", async () => {
    const user = userEvent.setup();
    renderControlPlane();
    const retireButton = await screen.findByRole("button", {
      name: "settings:SETTINGS_SYSTEM_AGENT_VERSION_RETIRE_ACTION",
    });
    await user.click(retireButton);
    expect(
      screen.getByRole("dialog", { name: "settings:SETTINGS_SYSTEM_AGENT_VERSION_RETIRE_TITLE" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getAllByRole("button", {
        name: "settings:SETTINGS_SYSTEM_AGENT_VERSION_RETIRE_ACTION",
      })[1],
    );

    await waitFor(() => {
      expect(mocks.retireVersion).toHaveBeenCalledWith("agent-1", "version-1");
    });
  });

  it("publishes exact Workspace Skill installations with the immutable Version", async () => {
    const user = userEvent.setup();
    renderControlPlane();
    await screen.findByText("Research Editor");

    await user.click(
      await screen.findByRole("button", {
        name: "settings:SETTINGS_SYSTEM_AGENT_VERSION_CREATE_ACTION",
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "settings:SETTINGS_SYSTEM_AGENT_VERSION_CREATE_TITLE",
    });
    await user.click(
      within(dialog).getByRole("combobox", {
        name: /SETTINGS_SYSTEM_AGENT_SKILL_WORKSPACE_LABEL/,
      }),
    );
    await user.click(await screen.findByRole("option", { name: "Design Workspace" }));
    await user.click(
      await screen.findByRole("checkbox", {
        name: /Sitemap Planner/,
      }),
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_AGENT_VERSION_PUBLISH_ACTION",
      }),
    );

    await waitFor(() => {
      expect(mocks.createVersion).toHaveBeenCalledWith(
        "agent-1",
        expect.objectContaining({
          skillGrantWorkspaceId: "workspace-1",
          skillInstallationIds: ["installation-1"],
        }),
      );
    });
  });

  it("disables Skill-granted Versions owned by another assignment workspace", async () => {
    const user = userEvent.setup();
    mocks.getDefinition.mockResolvedValue({
      ...detail,
      versions: [
        version,
        {
          ...version,
          id: "version-2",
          versionNumber: 2,
          skillGrantWorkspaceId: "workspace-2",
          skillInstallationIds: ["installation-2"],
        },
      ],
    });
    renderControlPlane();

    await user.click(
      await screen.findByRole("button", {
        name: "settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_CREATE_ACTION",
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_CREATE_TITLE",
    });
    await user.click(
      within(dialog).getByRole("combobox", {
        name: /SETTINGS_SYSTEM_AGENT_ASSIGNMENT_WORKSPACE_LABEL/,
      }),
    );
    await user.click(await screen.findByRole("option", { name: "Design Workspace" }));
    await user.click(
      within(dialog).getByRole("combobox", {
        name: /SETTINGS_SYSTEM_AGENT_ASSIGNMENT_VERSION_LABEL/,
      }),
    );

    const versionOptions = await screen.findAllByRole("option", {
      name: "settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_VERSION_OPTION",
    });
    expect(versionOptions).toHaveLength(2);
    expect(versionOptions[1]).toHaveAttribute("aria-disabled", "true");
  });
});
