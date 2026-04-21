import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemDirectoryUsersPage } from "@/pages/system/directory/users/page";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

vi.mock("@/components/common/data-table-search-input", () => ({
  DataTableSearchInput: ({ placeholder }: { placeholder: string }) => <div>{placeholder}</div>,
}));

vi.mock("@/layouts/page-shell/admin-data-table-section", () => ({
  AdminDataTableSection: ({
    emptyTitle,
    emptyDescription,
    toolbar,
  }: {
    emptyTitle: string;
    emptyDescription: string;
    toolbar?: React.ReactNode;
  }) => (
    <div>
      <div>{emptyTitle}</div>
      <div>{emptyDescription}</div>
      <div>{toolbar}</div>
    </div>
  ),
}));

vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({
    formatDateTime: (value: string) => value,
  }),
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
  });
});
