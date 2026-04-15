import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";

import {
  WorkspaceAvatar,
  workspaceAvatarPropsFromIdentity,
} from "@/components/common/entity-avatar";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import type { OrganizationWorkspace } from "@/types/api";

import type {
  UserCenterWorkspaceListItem,
  UserCenterWorkspacesTranslateFn,
  WorkspaceMenuItem,
} from "../types";
import type { WorkspaceEditingField } from "../hooks/use-workspace-menu-actions";
import { WorkspaceActionsDropdown } from "./workspace-actions-dropdown";
import { WorkspaceInlineNameEditor } from "./workspace-inline-name-editor";
import { WorkspaceMembersPopover } from "./workspace-members-popover";

const WORKSPACE_NAME_MAX_LENGTH = 128;
const WORKSPACE_DESCRIPTION_MAX_LENGTH = 256;

function normalizeWorkspaceDescriptionPreview(value?: string | null) {
  return (value ?? "").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

interface UserCenterWorkspacesColumnsOptions {
  t: UserCenterWorkspacesTranslateFn;
  buildMenuItems: (workspace: UserCenterWorkspaceListItem) => WorkspaceMenuItem[];
  onPrepareWorkspaceMenu: (workspaceId: string) => void;
  editingWorkspaceId: string | null;
  editingWorkspaceField: WorkspaceEditingField | null;
  editingWorkspaceName: string;
  editingWorkspaceDescription: string;
  onEditingWorkspaceNameChange: (value: string) => void;
  onEditingWorkspaceDescriptionChange: (value: string) => void;
  onCommitWorkspaceEdit: (
    workspace: UserCenterWorkspaceListItem,
    field: WorkspaceEditingField,
  ) => void;
  onCancelWorkspaceEdit: () => void;
}

export function useUserCenterWorkspacesColumns(
  options: UserCenterWorkspacesColumnsOptions,
): Array<ColumnDef<UserCenterWorkspaceListItem, unknown>> {
  const { t, buildMenuItems } = options;
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });

  return useMemo<Array<ColumnDef<UserCenterWorkspaceListItem, unknown>>>(
    () => [
      {
        id: "workspace",
        meta: {
          title: t("common:ORG_WORKSPACES_TABLE_WORKSPACE"),
          sortKey: "name",
          kind: "primary",
        },
        header: t("common:ORG_WORKSPACES_TABLE_WORKSPACE"),
        cell: ({ row }) => {
          const item = row.original;
          const descriptionPreview = normalizeWorkspaceDescriptionPreview(item.description);

          return (
            <div className="flex min-w-0 items-center gap-3">
              <WorkspaceAvatar
                name={item.name}
                size={42}
                {...workspaceAvatarPropsFromIdentity(item)}
              />
              <div className="min-w-0 flex-1">
                <WorkspaceInlineNameEditor
                  editing={
                    options.editingWorkspaceId === item.workspaceId &&
                    options.editingWorkspaceField === "name"
                  }
                  value={item.name}
                  draftValue={options.editingWorkspaceName}
                  ariaLabel={t("common:ORG_WORKSPACES_RENAME_INPUT_LABEL")}
                  maxLength={WORKSPACE_NAME_MAX_LENGTH}
                  className="block truncate text-headline font-semibold"
                  inputClassName="w-full text-headline font-semibold"
                  onDraftChange={options.onEditingWorkspaceNameChange}
                  onCommit={() => void options.onCommitWorkspaceEdit(item, "name")}
                  onCancel={options.onCancelWorkspaceEdit}
                />
                <WorkspaceInlineNameEditor
                  editing={
                    options.editingWorkspaceId === item.workspaceId &&
                    options.editingWorkspaceField === "description"
                  }
                  value={descriptionPreview}
                  draftValue={options.editingWorkspaceDescription}
                  ariaLabel={t("common:ORG_WORKSPACES_DESCRIPTION_INPUT_LABEL")}
                  maxLength={WORKSPACE_DESCRIPTION_MAX_LENGTH}
                  emptyFallback={t("common:ORG_WORKSPACES_DESCRIPTION_FALLBACK")}
                  className="block truncate text-label-secondary"
                  containerClassName="mt-1"
                  inputClassName="w-full text-footnote text-label-primary"
                  onDraftChange={options.onEditingWorkspaceDescriptionChange}
                  onCommit={() => void options.onCommitWorkspaceEdit(item, "description")}
                  onCancel={options.onCancelWorkspaceEdit}
                />
              </div>
              <WorkspaceActionsDropdown
                menuItems={buildMenuItems(item)}
                onPrepareMenu={() => options.onPrepareWorkspaceMenu(item.workspaceId)}
              />
            </div>
          );
        },
        size: 340,
        minSize: 300,
      },
      {
        id: "members",
        meta: {
          title: t("common:ORG_WORKSPACES_TABLE_MEMBERS"),
          kind: "meta",
        },
        header: t("common:ORG_WORKSPACES_TABLE_MEMBERS"),
        cell: ({ row }) => (
          <WorkspaceMembersPopover workspace={row.original as OrganizationWorkspace} />
        ),
        size: 200,
        minSize: 180,
      },
      {
        id: "createdAt",
        meta: {
          title: t("common:ORG_WORKSPACES_TABLE_CREATED_AT"),
          sortKey: "created_at",
          kind: "time",
        },
        header: t("common:ORG_WORKSPACES_TABLE_CREATED_AT"),
        cell: ({ row }) =>
          row.original.createdAt ? (
            <span>{dateTime.formatDateTime(row.original.createdAt)}</span>
          ) : (
            <span>-</span>
          ),
        size: 190,
        minSize: 170,
      },
    ],
    [
      buildMenuItems,
      dateTime.formatDateTime,
      options.onPrepareWorkspaceMenu,
      options.editingWorkspaceDescription,
      options.editingWorkspaceField,
      options.editingWorkspaceId,
      options.editingWorkspaceName,
      options.onCancelWorkspaceEdit,
      options.onCommitWorkspaceEdit,
      options.onEditingWorkspaceDescriptionChange,
      options.onEditingWorkspaceNameChange,
      t,
    ],
  );
}
