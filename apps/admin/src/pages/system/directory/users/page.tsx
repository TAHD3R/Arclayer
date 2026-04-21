import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ColumnDef } from "@tanstack/react-table";
import { Crown, Lock, ShieldCheck, UserCheck, UserMinus } from "lucide-react";

import type { SystemDirectoryUser } from "@/types/api/system-directory";

import {
  createCustomColumn,
  createDateColumn,
  createTruncatedTextColumn,
  createUserIdentityCell,
  renderCountTag,
  renderTag,
  SystemDirectoryTable,
  useSystemDirectoryDateTimeFormatter,
} from "../system-directory-table";
import { SystemDirectoryDetailsSheet } from "../system-directory-details-sheet";
import { useSystemDirectoryUserDetail, useSystemDirectoryUsersTable } from "../hooks";

export function SystemDirectoryUsersPage() {
  const { t } = useTranslation(["settings"]);
  const dateTime = useSystemDirectoryDateTimeFormatter();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const columns = useMemo<Array<ColumnDef<SystemDirectoryUser, unknown>>>(
    () => [
      createUserIdentityCell<SystemDirectoryUser>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_USER"),
        { id: "user", sortKey: "username", kind: "primary", size: 260, minSize: 220 },
      ),
      createTruncatedTextColumn<SystemDirectoryUser>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_EMAIL"),
        (row) => row.email,
        { id: "email", size: 240, minSize: 220 },
      ),
      createCustomColumn<SystemDirectoryUser>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_STATUS"),
        (row) => {
          if (row.status === "active") {
            return renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_ACTIVE"), {
              tone: "green",
              icon: UserCheck,
            });
          }
          if (row.status === "disabled") {
            return renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED"), {
              tone: "red",
              icon: UserMinus,
            });
          }
          return renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_LOCKED"), {
            tone: "gold",
            icon: Lock,
          });
        },
        { id: "status" },
      ),
      createCustomColumn<SystemDirectoryUser>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_SUPER_ADMIN"),
        (row) =>
          row.isSuperAdmin
            ? renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_SUPER_ADMIN_ON"), {
                tone: "gold",
                icon: Crown,
              })
            : renderTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_SUPER_ADMIN_OFF"), {
                tone: "default",
                icon: ShieldCheck,
              }),
        { id: "superAdmin", size: 170, minSize: 150 },
      ),
      createCustomColumn<SystemDirectoryUser>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_ORGANIZATIONS"),
        (row) => renderCountTag(row.organizationMembershipCount),
        { id: "organizations" },
      ),
      createCustomColumn<SystemDirectoryUser>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACES"),
        (row) => renderCountTag(row.workspaceMembershipCount),
        { id: "workspaces" },
      ),
      createCustomColumn<SystemDirectoryUser>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECTS"),
        (row) => renderCountTag(row.projectMembershipCount),
        { id: "projects" },
      ),
      createDateColumn<SystemDirectoryUser>(
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_LAST_LOGIN"),
        (row) => row.lastLoginAt,
        dateTime,
        { id: "lastLogin", sortKey: "last_login_at" },
      ),
    ],
    [dateTime, t],
  );

  const tableHook = useSystemDirectoryUsersTable(columns);
  const detailQuery = useSystemDirectoryUserDetail(selectedUserId);

  return (
    <>
      <SystemDirectoryTable
        tableHook={tableHook}
        onRowClick={(row) => setSelectedUserId(row.userId)}
        text={{
          emptyTitle: t("settings:SETTINGS_SYSTEM_DIRECTORY_USERS_EMPTY_TITLE"),
          emptyDescription: t("settings:SETTINGS_SYSTEM_DIRECTORY_USERS_EMPTY_DESC"),
          searchPlaceholder: t("settings:SETTINGS_SYSTEM_DIRECTORY_USERS_SEARCH"),
        }}
      />
      <SystemDirectoryDetailsSheet
        kind="user"
        open={Boolean(selectedUserId)}
        onOpenChange={(open) => {
          if (!open) setSelectedUserId(null);
        }}
        query={detailQuery}
        formatDateTime={dateTime.formatDateTime}
      />
    </>
  );
}
