import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { WorkspacesPage } from "@/pages/usercenter/workspaces/page";

const translations = {
  "account:ACCOUNT_PAGE_WORKSPACES_TITLE": "Workspaces",
  "account:ACCOUNT_PAGE_WORKSPACES_DESC": "Manage your workspaces",
  "common:ORG_WORKSPACES_CREATE_TEAM": "Create workspace",
  "common:ORG_WORKSPACES_CREATE_TEAM_DIALOG_DESC":
    "Create a workspace for collaboration, projects, and client work.",
  "common:ORG_WORKSPACES_ACTIVE_EMPTY_TITLE": "No active workspaces",
  "common:ORG_WORKSPACES_ACTIVE_EMPTY_DESC": "Create your first workspace",
  "common:ORG_WORKSPACES_ARCHIVED_EMPTY_TITLE": "No archived workspaces",
  "common:ORG_WORKSPACES_ARCHIVED_EMPTY_DESC": "Archived workspaces will appear here",
} as const;

const useSearchMock = vi.fn();
const useNavigateMock = vi.fn();
const workspacesContentSectionMock = vi.fn();

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
  useWorkspaceStore: () => vi.fn(),
}));

vi.mock("@/pages/usercenter/workspaces/components/usercenter-workspaces-dialogs", () => ({
  UserCenterWorkspacesDialogs: () => null,
}));

vi.mock("@/pages/usercenter/workspaces/components/usercenter-workspaces-toolbar", () => ({
  UserCenterWorkspacesToolbar: (props: { onViewModeChange: (mode: "card" | "table") => void }) => (
    <button type="button" onClick={() => props.onViewModeChange("table")}>
      Switch to table
    </button>
  ),
}));

vi.mock("@/pages/usercenter/workspaces/components/workspaces-table-section", () => ({
  WorkspacesContentSection: (props: Record<string, unknown>) => {
    workspacesContentSectionMock(props);
    return <div data-testid={`section-${props.archived ? "archived" : "active"}`} />;
  },
}));

vi.mock("@/pages/usercenter/workspaces/components/workspaces-columns", () => ({
  useUserCenterWorkspacesColumns: () => [],
}));

vi.mock("@/pages/usercenter/workspaces/hooks/use-workspace-menu-actions", () => ({
  useWorkspaceMenuActions: () => ({
    buildMenuItems: () => [],
    prefetchWorkspaceDangerCapabilities: vi.fn(),
    editingWorkspaceId: null,
    editingWorkspaceField: null,
    editingWorkspaceName: "",
    editingWorkspaceDescription: "",
    setEditingWorkspaceName: vi.fn(),
    setEditingWorkspaceDescription: vi.fn(),
    commitWorkspaceEdit: vi.fn(),
    cancelWorkspaceEdit: vi.fn(),
    isWorkspaceEditNavigationSuppressed: false,
    mutations: {
      createMutation: {
        isPending: false,
        mutateAsync: vi.fn().mockResolvedValue(undefined),
      },
    },
    archiveDialog: {
      workspace: null,
      setWorkspace: vi.fn(),
      pending: false,
      onConfirm: vi.fn(),
    },
    deleteDialog: {
      workspace: null,
      setWorkspace: vi.fn(),
      confirmName: "",
      setConfirmName: vi.fn(),
      confirmMatches: false,
      pending: false,
      onConfirm: vi.fn(),
    },
    iconDialog: {
      workspace: null,
      setWorkspace: vi.fn(),
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

vi.mock("@/pages/usercenter/workspaces/hooks/use-usercenter-workspaces-tables", () => ({
  useUserCenterWorkspacesTables: () => ({
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

describe("WorkspacesPage", () => {
  it("shows the header create action in table mode and keeps inline create affordances scoped to the active section", async () => {
    const user = userEvent.setup();
    useSearchMock.mockReturnValue({ create: undefined });

    render(<WorkspacesPage />);

    expect(screen.queryByRole("button", { name: /create workspace/i })).not.toBeInTheDocument();

    let activeProps = workspacesContentSectionMock.mock.calls
      .map(([props]) => props)
      .find((props) => props.archived === false);
    let archivedProps = workspacesContentSectionMock.mock.calls
      .map(([props]) => props)
      .find((props) => props.archived === true);

    expect(activeProps.emptyExtra).toBeTruthy();
    expect(activeProps.appendCard).toBeTruthy();
    expect(archivedProps.emptyExtra).toBeUndefined();
    expect(archivedProps.appendCard).toBeUndefined();

    await user.click(screen.getByRole("button", { name: "Switch to table" }));

    expect(screen.getByRole("button", { name: /create workspace/i })).toBeInTheDocument();
  });
});
