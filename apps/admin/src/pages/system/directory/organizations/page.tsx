import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ColumnDef } from "@tanstack/react-table";
import { Building2, CircleUserRound, FolderKanban, Users } from "lucide-react";

import type { SystemDirectoryOrganization } from "@/types/api/system-directory";

import {
  createCustomColumn,
  createDateColumn,
  createTruncatedTextColumn,
  createOwnerCell,
  renderCountTag,
  renderSlugTag,
  renderTag,
  SystemDirectoryTable,
  useSystemDirectoryDateTimeFormatter,
} from "../system-directory-table";
import { SystemDirectoryDetailsSheet } from "../system-directory-details-sheet";
import {
  useSystemDirectoryOrganizationDetail,
  useSystemDirectoryOrganizationsTable,
} from "../hooks";

export function SystemDirectoryOrganizationsPage() {
  const { t } = useTranslation(["settings"]);
  const dateTime = useSystemDirectoryDateTimeFormatter();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);

  const columns = useMemo<Array<ColumnDef<SystemDirectoryOrganization, unknown>>>(
    () => [
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
    ],
    [dateTime, t],
  );

  const tableHook = useSystemDirectoryOrganizationsTable(columns);
  const detailQuery = useSystemDirectoryOrganizationDetail(selectedOrganizationId);

  return (
    <>
      <SystemDirectoryTable
        tableHook={tableHook}
        onRowClick={(row) => setSelectedOrganizationId(row.organizationId)}
        text={{
          emptyTitle: t("settings:SETTINGS_SYSTEM_DIRECTORY_ORGANIZATIONS_EMPTY_TITLE"),
          emptyDescription: t("settings:SETTINGS_SYSTEM_DIRECTORY_ORGANIZATIONS_EMPTY_DESC"),
          searchPlaceholder: t("settings:SETTINGS_SYSTEM_DIRECTORY_ORGANIZATIONS_SEARCH"),
        }}
      />
      <SystemDirectoryDetailsSheet
        kind="organization"
        open={Boolean(selectedOrganizationId)}
        onOpenChange={(open) => {
          if (!open) setSelectedOrganizationId(null);
        }}
        query={detailQuery}
        formatDateTime={dateTime.formatDateTime}
      />
    </>
  );
}
