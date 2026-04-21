import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemDirectoryUsersPage } from "@/pages/system/directory/users/page";

const { adminDataTableSectionMock, userDetailHookMock } = vi.hoisted(() => ({
  adminDataTableSectionMock: vi.fn(),
  userDetailHookMock: vi.fn(),
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

vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({
    formatDateTime: (value: string) => value,
  }),
}));

vi.mock("@/pages/system/directory/hooks", async () => {
  const actual = await vi.importActual<typeof import("@/pages/system/directory/hooks")>(
    "@/pages/system/directory/hooks",
  );

  return {
    ...actual,
    useSystemDirectoryUserDetail: userDetailHookMock,
  };
});

vi.mock("@/layouts/page-shell/admin-data-table-section", () => ({
  AdminDataTableSection: (props: {
    emptyTitle: string;
    emptyDescription: string;
    toolbar?: React.ReactNode;
    onRowClick?: (row: { original: { userId: string } }, rowIndex: number) => void;
  }) => {
    adminDataTableSectionMock(props);
    return (
      <div>
        <div>{props.emptyTitle}</div>
        <div>{props.emptyDescription}</div>
        <div>{props.toolbar}</div>
        {props.onRowClick ? (
          <button
            type="button"
            onClick={() => props.onRowClick?.({ original: { userId: "user-1" } }, 0)}
          >
            open-user-row
          </button>
        ) : null}
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

vi.mock("@arclayer/ui/data-table", async () => {
  const actual =
    await vi.importActual<typeof import("@arclayer/ui/data-table")>("@arclayer/ui/data-table");
  return {
    ...actual,
    useDataTable: () => ({
      table: {} as never,
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
    userDetailHookMock.mockImplementation((userId: string | null) => ({
      detail: userId
        ? {
            userId,
            username: "philip",
            displayName: "Philip",
            email: "philip@example.com",
            avatarUrl: null,
            status: "active",
            isSuperAdmin: true,
            lastLoginAt: null,
            createdAt: "2026-04-20T00:00:00Z",
            updatedAt: "2026-04-21T00:00:00Z",
            ownedOrganizationsCount: 1,
            organizationMembershipCount: 2,
            workspaceMembershipCount: 3,
            projectMembershipCount: 4,
          }
        : null,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }));
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
    expect(adminDataTableSectionMock).toHaveBeenCalled();
  });

  it("opens the details sheet after clicking a user row", () => {
    renderWithQueryClient(<SystemDirectoryUsersPage />);

    fireEvent.click(screen.getByText("open-user-row"));

    expect(userDetailHookMock).toHaveBeenLastCalledWith("user-1");
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_USER_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACCOUNT"),
    ).toBeInTheDocument();
  });
});
