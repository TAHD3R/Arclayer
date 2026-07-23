import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemDirectoryProjectsPage } from "@/pages/system/directory/projects/page";
import { SystemDirectoryUsersPage } from "@/pages/system/directory/users/page";
import { SystemDirectoryWorkspacesPage } from "@/pages/system/directory/workspaces/page";

const { adminDataTableSectionMock } = vi.hoisted(() => ({
  adminDataTableSectionMock: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

vi.mock("@/components/common/data-table-search-input", () => ({
  DataTableSearchInput: ({ placeholder }: { placeholder: string }) => <div>{placeholder}</div>,
}));

vi.mock("@/api/system-directory", () => ({
  listSystemDirectoryUsers: vi
    .fn()
    .mockResolvedValue({ items: [], total: 0, page: 1, size: 20, pages: 0 }),
  listSystemDirectoryWorkspaces: vi
    .fn()
    .mockResolvedValue({ items: [], total: 0, page: 1, size: 20, pages: 0 }),
  listSystemDirectoryProjects: vi
    .fn()
    .mockResolvedValue({ items: [], total: 0, page: 1, size: 20, pages: 0 }),
  getSystemDirectoryUserDetail: vi.fn(),
  updateSystemDirectoryUser: vi.fn(),
  resetSystemDirectoryUserPassword: vi.fn(),
  revokeSystemDirectoryUserSessions: vi.fn(),
  sendSystemDirectoryUserResetPasswordEmail: vi.fn(),
  disableSystemDirectoryUserTwoFactor: vi.fn(),
  unlinkSystemDirectoryUserOAuthIdentity: vi.fn(),
  disableSystemDirectoryUser: vi.fn(),
  enableSystemDirectoryUser: vi.fn(),
  deleteSystemDirectoryUser: vi.fn(),
  getSystemDirectoryWorkspaceDetail: vi.fn(),
  updateSystemDirectoryWorkspace: vi.fn(),
  archiveSystemDirectoryWorkspace: vi.fn(),
  restoreSystemDirectoryWorkspace: vi.fn(),
  disableSystemDirectoryWorkspace: vi.fn(),
  enableSystemDirectoryWorkspace: vi.fn(),
  getSystemDirectoryProjectDetail: vi.fn(),
  updateSystemDirectoryProject: vi.fn(),
  disableSystemDirectoryProject: vi.fn(),
  enableSystemDirectoryProject: vi.fn(),
  deleteSystemDirectoryProject: vi.fn(),
}));

vi.mock("@/api/rbac", () => ({
  listWorkspaceRoles: vi
    .fn()
    .mockResolvedValue({ items: [], total: 0, page: 1, size: 20, pages: 0 }),
}));

vi.mock("@/api/workspaces", () => ({
  getWorkspaceRolePolicy: vi.fn().mockResolvedValue({ defaultRoleCode: "member" }),
  patchWorkspaceRolePolicy: vi.fn(),
  assignWorkspaceRoleToAllUsers: vi.fn(),
}));

vi.mock("@/components/common/data-table-tools-labels", () => ({
  buildDataTableToolsLabels: () => ({
    refresh: "common:DATA_TABLE_REFRESH",
    clearSelection: "common:DATA_TABLE_CLEAR_SELECTION",
    columns: "common:DATA_TABLE_COLUMNS",
    columnsTitle: "common:DATA_TABLE_COLUMNS_TITLE",
    columnsDescription: "common:DATA_TABLE_COLUMNS_DESCRIPTION",
    reset: "common:DATA_TABLE_RESET",
  }),
}));

vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({
    formatDateTime: (value: string) => value,
    localization: { timeZone: "UTC" },
  }),
}));

vi.mock("@/layouts/page-shell/admin-data-table-section", () => ({
  AdminDataTableSection: (props: {
    emptyTitle: string;
    emptyDescription: string;
    toolbar?: React.ReactNode;
    footerSlot?: React.ReactNode;
  }) => {
    adminDataTableSectionMock(props);
    return (
      <div>
        <div>{props.emptyTitle}</div>
        <div>{props.emptyDescription}</div>
        <div data-testid="toolbar">{props.toolbar}</div>
        <div>{props.footerSlot}</div>
      </div>
    );
  },
}));

