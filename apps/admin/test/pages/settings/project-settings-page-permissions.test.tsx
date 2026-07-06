import type { PropsWithChildren, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectSettingsPage } from "@/pages/projects/settings/project/page";

const getProjectDetailMock = vi.fn();
const patchProjectMock = vi.fn();
const checkProjectSlugAvailabilityMock = vi.fn();
const getProjectCoreSettingsMock = vi.fn();
const patchProjectCoreSettingsMock = vi.fn();
const getMyProjectAuthzMock = vi.fn();
const listProjectPermissionActionsMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en", resolvedLanguage: "en" },
    t: (key: string) => key,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/api/projects", () => ({
  getProjectDetail: (...args: unknown[]) => getProjectDetailMock(...args),
  patchProject: (...args: unknown[]) => patchProjectMock(...args),
  checkProjectSlugAvailability: (...args: unknown[]) => checkProjectSlugAvailabilityMock(...args),
}));

vi.mock("@/api/settings", () => ({
  getProjectCoreSettings: (...args: unknown[]) => getProjectCoreSettingsMock(...args),
  patchProjectCoreSettings: (...args: unknown[]) => patchProjectCoreSettingsMock(...args),
}));

vi.mock("@/api/workspaces", () => ({
  getMyProjectAuthz: (...args: unknown[]) => getMyProjectAuthzMock(...args),
}));

