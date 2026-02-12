import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Avatar, Button as AntButton, Dropdown, Tag } from "antd";
import type { MenuProps } from "antd";
import { Archive, MoreVertical, Trash2, Undo2 } from "lucide-react";

import type { OrganizationWorkspace } from "@/api/organization-workspaces";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";

import type { OrganizationWorkspacesTranslateFn } from "./organization-workspaces-types";
import { WorkspaceMembersPopover } from "./workspace-members-popover";

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

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
                  onClick: () => {
                    onUnarchiveWorkspace(item.workspaceId);
                  },
                },
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
            <div className="flex min-w-0 justify-center items-center gap-3">
              <Avatar size={42} src={item.iconUrl ?? undefined}>
                {item.name.slice(0, 1).toUpperCase()}
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-semibold">{item.name}</span>
                  <Tag className="!mr-0">{item.slug}</Tag>
                  {item.isArchived ? (
                    <Tag color="default" className="!mr-0">
                      {t("common:ORG_WORKSPACES_STATUS_ARCHIVED")}
                    </Tag>
                  ) : null}
                </div>
                <div className="truncate text-muted-foreground">
                  {item.description || t("common:ORG_WORKSPACES_DESCRIPTION_FALLBACK")}
                </div>
              </div>
              <Dropdown
                trigger={["click"]}
                menu={{ items: menuItems }}
                getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              >
                <AntButton type="text" icon={<MoreVertical className="size-4" />} />
              </Dropdown>
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
        cell: ({ row }) => <span>{formatDateTime(row.original.createdAt)}</span>,
      },
      {
        id: "actions",
        meta: { kind: "actions" },
        header: "",
        cell: ({ row }) => {
          const item = row.original;
          return (
            <AntButton
              type="link"
              disabled={item.isArchived}
              onClick={() => onEnterWorkspace(item.workspaceId)}
            >
              {t("common:ORG_WORKSPACES_ACTION_ENTER")}
            </AntButton>
          );
        },
      },
    ],
    [onArchiveWorkspace, onEnterWorkspace, onRequestDeleteWorkspace, onUnarchiveWorkspace, t],
  );
}