vi.mock("@arclayer/ui/setting-sheet", () => ({
  SettingSheet: ({
    open,
    title,
    description,
    children,
  }: {
    open: boolean;
    title: string;
    description?: React.ReactNode;
    children?: React.ReactNode;
  }) =>
    open ? (
      <div>
        <div>{title}</div>
        <div>{description}</div>
        <div>{children}</div>
      </div>
    ) : null,
}));

vi.mock("@arclayer/ui/setting-dialog-field", () => ({
  SettingDialogFields: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SettingDialogField: ({
    title,
    children,
  }: {
    title: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <div>
      <div>{title}</div>
      <div>{children}</div>
    </div>
  ),
}));

vi.mock("@arclayer/ui/button", () => ({
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@arclayer/ui/select", () => ({
  Select: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: () => <span>sort-value</span>,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@arclayer/ui/filters", async () => {
  const actual =
    await vi.importActual<typeof import("@arclayer/ui/filters")>("@arclayer/ui/filters");
  return {
    ...actual,
    Filters: ({ trigger }: { trigger?: React.ReactNode }) => <div>{trigger ?? "filters"}</div>,
    createFilter: vi.fn(),
  };
});

vi.mock("@arclayer/ui/data-table", async () => {
  const actual =
    await vi.importActual<typeof import("@arclayer/ui/data-table")>("@arclayer/ui/data-table");
  return {
    ...actual,
    DataTableToolbarTools: ({ labels }: { labels: { refresh: string } }) => (
      <div>{labels.refresh}</div>
    ),
    useDataTable: () => ({
      table: {
        getSelectedRowModel: () => ({
          rows: [
            {
              id: "user-1",
              original: {
                userId: "user-1",
                username: "philip",
                displayName: "Philip",
                email: "philip@example.com",
                status: "active",
              },
            },
          ],
        }),
        resetRowSelection: vi.fn(),
      } as never,
      searchInput: "",
      setSearchInput: vi.fn(),
      requestParams: {},
      pageData: undefined,
      items: [],
      total: 0,
      pageCount: 0,
      infiniteScroll: undefined,
      sorting: [],
      setSorting: vi.fn(),
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
      resetColumnVisibility: vi.fn(),
    }),
    useDataTableRowHeightPreference: () => ["medium", vi.fn()],
    useDataTableWrapHeadersPreference: () => [false, vi.fn()],
  };
});

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("SystemDirectoryUsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the user directory empty state and search field", () => {
    renderWithQueryClient(<SystemDirectoryUsersPage />);

    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_DIRECTORY_USERS_EMPTY_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_DIRECTORY_USERS_EMPTY_DESC"),
    ).toBeInTheDocument();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_DIRECTORY_USERS_SEARCH")).toBeInTheDocument();
    expect(screen.getByText("sort-value")).toBeInTheDocument();
    expect(screen.getByText("common:DATA_TABLE_REFRESH")).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_DIRECTORY_SELECTED_COUNT"),
    ).toBeInTheDocument();
    expect(adminDataTableSectionMock).toHaveBeenCalled();
  });

  it("renders sort before filters in the toolbar", () => {
    renderWithQueryClient(<SystemDirectoryUsersPage />);

    const toolbar = screen.getByTestId("toolbar");
    const buttons = within(toolbar).getAllByRole("button");

    expect(buttons[0]).toHaveTextContent("sort-value");
  });
});

describe("System directory remaining tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the workspaces page shell", () => {
    renderWithQueryClient(<SystemDirectoryWorkspacesPage />);

    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_EMPTY_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_SEARCH"),
    ).toBeInTheDocument();
  });

  it("renders the projects page shell", () => {
    renderWithQueryClient(<SystemDirectoryProjectsPage />);

    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_EMPTY_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_SEARCH"),
    ).toBeInTheDocument();
  });
});
