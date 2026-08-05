import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";

import { listWorkspaceMemberCreditUsage, type MemberCreditUsageItemOut } from "@/api/commerce";
import { UserAvatar } from "@/components/common/entity-avatar";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { Badge } from "@arclayer/ui/badge";
import { useDataTable } from "@arclayer/ui/data-table";
import { MEMBER_CREDIT_USAGE_TABLE_ID } from "./use-plan-usage-controller";

function memberLabel(member: MemberCreditUsageItemOut, fallback: string): string {
  return member.user.displayName || member.user.username || member.user.email || fallback;
}

export function MemberCreditUsageTable({ workspaceId }: { workspaceId: string }) {
  const { t, i18n } = useTranslation(["commerce", "common"]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const columns = useMemo<ColumnDef<MemberCreditUsageItemOut, unknown>[]>(
    () => [
      {
        id: "member",
        header: t("commerce:MEMBER_USAGE_COLUMN_MEMBER"),
        meta: { title: t("commerce:MEMBER_USAGE_COLUMN_MEMBER"), kind: "primary" },
        cell: ({ row }) => {
          const label = memberLabel(row.original, t("common:ORG_MEMBERS_TABLE_MEMBER"));
          return (
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar
                name={label}
                assetRef={row.original.user.avatarUrl}
                size={32}
                decorative
              />
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-label-primary">{label}</span>
                  {row.original.isOwner ? (
                    <Badge variant="secondary">{t("commerce:MEMBER_USAGE_OWNER")}</Badge>
                  ) : null}
                </div>
                {row.original.user.email ? (
                  <div className="truncate text-caption text-label-secondary">
                    {row.original.user.email}
                  </div>
                ) : null}
              </div>
            </div>
          );
        },
        size: 260,
        minSize: 220,
      },
      {
        accessorKey: "committedCredits",
        header: t("commerce:MEMBER_USAGE_COLUMN_USED"),
        meta: { title: t("commerce:MEMBER_USAGE_COLUMN_USED"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {number.format(row.original.committedCredits)}
          </span>
        ),
        size: 110,
      },
      {
        accessorKey: "reservedCredits",
        header: t("commerce:MEMBER_USAGE_COLUMN_RESERVED"),
        meta: { title: t("commerce:MEMBER_USAGE_COLUMN_RESERVED"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {number.format(row.original.reservedCredits)}
          </span>
        ),
        size: 110,
      },
      {
        accessorKey: "availableCredits",
        header: t("commerce:MEMBER_USAGE_COLUMN_AVAILABLE"),
        meta: { title: t("commerce:MEMBER_USAGE_COLUMN_AVAILABLE"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {row.original.availableCredits == null
              ? t("commerce:MEMBER_LIMIT_UNLIMITED")
              : number.format(row.original.availableCredits)}
          </span>
        ),
        size: 120,
      },
      {
        id: "effectiveLimit",
        header: t("commerce:MEMBER_USAGE_COLUMN_LIMIT"),
        meta: { title: t("commerce:MEMBER_USAGE_COLUMN_LIMIT"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {row.original.effectiveLimit.limitKind === "unlimited"
              ? t("commerce:MEMBER_LIMIT_UNLIMITED")
              : number.format(row.original.effectiveLimit.limitCredits ?? 0)}
          </span>
        ),
        size: 120,
      },
    ],
    [number, t],
  );
  const tableHook = useDataTable<MemberCreditUsageItemOut, { workspaceId: string }>({
    tableId: MEMBER_CREDIT_USAGE_TABLE_ID,
    columns,
    initialState: { pageSize: 20, columnPinning: { left: ["member"] } },
    extraQuery: { workspaceId },
    features: { sorting: { enabled: false }, columnPinning: { enabled: true } },
    fetcher: (params) =>
      listWorkspaceMemberCreditUsage(workspaceId, { page: params.page, size: params.size }),
    queryOptions: { retry: false, meta: { silent: true } },
  });

  return (
    <AdminDataTableSection
      table={tableHook.table}
      emptyText={t("commerce:MEMBER_USAGE_EMPTY_TITLE")}
      emptyTitle={t("commerce:MEMBER_USAGE_EMPTY_TITLE")}
      emptyDescription={t("commerce:MEMBER_USAGE_EMPTY_DESCRIPTION")}
      loading={tableHook.isLoading}
      error={tableHook.error}
      onRetry={() => void tableHook.refetch()}
      t={(key, options) => t(key, options)}
      rowHeight="short"
      wrapHeaders
      refreshing={tableHook.isFetching && !tableHook.isLoading}
      infiniteScroll={tableHook.infiniteScroll}
    />
  );
}
