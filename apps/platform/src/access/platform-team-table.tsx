import { DataTablePresenter, useDataTableCore } from "@arclayer/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import {
  KeyRound,
  LaptopMinimal,
  MoreHorizontal,
  ShieldCheck,
  UserRoundCog,
  UserRoundX,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  PlatformTeamOperatorOut,
  PlatformTeamOwnerOut,
  PlatformTeamUserOut,
} from "@arclayer/platform-openapi";

import { localizePlatformRole } from "@/access/platform-role-copy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime } from "@/monitoring/format";

export type PlatformTeamMemberAction = Readonly<{
  kind: "roles" | "sessions" | "reset-mfa" | "offboard";
  operator: PlatformTeamOperatorOut;
}>;

type TeamMemberRow =
  | Readonly<{ id: string; kind: "owner"; owner: PlatformTeamOwnerOut }>
  | Readonly<{ id: string; kind: "member"; operator: PlatformTeamOperatorOut }>;

type TeamTableCapabilities = Readonly<{
  canManageRoles: boolean;
  canReadSessions: boolean;
  canRemove: boolean;
  canResetMfa: boolean;
}>;

function person(user: PlatformTeamUserOut): string {
  return user.displayName ?? user.username;
}

export function PlatformTeamTable({
  capabilities,
  currentUserId,
  includeOwner,
  onAction,
  operators,
  owner,
  query,
}: Readonly<{
  capabilities: TeamTableCapabilities;
  currentUserId: string;
  includeOwner: boolean;
  onAction: (action: PlatformTeamMemberAction) => void;
  operators: readonly PlatformTeamOperatorOut[];
  owner: PlatformTeamOwnerOut | null;
  query: string;
}>) {
  const { t } = useTranslation("access");
  const rows = useMemo<TeamMemberRow[]>(() => {
    const allRows: TeamMemberRow[] = [
      ...(includeOwner && owner
        ? [{ id: `owner:${owner.user.userId}`, kind: "owner" as const, owner }]
        : []),
      ...operators.map((operator) => ({
        id: `member:${operator.operatorId}`,
        kind: "member" as const,
        operator,
      })),
    ];
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return allRows;
    return allRows.filter((row) => {
      const user = row.kind === "owner" ? row.owner.user : row.operator.user;
      const roles =
        row.kind === "owner"
          ? t("ACCOUNT_AUTHORITY_OWNER")
          : row.operator.roles.map((role) => localizePlatformRole(role, t).name).join(" ");
      return [person(user), user.username, roles]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [includeOwner, operators, owner, query, t]);

  const columns = useMemo<ColumnDef<TeamMemberRow, unknown>[]>(
    () => [
      {
        id: "person",
        accessorFn: (row) => person(row.kind === "owner" ? row.owner.user : row.operator.user),
        header: t("OPERATOR_COLUMN_PERSON"),
        meta: { kind: "primary", pin: "left", title: t("OPERATOR_COLUMN_PERSON") },
        cell: ({ row }) => {
          const user =
            row.original.kind === "owner" ? row.original.owner.user : row.original.operator.user;
          return (
            <div>
              <p className="font-medium">{person(user)}</p>
              <p className="text-sm text-muted-foreground">{user.username}</p>
            </div>
          );
        },
      },
      {
        id: "roles",
        accessorFn: (row) =>
          row.kind === "owner"
            ? "instance-owner"
            : row.operator.roles.map((role) => role.code).join(" "),
        header: t("OPERATOR_COLUMN_ROLES"),
        meta: { title: t("OPERATOR_COLUMN_ROLES") },
        cell: ({ row }) =>
          row.original.kind === "owner" ? (
            <Badge variant="secondary">
              <ShieldCheck aria-hidden="true" />
              {t("ACCOUNT_AUTHORITY_OWNER")}
            </Badge>
          ) : (
            <div className="flex max-w-md flex-wrap gap-1.5">
              {row.original.operator.roles.length ? (
                row.original.operator.roles.map((role) => (
                  <Badge key={role.roleId} variant="secondary">
                    {localizePlatformRole(role, t).name}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">{t("NO_ROLES")}</span>
              )}
            </div>
          ),
      },
      {
        id: "status",
        accessorFn: (row) => (row.kind === "owner" ? "owner" : row.operator.status),
        header: t("OPERATOR_COLUMN_STATUS"),
        meta: { kind: "status", title: t("OPERATOR_COLUMN_STATUS") },
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.kind === "owner" || row.original.operator.status === "active"
                ? "secondary"
                : "outline"
            }
          >
            {row.original.kind === "owner"
              ? t("TEAM_MEMBER_OWNER_STATUS")
              : t(`OPERATOR_${row.original.operator.status.toUpperCase()}`)}
          </Badge>
        ),
      },
      {
        id: "mfa",
        accessorFn: (row) =>
          row.kind === "owner"
            ? row.owner.mfa.verifiedMethodCount
            : row.operator.mfa.verifiedMethodCount,
        header: t("OPERATOR_COLUMN_MFA"),
        meta: { kind: "status", title: t("OPERATOR_COLUMN_MFA") },
        cell: ({ row }) => {
          const mfa =
            row.original.kind === "owner" ? row.original.owner.mfa : row.original.operator.mfa;
          return (
            <div className="space-y-1">
              <p>{t("MFA_SUMMARY", { count: mfa.verifiedMethodCount })}</p>
              <p className="text-xs text-muted-foreground">
                {t(
                  mfa.phishingResistantReady
                    ? "MFA_PHISHING_RESISTANT_READY"
                    : "MFA_PHISHING_RESISTANT_MISSING",
                )}
              </p>
            </div>
          );
        },
      },
      {
        id: "recentActivity",
        accessorFn: (row) =>
          row.kind === "owner"
            ? (row.owner.sessions.mostRecentActivityAt ?? "")
            : (row.operator.sessions.mostRecentActivityAt ?? ""),
        header: t("OPERATOR_COLUMN_RECENT_ACTIVITY"),
        meta: { kind: "time", title: t("OPERATOR_COLUMN_RECENT_ACTIVITY") },
        cell: ({ row }) => {
          const value =
            row.original.kind === "owner"
              ? row.original.owner.sessions.mostRecentActivityAt
              : row.original.operator.sessions.mostRecentActivityAt;
          return value ? formatDateTime(value) : t("UNAVAILABLE");
        },
      },
      {
        id: "sessions",
        accessorFn: (row) =>
          row.kind === "owner"
            ? row.owner.sessions.activeSessionCount
            : row.operator.sessions.activeSessionCount,
        header: t("OPERATOR_COLUMN_SESSIONS"),
        meta: { title: t("OPERATOR_COLUMN_SESSIONS") },
        cell: ({ row }) =>
          t("SESSION_SUMMARY", {
            count:
              row.original.kind === "owner"
                ? row.original.owner.sessions.activeSessionCount
                : row.original.operator.sessions.activeSessionCount,
          }),
      },
      {
        id: "actions",
        header: "",
        enableHiding: false,
        enableSorting: false,
        meta: { kind: "actions", pin: "right", title: t("ACTIONS") },
        cell: ({ row }) =>
          row.original.kind === "member" ? (
            <TeamMemberActions
              capabilities={capabilities}
              currentUserId={currentUserId}
              onAction={onAction}
              operator={row.original.operator}
            />
          ) : null,
      },
    ],
    [capabilities, currentUserId, onAction, t],
  );

  const table = useDataTableCore({
    columns,
    data: rows,
    pageCount: 1,
    features: { sorting: { enabled: true, mode: "client" } },
    rowSelection: { enabled: false, getRowId: (row) => row.id },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(includeOwner ? "TEAM_MEMBERS_TITLE" : "REMOVED_MEMBERS_TITLE")}</CardTitle>
        <CardDescription>
          {t(includeOwner ? "TEAM_MEMBERS_DESCRIPTION" : "REMOVED_MEMBERS_DESCRIPTION")}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <DataTablePresenter
          columnMenuLabels={{
            filter: t("TABLE_FILTER"),
            hide: t("TABLE_HIDE_COLUMN"),
            sort: t("TABLE_SORT"),
            sortAscending: t("TABLE_SORT_ASCENDING"),
            sortDescending: t("TABLE_SORT_DESCENDING"),
            unwrapContent: t("TABLE_UNWRAP_CONTENT"),
            wrapContent: t("TABLE_WRAP_CONTENT"),
          }}
          emptyText={t(includeOwner ? "TEAM_MEMBERS_EMPTY" : "REMOVED_MEMBERS_EMPTY")}
          rowClassName={(row) =>
            row.original.kind === "member" && row.original.operator.status === "deactivated"
              ? "opacity-60"
              : undefined
          }
          surface="embedded"
          table={table.table}
          wrapContent
        />
      </CardContent>
    </Card>
  );
}

function TeamMemberActions({
  capabilities,
  currentUserId,
  onAction,
  operator,
}: Readonly<{
  capabilities: TeamTableCapabilities;
  currentUserId: string;
  onAction: (action: PlatformTeamMemberAction) => void;
  operator: PlatformTeamOperatorOut;
}>) {
  const { t } = useTranslation("access");
  if (operator.status === "deactivated") return null;
  const isCurrent = operator.user.userId === currentUserId;
  const hasActions =
    capabilities.canManageRoles ||
    (!isCurrent &&
      (capabilities.canReadSessions || capabilities.canResetMfa || capabilities.canRemove));
  if (!hasActions) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("OPERATOR_ACTIONS", { name: person(operator.user) })}
          size="icon"
          variant="ghost"
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {capabilities.canManageRoles ? (
          <DropdownMenuItem onSelect={() => onAction({ kind: "roles", operator })}>
            <UserRoundCog aria-hidden="true" />
            {t("MANAGE_ROLES")}
          </DropdownMenuItem>
        ) : null}
        {capabilities.canReadSessions && !isCurrent ? (
          <DropdownMenuItem onSelect={() => onAction({ kind: "sessions", operator })}>
            <LaptopMinimal aria-hidden="true" />
            {t("VIEW_OPERATOR_SESSIONS")}
          </DropdownMenuItem>
        ) : null}
        {capabilities.canResetMfa && !isCurrent ? (
          <DropdownMenuItem onSelect={() => onAction({ kind: "reset-mfa", operator })}>
            <KeyRound aria-hidden="true" />
            {t("RESET_OPERATOR_MFA")}
          </DropdownMenuItem>
        ) : null}
        {(capabilities.canManageRoles ||
          capabilities.canReadSessions ||
          capabilities.canResetMfa) &&
        capabilities.canRemove &&
        !isCurrent ? (
          <DropdownMenuSeparator />
        ) : null}
        {capabilities.canRemove && !isCurrent ? (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => onAction({ kind: "offboard", operator })}
          >
            <UserRoundX aria-hidden="true" />
            {t("REMOVE_PLATFORM_ACCESS")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
