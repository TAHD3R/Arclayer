import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsScreenProvider } from "@/components/layout/settings-screen-provider";
import { TeamRolesView } from "@/pages/workspaces/team/roles/components/team-roles-view";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const {
  listAllWorkspaceRolesMock,
  listAllWorkspacePermissionsMock,
  createWorkspaceRoleFromTemplateMock,
  updateWorkspaceRoleMock,
  deleteWorkspaceRoleMock,
  setWorkspaceRolePermissionsMock,
  workspacePermissionAccessMock,
  notifySuccessTextMock,
  notifyErrorMock,
} = vi.hoisted(() => ({
  listAllWorkspaceRolesMock: vi.fn(),
  listAllWorkspacePermissionsMock: vi.fn(),
  createWorkspaceRoleFromTemplateMock: vi.fn(),
  updateWorkspaceRoleMock: vi.fn(),
  deleteWorkspaceRoleMock: vi.fn(),
  setWorkspaceRolePermissionsMock: vi.fn(),
  workspacePermissionAccessMock: vi.fn(),
  notifySuccessTextMock: vi.fn(),
  notifyErrorMock: vi.fn(),
}));

vi.mock("@/api/rbac", () => ({
  listAllWorkspaceRoles: (...args: unknown[]) => listAllWorkspaceRolesMock(...args),
  listAllWorkspacePermissions: (...args: unknown[]) => listAllWorkspacePermissionsMock(...args),
  createWorkspaceRoleFromTemplate: (...args: unknown[]) =>
    createWorkspaceRoleFromTemplateMock(...args),
  updateWorkspaceRole: (...args: unknown[]) => updateWorkspaceRoleMock(...args),
  deleteWorkspaceRole: (...args: unknown[]) => deleteWorkspaceRoleMock(...args),
  setWorkspaceRolePermissions: (...args: unknown[]) => setWorkspaceRolePermissionsMock(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifySuccessText: (...args: unknown[]) => notifySuccessTextMock(...args),
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
}));

vi.mock("@/hooks/use-workspace-permission-access", () => ({
  useWorkspacePermissionAccess: (...args: unknown[]) => workspacePermissionAccessMock(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      key === "team:TEAM_ROLES_PERMISSION_COUNT"
        ? `${options?.count ?? 0} permissions`
        : key === "team:TEAM_ROLES_CONDITION_SET_COUNT"
          ? `${options?.count ?? 0} conditions`
          : key,
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

  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsScreenProvider>{node}</SettingsScreenProvider>
    </QueryClientProvider>,
  );
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
    workspacePermissionAccessMock.mockReturnValue({
      authzQuery: { isLoading: false, data: { permissionCodes: [] }, error: null },
      actionsQuery: { isLoading: false, data: [], error: null },
      permissionCodes: ["rbac:roles:read", "rbac:permissions:read", "rbac:roles:write"],
      actionCatalog: [],
      isSuperuser: false,
      hasPermission: (code: string) =>
        ["rbac:roles:read", "rbac:permissions:read", "rbac:roles:write"].includes(code),
      hasAction: () => false,
    });

    listAllWorkspaceRolesMock.mockResolvedValue([
      {
        id: "role-system-admin",
        code: "admin",
        name: "Admin",
        description: "System role",
        isDefault: true,
        isSuperuser: true,
        isSystem: true,
        permissionCodes: ["content.write"],
      },
      {
        id: "role-custom-editor",
        code: "custom_editor",
        name: "Content editor",
        description: "Can edit pages",
        isDefault: false,
        isSuperuser: false,
        isSystem: false,
        permissionCodes: ["content.write", "content.read"],
        permissionGrants: [
          {
            permissionCode: "content.read",
            conditionSets: [
              {
                conditions: [
                  {
                    field: "owner_user_id",
                    operator: "equals_current_user",
                    value: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
    listAllWorkspacePermissionsMock.mockResolvedValue([
      {
        code: "content.write",
        name: "Edit content",
        description: "Allows editing content",
        ownerKey: "core",
        ownerName: "Core",
      },
      {
        code: "content.read",
        name: "Read content",
        description: "Allows reading content",
        ownerKey: "core",
        ownerName: "Core",
      },
    ]);
    createWorkspaceRoleFromTemplateMock.mockResolvedValue(null);
    updateWorkspaceRoleMock.mockResolvedValue(null);
    deleteWorkspaceRoleMock.mockResolvedValue(null);
    setWorkspaceRolePermissionsMock.mockResolvedValue(null);
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

  it("shows permission count beside search and uses the shared settings table border treatment", async () => {
    const { container } = renderWithQuery(<TeamRolesView workspaceIdOverride="ws-1" />);

    await screen.findByTitle("Content editor");

    expect(screen.getByText("2 permissions")).toHaveClass("text-headline");

    const matrix = screen.getByRole("table");
    const matrixShell = matrix.parentElement;
    expect(matrixShell).toHaveClass("rounded-xl", "border", "border-border/70", "bg-background");
    const columns = matrix.querySelectorAll("col");
    expect(columns).toHaveLength(3);
    expect(columns[0]).toHaveAttribute("style", expect.stringContaining("42%"));
    expect(columns[1]).toHaveAttribute("style", expect.stringContaining("29%"));

    const tableHead = matrix.querySelector("thead");
    expect(tableHead).toHaveClass("border-b", "border-border/60");

    const headerCells = matrix.querySelectorAll("th");
    expect(headerCells[0]).toHaveClass("bg-background");
    expect(headerCells[0]).not.toHaveClass("border-r");

    const firstBodyRow = matrix.querySelector("tbody tr");
    expect(firstBodyRow).toHaveClass("bg-background", "hover:bg-muted/20");

    const stickyPermissionCell = firstBodyRow?.querySelector("td");
    expect(stickyPermissionCell).toHaveClass("bg-inherit");
    expect(stickyPermissionCell).not.toHaveClass("border-r");
    expect(stickyPermissionCell?.firstElementChild).toHaveClass("min-w-0", "p-2");

    const pageBody = container.querySelector(".flex.flex-col.gap-4.pb-8");
    expect(pageBody).not.toBeNull();
  });

  it("stages permission edits and saves the custom role permission set explicitly", async () => {
    const user = userEvent.setup();

    renderWithQuery(<TeamRolesView workspaceIdOverride="ws-1" />);

    await screen.findByTitle("Content editor");
    expect(screen.getByText("1 conditions")).toBeInTheDocument();

    const editContentRow = screen.getByText("Edit content").closest("tr");
    expect(editContentRow).not.toBeNull();
    const customRoleCheckbox = within(editContentRow as HTMLElement).getAllByRole("checkbox")[1];
    expect(customRoleCheckbox).toBeChecked();

    await user.click(customRoleCheckbox);

    expect(setWorkspaceRolePermissionsMock).not.toHaveBeenCalled();
    expect(screen.getByText("team:TEAM_ROLES_UNSAVED_TITLE")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "team:TEAM_ROLES_SAVE_PERMISSIONS" }));

    await waitFor(() => {
      expect(setWorkspaceRolePermissionsMock).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        roleCode: "custom_editor",
        permissionCodes: ["content.read"],
        permissionGrants: [
          {
            permissionCode: "content.read",
            conditionSets: [
              {
                conditions: [
                  {
                    field: "owner_user_id",
                    operator: "equals_current_user",
                    value: null,
                  },
                ],
              },
            ],
          },
        ],
      });
    });
  });

  it("reverts staged permission changes before save", async () => {
    const user = userEvent.setup();

    renderWithQuery(<TeamRolesView workspaceIdOverride="ws-1" />);

    await screen.findByTitle("Content editor");
    const editContentRow = screen.getByText("Edit content").closest("tr");
    expect(editContentRow).not.toBeNull();
    const customRoleCheckbox = within(editContentRow as HTMLElement).getAllByRole("checkbox")[1];

    await user.click(customRoleCheckbox);
    expect(customRoleCheckbox).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "team:TEAM_ROLES_REVERT_PERMISSIONS" }));

    expect(customRoleCheckbox).toBeChecked();
    expect(setWorkspaceRolePermissionsMock).not.toHaveBeenCalled();
  });

  it("blocks the roles matrix when the current user cannot read RBAC", async () => {
    workspacePermissionAccessMock.mockReturnValue({
      authzQuery: { isLoading: false, data: { permissionCodes: [] }, error: null },
      actionsQuery: { isLoading: false, data: [], error: null },
      permissionCodes: [],
      actionCatalog: [],
      isSuperuser: false,
      hasPermission: () => false,
      hasAction: () => false,
    });

    renderWithQuery(<TeamRolesView workspaceIdOverride="ws-1" />);

    expect(screen.getByText(/common:PAGE_FORBIDDEN_TITLE/)).toBeInTheDocument();
    expect(listAllWorkspaceRolesMock).not.toHaveBeenCalled();
  });
});
