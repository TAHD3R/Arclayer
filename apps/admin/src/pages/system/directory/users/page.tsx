import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Crown,
  KeyRound,
  Lock,
  MoreVertical,
  Mail,
  ShieldOff,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
} from "lucide-react";

import type { SystemDirectoryUser } from "@/types/api/system-directory";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

import {
  createActionsColumn,
  createCustomColumn,
  createDateColumn,
  createSelectionColumn,
  createTruncatedTextColumn,
  createUserIdentityCell,
  renderCountTag,
  renderTag,
  renderTruncatedTag,
  SystemDirectoryTable,
  useSystemDirectoryDateTimeFormatter,
} from "../system-directory-table";
import { useSystemDirectoryUserGovernance, useSystemDirectoryUsersTable } from "../hooks";
import {
  ConfirmUserActionDialog,
  EditAccountDialog,
  getUserActionAvailability,
  ResetPasswordDialog,
  type UserActionTarget,
} from "./governance-dialogs";

type ConfirmActionKind =
  | "revoke"
  | "disable"
  | "enable"
  | "disableTwoFactor"
  | "delete"
  | "sendResetPasswordEmail"
  | "unlinkOAuth";

function toActionTarget(user: SystemDirectoryUser): UserActionTarget {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    status: user.status,
    avatarUrl: user.avatarUrl,
    avatar_url: user.avatar_url,
    hasPassword: user.hasPassword,
    twoFactorEnabled: user.twoFactorEnabled,
    linkedOauthProviders: user.linkedOauthProviders ?? user.linked_oauth_providers ?? [],
  };
}

