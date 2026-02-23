import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Avatar, Button as AntButton, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { Archive, LogIn, MoreVertical, Trash2, Undo2 } from "lucide-react";

import type { OrganizationWorkspace } from "@/api/organization-workspaces";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";

import type { OrganizationWorkspacesTranslateFn } from "./organization-workspaces-types";
import { WorkspaceMembersPopover } from "./workspace-members-popover";

interface UseOrganizationWorkspacesColumnsOptions {
  t: OrganizationWorkspacesTranslateFn;
  onArchiveWorkspace: (workspace: OrganizationWorkspace) => void;
  onRequestDeleteWorkspace: (workspace: OrganizationWorkspace) => void;
  onUnarchiveWorkspace: (workspaceId: string) => void;
  onEnterWorkspace: (workspaceId: string) => void;
}

export function useOrganizationWorkspacesColumns(
  options: UseOrganizationWorkspacesColumnsOptions,
): Array<ColumnDef<OrganizationWorkspace, unknown>> {
  const {
    t,
    onArchiveWorkspace,
    onRequestDeleteWorkspace,
    onUnarchiveWorkspace,
    onEnterWorkspace,
  } = options;
  const dateTime = useWorkspaceDateTimeFormatter();

  return useMemo<Array<ColumnDef<OrganizationWorkspace, unknown>>>(
    () => [
      {
        id: "workspace",
        meta: { sortKey: "name" },
        header: t("common:ORG_WORKSPACES_TABLE_WORKSPACE"),
        cell: ({ row }) => {
          const item = row.original;
          const menuItems: MenuProps["items"] = item.isArchived
            ? [
                {
                  key: "unarchive",
                  icon: <Undo2 className="size-4" />,
                  label: t("common:ORG_WORKSPACES_ACTION_UNARCHIVE"),
                  onClick: () => onUnarchiveWorkspace(item.workspaceId),
                },
                { type: "divider" },
                {
                  key: "delete",
                  danger: true,
                  icon: <Trash2 className="size-4" />,
                  label: t("common:ORG_WORKSPACES_ACTION_DELETE"),
                  onClick: () => onRequestDeleteWorkspace(item),
                },
              ]
            : [
                {
                  key: "enter",
                  icon: <LogIn className="size-4" />,
                  label: t("common:ORG_WORKSPACES_ACTION_ENTER"),
                  onClick: () => onEnterWorkspace(item.workspaceId),
                },
                { type: "divider" },
                {
                  key: "archive",
                  icon: <Archive className="size-4" />,
                  label: t("common:ORG_WORKSPACES_ACTION_ARCHIVE"),
                  onClick: () => onArchiveWorkspace(item),
                },
                {
                  key: "delete",
                  danger: true,
                  icon: <Trash2 className="size-4" />,
                  label: t("common:ORG_WORKSPACES_ACTION_DELETE"),
                  onClick: () => onRequestDeleteWorkspace(item),
                },
              ];

          return (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar size={42} src={item.iconUrl ?? undefined}>
                {item.name.slice(0, 1).toUpperCase()}
              </Avatar>
              <div className="min-w-0 flex-1">
                <span className="truncate text-headline font-semibold">{item.name}</span>
                <div className="truncate text-muted-foreground">
                  {item.description || t("common:ORG_WORKSPACES_DESCRIPTION_FALLBACK")}
                </div>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <Dropdown
                  trigger={["click"]}
                  menu={{ items: menuItems }}
                  getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
                >
                  <AntButton type="text" icon={<MoreVertical className="size-4" />} />
                </Dropdown>
              </div>
            </div>
          );
        },
      },
      {
        id: "members",
        header: t("common:ORG_WORKSPACES_TABLE_MEMBERS"),
        cell: ({ row }) => <WorkspaceMembersPopover workspace={row.original} />,
      },
      {
        id: "createdAt",
        meta: { sortKey: "created_at" },
        header: t("common:ORG_WORKSPACES_TABLE_CREATED_AT"),
        cell: ({ row }) => <span>{dateTime.formatDateTime(row.original.createdAt)}</span>,
      },
    ],
    [
      dateTime.formatDateTime,
      onArchiveWorkspace,
      onEnterWorkspace,
      onRequestDeleteWorkspace,
      onUnarchiveWorkspace,
      t,
    ],
  );
}
