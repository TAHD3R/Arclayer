import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ProjectsPage } from "@/pages/usercenter/projects/page";

const translations = {
  "account:ACCOUNT_PAGE_PROJECTS_TITLE": "Projects",
  "account:ACCOUNT_PAGE_PROJECTS_DESC": "Manage your projects",
  "account:ACCOUNT_PROJECTS_CREATE_ACTION": "Create project",
  "account:ACCOUNT_PROJECTS_CREATE_DESC": "Create a project for sites and publishing.",
  "account:ACCOUNT_PROJECTS_EMPTY_TITLE": "No projects yet",
  "account:ACCOUNT_PROJECTS_EMPTY_DESC": "Create your first project",
  "account:ACCOUNT_PROJECTS_ARCHIVED_EMPTY_TITLE": "No archived projects",
  "account:ACCOUNT_PROJECTS_ARCHIVED_EMPTY_DESC": "Archived projects will appear here",
} as const;

const useSearchMock = vi.fn();
const useNavigateMock = vi.fn();
const projectsContentSectionMock = vi.fn();
const workspaceStoreState = {
  currentWorkspaceId: null as string | null,
  lastWorkspaceId: null as string | null,
  setCurrentWorkspaceId: vi.fn(),
  setCurrentProjectId: vi.fn(),
};

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => useSearchMock(),
  useNavigate: () => useNavigateMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key as keyof typeof translations] ?? key,
  }),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: (props: {
    title: string;
    description: string;
    action?: ReactNode;
    extra?: ReactNode;
    children?: ReactNode;
  }) => (
    <div>
      <h1>{props.title}</h1>
      <p>{props.description}</p>
      <div data-testid="page-action">{props.action}</div>
      <div>{props.extra}</div>
      <div>{props.children}</div>
    </div>
  ),
}));

vi.mock("@arclayer/ui/button", () => ({
  Button: (props: {
    children?: ReactNode;
    onClick?: () => void;
    type?: "button" | "submit" | "reset";
  }) => (
    <button type={props.type ?? "button"} onClick={props.onClick}>
      {props.children}
    </button>
  ),
}));

vi.mock("@arclayer/ui/chrome-tabs", () => ({
  ChromeTabs: (props: { children?: ReactNode }) => <div>{props.children}</div>,
  ChromeTabsContent: (props: { children?: ReactNode }) => <div>{props.children}</div>,
}));

vi.mock("@/components/common/data-table-tools-labels", () => ({
  buildDataTableToolsLabels: () => ({}),
}));

vi.mock("@arclayer/ui/data-table", () => ({
  useDataTableRowHeightPreference: () => ["medium", vi.fn()],
  useDataTableWrapHeadersPreference: () => [false, vi.fn()],
}));

vi.mock("@/stores/use-workspace-store", () => ({
  useWorkspaceStore: (selector: (state: typeof workspaceStoreState) => unknown) =>
    selector(workspaceStoreState),
}));

vi.mock("@/pages/usercenter/projects/components/usercenter-projects-dialogs", () => ({
  UserCenterProjectsDialogs: () => null,
}));

vi.mock("@/pages/usercenter/projects/components/usercenter-projects-toolbar", () => ({
  UserCenterProjectsToolbar: (props: { onViewModeChange: (mode: "card" | "table") => void }) => (
    <button type="button" onClick={() => props.onViewModeChange("table")}>
      Switch to table
    </button>
  ),
}));

vi.mock("@/pages/usercenter/projects/components/projects-content-section", () => ({
  ProjectsContentSection: (props: Record<string, unknown>) => {
    projectsContentSectionMock(props);
    return <div data-testid={`section-${props.archived ? "archived" : "active"}`} />;
  },
}));

vi.mock("@/pages/usercenter/projects/components/projects-columns", () => ({
  useUserCenterProjectsColumns: () => [],
}));

vi.mock("@/pages/usercenter/projects/hooks/use-project-menu-actions", () => ({
  useProjectMenuActions: () => ({
    buildMenuItems: () => [],
    prefetchProjectDangerCapabilities: vi.fn(),
    editingProjectId: null,
    editingProjectField: null,
    editingProjectName: "",
    editingProjectDescription: "",
    setEditingProjectName: vi.fn(),
    setEditingProjectDescription: vi.fn(),
    commitProjectEdit: vi.fn(),
    cancelProjectEdit: vi.fn(),
    isProjectEditNavigationSuppressed: false,
    mutations: {
      createMutation: {
        isPending: false,
        mutateAsync: vi.fn().mockResolvedValue(undefined),
      },
    },
    archiveDialog: {
      project: null,
      setProject: vi.fn(),
      pending: false,
      onConfirm: vi.fn(),
    },
    deleteDialog: {
      project: null,
      setProject: vi.fn(),
      confirmName: "",
      setConfirmName: vi.fn(),
      confirmMatches: false,
      pending: false,
      onConfirm: vi.fn(),
    },
    iconDialog: {
      project: null,
      setProject: vi.fn(),
      values: {
        iconMode: "initials",
        iconColor: "#337ea9",
        iconGlyph: null,
        iconEmoji: null,
        iconUrl: null,
      },
      setValues: vi.fn(),
      pending: false,
      onConfirm: vi.fn(),
      onClose: vi.fn(),
    },
  }),
}));

vi.mock("@/pages/usercenter/projects/hooks/use-usercenter-projects-tables", () => ({
  useUserCenterProjectsTables: () => ({
    activeTableId: "active-table",
    archivedTableId: "archived-table",
    activeTableHook: {
      table: {},
      searchInput: "",
      setSearchInput: vi.fn(),
      refetch: vi.fn(),
      isFetching: false,
      isLoading: false,
      error: null,
      pageData: null,
      resetColumnVisibility: vi.fn(),
    },
    archivedTableHook: {
      table: {},
      searchInput: "",
      setSearchInput: vi.fn(),
      refetch: vi.fn(),
      isFetching: false,
      isLoading: false,
      error: null,
      pageData: null,
      resetColumnVisibility: vi.fn(),
    },
  }),
}));

describe("ProjectsPage", () => {
  it("shows the header create action in table mode and keeps inline create affordances scoped to the active section", async () => {
    const user = userEvent.setup();
    useSearchMock.mockReturnValue({ create: undefined });

    render(<ProjectsPage />);

    expect(screen.queryByRole("button", { name: /create project/i })).not.toBeInTheDocument();

    let activeProps = projectsContentSectionMock.mock.calls
      .map(([props]) => props)
      .find((props) => props.archived === false);
    let archivedProps = projectsContentSectionMock.mock.calls
      .map(([props]) => props)
      .find((props) => props.archived === true);

    expect(activeProps.emptyExtra).toBeTruthy();
    expect(activeProps.appendCard).toBeTruthy();
    expect(archivedProps.emptyExtra).toBeUndefined();
    expect(archivedProps.appendCard).toBeUndefined();

    await user.click(screen.getByRole("button", { name: "Switch to table" }));

    expect(screen.getByRole("button", { name: /create project/i })).toBeInTheDocument();
  });
});
