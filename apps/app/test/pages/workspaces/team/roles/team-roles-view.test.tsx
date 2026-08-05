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
  getWorkspacePermissionCatalogMock,
  createWorkspaceRoleFromTemplateMock,
  updateWorkspaceRoleMock,
  deleteWorkspaceRoleMock,
  setWorkspaceRolePermissionsBatchMock,
  workspacePermissionAccessMock,
  notifySuccessTextMock,
  notifyErrorMock,
} = vi.hoisted(() => ({
  getWorkspacePermissionCatalogMock: vi.fn(),
  createWorkspaceRoleFromTemplateMock: vi.fn(),
  updateWorkspaceRoleMock: vi.fn(),
  deleteWorkspaceRoleMock: vi.fn(),
  setWorkspaceRolePermissionsBatchMock: vi.fn(),
  workspacePermissionAccessMock: vi.fn(),
  notifySuccessTextMock: vi.fn(),
  notifyErrorMock: vi.fn(),
}));

vi.mock("@/api/rbac", () => ({
  getWorkspacePermissionCatalog: (...args: unknown[]) => getWorkspacePermissionCatalogMock(...args),
  createWorkspaceRoleFromTemplate: (...args: unknown[]) =>
    createWorkspaceRoleFromTemplateMock(...args),
  updateWorkspaceRole: (...args: unknown[]) => updateWorkspaceRoleMock(...args),
  deleteWorkspaceRole: (...args: unknown[]) => deleteWorkspaceRoleMock(...args),
  setWorkspaceRolePermissionsBatch: (...args: unknown[]) =>
    setWorkspaceRolePermissionsBatchMock(...args),
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

vi.mock("@/components/common/reui-filter-i18n", () => ({
  buildReuiFilterI18n: () => ({}),
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

vi.mock("@arclayer/ui/filters", () => ({
  createFilter: (field: string, operator: string, values: string[]) => ({
    id: `${field}-${operator}`,
    field,
    operator,
    values,
  }),
  Filters: ({ trigger }: { trigger: ReactNode }) => <>{trigger}</>,
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

    const roles = [
      {
        id: "role-system-admin",
        code: "admin",
        name: "Admin",
        description: "System role",
        isDefault: true,
        isSuperuser: true,
        isSystem: true,
        source: "system",
        immutable: true,
        revision: "role-admin-rev-1",
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
        source: "custom",
        immutable: false,
        revision: "role-editor-rev-1",
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
    ];
    const permissions = [
      {
        id: "permission-write",
        code: "content.write",
        scope: "workspace",
        name: "Edit content",
        description: "Allows editing content",
        groupCode: "content",
        groupName: "Content",
        sortOrder: 100001,
        ownerKey: "core",
        ownerName: "Core",
        lifecycle: "active",
        replacementCode: null,
        actionCodes: ["content.write"],
        conditionTemplates: [],
      },
      {
        id: "permission-read",
        code: "content.read",
        scope: "workspace",
        name: "Read content",
        description: "Allows reading content",
        groupCode: "content",
        groupName: "Content",
        sortOrder: 100002,
        ownerKey: "core",
        ownerName: "Core",
        lifecycle: "active",
        replacementCode: null,
        actionCodes: ["content.read"],
        conditionTemplates: ["own_content"],
      },
    ];
    getWorkspacePermissionCatalogMock.mockResolvedValue({
      status: "modified",
      catalog: {
        catalogRevision: "catalog-rev-1",
        etag: '"etag-1"',
        groups: [{ code: "content", name: "Content", order: 100 }],
        roles,
        permissions,
        actions: [],
        conditionTemplates: [
          {
            key: "own_content",
            field: "owner_user_id",
            operators: ["equals_current_user"],
            valueType: "context_user_id",
            description: "Own content",
          },
        ],
      },
    });
    createWorkspaceRoleFromTemplateMock.mockResolvedValue(null);
    updateWorkspaceRoleMock.mockResolvedValue(null);
    deleteWorkspaceRoleMock.mockResolvedValue(null);
    setWorkspaceRolePermissionsBatchMock.mockResolvedValue({
      catalogRevision: "catalog-rev-1",
      roles: [{ ...roles[1], revision: "role-editor-rev-2" }],
    });
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

  it("renders a bounded grouped matrix with sticky permission context", async () => {
    const { container } = renderWithQuery(<TeamRolesView workspaceIdOverride="ws-1" />);

    await screen.findByTitle("Content editor");

    const matrix = screen.getByRole("table");
    const matrixScope = within(matrix);
    expect(matrixScope.getByText("Content")).toBeInTheDocument();
    const matrixShell = matrix.parentElement;
    expect(matrixShell).toHaveClass("rounded-xl", "border", "border-border/70", "bg-background");
    const headerCells = matrix.querySelectorAll("th");
    expect(headerCells[0]).toHaveClass("sticky", "left-0", "bg-background");

    const permissionRow = matrixScope.getByText("Edit content").closest("tr");
    expect(permissionRow).toHaveClass("bg-background", "hover:bg-muted/20");

    const stickyPermissionCell = permissionRow?.querySelector("td");
    expect(stickyPermissionCell).toHaveClass("sticky", "left-0", "bg-inherit");

    const pageBody = container.querySelector(".flex.flex-col.gap-4.pb-8");
    expect(pageBody).not.toBeNull();
  });

  it("stages permission edits and saves the custom role permission set explicitly", async () => {
    const user = userEvent.setup();

    renderWithQuery(<TeamRolesView workspaceIdOverride="ws-1" />);

    await screen.findByTitle("Content editor");
    expect(screen.getByText("1 conditions")).toBeInTheDocument();

    const editContentRow = within(screen.getByRole("table"))
      .getByText("Edit content")
      .closest("tr");
    expect(editContentRow).not.toBeNull();
    const customRoleCheckbox = within(editContentRow as HTMLElement).getAllByRole("checkbox")[1];
    expect(customRoleCheckbox).toBeChecked();

    await user.click(customRoleCheckbox);

    expect(setWorkspaceRolePermissionsBatchMock).not.toHaveBeenCalled();
    expect(screen.getByText("team:TEAM_ROLES_UNSAVED_TITLE")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "team:TEAM_ROLES_SAVE_CHANGED" }));

    await waitFor(() => {
      expect(setWorkspaceRolePermissionsBatchMock).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        request: {
          catalogRevision: "catalog-rev-1",
          idempotencyKey: expect.any(String),
          roles: [
            {
              roleCode: "custom_editor",
              roleRevision: "role-editor-rev-1",
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
          ],
        },
      });
    });
  });

  it("reverts staged permission changes before save", async () => {
    const user = userEvent.setup();

    renderWithQuery(<TeamRolesView workspaceIdOverride="ws-1" />);

    await screen.findByTitle("Content editor");
    const editContentRow = within(screen.getByRole("table"))
      .getByText("Edit content")
      .closest("tr");
    expect(editContentRow).not.toBeNull();
    const customRoleCheckbox = within(editContentRow as HTMLElement).getAllByRole("checkbox")[1];

    await user.click(customRoleCheckbox);
    expect(customRoleCheckbox).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "team:TEAM_ROLES_REVERT_PERMISSIONS" }));

    expect(customRoleCheckbox).toBeChecked();
    expect(setWorkspaceRolePermissionsBatchMock).not.toHaveBeenCalled();
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
    expect(getWorkspacePermissionCatalogMock).not.toHaveBeenCalled();
  });
});
