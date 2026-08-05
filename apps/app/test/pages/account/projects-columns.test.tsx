import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useUserCenterProjectsColumns } from "@/pages/usercenter/projects/components/projects-columns";

vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({
    formatDateTime: (value: string | null | undefined) => value ?? "-",
  }),
}));

vi.mock("@/pages/usercenter/projects/components/project-members-popover", () => ({
  ProjectMembersPopover: () => <div>members</div>,
}));

vi.mock("@/pages/usercenter/projects/components/project-actions-dropdown", () => ({
  ProjectActionsDropdown: () => <button type="button">actions</button>,
}));

vi.mock("@/pages/usercenter/projects/components/project-inline-name-editor", () => ({
  ProjectInlineNameEditor: (props: { value: string; emptyFallback?: string }) => (
    <div>{props.value || props.emptyFallback || ""}</div>
  ),
}));

vi.mock("@/components/common/project-avatar", () => ({
  ProjectAvatar: () => <div>avatar</div>,
  projectAvatarPropsFromIdentity: () => ({}),
}));

describe("useUserCenterProjectsColumns", () => {
  it("keeps createdAt visible by default and uses the Created at label", () => {
    const t = (key: string) =>
      (
        ({
          "account:ACCOUNT_PAGE_PROJECTS_TITLE": "Projects",
          "account:ACCOUNT_PROJECTS_TABLE_MEMBERS": "Members",
          "common:ORG_WORKSPACES_TABLE_CREATED_AT": "Created at",
          "account:ACCOUNT_PROJECTS_RENAME_INPUT_LABEL": "Rename project",
          "account:ACCOUNT_PROJECTS_DESCRIPTION_INPUT_LABEL": "Edit project description",
          "account:ACCOUNT_PROJECTS_DESCRIPTION_FALLBACK": "-",
        }) as const
      )[
        key as
          | "account:ACCOUNT_PAGE_PROJECTS_TITLE"
          | "account:ACCOUNT_PROJECTS_TABLE_MEMBERS"
          | "common:ORG_WORKSPACES_TABLE_CREATED_AT"
          | "account:ACCOUNT_PROJECTS_RENAME_INPUT_LABEL"
          | "account:ACCOUNT_PROJECTS_DESCRIPTION_INPUT_LABEL"
          | "account:ACCOUNT_PROJECTS_DESCRIPTION_FALLBACK"
      ] ?? key;

    const { result } = renderHook(() =>
      useUserCenterProjectsColumns({
        t,
        buildMenuItems: () => [],
        onPrepareProjectMenu: vi.fn(),
        editingProjectId: null,
        editingProjectField: null,
        editingProjectName: "",
        editingProjectDescription: "",
        onEditingProjectNameChange: vi.fn(),
        onEditingProjectDescriptionChange: vi.fn(),
        onCommitProjectEdit: vi.fn(),
        onCancelProjectEdit: vi.fn(),
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