export function SystemDirectoryUsersPage() {
  const { t } = useTranslation(["settings"]);
  const dateTime = useSystemDirectoryDateTimeFormatter();
  const governance = useSystemDirectoryUserGovernance();

  const [editTarget, setEditTarget] = useState<UserActionTarget | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserActionTarget | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    kind: ConfirmActionKind;
    users: UserActionTarget[];
    provider?: string;
  } | null>(null);

  const openEditDialog = (user: UserActionTarget) => setEditTarget(user);
  const openPasswordDialog = (user: UserActionTarget) => setPasswordTarget(user);
  const openConfirmDialog = (
    kind: ConfirmActionKind,
    users: UserActionTarget[],
    options?: { provider?: string },
  ) => setConfirmAction({ kind, users, provider: options?.provider });

  const columns = useMemo<Array<ColumnDef<SystemDirectoryUser, unknown>>>(
    () => [
      createSelectionColumn<SystemDirectoryUser>(),
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
        t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PERMISSION"),
        (row) =>
          row.isSuperAdmin
            ? renderTruncatedTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_SUPER_ADMIN_ON"), {
                tone: "gold",
                icon: Crown,
                className: "max-w-[10.5rem]",
                textClassName: "max-w-[8rem]",
              })
            : renderTruncatedTag(t("settings:SETTINGS_SYSTEM_DIRECTORY_SUPER_ADMIN_OFF"), {
                tone: "default",
                icon: ShieldCheck,
                className: "max-w-[10.5rem]",
                textClassName: "max-w-[8rem]",
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
      createActionsColumn<SystemDirectoryUser>({
        size: 72,
        minSize: 72,
        renderActions: (row) => {
          const target = toActionTarget(row);
          const isDisabled = row.status === "disabled";
          const availability = getUserActionAvailability(target);
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label={t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_MORE")}
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreVertical className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuIconItem
                  icon={<KeyRound className="size-4" />}
                  onSelect={() => openEditDialog(target)}
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_EDIT_ACCOUNT")}
                </DropdownMenuIconItem>
                <DropdownMenuIconItem
                  icon={<KeyRound className="size-4" />}
                  disabled={!availability.canResetPassword}
                  onSelect={() => openPasswordDialog(target)}
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_RESET_PASSWORD")}
                </DropdownMenuIconItem>
                <DropdownMenuIconItem
                  icon={<Mail className="size-4" />}
                  disabled={!availability.canSendResetPasswordEmail}
                  onSelect={() => openConfirmDialog("sendResetPasswordEmail", [target])}
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_SEND_RESET_PASSWORD_EMAIL")}
                </DropdownMenuIconItem>
                <DropdownMenuSeparator />
                <DropdownMenuIconItem
                  icon={<ShieldOff className="size-4" />}
                  disabled={!availability.canDisableTwoFactor}
                  onSelect={() => openConfirmDialog("disableTwoFactor", [target])}
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_TWO_FACTOR")}
                </DropdownMenuIconItem>
                {availability.linkedProviders.map((provider) => (
                  <DropdownMenuIconItem
                    key={provider}
                    icon={<ShieldOff className="size-4" />}
                    onSelect={() => openConfirmDialog("unlinkOAuth", [target], { provider })}
                  >
                    {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_UNLINK_OAUTH_PROVIDER", {
                      provider,
                    })}
                  </DropdownMenuIconItem>
                ))}
                <DropdownMenuIconItem
                  icon={<Lock className="size-4" />}
                  onSelect={() => openConfirmDialog("revoke", [target])}
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_REVOKE_LOGIN_SESSIONS")}
                </DropdownMenuIconItem>
                <DropdownMenuSeparator />
                <DropdownMenuIconItem
                  icon={
                    isDisabled ? <UserCheck className="size-4" /> : <UserMinus className="size-4" />
                  }
                  onSelect={() => openConfirmDialog(isDisabled ? "enable" : "disable", [target])}
                >
                  {isDisabled
                    ? t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_ACCOUNT")
                    : t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_ACCOUNT")}
                </DropdownMenuIconItem>
                <DropdownMenuSeparator />
                <DropdownMenuIconItem
                  icon={<Trash2 className="size-4" />}
                  variant="destructive"
                  onSelect={() => openConfirmDialog("delete", [target])}
                >
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_ACCOUNT")}
                </DropdownMenuIconItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      }),
    ],
    [dateTime, t],
  );

  const tableHook = useSystemDirectoryUsersTable(columns);

  const selectedUsers = tableHook.table
    .getSelectedRowModel()
    .rows.map((row) => toActionTarget(row.original));
  const selectedUserIds = selectedUsers.map((user) => user.userId);
  const selectedDisabledUsers = selectedUsers.filter((user) => user.status === "disabled");
  const selectedEnabledUsers = selectedUsers.filter((user) => user.status !== "disabled");
  const confirmConfig = useMemo(() => {
    if (!confirmAction) return null;
    const count = confirmAction.users.length;
    if (confirmAction.kind === "revoke") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_REVOKE_TITLE"),
        description:
          count > 1
            ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_REVOKE_DESC_MANY")
            : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_REVOKE_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_REVOKE_LOGIN_SESSIONS"),
        variant: "default" as const,
      };
    }
    if (confirmAction.kind === "sendResetPasswordEmail") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_SEND_RESET_PASSWORD_EMAIL_TITLE"),
        description:
          count > 1
            ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_SEND_RESET_PASSWORD_EMAIL_DESC_MANY")
            : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_SEND_RESET_PASSWORD_EMAIL_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_SEND_RESET_PASSWORD_EMAIL"),
        variant: "default" as const,
      };
    }
    if (confirmAction.kind === "disableTwoFactor") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_TWO_FACTOR_TITLE"),
        description:
          count > 1
            ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_TWO_FACTOR_DESC_MANY")
            : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_TWO_FACTOR_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_TWO_FACTOR"),
        variant: "destructive" as const,
      };
    }
    if (confirmAction.kind === "unlinkOAuth") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_UNLINK_OAUTH_TITLE"),
        description: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_UNLINK_OAUTH_DESC", {
          provider: confirmAction.provider ?? "",
        }),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_UNLINK_OAUTH"),
        variant: "destructive" as const,
      };
    }
    if (confirmAction.kind === "disable") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_TITLE"),
        description:
          count > 1
            ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_DESC_MANY")
            : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DISABLE_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_ACCOUNT"),
        variant: "destructive" as const,
      };
    }
    if (confirmAction.kind === "delete") {
      return {
        title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DELETE_TITLE"),
        description: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_DELETE_DESC_ONE"),
        confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_ACCOUNT"),
        variant: "destructive" as const,
      };
    }
    return {
      title: t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_TITLE"),
      description:
        count > 1
          ? t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_DESC_MANY")
          : t("settings:SETTINGS_SYSTEM_DIRECTORY_CONFIRM_ENABLE_DESC_ONE"),
      confirmLabel: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_ACCOUNT"),
      variant: "default" as const,
    };
  }, [confirmAction, t]);

  const confirmPending =
    governance.revokeSessionsMutation.isPending ||
    governance.sendResetPasswordEmailMutation.isPending ||
    governance.disableTwoFactorMutation.isPending ||
    governance.unlinkOAuthIdentityMutation.isPending ||
    governance.disableUsersMutation.isPending ||
    governance.enableUsersMutation.isPending ||
    governance.deleteUserMutation.isPending;

  return (
    <>
      <SystemDirectoryTable
        tableHook={tableHook}
        text={{
          emptyTitle: t("settings:SETTINGS_SYSTEM_DIRECTORY_USERS_EMPTY_TITLE"),
          emptyDescription: t("settings:SETTINGS_SYSTEM_DIRECTORY_USERS_EMPTY_DESC"),
          searchPlaceholder: t("settings:SETTINGS_SYSTEM_DIRECTORY_USERS_SEARCH"),
        }}
        bulkActions={[
          {
            key: "reset-password",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_RESET_PASSWORD"),
            disabled: selectedUserIds.length !== 1,
            onClick: () => {
              if (selectedUsers.length !== 1) return;
              openPasswordDialog(selectedUsers[0]);
            },
          },
          {
            key: "revoke-sessions",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_REVOKE_LOGIN_SESSIONS"),
            onClick: () => openConfirmDialog("revoke", selectedUsers),
          },
          {
            key: "send-reset-password-email",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_SEND_RESET_PASSWORD_EMAIL"),
            disabled: selectedUserIds.length !== 1 || !selectedUsers[0]?.email,
            onClick: () => openConfirmDialog("sendResetPasswordEmail", selectedUsers.slice(0, 1)),
          },
          {
            key: "disable",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_ACCOUNT"),
            disabled: selectedEnabledUsers.length === 0,
            onClick: () => openConfirmDialog("disable", selectedEnabledUsers),
          },
          {
            key: "enable",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_ACCOUNT"),
            disabled: selectedDisabledUsers.length === 0,
            onClick: () => openConfirmDialog("enable", selectedDisabledUsers),
          },
        ]}
      />

      <EditAccountDialog
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        user={editTarget}
        pending={governance.editProfileMutation.isPending}
        onSubmit={async (values) => {
          if (!editTarget) return;
          await governance.editProfileMutation.mutateAsync({
            userId: editTarget.userId,
            displayName: values.displayName,
            email: values.email,
            avatarAssetId: values.avatarAssetId,
          });
        }}
      />

      <ResetPasswordDialog
        open={Boolean(passwordTarget)}
        onOpenChange={(open) => {
          if (!open) setPasswordTarget(null);
        }}
        user={passwordTarget}
        pending={governance.resetPasswordMutation.isPending}
        onSubmit={async (values) => {
          if (!passwordTarget) return;
          await governance.resetPasswordMutation.mutateAsync({
            userId: passwordTarget.userId,
            newPassword: values.newPassword,
          });
        }}
      />

      {confirmConfig ? (
        <ConfirmUserActionDialog
          open={Boolean(confirmAction)}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }}
          title={confirmConfig.title}
          description={confirmConfig.description}
          confirmLabel={confirmConfig.confirmLabel}
          pending={confirmPending}
          variant={confirmConfig.variant}
          onConfirm={async () => {
            if (!confirmAction) return;
            const userIds = confirmAction.users.map((user) => user.userId);
            if (confirmAction.kind === "revoke") {
              await governance.revokeSessionsMutation.mutateAsync({ userIds });
              return;
            }
            if (confirmAction.kind === "sendResetPasswordEmail") {
              await governance.sendResetPasswordEmailMutation.mutateAsync({ userId: userIds[0]! });
              return;
            }
            if (confirmAction.kind === "disableTwoFactor") {
              await governance.disableTwoFactorMutation.mutateAsync({ userId: userIds[0]! });
              return;
            }
            if (confirmAction.kind === "unlinkOAuth") {
              await governance.unlinkOAuthIdentityMutation.mutateAsync({
                userId: userIds[0]!,
                provider: confirmAction.provider ?? "",
              });
              return;
            }
            if (confirmAction.kind === "disable") {
              await governance.disableUsersMutation.mutateAsync({ userIds });
              return;
            }
            if (confirmAction.kind === "delete") {
              await governance.deleteUserMutation.mutateAsync({ userId: userIds[0]! });
              return;
            }
            await governance.enableUsersMutation.mutateAsync({ userIds });
          }}
        />
      ) : null}
    </>
  );
}
