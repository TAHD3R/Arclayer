import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TeamRolesView } from "@/pages/workspaces/team/roles/components/team-roles-view";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const {
  getWorkspaceRbacMatrixMock,
  createWorkspaceRoleFromTemplateMock,
  updateWorkspaceRoleMock,
  deleteWorkspaceRoleMock,
  setWorkspacePermissionRolesMock,
  notifySuccessTextMock,
  notifyErrorMock,
} = vi.hoisted(() => ({
  getWorkspaceRbacMatrixMock: vi.fn(),
  createWorkspaceRoleFromTemplateMock: vi.fn(),
  updateWorkspaceRoleMock: vi.fn(),
  deleteWorkspaceRoleMock: vi.fn(),
  setWorkspacePermissionRolesMock: vi.fn(),
  notifySuccessTextMock: vi.fn(),
  notifyErrorMock: vi.fn(),
}));

vi.mock("@/api/rbac", () => ({
  getWorkspaceRbacMatrix: (...args: unknown[]) => getWorkspaceRbacMatrixMock(...args),
  createWorkspaceRoleFromTemplate: (...args: unknown[]) =>
    createWorkspaceRoleFromTemplateMock(...args),
  updateWorkspaceRole: (...args: unknown[]) => updateWorkspaceRoleMock(...args),
  deleteWorkspaceRole: (...args: unknown[]) => deleteWorkspaceRoleMock(...args),
  setWorkspacePermissionRoles: (...args: unknown[]) => setWorkspacePermissionRolesMock(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifySuccessText: (...args: unknown[]) => notifySuccessTextMock(...args),
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      key === "team:TEAM_ROLES_PERMISSION_COUNT" ? `${options?.count ?? 0} permissions` : key,
  }),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: (props: {
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    extra?: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      <h1>{props.title}</h1>
      {props.description ? <p>{props.description}</p> : null}
      {props.action}
      {props.extra}
      {props.children}
    </div>
  ),
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: (props: { emptyTitle?: ReactNode; emptyDescription?: ReactNode }) => (
    <div>
      {props.emptyTitle}
      {props.emptyDescription}
    </div>
  ),
}));

vi.mock("@/components/common/data-table-search-input", () => ({
  DataTableSearchInput: (props: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <input
      aria-label={String(props.placeholder || "search")}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  ),
}));

vi.mock("@arclayer/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuIconItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
  }) => (
    <button disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}));

function renderWithQuery(node: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

describe("TeamRolesView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      keepSession: true,
      sessionVersion: 1,
      accessToken: "token",
      refreshToken: "refresh",
      tokenType: "bearer",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
    useWorkspaceStore.setState({ currentWorkspaceId: "ws-1", lastWorkspaceId: "ws-1" });

    getWorkspaceRbacMatrixMock.mockResolvedValue({
      roles: [
        {
          id: "role-system-admin",
          code: "admin",
          name: "Admin",
          description: "System role",
          isDefault: true,
          isSuperuser: true,
          isSystem: true,
        },
        {
          id: "role-custom-editor",
          code: "custom_editor",
          name: "Content editor",
          description: "Can edit pages",
          isDefault: false,
          isSuperuser: false,
          isSystem: false,
        },
      ],
      permissions: [
        {
          code: "content.write",
          name: "Edit content",
          description: "Allows editing content",
          pluginId: "core",
          pluginName: "Core",
          grantedRoleCodes: ["admin", "custom_editor"],
        },
      ],
    });
    createWorkspaceRoleFromTemplateMock.mockResolvedValue(null);
    updateWorkspaceRoleMock.mockResolvedValue(null);
    deleteWorkspaceRoleMock.mockResolvedValue(null);
    setWorkspacePermissionRolesMock.mockResolvedValue(null);
  });

  it("lets admins edit a custom role from the roles matrix header", async () => {
    const user = userEvent.setup();

    renderWithQuery(<TeamRolesView workspaceIdOverride="ws-1" />);

    await screen.findByTitle("Content editor");

    await user.click(screen.getByRole("button", { name: "team:TEAM_ACTION_EDIT" }));

    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);

    expect(dialogScope.getByText("team:TEAM_ROLES_EDIT_ROLE_DIALOG_TITLE")).toBeInTheDocument();
    const textboxes = dialogScope.getAllByRole("textbox");
    const [nameInput, descriptionInput] = textboxes;

    expect(nameInput).toHaveValue("Content editor");
    expect(descriptionInput).toHaveValue("Can edit pages");

    await user.clear(nameInput);
    await user.type(nameInput, "Senior editor");
    await user.clear(descriptionInput);
    await user.type(descriptionInput, "Owns editorial workflow");

    await user.click(dialogScope.getByRole("button", { name: "common:CONFIRM" }));

    await waitFor(() => {
      expect(updateWorkspaceRoleMock).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        roleCode: "custom_editor",
        name: "Senior editor",
        description: "Owns editorial workflow",
      });
    });
  });

  it("shows permission count beside search and uses a wide permission column with bordered header", async () => {
    const { container } = renderWithQuery(<TeamRolesView workspaceIdOverride="ws-1" />);

    await screen.findByTitle("Content editor");

    expect(screen.getByText("1 permissions")).toHaveClass("text-headline");

    const matrix = screen.getByRole("table");
    const matrixShell = matrix.parentElement;
    expect(matrixShell).toHaveClass("rounded-lg", "border", "border-border", "bg-background");
    const columns = matrix.querySelectorAll("col");
    expect(columns).toHaveLength(3);
    expect(columns[0]).toHaveAttribute("style", expect.stringContaining("42%"));
    expect(columns[1]).toHaveAttribute("style", expect.stringContaining("29%"));

    const tableHead = matrix.querySelector("thead");
    expect(tableHead).toHaveClass("border-b");

    const headerCells = matrix.querySelectorAll("th");
    expect(headerCells[0]).toHaveClass("bg-background", "border-r");

    const firstBodyRow = matrix.querySelector("tbody tr");
    expect(firstBodyRow).toHaveClass("bg-muted/35", "hover:bg-card");

    const stickyPermissionCell = firstBodyRow?.querySelector("td");
    expect(stickyPermissionCell).toHaveClass("bg-inherit", "border-r");

    const pageBody = container.querySelector(".flex.flex-col.gap-4.pb-8");
    expect(pageBody).not.toBeNull();
  });
});
