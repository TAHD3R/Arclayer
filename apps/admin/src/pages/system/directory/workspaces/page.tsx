import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type ColumnDef } from "@tanstack/react-table";
import { Archive, FolderKanban, LayoutTemplate, Users } from "lucide-react";

import type { SystemDirectoryWorkspace } from "@/types/api/system-directory";

import {
  createCustomColumn,
  createDateColumn,
  createTruncatedTextColumn,
  createOwnerCell,
  renderTag,
  SystemDirectoryTable,
  useSystemDirectoryDateTimeFormatter,
} from "../system-directory-table";
import { useSystemDirectoryWorkspacesTable } from "../hooks";

export function SystemDirectoryWorkspacesPage() {
  const { t } = useTranslation(["settings"]);
  const dateTime = useSystemDirectoryDateTimeFormatter();

  const columns = useMemo<Array<ColumnDef<SystemDirectoryWorkspace, unknown>>>(
    () => [
      createTruncatedTextColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACE"),
        (row) => row.name,
        { id: "workspace", sortKey: "name", kind: "primary", size: 320, minSize: 280 },
      ),
      createTruncatedTextColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ORGANIZATION"),
        (row) => row.organizationName,
        { id: "organization", size: 280, minSize: 240 },
      ),
      createTruncatedTextColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_DESCRIPTION"),
        (row) => row.description,
        { id: "description", size: 260, minSize: 220 },
      ),
      createOwnerCell<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_OWNER"),
        {
          size: 280,
          minSize: 240,
        },
      ),
      createCustomColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_MEMBERS"),
        (row) => renderTag(String(row.memberCount), { tone: "blue", icon: Users }),
        { id: "members" },
      ),
      createCustomColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECTS"),
        (row) => renderTag(String(row.projectCount), { tone: "default", icon: LayoutTemplate }),
        { id: "projects" },
      ),
      createCustomColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ARCHIVED"),
        (row) =>
          row.isArchived
            ? renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_ARCHIVED"), {
                tone: "gold",
                icon: Archive,
              })
            : renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE"), {
                tone: "green",
                icon: FolderKanban,
              }),
        { id: "state" },
      ),
      createDateColumn<SystemDirectoryWorkspace>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT"),
        (row) => row.createdAt,
        dateTime,
        { id: "createdAt", sortKey: "created_at" },
      ),
    ],
    [dateTime, t],
  );

  const tableHook = useSystemDirectoryWorkspacesTable(columns);

  return (
    <SystemDirectoryTable
      tableHook={tableHook}
      text={{
        emptyTitle: t("settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_EMPTY_TITLE"),
        emptyDescription: t("settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_EMPTY_DESC"),
        searchPlaceholder: t("settings:SETTINGS_SYSTEM_DIRECTORY_WORKSPACES_SEARCH"),
      }}
    />
  );
}
