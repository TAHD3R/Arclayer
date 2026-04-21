import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type ColumnDef } from "@tanstack/react-table";
import { Building2, CircleUserRound, FolderKanban, MoreVertical, Users } from "lucide-react";

import type { SystemDirectoryOrganization } from "@/types/api/system-directory";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

import {
  createActionsColumn,
  createCustomColumn,
  createDateColumn,
  createSelectionColumn,
  createTruncatedTextColumn,
  createOwnerCell,
  renderCountTag,
  renderSlugTag,
  renderTag,
  SystemDirectoryTable,
  useSystemDirectoryDateTimeFormatter,
} from "../system-directory-table";
import { useSystemDirectoryOrganizationsTable } from "../hooks";

export function SystemDirectoryOrganizationsPage() {
  const { t } = useTranslation(["settings"]);
  const dateTime = useSystemDirectoryDateTimeFormatter();

  const columns = useMemo<Array<ColumnDef<SystemDirectoryOrganization, unknown>>>(
    () => [
      createSelectionColumn<SystemDirectoryOrganization>(),
      createTruncatedTextColumn<SystemDirectoryOrganization>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ORGANIZATION"),
        (row) => row.name,
        { id: "organization", sortKey: "name", kind: "primary", size: 320, minSize: 280 },
      ),
      createCustomColumn<SystemDirectoryOrganization>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_SLUG"),
        (row) => renderSlugTag(row.slug),
        { id: "slug", size: 220, minSize: 180 },
      ),
      createCustomColumn<SystemDirectoryOrganization>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_KIND"),
        (row) =>
          row.kind === "personal"
            ? renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_KIND_PERSONAL"), {
                tone: "blue",
                icon: CircleUserRound,
              })
            : renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_KIND_TEAM"), {
                tone: "default",
                icon: Building2,
              }),
        { id: "kind" },
      ),
      createOwnerCell<SystemDirectoryOrganization>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_OWNER"),
        { size: 280, minSize: 240 },
      ),
      createCustomColumn<SystemDirectoryOrganization>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_MEMBERS"),
        (row) => renderCountTag(row.memberCount),
        { id: "members" },
      ),
      createCustomColumn<SystemDirectoryOrganization>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACES"),
        (row) => renderTag(String(row.workspaceCount), { tone: "blue", icon: FolderKanban }),
        { id: "workspaces" },
      ),
      createCustomColumn<SystemDirectoryOrganization>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECTS"),
        (row) => renderTag(String(row.projectCount), { tone: "default", icon: Users }),
        { id: "projects" },
      ),
      createDateColumn<SystemDirectoryOrganization>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT"),
        (row) => row.createdAt,
        dateTime,
        { id: "createdAt", sortKey: "created_at" },
      ),
      createActionsColumn<SystemDirectoryOrganization>({
        size: 220,
        minSize: 208,
        renderActions: () => (
          <>
            <Button size="sm" variant="outline">
              {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_EDIT_ORGANIZATION")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_MORE")}
                >
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuIconItem icon={<Users className="size-4" />}>
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ASSIGN_RESPONSIBLE_PERSON")}
                </DropdownMenuIconItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ),
      }),
    ],
    [dateTime, t],
  );

  const tableHook = useSystemDirectoryOrganizationsTable(columns);

  return (
    <SystemDirectoryTable
      tableHook={tableHook}
      text={{
        emptyTitle: t("settings:SETTINGS_SYSTEM_DIRECTORY_ORGANIZATIONS_EMPTY_TITLE"),
        emptyDescription: t("settings:SETTINGS_SYSTEM_DIRECTORY_ORGANIZATIONS_EMPTY_DESC"),
        searchPlaceholder: t("settings:SETTINGS_SYSTEM_DIRECTORY_ORGANIZATIONS_SEARCH"),
      }}
      bulkActions={[
        {
          key: "export-members",
          label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_EXPORT_MEMBERS"),
          onClick: () => undefined,
        },
      ]}
    />
  );
}
