import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";

import { WorkspaceAvatar } from "@/components/common/entity-avatar";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import type { OrganizationWorkspace } from "@/types/api";

import type {
  UserCenterWorkspaceListItem,
  UserCenterWorkspacesTranslateFn,
  WorkspaceMenuItem,
} from "../types";
import { WorkspaceActionsDropdown } from "./workspace-actions-dropdown";
import { WorkspaceMembersPopover } from "./workspace-members-popover";

interface UserCenterWorkspacesColumnsOptions {
  t: UserCenterWorkspacesTranslateFn;
  buildMenuItems: (workspace: UserCenterWorkspaceListItem) => WorkspaceMenuItem[];
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

          return (
            <div className="flex min-w-0 items-center gap-3">
              <WorkspaceAvatar name={item.name} assetRef={item.iconUrl} size={42} />
              <div className="min-w-0 flex-1">
                <span className="truncate text-headline font-semibold">{item.name}</span>
                <div className="truncate text-label-secondary">
                  {item.description || t("common:ORG_WORKSPACES_DESCRIPTION_FALLBACK")}
                </div>
              </div>
              <WorkspaceActionsDropdown menuItems={buildMenuItems(item)} />
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
          defaultHidden: true,
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
    [buildMenuItems, dateTime.formatDateTime, t],
  );
}
