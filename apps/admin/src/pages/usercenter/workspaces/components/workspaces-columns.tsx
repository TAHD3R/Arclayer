import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Archive, LogIn, MoreVertical, Trash2, Undo2, UserRound } from "lucide-react";

import { WorkspaceAvatar } from "@/components/common/entity-avatar";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import type { OrganizationWorkspace } from "@/types/api";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

import type { UserCenterWorkspaceListItem, UserCenterWorkspacesTranslateFn } from "../types";
import { WorkspaceMembersPopover } from "./workspace-members-popover";

interface UserCenterWorkspacesColumnsOptions {
  t: UserCenterWorkspacesTranslateFn;
  onArchiveWorkspace: (workspace: OrganizationWorkspace) => void;
  onRequestDeleteWorkspace: (workspace: OrganizationWorkspace) => void;
  onUnarchiveWorkspace: (workspaceId: string) => void;
  onEnterWorkspace: (workspaceId: string) => void;
}

export function useUserCenterWorkspacesColumns(
  options: UserCenterWorkspacesColumnsOptions,
): Array<ColumnDef<UserCenterWorkspaceListItem, unknown>> {
  const {
    t,
    onArchiveWorkspace,
    onRequestDeleteWorkspace,
    onUnarchiveWorkspace,
    onEnterWorkspace,
  } = options;
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
          const menuItems = item.kind === "personal"
            ? [
                {
                  key: "enter",
                  icon: <LogIn className="size-4" />,
                  label: t("common:ORG_WORKSPACES_ACTION_ENTER"),
                  onClick: () => onEnterWorkspace(item.workspaceId),
                },
              ]
            : item.isArchived
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
                  onClick: () => onRequestDeleteWorkspace(item as OrganizationWorkspace),
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
                  onClick: () => onArchiveWorkspace(item as OrganizationWorkspace),
                },
                {
                  key: "delete",
                  danger: true,
                  icon: <Trash2 className="size-4" />,
                  label: t("common:ORG_WORKSPACES_ACTION_DELETE"),
                  onClick: () => onRequestDeleteWorkspace(item as OrganizationWorkspace),
                },
              ];

          return (
            <div className="flex min-w-0 items-center gap-3">
              <WorkspaceAvatar name={item.name} assetRef={item.iconUrl} size={42} />
              <div className="min-w-0 flex-1">
                <span className="truncate text-headline font-semibold">{item.name}</span>
                {item.kind === "personal" ? (
                  <div className="mt-1 grid gap-1">
                    <div>
                      <Badge variant="outline" className="gap-1.5 text-label-secondary">
                        <UserRound className="size-3" />
                        {t("account:ACCOUNT_SECTION_PERSONAL")}
                      </Badge>
                    </div>
                    <div className="truncate text-footnote text-label-secondary">
                      {t("common:WORKSPACES_PERSONAL_DESCRIPTION")}
                    </div>
                  </div>
                ) : (
                  <div className="truncate text-label-secondary">
                    {item.description || t("common:ORG_WORKSPACES_DESCRIPTION_FALLBACK")}
                  </div>
                )}
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {menuItems.map((item) =>
                      item.type === "divider" ? (
                        <DropdownMenuSeparator key="divider" />
                      ) : (
                        <DropdownMenuIconItem
                          key={item.key}
                          onSelect={item.onClick}
                          variant={item.danger ? "destructive" : undefined}
                          icon={item.icon}
                        >
                          {item.label}
                        </DropdownMenuIconItem>
                      ),
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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
        cell: ({ row }) =>
          row.original.kind === "personal" ? (
            <Badge variant="outline" className="gap-1.5 text-label-secondary">
              <UserRound className="size-3" />
              {t("account:ACCOUNT_SECTION_PERSONAL")}
            </Badge>
          ) : (
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
          row.original.createdAt ? <span>{dateTime.formatDateTime(row.original.createdAt)}</span> : <span>-</span>,
        size: 190,
        minSize: 170,
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
