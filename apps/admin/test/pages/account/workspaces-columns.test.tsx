import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useUserCenterWorkspacesColumns } from "@/pages/usercenter/workspaces/components/workspaces-columns";

vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({
    formatDateTime: (value: string | null | undefined) => value ?? "-",
  }),
}));

vi.mock("@/pages/usercenter/workspaces/components/workspace-members-popover", () => ({
  WorkspaceMembersPopover: () => <div>members</div>,
}));

vi.mock("@/pages/usercenter/workspaces/components/workspace-actions-dropdown", () => ({
  WorkspaceActionsDropdown: () => <button type="button">actions</button>,
}));

vi.mock("@/pages/usercenter/workspaces/components/workspace-inline-name-editor", () => ({
  WorkspaceInlineNameEditor: (props: { value: string; emptyFallback?: string }) => (
    <div>{props.value || props.emptyFallback || ""}</div>
  ),
}));

vi.mock("@/components/common/entity-avatar", () => ({
  WorkspaceAvatar: () => <div>avatar</div>,
  workspaceAvatarPropsFromIdentity: () => ({}),
}));

describe("useUserCenterWorkspacesColumns", () => {
  it("keeps createdAt visible by default and uses the Created at label", () => {
    const t = (key: string) =>
      (
        ({
          "common:ORG_WORKSPACES_TABLE_WORKSPACE": "Workspace",
          "common:ORG_WORKSPACES_TABLE_MEMBERS": "Members",
          "common:ORG_WORKSPACES_TABLE_CREATED_AT": "Created at",
          "common:ORG_WORKSPACES_RENAME_INPUT_LABEL": "Rename workspace",
          "common:ORG_WORKSPACES_DESCRIPTION_INPUT_LABEL": "Edit description",
          "common:ORG_WORKSPACES_DESCRIPTION_FALLBACK": "-",
        }) as const
      )[
        key as
          | "common:ORG_WORKSPACES_TABLE_WORKSPACE"
          | "common:ORG_WORKSPACES_TABLE_MEMBERS"
          | "common:ORG_WORKSPACES_TABLE_CREATED_AT"
          | "common:ORG_WORKSPACES_RENAME_INPUT_LABEL"
          | "common:ORG_WORKSPACES_DESCRIPTION_INPUT_LABEL"
          | "common:ORG_WORKSPACES_DESCRIPTION_FALLBACK"
      ] ?? key;

    const { result } = renderHook(() =>
      useUserCenterWorkspacesColumns({
        t,
        buildMenuItems: () => [],
        onPrepareWorkspaceMenu: vi.fn(),
        editingWorkspaceId: null,
        editingWorkspaceField: null,
        editingWorkspaceName: "",
        editingWorkspaceDescription: "",
        onEditingWorkspaceNameChange: vi.fn(),
        onEditingWorkspaceDescriptionChange: vi.fn(),
        onCommitWorkspaceEdit: vi.fn(),
        onCancelWorkspaceEdit: vi.fn(),
      }),
    );

    const createdAtColumn = result.current.find((column) => column.id === "createdAt");

    expect(createdAtColumn?.meta).toMatchObject({
      title: "Created at",
      sortKey: "created_at",
      kind: "time",
    });
    expect(createdAtColumn?.meta).not.toHaveProperty("defaultHidden");
    expect(createdAtColumn?.header).toBe("Created at");
  });
});
