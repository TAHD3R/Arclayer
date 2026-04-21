import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type ColumnDef } from "@tanstack/react-table";
import { FolderKanban, LayoutTemplate, MoreVertical, Users } from "lucide-react";

import type { SystemDirectoryProject } from "@/types/api/system-directory";
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
  renderSlugTag,
  renderTagWithTooltip,
  renderTag,
  SystemDirectoryTable,
  useSystemDirectoryDateTimeFormatter,
} from "../system-directory-table";
import { useSystemDirectoryProjectsTable } from "../hooks";

export function SystemDirectoryProjectsPage() {
  const { t } = useTranslation(["settings"]);
  const dateTime = useSystemDirectoryDateTimeFormatter();

  const columns = useMemo<Array<ColumnDef<SystemDirectoryProject, unknown>>>(
    () => [
      createSelectionColumn<SystemDirectoryProject>(),
      createTruncatedTextColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECT"),
        (row) => row.name,
        { id: "project", sortKey: "name", kind: "primary", size: 300, minSize: 260 },
      ),
      createCustomColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACE"),
        (row) =>
          renderTagWithTooltip(row.workspaceName, {
            tone: "blue",
            icon: FolderKanban,
            textClassName: "max-w-[12rem]",
          }),
        { id: "workspace", size: 280, minSize: 240 },
      ),
      createCustomColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ORGANIZATION"),
        (row) =>
          renderTagWithTooltip(row.organizationName, {
            tone: "default",
            icon: LayoutTemplate,
            textClassName: "max-w-[12rem]",
          }),
        { id: "organization", size: 280, minSize: 240 },
      ),
      createCustomColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_SLUG"),
        (row) => renderSlugTag(row.slug),
        { id: "slug", size: 220, minSize: 180 },
      ),
      createOwnerCell<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_OWNER"),
        {
          size: 280,
          minSize: 240,
        },
      ),
      createCustomColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_MEMBERS"),
        (row) => renderTag(String(row.memberCount), { tone: "blue", icon: Users }),
        { id: "members" },
      ),
      createDateColumn<SystemDirectoryProject>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT"),
        (row) => row.createdAt,
        dateTime,
        { id: "createdAt", sortKey: "created_at" },
      ),
      createActionsColumn<SystemDirectoryProject>({
        size: 220,
        minSize: 208,
        renderActions: () => (
          <>
            <Button size="sm" variant="outline">
              {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ARCHIVE_PROJECT")}
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
                <DropdownMenuIconItem
                  icon={<LayoutTemplate className="size-4" />}
                  variant="destructive"
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_PROJECT")}
                </DropdownMenuIconItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ),
      }),
    ],
    [dateTime, t],
  );

  const tableHook = useSystemDirectoryProjectsTable(columns);

  return (
    <SystemDirectoryTable
      tableHook={tableHook}
      text={{
        emptyTitle: t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_EMPTY_TITLE"),
        emptyDescription: t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_EMPTY_DESC"),
        searchPlaceholder: t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_SEARCH"),
      }}
      bulkActions={[
        {
          key: "archive",
          label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ARCHIVE_PROJECT"),
          onClick: () => undefined,
        },
      ]}
    />
  );
}
