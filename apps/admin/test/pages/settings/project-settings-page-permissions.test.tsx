import type { PropsWithChildren, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectSettingsPage } from "@/pages/projects/settings/project/page";

const getProjectDetailMock = vi.fn();
const patchProjectMock = vi.fn();
const checkProjectSlugAvailabilityMock = vi.fn();
const getProjectDangerCapabilitiesMock = vi.fn();
const archiveProjectMock = vi.fn();
const deleteProjectMock = vi.fn();
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
  archiveProject: (...args: unknown[]) => archiveProjectMock(...args),
  deleteProject: (...args: unknown[]) => deleteProjectMock(...args),
  getProjectDetail: (...args: unknown[]) => getProjectDetailMock(...args),
  getProjectDangerCapabilities: (...args: unknown[]) => getProjectDangerCapabilitiesMock(...args),
  patchProject: (...args: unknown[]) => patchProjectMock(...args),
  checkProjectSlugAvailability: (...args: unknown[]) => checkProjectSlugAvailabilityMock(...args),
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

vi.mock("@arclayer/ui/setting-dialog", () => ({
  SettingDialog: ({
    open,
    title,
    footer,
    children,
  }: PropsWithChildren<{ open: boolean; title: ReactNode; footer?: ReactNode }>) =>
    open ? (
      <div role="dialog" aria-label={String(title)}>
        {children}
        {footer}
      </div>
    ) : null,
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
    getProjectDangerCapabilitiesMock.mockReset();
    archiveProjectMock.mockReset();
    deleteProjectMock.mockReset();
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
        authoringMode: "builder_managed",
        authoringRevision: 4,
        authoringState: "ready",
        iconMode: "initials",
        iconColor: "#337ea9",
        iconGlyph: null,
        iconEmoji: null,
        iconUrl: null,
        isActive: true,
      },
      primaryRuntime: {
        id: "runtime-1",
        projectId: "project-1",
        name: "Primary runtime",
        kind: "managed",
        isActive: true,
      },
    });
    patchProjectMock.mockResolvedValue({});
    checkProjectSlugAvailabilityMock.mockResolvedValue({
      available: true,
      normalizedSlug: "launch-site",
      reason: null,
    });
    getProjectDangerCapabilitiesMock.mockResolvedValue({
      projectId: "project-1",
      workspaceId: "workspace-1",
      confirmDeleteName: "Launch site",
      archiveAction: { enabled: true, blockedReason: null },
      deleteAction: { enabled: true, blockedReason: null },
    });
    archiveProjectMock.mockResolvedValue({ projectId: "project-1", isActive: false });
    deleteProjectMock.mockResolvedValue({ projectId: "project-1", deleted: true });
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
    expect(screen.getByTestId("project-name-input")).toBeDisabled();
    expect(screen.queryByTestId("project-slug-input")).not.toBeInTheDocument();
    expect(screen.getByTestId("project-description-input")).toBeDisabled();
    expect(screen.getByTestId("project-archive-trigger")).toBeDisabled();
    expect(screen.getByTestId("project-delete-trigger")).toBeDisabled();
  });

  it("keeps project settings controls closed while permissions warm up", async () => {
    getMyProjectAuthzMock.mockImplementationOnce(() => new Promise(() => {}));

    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("project-icon-action")).toBeDisabled();
      expect(screen.getByTestId("project-name-input")).toBeDisabled();
      expect(screen.queryByTestId("project-slug-input")).not.toBeInTheDocument();
      expect(screen.getByTestId("project-description-input")).toBeDisabled();
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

  it("keeps every project settings section reachable from the narrow navigation sheet", async () => {
    const user = userEvent.setup();
    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    await user.click(
      await screen.findByRole("button", {
        name: "account:SETTINGS_PROJECT_NAVIGATION_ACTION",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "account:SETTINGS_PROJECT_TITLE" });
    await user.click(
      within(dialog).getByRole("button", { name: "account:SETTINGS_PROJECT_DATABASES_TITLE" }),
    );

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/$projectId/settings/databases",
      params: { projectId: "project-1" },
    });
  });

  it("keeps internal project source settings out of the user-facing project settings page", async () => {
    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("project-name-input")).toBeInTheDocument();
    });
    expect(screen.queryByDisplayValue("pnpm build")).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-source-framework-evaluation")).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-source-runtime-binding")).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-source-workflow-contract")).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-slug-input")).not.toBeInTheDocument();
  });

  it("shows the project lifecycle, authoring authority, access, and stable internal identity", async () => {
    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    expect(await screen.findByText("account:SETTINGS_PROJECT_CONTEXT_TITLE")).toBeInTheDocument();
    expect(screen.getByText("account:SETTINGS_PROJECT_STATUS_ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("account:SETTINGS_PROJECT_AUTHORING_BUILDER")).toBeInTheDocument();
    expect(screen.getByText("account:SETTINGS_PROJECT_ACCESS_MANAGE")).toBeInTheDocument();
    expect(screen.getByText("launch-site")).toBeInTheDocument();
    expect(screen.getByText("project-1")).toBeInTheDocument();
    expect(screen.getByText("workspace-1")).toBeInTheDocument();
    expect(screen.getByText("#4")).toBeInTheDocument();
  });

  it("marks an attached inactive runtime as needing attention", async () => {
    getProjectDetailMock.mockResolvedValueOnce({
      project: {
        id: "project-1",
        workspaceId: "workspace-1",
        slug: "launch-site",
        name: "Launch site",
        description: "Primary project",
        authoringMode: "builder_managed",
        authoringRevision: 4,
        authoringState: "ready",
        iconMode: "initials",
        iconColor: "#337ea9",
        iconGlyph: null,
        iconEmoji: null,
        iconUrl: null,
        isActive: true,
      },
      primaryRuntime: {
        id: "runtime-1",
        projectId: "project-1",
        name: "Primary runtime",
        kind: "managed",
        isActive: false,
      },
    });

    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    expect(await screen.findByText("Primary runtime")).toBeInTheDocument();
    expect(screen.getByText("account:SETTINGS_PROJECT_RUNTIME_INACTIVE_DESC")).toBeInTheDocument();
  });

  it("explains why lifecycle actions are disabled while capabilities load", async () => {
    getProjectDangerCapabilitiesMock.mockImplementationOnce(() => new Promise(() => {}));

    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("account:SETTINGS_PROJECT_DANGER_LOADING");
    expect(screen.getByTestId("project-archive-trigger")).toHaveAttribute(
      "aria-describedby",
      "project-danger-loading",
    );
    expect(screen.getByTestId("project-delete-trigger")).toBeDisabled();
    expect(status.closest("section")).toHaveAttribute("aria-busy", "true");
  });

  it("saves team-facing identity with local unsaved and saved feedback", async () => {
    const user = userEvent.setup();
    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    const nameInput = await screen.findByTestId("project-name-input");
    await user.clear(nameInput);
    await user.type(nameInput, "Launch workspace");

    expect(screen.getByTestId("project-identity-save-status")).toHaveTextContent(
      "account:SETTINGS_PROJECT_IDENTITY_UNSAVED",
    );
    await user.click(
      screen.getByRole("button", { name: "account:SETTINGS_PROJECT_IDENTITY_SAVE_ACTION" }),
    );

    await waitFor(() => {
      expect(patchProjectMock).toHaveBeenCalledWith("project-1", {
        name: "Launch workspace",
        description: "Primary project",
      });
      expect(screen.getByTestId("project-identity-save-status")).toHaveTextContent(
        "account:SETTINGS_PROJECT_IDENTITY_SAVED",
      );
    });
  });

  it("archives the project only after explicit confirmation", async () => {
    const user = userEvent.setup();
    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    await user.click(await screen.findByTestId("project-archive-trigger"));
    expect(archiveProjectMock).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("project-archive-confirm"));

    await waitFor(() => {
      expect(archiveProjectMock).toHaveBeenCalledWith("project-1");
      expect(navigateMock).toHaveBeenCalledWith({ to: "/projects" });
    });
  });

  it("requires the exact backend-provided project name before permanent deletion", async () => {
    const user = userEvent.setup();
    renderWithQuery(<ProjectSettingsPage activeTab="general" projectId="project-1" />);

    await user.click(await screen.findByTestId("project-delete-trigger"));
    const confirm = screen.getByTestId("project-delete-confirm");
    const nameInput = screen.getByLabelText(
      "account:ACCOUNT_PROJECTS_DELETE_CONFIRM_INPUT_PLACEHOLDER",
    );

    expect(confirm).toBeDisabled();
    await user.type(nameInput, "Launch");
    expect(confirm).toBeDisabled();
    await user.type(nameInput, " site");
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => {
      expect(deleteProjectMock).toHaveBeenCalledWith("project-1", "Launch site");
      expect(navigateMock).toHaveBeenCalledWith({ to: "/projects" });
    });
  });
});
