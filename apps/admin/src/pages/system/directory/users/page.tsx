import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ColumnDef, type Header, type SortingState } from "@tanstack/react-table";
import {
  Crown,
  FunnelX,
  KeyRound,
  ListFilter,
  Lock,
  MoreVertical,
  Mail,
  ShieldCheck as ShieldCheckIcon,
  ShieldOff,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
} from "lucide-react";

import type { SystemDirectoryUser } from "@/types/api/system-directory";
import {
  buildOperatorAwareFilterState,
  buildFiltersFromOperatorAwareState,
  resolveOperatorAwareFieldFilter,
  summarizeOperatorAwareFieldFilter,
  type OperatorAwareFilterState,
} from "@/components/common/reui-filter-state";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Filters, type Filter, type FilterFieldConfig } from "@arclayer/ui/filters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

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

type UserFilterField =
  | "status"
  | "superAdmin"
  | "hasPassword"
  | "twoFactorEnabled"
  | "oauthProvider";

type UserFilterValue = string;
type UserSortValue =
  | "-created_at"
  | "username"
  | "-username"
  | "email"
  | "-email"
  | "status"
  | "-status"
  | "is_super_admin"
  | "-is_super_admin"
  | "last_login_at"
  | "-last_login_at";

const FILTER_OPERATORS = [{ value: "is", labelKey: "common:FILTER_OPERATOR_IS" }] as const;
const DEFAULT_USER_SORT: UserSortValue = "-created_at";

