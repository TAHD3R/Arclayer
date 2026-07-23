import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";

import { listSystemAIUsageGroups } from "@/api/platform-observability";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { BaseTag } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { useDataTable } from "@arclayer/ui/data-table";
import type { AIUsageGroup } from "@arclayer/openapi/admin-types";

const AI_USAGE_TABLE_PAGE_SIZE = 10;

function TruncatedValue(props: { children: string; mono?: boolean }) {
  return (
    <span
      className={
        props.mono
          ? "block max-w-full truncate font-mono text-footnote"
          : "block max-w-full truncate"
      }
      title={props.children}
    >
      {props.children}
    </span>
  );
}

export function AIUsageGroupsTable({
  days,
  onSelect,
}: {
  days: number;
  onSelect?: (group: AIUsageGroup) => void;
}) {
  const { t, i18n } = useTranslation(["platform", "common"]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const percent = useMemo(
    () => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }),
    [locale],
  );
  const money = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }),
    [locale],
  );
  const columns = useMemo<ColumnDef<AIUsageGroup, unknown>[]>(
    () => [
      {
        id: "model",
        header: t("platform:AI_USAGE_MODEL"),
        meta: { title: t("platform:AI_USAGE_MODEL"), kind: "primary" },
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <BaseTag className="shrink-0">{row.original.provider}</BaseTag>
            <TruncatedValue mono>{row.original.model}</TruncatedValue>
          </div>
        ),
        size: 300,
        minSize: 220,
      },
      {
        id: "requests",
        header: t("platform:METRIC_AI_REQUESTS"),
        meta: { title: t("platform:METRIC_AI_REQUESTS"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {number.format(row.original.requests)}
          </span>
        ),
        size: 110,
      },
      {
        id: "errorRate",
        header: t("platform:METRIC_ERROR_RATE"),
        meta: { title: t("platform:METRIC_ERROR_RATE"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {percent.format(row.original.errorRate)}
          </span>
        ),
        size: 110,
      },
      {
        id: "tokens",
        header: t("platform:METRIC_TOTAL_TOKENS"),
        meta: { title: t("platform:METRIC_TOTAL_TOKENS"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {number.format(row.original.totalTokens)}
          </span>
        ),
        size: 130,
      },
      {
        id: "cost",
        header: t("platform:METRIC_AI_COST"),
        meta: { title: t("platform:METRIC_AI_COST"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {money.format(row.original.costMicros / 1_000_000)}
          </span>
        ),
        size: 120,
      },
      {
        id: "latency",
        header: t("platform:AI_USAGE_AVG_LATENCY"),
        meta: { title: t("platform:AI_USAGE_AVG_LATENCY"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {number.format(row.original.avgLatencyMs)} ms
          </span>
        ),
        size: 140,
      },
      {
        id: "lastSeen",
        header: t("platform:AUDIT_REQUEST_LAST_SEEN"),
        meta: { title: t("platform:AUDIT_REQUEST_LAST_SEEN"), kind: "meta" },
        cell: ({ row }) => (
          <TruncatedValue>{dateTime.formatDateTime(row.original.lastSeenAt)}</TruncatedValue>
        ),
        size: 180,
      },
    ],
    [dateTime, money, number, percent, t],
  );
  const tableHook = useDataTable<AIUsageGroup, { days: number }>({
    tableId: "system-observability-ai-usage-groups",
    columns,
    initialState: { pageSize: AI_USAGE_TABLE_PAGE_SIZE },
    extraQuery: { days },
    features: { sorting: { enabled: false } },
    fetcher: (params) =>
      listSystemAIUsageGroups({
        days,
        page: params.page,
        size: params.size,
        q: params.q,
      }),
    queryOptions: { retry: false, meta: { silent: true } },
  });

  return (
    <AdminDataTableSection
      table={tableHook.table}
      emptyText={t("platform:AI_USAGE_EMPTY_TITLE")}
      emptyTitle={t("platform:AI_USAGE_EMPTY_TITLE")}
      emptyDescription={t("platform:AI_USAGE_EMPTY_DESCRIPTION")}
      loading={tableHook.isLoading}
      error={tableHook.error}
      onRetry={() => void tableHook.refetch()}
      t={(key, options) => t(key, options)}
      rowHeight="short"
      wrapHeaders
      refreshing={tableHook.isFetching && !tableHook.isLoading}
      infiniteScroll={tableHook.infiniteScroll}
      toolbar={
        <PageExtraToolbar
          leading={
            <DataTableSearchInput
              value={tableHook.searchInput}
              onChange={tableHook.setSearchInput}
              placeholder={t("platform:AI_USAGE_SEARCH_PLACEHOLDER")}
              clearLabel={t("common:CLEAR")}
            />
          }
        />
      }
      rowClassName={onSelect ? () => "cursor-pointer" : undefined}
      onRowClick={onSelect ? (row) => onSelect(row.original) : undefined}
    />
  );
}