vi.mock("@/api/rbac", () => ({
  listProjectPermissionActions: (...args: unknown[]) => listProjectPermissionActionsMock(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@arclayer/hooks/use-saving-key", () => ({
  useSavingKey: () => ({
    savingKey: null,
    withSavingKey: async (_key: string, action: () => Promise<unknown>) => action(),
  }),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({
    title,
    description,
    extra,
    children,
  }: PropsWithChildren<{
    title: string;
    description: string;
    extra?: ReactNode;
  }>) => (
    <div data-testid="default-page" data-title={title} data-description={description}>
      <div data-testid="default-page-extra">{extra}</div>
      {children}
    </div>
  ),
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: (props: PropsWithChildren) => <>{props.children}</>,
}));

vi.mock("@arclayer/ui/chrome-tabs", () => ({
  ChromeTabs: (props: PropsWithChildren<{ value: string }>) => (
    <div data-testid="chrome-tabs" data-value={props.value}>
      {props.children}
    </div>
  ),
  ChromeTabsContent: (props: PropsWithChildren<{ value: string }>) => (
    <div data-testid={`chrome-tabs-content-${props.value}`}>{props.children}</div>
  ),
  ChromeTabsList: (props: PropsWithChildren) => <div>{props.children}</div>,
  ChromeTabsTrigger: (props: PropsWithChildren<{ value: string }>) => (
    <button type="button" data-value={props.value}>
      {props.children}
    </button>
  ),
}));

vi.mock("@arclayer/ui/accordion", () => ({
  Accordion: (props: PropsWithChildren) => <div>{props.children}</div>,
}));

vi.mock("@arclayer/ui/setting-panel", () => ({
  SettingPanel: (props: PropsWithChildren<{ title: string; description: string }>) => (
    <section
      data-testid="setting-panel"
      data-title={props.title}
      data-description={props.description}
    >
      {props.children}
    </section>
  ),
}));

vi.mock("@arclayer/ui/setting-action-group", () => ({
  SettingActionGroup: (props: PropsWithChildren) => <div>{props.children}</div>,
}));

vi.mock("@arclayer/ui/setting-action-item", () => ({
  SettingActionItem: ({
    title,
    disabled,
    onTrigger,
  }: PropsWithChildren<{
    title: string;
    disabled?: boolean;
    as?: "button" | "div";
    onTrigger?: () => void;
  }>) => (
    <button
      type="button"
      data-testid={
        title === "common:ORG_WORKSPACES_ACTION_CHANGE_ICON" ? "project-icon-action" : undefined
      }
      disabled={disabled}
      onClick={() => onTrigger?.()}
    >
      {title}
    </button>
  ),
}));

vi.mock("@arclayer/ui/setting-accordion-item", () => ({
  SettingAccordionItem: ({
    value,
    disabled,
    children,
  }: PropsWithChildren<{
    value: string;
    disabled?: boolean;
  }>) => (
    <div data-testid={`accordion-${value}`} data-disabled={String(Boolean(disabled))}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/common/project-avatar", () => ({
  ProjectAvatar: () => <div data-testid="project-avatar" />,
  projectAvatarPropsFromIdentity: () => ({}),
}));

vi.mock("@/pages/usercenter/projects/components/project-icon-dialog", () => ({
  ProjectIconDialog: () => <div data-testid="project-icon-dialog" />,
}));

vi.mock("@/pages/projects/settings/api-keys/page", () => ({
  ProjectApiKeysSettingsPage: () => <div data-testid="project-api-keys-settings-page" />,
}));

vi.mock("@arclayer/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

function renderWithQuery(node: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>),
  };
}

describe("ProjectSettingsPage permission consumption", () => {
  beforeEach(() => {
    getProjectDetailMock.mockReset();
    patchProjectMock.mockReset();
    checkProjectSlugAvailabilityMock.mockReset();
    getProjectCoreSettingsMock.mockReset();
    patchProjectCoreSettingsMock.mockReset();
    getMyProjectAuthzMock.mockReset();
    listProjectPermissionActionsMock.mockReset();
    navigateMock.mockReset();

    getProjectDetailMock.mockResolvedValue({
      project: {
        id: "project-1",
        workspaceId: "workspace-1",
        slug: "launch-site",
        name: "Launch site",
        description: "Primary project",
        iconMode: "initials",
        iconColor: "#337ea9",
        iconGlyph: null,
        iconEmoji: null,
        iconUrl: null,
        isActive: true,
      },
      primaryRuntime: {
        runtimeId: "runtime-1",
        hostname: "launch.example.com",
      },
    });
    patchProjectMock.mockResolvedValue({});
    getProjectCoreSettingsMock.mockResolvedValue({
      namespace: "core",
      value: {
        project_source: {
          framework: "react_vite",
          source_provider: "managed",
          package_manager: "pnpm",
          root_directory: ".",
          build_command: "pnpm build",
          output_directory: "dist",
          artifact_strategy: "object_storage",
        },
      },
    });
    patchProjectCoreSettingsMock.mockResolvedValue({
      namespace: "core",
      value: {},
    });
    checkProjectSlugAvailabilityMock.mockResolvedValue({
      available: true,
      normalizedSlug: "launch-site",
      reason: null,
    });
    getMyProjectAuthzMock.mockResolvedValue({
      projectId: "project-1",
      workspaceId: "workspace-1",
      isSuperuser: false,
      permissionCodes: ["system:settings:manage"],
    });
    listProjectPermissionActionsMock.mockResolvedValue([
      {
        code: "project:settings:manage",
        description: "Manage project-level settings",
        subjectKinds: ["project_member"],
        permissionCodes: ["system:settings:manage"],
      },
    ]);
  });

  it("shows project read-only guidance and disables settings controls without manage access", async () => {
    getMyProjectAuthzMock.mockResolvedValueOnce({
      projectId: "project-1",
      workspaceId: "workspace-1",
      isSuperuser: false,
      permissionCodes: ["system:settings:read"],
    });

    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    expect(await screen.findAllByText("account:SETTINGS_PROJECT_READ_ONLY_DESC")).not.toHaveLength(
      0,
    );
    expect(screen.getByTestId("project-icon-action")).toBeDisabled();
    expect(screen.getByTestId("accordion-project_name")).toHaveAttribute("data-disabled", "true");
    expect(screen.getByTestId("accordion-project_slug")).toHaveAttribute("data-disabled", "true");
    expect(screen.getByTestId("accordion-project_description")).toHaveAttribute(
      "data-disabled",
      "true",
    );
    expect(await screen.findByDisplayValue("pnpm build")).toBeDisabled();
  });

  it("keeps project settings controls closed while permissions warm up", async () => {
    getMyProjectAuthzMock.mockImplementationOnce(() => new Promise(() => {}));

    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("project-icon-action")).toBeDisabled();
      expect(screen.getByTestId("accordion-project_name")).toHaveAttribute("data-disabled", "true");
      expect(screen.getByTestId("accordion-project_slug")).toHaveAttribute("data-disabled", "true");
      expect(screen.getByTestId("accordion-project_description")).toHaveAttribute(
        "data-disabled",
        "true",
      );
    });
    expect(screen.queryByText("account:SETTINGS_PROJECT_READ_ONLY_DESC")).not.toBeInTheDocument();
  });

  it("keeps website routing and release surfaces out of the project settings nav", async () => {
    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    expect(
      await screen.findByPlaceholderText("account:SETTINGS_PROJECT_SEARCH_PLACEHOLDER"),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "account:SETTINGS_PROJECT_TITLE" });

    expect(within(nav).getByText("account:SETTINGS_NAV_PROJECT_GENERAL")).toBeInTheDocument();
    expect(within(nav).getByText("account:SETTINGS_NAV_PROJECT_API")).toBeInTheDocument();
    expect(within(nav).queryByText("account:SETTINGS_NAV_PROJECT_DOMAIN")).not.toBeInTheDocument();
    expect(
      within(nav).queryByText("account:SETTINGS_PROJECT_DEPLOYMENTS_TITLE"),
    ).not.toBeInTheDocument();
  });

  it("surfaces the project settings responsibility audit", async () => {
    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    expect(await screen.findByText("account:SETTINGS_PROJECT_SCOPE_TITLE")).toBeInTheDocument();
    expect(
      screen.getByText("account:SETTINGS_PROJECT_SCOPE_PROJECT_OPS_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("account:SETTINGS_PROJECT_SCOPE_WEBSITE_OPS_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("account:SETTINGS_PROJECT_SCOPE_BUILDER_OPS_TITLE"),
    ).toBeInTheDocument();
  });

  it("routes moved responsibility rows to their dedicated project surfaces", async () => {
    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "account:SETTINGS_PROJECT_SCOPE_WEBSITE_OPS_TITLE",
      }),
    );
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/$projectId/website/domain",
      params: { projectId: "project-1" },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "account:SETTINGS_PROJECT_SCOPE_BUILDER_OPS_TITLE",
      }),
    );
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/$projectId/editor",
      params: { projectId: "project-1" },
    });
  });

  it("filters project settings navigation with the system settings search pattern", async () => {
    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    const search = await screen.findByPlaceholderText(
      "account:SETTINGS_PROJECT_SEARCH_PLACEHOLDER",
    );
    fireEvent.change(search, { target: { value: "database" } });
    const nav = screen.getByRole("navigation", { name: "account:SETTINGS_PROJECT_TITLE" });

    expect(within(nav).getByText("account:SETTINGS_PROJECT_DATABASES_TITLE")).toBeInTheDocument();
    expect(within(nav).queryByText("account:SETTINGS_NAV_PROJECT_GENERAL")).not.toBeInTheDocument();
  });

  it("surfaces framework fit guidance for project source settings", async () => {
    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    const evaluation = await screen.findByTestId("project-source-framework-evaluation");

    expect(
      within(evaluation).getByText("account:SETTINGS_PROJECT_SOURCE_FRAMEWORK_EVALUATION_TITLE"),
    ).toBeInTheDocument();
    expect(
      within(evaluation).getByText("account:SETTINGS_PROJECT_SOURCE_FRAMEWORK_STATUS_RECOMMENDED"),
    ).toBeInTheDocument();
    expect(
      within(evaluation).getByText("account:SETTINGS_PROJECT_SOURCE_FRAMEWORK_REACT_VITE_SUMMARY"),
    ).toBeInTheDocument();
    expect(
      within(evaluation).getByText(
        "account:SETTINGS_PROJECT_SOURCE_FRAMEWORK_REACT_VITE_FIT_VISUAL",
      ),
    ).toBeInTheDocument();
    expect(
      within(evaluation).getByText("account:SETTINGS_PROJECT_SOURCE_FRAMEWORK_REACT_VITE_FIT_AI"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("account:SETTINGS_PROJECT_SOURCE_PROVIDER_MODE_MANAGED_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("account:SETTINGS_PROJECT_SOURCE_PROVIDER_MODE_MANAGED_DESC"),
    ).toBeInTheDocument();

    const runtimeBinding = screen.getByTestId("project-source-runtime-binding");
    expect(
      within(runtimeBinding).getByText("account:SETTINGS_PROJECT_SOURCE_RUNTIME_BINDING_TITLE"),
    ).toBeInTheDocument();
    expect(
      within(runtimeBinding).getByText(
        "account:SETTINGS_PROJECT_SOURCE_RUNTIME_BINDING_SETTINGS_TITLE",
      ),
    ).toBeInTheDocument();
    expect(
      within(runtimeBinding).getByText(
        "account:SETTINGS_PROJECT_SOURCE_RUNTIME_BINDING_CONTENT_TITLE",
      ),
    ).toBeInTheDocument();
    expect(
      within(runtimeBinding).getByText(
        "account:SETTINGS_PROJECT_SOURCE_RUNTIME_BINDING_SOURCE_TITLE",
      ),
    ).toBeInTheDocument();
    expect(
      within(runtimeBinding).getByText(
        "account:SETTINGS_PROJECT_SOURCE_RUNTIME_BINDING_RELEASE_TITLE",
      ),
    ).toBeInTheDocument();

    const workflowContract = screen.getByTestId("project-source-workflow-contract");
    expect(
      within(workflowContract).getByText("account:SETTINGS_PROJECT_SOURCE_WORKFLOW_TITLE"),
    ).toBeInTheDocument();
    expect(
      within(workflowContract).getByText("account:SETTINGS_PROJECT_SOURCE_WORKFLOW_PREVIEW_TITLE"),
    ).toBeInTheDocument();
    expect(
      within(workflowContract).getByText(
        "account:SETTINGS_PROJECT_SOURCE_WORKFLOW_SOURCE_CRUD_READY_DESC",
      ),
    ).toBeInTheDocument();
    expect(
      within(workflowContract).getByText(
        "account:SETTINGS_PROJECT_SOURCE_WORKFLOW_RELEASE_READY_DESC",
      ),
    ).toBeInTheDocument();
  });

  it("persists project source build settings to project core settings", async () => {
    getProjectCoreSettingsMock.mockResolvedValueOnce({
      namespace: "core",
      value: {
        project_source: {
          framework: "react_vite",
          source_provider: "managed",
          package_manager: "pnpm",
          root_directory: ".",
          build_command: "pnpm build --initial",
          output_directory: "dist",
          artifact_strategy: "object_storage",
        },
      },
    });
    patchProjectCoreSettingsMock.mockResolvedValueOnce({
      namespace: "core",
      value: {
        project_source: {
          framework: "react_vite",
          source_provider: "managed",
          package_manager: "pnpm",
          root_directory: ".",
          build_command: "pnpm build --filter site",
          output_directory: "dist",
          artifact_strategy: "object_storage",
        },
      },
    });

    const { queryClient } = renderWithQuery(
      <ProjectSettingsPage activeTab="general" projectId="project-1" />,
    );
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    fireEvent.change(await screen.findByDisplayValue("pnpm build --initial"), {
      target: { value: "pnpm build --filter site" },
    });
    await waitFor(() => {
      expect(screen.getByText("settings:SETTINGS_SYSTEM_UNSAVED_CHANGES")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(patchProjectCoreSettingsMock).toHaveBeenCalledWith("project-1", {
        project_source: {
          framework: "react_vite",
          source_provider: "managed",
          package_manager: "pnpm",
          root_directory: ".",
          build_command: "pnpm build --filter site",
          output_directory: "dist",
          artifact_strategy: "object_storage",
        },
      });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["project-core-settings", "project-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["project", "source", "project-1"],
    });
  });

  it("surfaces Git source read-only guidance for project source settings", async () => {
    getProjectCoreSettingsMock.mockResolvedValueOnce({
      namespace: "core",
      value: {
        project_source: {
          framework: "react_vite",
          source_provider: "git",
          package_manager: "pnpm",
          root_directory: ".",
          build_command: "pnpm build",
          output_directory: "dist",
          artifact_strategy: "object_storage",
        },
      },
    });

    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    expect(
      await screen.findByText("account:SETTINGS_PROJECT_SOURCE_PROVIDER_MODE_GIT_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("account:SETTINGS_PROJECT_SOURCE_PROVIDER_MODE_GIT_DESC"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("account:SETTINGS_PROJECT_SOURCE_WORKFLOW_SOURCE_CRUD_LIMITED_DESC"),
    ).toBeInTheDocument();
  });

  it("surfaces Astro source guidance and generated file contract", async () => {
    getProjectCoreSettingsMock.mockResolvedValue({
      namespace: "core",
      value: {
        project_source: {
          framework: "astro",
          source_provider: "managed",
          package_manager: "pnpm",
          root_directory: ".",
          build_command: "pnpm build",
          output_directory: "dist",
          artifact_strategy: "object_storage",
        },
      },
    });

    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    const evaluation = await screen.findByTestId("project-source-framework-evaluation");

    await waitFor(() => {
      expect(
        within(evaluation).getByText("account:SETTINGS_PROJECT_SOURCE_FRAMEWORK_ASTRO_SUMMARY"),
      ).toBeInTheDocument();
    });
    expect(
      within(evaluation).getByText("account:SETTINGS_PROJECT_SOURCE_FRAMEWORK_ASTRO_FIT_CONTENT"),
    ).toBeInTheDocument();
    expect(screen.getByText("src/components/ReactIsland.tsx")).toBeInTheDocument();
    expect(screen.getByText("src/styles/global.css")).toBeInTheDocument();
  });
});
