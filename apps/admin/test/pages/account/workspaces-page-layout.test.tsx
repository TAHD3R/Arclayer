import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { WorkspacesPage } from "@/pages/usercenter/workspaces/page";

const mockNavigate = vi.fn();
const mockSetCurrentWorkspaceId = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  useSearch: () => ({ create: "0" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/stores/use-workspace-store", () => ({
  useWorkspaceStore: (
    selector: (state: { setCurrentWorkspaceId: typeof mockSetCurrentWorkspaceId }) => unknown,
  ) => selector({ setCurrentWorkspaceId: mockSetCurrentWorkspaceId }),
}));

vi.mock("@arclayer/ui/data-table", () => ({
  useDataTableRowHeightPreference: () => ["medium", vi.fn()],
  useDataTableWrapHeadersPreference: () => [false, vi.fn()],
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({ extra, children }: PropsWithChildren<{ extra?: ReactNode }>) => (
    <div>
      <div data-testid="default-page-extra">{extra}</div>
      <div data-testid="default-page-children">{children}</div>
    </div>
  ),
}));

vi.mock("@arclayer/ui/chrome-tabs", () => ({
  ChromeTabs: ({ children }: PropsWithChildren) => <div data-testid="chrome-tabs">{children}</div>,
  ChromeTabsContent: ({ children, value }: PropsWithChildren<{ value: string }>) => (
    <div data-testid={`chrome-tabs-content-${value}`}>{children}</div>
  ),
}));

vi.mock("@/pages/usercenter/workspaces/components/usercenter-workspaces-dialogs", () => ({
  UserCenterWorkspacesDialogs: () => null,
}));

vi.mock("@/pages/usercenter/workspaces/components/usercenter-workspaces-toolbar", () => ({
  UserCenterWorkspacesToolbar: (props: {
    viewMode: "card" | "table";
    onViewModeChange: (value: "card" | "table") => void;
  }) => (
    <button
      type="button"
      data-testid="workspaces-toolbar"
      data-view-mode={props.viewMode}
      onClick={() => props.onViewModeChange("table")}
    >
      toolbar
    </button>
  ),
}));

vi.mock("@/pages/usercenter/workspaces/components/workspaces-table-section", () => ({
  WorkspacesContentSection: (props: { archived: boolean; toolbar?: ReactNode }) => (
    <div
      data-testid={props.archived ? "archived-section" : "active-section"}
      data-has-toolbar={props.toolbar ? "true" : "false"}
    />
  ),
}));

vi.mock("@/pages/usercenter/workspaces/components/workspaces-columns", () => ({
  useUserCenterWorkspacesColumns: () => [],
}));

vi.mock("@/pages/usercenter/workspaces/hooks/use-usercenter-workspaces-mutations", () => ({
  useUserCenterWorkspacesMutations: () => ({
    createMutation: { isPending: false, mutateAsync: vi.fn() },
    archiveMutation: { isPending: false, mutateAsync: vi.fn() },
    unarchiveMutation: { mutateAsync: vi.fn() },
    deleteMutation: { isPending: false, mutateAsync: vi.fn() },
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

describe("WorkspacesPage layout", () => {
  it("keeps the toolbar in DefaultPage.extra after switching to table mode", async () => {
    const user = userEvent.setup();

    render(<WorkspacesPage />);

    const extra = screen.getByTestId("default-page-extra");
    expect(screen.getByTestId("workspaces-toolbar")).toHaveAttribute("data-view-mode", "card");
    expect(extra).toContainElement(screen.getByTestId("workspaces-toolbar"));

    await user.click(screen.getByTestId("workspaces-toolbar"));

    expect(screen.getByTestId("workspaces-toolbar")).toHaveAttribute("data-view-mode", "table");
    expect(extra).toContainElement(screen.getByTestId("workspaces-toolbar"));
    expect(screen.getByTestId("active-section")).toHaveAttribute("data-has-toolbar", "false");
    expect(screen.getByTestId("archived-section")).toHaveAttribute("data-has-toolbar", "false");
  });
});