const USER_SORT_OPTIONS: ReadonlyArray<{ value: UserSortValue; labelKey: string }> = [
  { value: "-created_at", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_USERS_SORT_NEWEST" },
  { value: "username", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_USERS_SORT_USERNAME_AZ" },
  { value: "-username", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_USERS_SORT_USERNAME_ZA" },
  { value: "email", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_USERS_SORT_EMAIL_AZ" },
  { value: "-email", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_USERS_SORT_EMAIL_ZA" },
  { value: "status", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_USERS_SORT_STATUS_AZ" },
  { value: "-status", labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_USERS_SORT_STATUS_ZA" },
  {
    value: "-is_super_admin",
    labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_USERS_SORT_PERMISSION_HIGH",
  },
  {
    value: "is_super_admin",
    labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_USERS_SORT_PERMISSION_LOW",
  },
  {
    value: "-last_login_at",
    labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_USERS_SORT_LAST_LOGIN_RECENT",
  },
  {
    value: "last_login_at",
    labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_USERS_SORT_LAST_LOGIN_OLD",
  },
] as const;

function toUserSortValue(sorting: SortingState): UserSortValue | null {
  const [first] = sorting;
  if (!first) return null;
  if (first.id === "user") return first.desc ? "-username" : "username";
  if (first.id === "email") return first.desc ? "-email" : "email";
  if (first.id === "status") return first.desc ? "-status" : "status";
  if (first.id === "superAdmin") return first.desc ? "-is_super_admin" : "is_super_admin";
  if (first.id === "lastLogin") return first.desc ? "-last_login_at" : "last_login_at";
  return null;
}

function toTableSorting(value: UserSortValue): SortingState {
  if (value === "username") return [{ id: "user", desc: false }];
  if (value === "-username") return [{ id: "user", desc: true }];
  if (value === "email") return [{ id: "email", desc: false }];
  if (value === "-email") return [{ id: "email", desc: true }];
  if (value === "status") return [{ id: "status", desc: false }];
  if (value === "-status") return [{ id: "status", desc: true }];
  if (value === "is_super_admin") return [{ id: "superAdmin", desc: false }];
  if (value === "-is_super_admin") return [{ id: "superAdmin", desc: true }];
  if (value === "last_login_at") return [{ id: "lastLogin", desc: false }];
  if (value === "-last_login_at") return [{ id: "lastLogin", desc: true }];
  return [];
}

function toUserFilters(filters: OperatorAwareFilterState<UserFilterField, UserFilterValue>) {
  return buildFiltersFromOperatorAwareState(filters);
}

function fromUserFilters(filters: Filter<UserFilterValue>[]) {
  return buildOperatorAwareFilterState<UserFilterField, UserFilterValue>(filters);
}

function summarizeUserFilter(
  field: UserFilterField,
  filters: OperatorAwareFilterState<UserFilterField, UserFilterValue>,
  formatValue?: (value: UserFilterValue) => string | undefined,
) {
  return summarizeOperatorAwareFieldFilter(resolveOperatorAwareFieldFilter(filters, field), {
    valueFormatter: formatValue,
    maxValues: 1,
  });
}

function firstFilterValue(
  filters: OperatorAwareFilterState<UserFilterField, UserFilterValue>,
  field: UserFilterField,
) {
  const value = filters[field]?.values[0];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanFilterValue(value: string | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

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
  const { t } = useTranslation(["common", "settings"]);
  const dateTime = useSystemDirectoryDateTimeFormatter();
  const governance = useSystemDirectoryUserGovernance();
  const [filters, setFilters] = useState<
    OperatorAwareFilterState<UserFilterField, UserFilterValue>
  >({});
  const reuiI18n = useMemo(
    () => buildReuiFilterI18n(t, t("settings:SETTINGS_SYSTEM_DIRECTORY_USERS_FILTER_TITLE")),
    [t],
  );

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

  const resolveFilterLabel = useCallback(
    (field: UserFilterField, value: string) => {
      if (field === "status") {
        if (value === "active") return t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_ACTIVE");
        if (value === "disabled") return t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED");
        if (value === "locked") return t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_LOCKED");
      }
      if (field === "superAdmin") {
        if (value === "true") return t("settings:SETTINGS_SYSTEM_DIRECTORY_SUPER_ADMIN_ON");
        if (value === "false") return t("settings:SETTINGS_SYSTEM_DIRECTORY_SUPER_ADMIN_OFF");
      }
      if (field === "hasPassword") {
        if (value === "true") return t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_PASSWORD_ON");
        if (value === "false") return t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_PASSWORD_OFF");
      }
      if (field === "twoFactorEnabled") {
        if (value === "true") return t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_TWO_FACTOR_ON");
        if (value === "false") return t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_TWO_FACTOR_OFF");
      }
      if (field === "oauthProvider") {
        if (value === "any") return t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_SIGN_IN_OAUTH");
        if (value === "none") {
          return t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_SIGN_IN_PASSWORD_ONLY");
        }
      }
      return value;
    },
    [t],
  );

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
        { id: "status", sortKey: "status" },
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
        { id: "superAdmin", sortKey: "is_super_admin", size: 170, minSize: 150 },
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

  const usersExtraQuery = useMemo(() => {
    const oauthProvider = firstFilterValue(filters, "oauthProvider");
    return {
      status: firstFilterValue(filters, "status"),
      isSuperAdmin: booleanFilterValue(firstFilterValue(filters, "superAdmin")),
      hasPassword: booleanFilterValue(firstFilterValue(filters, "hasPassword")),
      twoFactorEnabled: booleanFilterValue(firstFilterValue(filters, "twoFactorEnabled")),
      oauthProvider:
        oauthProvider === "any" ? "any" : oauthProvider === "none" ? "none" : undefined,
    };
  }, [filters]);
  const tableHook = useSystemDirectoryUsersTable(columns, usersExtraQuery);
  const activeSort = toUserSortValue(tableHook.sorting) ?? DEFAULT_USER_SORT;
  const filterItems = useMemo(() => toUserFilters(filters), [filters]);
  const filterFields = useMemo<FilterFieldConfig<UserFilterValue>[]>(
    () => [
      {
        key: "status",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_STATUS"),
        type: "select",
        icon: <UserCheck className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: [
          { value: "active", label: t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_ACTIVE") },
          { value: "disabled", label: t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED") },
          { value: "locked", label: t("settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_LOCKED") },
        ],
      },
      {
        key: "superAdmin",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_PERMISSION"),
        type: "select",
        icon: <ShieldCheckIcon className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: [
          {
            value: "true",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_SUPER_ADMIN_ON"),
          },
          {
            value: "false",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_SUPER_ADMIN_OFF"),
          },
        ],
      },
      {
        key: "hasPassword",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_PASSWORD"),
        type: "select",
        icon: <KeyRound className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: [
          {
            value: "true",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_PASSWORD_ON"),
          },
          {
            value: "false",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_PASSWORD_OFF"),
          },
        ],
      },
      {
        key: "twoFactorEnabled",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_TWO_FACTOR"),
        type: "select",
        icon: <ShieldCheck className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: [
          {
            value: "true",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_TWO_FACTOR_ON"),
          },
          {
            value: "false",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_TWO_FACTOR_OFF"),
          },
        ],
      },
      {
        key: "oauthProvider",
        label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_FIELD_SIGN_IN"),
        type: "select",
        icon: <ShieldOff className="size-4" />,
        searchable: false,
        operators: FILTER_OPERATORS.map((operator) => ({
          value: operator.value,
          label: t(operator.labelKey),
        })),
        options: [
          {
            value: "any",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_SIGN_IN_OAUTH"),
          },
          {
            value: "none",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_SIGN_IN_PASSWORD_ONLY"),
          },
        ],
      },
    ],
    [t],
  );

  const handleFiltersChange = useCallback(
    (next: OperatorAwareFilterState<UserFilterField, UserFilterValue>) => {
      setFilters(next);
    },
    [],
  );

  const clearFilters = useCallback(() => {
    handleFiltersChange({});
  }, [handleFiltersChange]);

  const resolveColumnFilterAction = useCallback(
    (header: Header<SystemDirectoryUser, unknown>) => {
      if (header.column.id === "status") {
        return {
          active: Boolean(filters.status),
          summary: summarizeUserFilter("status", filters, (value) =>
            resolveFilterLabel("status", value),
          ),
          onSelect: () => void 0,
        };
      }
      if (header.column.id === "superAdmin") {
        return {
          active: Boolean(filters.superAdmin),
          summary: summarizeUserFilter("superAdmin", filters, (value) =>
            resolveFilterLabel("superAdmin", value),
          ),
          onSelect: () => void 0,
        };
      }
      return undefined;
    },
    [filters, resolveFilterLabel],
  );

  const hasOverrides = filterItems.length > 0 || activeSort !== DEFAULT_USER_SORT;
  const toolbarLeading = useMemo(
    () => (
      <>
        <Select
          value={activeSort}
          onValueChange={(next) => {
            tableHook.setSorting(toTableSorting(next as UserSortValue));
          }}
        >
          <SelectTrigger className="w-[14rem] min-w-[14rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" position="popper">
            {USER_SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Filters
          filters={filterItems}
          fields={filterFields}
          onChange={(next) => handleFiltersChange(fromUserFilters(next))}
          i18n={reuiI18n}
          allowMultiple={false}
          enableShortcut
          shortcutKey="f"
          shortcutLabel="F"
          trigger={
            <Button variant="outline">
              <ListFilter className="size-4" />
            </Button>
          }
        />

        {hasOverrides ? (
          <Button
            variant="outline"
            onClick={() => {
              clearFilters();
              tableHook.setSorting(toTableSorting(DEFAULT_USER_SORT));
            }}
          >
            <FunnelX className="size-4" />
            {t("settings:SETTINGS_SYSTEM_DIRECTORY_FILTER_RESET")}
          </Button>
        ) : null}
      </>
    ),
    [
      activeSort,
      clearFilters,
      filterFields,
      filterItems,
      handleFiltersChange,
      hasOverrides,
      reuiI18n,
      t,
      tableHook,
    ],
  );

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
        toolbarLeading={toolbarLeading}
        resolveColumnFilterAction={resolveColumnFilterAction}
        bulkActions={[
          {
            key: "reset-password",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_RESET_PASSWORD"),
            icon: <KeyRound className="size-4" />,
            disabled: selectedUserIds.length !== 1,
            onClick: () => {
              if (selectedUsers.length !== 1) return;
              openPasswordDialog(selectedUsers[0]);
            },
          },
          {
            key: "revoke-sessions",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_REVOKE_LOGIN_SESSIONS"),
            icon: <UserMinus className="size-4" />,
            onClick: () => openConfirmDialog("revoke", selectedUsers),
          },
          {
            key: "send-reset-password-email",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_SEND_RESET_PASSWORD_EMAIL"),
            icon: <Mail className="size-4" />,
            disabled: selectedUserIds.length !== 1 || !selectedUsers[0]?.email,
            onClick: () => openConfirmDialog("sendResetPasswordEmail", selectedUsers.slice(0, 1)),
          },
          {
            key: "disable",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_ACCOUNT"),
            icon: <ShieldOff className="size-4" />,
            disabled: selectedEnabledUsers.length === 0,
            onClick: () => openConfirmDialog("disable", selectedEnabledUsers),
          },
          {
            key: "enable",
            label: t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_ACCOUNT"),
            icon: <ShieldCheck className="size-4" />,
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
