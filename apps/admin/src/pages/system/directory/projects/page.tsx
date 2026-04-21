import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ColumnDef } from "@tanstack/react-table";
import { FolderKanban, LayoutTemplate, Users } from "lucide-react";

import type { SystemDirectoryProject } from "@/types/api/system-directory";

import {
  createCustomColumn,
  createDateColumn,
  createTruncatedTextColumn,
  createOwnerCell,
  renderSlugTag,
  renderTagWithTooltip,
  renderTag,
  SystemDirectoryTable,
  useSystemDirectoryDateTimeFormatter,
} from "../system-directory-table";
import { SystemDirectoryDetailsSheet } from "../system-directory-details-sheet";
import { useSystemDirectoryProjectDetail, useSystemDirectoryProjectsTable } from "../hooks";

export function SystemDirectoryProjectsPage() {
  const { t } = useTranslation(["settings"]);
  const dateTime = useSystemDirectoryDateTimeFormatter();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const columns = useMemo<Array<ColumnDef<SystemDirectoryProject, unknown>>>(
    () => [
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
    ],
    [dateTime, t],
  );

  const tableHook = useSystemDirectoryProjectsTable(columns);
  const detailQuery = useSystemDirectoryProjectDetail(selectedProjectId);

  return (
    <>
      <SystemDirectoryTable
        tableHook={tableHook}
        onRowClick={(row) => setSelectedProjectId(row.projectId)}
        text={{
          emptyTitle: t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_EMPTY_TITLE"),
          emptyDescription: t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_EMPTY_DESC"),
          searchPlaceholder: t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECTS_SEARCH"),
        }}
      />
      <SystemDirectoryDetailsSheet
        kind="project"
        open={Boolean(selectedProjectId)}
        onOpenChange={(open) => {
          if (!open) setSelectedProjectId(null);
        }}
        query={detailQuery}
        formatDateTime={dateTime.formatDateTime}
      />
    </>
  );
}
