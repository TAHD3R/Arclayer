import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";

import {
  listSystemHTTPRequestGroups,
  type HTTPRequestGroupWithPercentiles,
} from "@/api/platform-observability";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { BaseTag } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { cn } from "@arclayer/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { useDataTable } from "@arclayer/ui/data-table";
type RequestGroupsTableProps = {
  days: number;
  onSelect?: (group: HTTPRequestGroupWithPercentiles) => void;
};

const METHOD_OPTIONS = ["ALL", "GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const STATUS_OPTIONS = ["ALL", "2", "3", "4", "5"] as const;

function requestTagColor(statusClass: number) {
  if (statusClass === 2) return "green" as const;
  if (statusClass === 4) return "gold" as const;
  if (statusClass >= 5) return "red" as const;
  return "default" as const;
}

function TruncatedValue(props: { children: string; className?: string }) {
  return (
    <span className={cn("block max-w-full truncate", props.className)} title={props.children}>
      {props.children}
    </span>
  );
}

export function RequestGroupsTable({ days, onSelect }: RequestGroupsTableProps) {
  const { t, i18n } = useTranslation(["platform", "common"]);
  const [method, setMethod] = useState<(typeof METHOD_OPTIONS)[number]>("ALL");
  const [statusClass, setStatusClass] = useState<(typeof STATUS_OPTIONS)[number]>("ALL");
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const number = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );
  const percent = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
        style: "percent",
        maximumFractionDigits: 2,
      }),
    [i18n.language, i18n.resolvedLanguage],
  );
  const columns = useMemo<ColumnDef<HTTPRequestGroupWithPercentiles, unknown>[]>(
    () => [
      {
        id: "route",
        header: t("platform:AUDIT_REQUEST_ROUTE"),
        meta: { title: t("platform:AUDIT_REQUEST_ROUTE"), kind: "primary" },
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <BaseTag className="shrink-0">{row.original.method}</BaseTag>
            <TruncatedValue
              className="font-mono text-footnote text-label-primary"
              children={row.original.routeTemplate}
            />
          </div>
        ),
        size: 360,
        minSize: 240,
      },
      {
        id: "status",
        header: t("platform:AUDIT_REQUEST_STATUS"),
        meta: { title: t("platform:AUDIT_REQUEST_STATUS"), kind: "meta" },
        cell: ({ row }) => (
          <BaseTag color={requestTagColor(row.original.statusClass)}>
            {row.original.statusClass === 0 ? "—" : `${row.original.statusClass}xx`}
          </BaseTag>
        ),
        size: 90,
      },
      {
        id: "requests",
        header: t("platform:METRIC_HTTP_REQUESTS"),
        meta: { title: t("platform:METRIC_HTTP_REQUESTS"), kind: "meta" },
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
        id: "avgLatency",
        header: t("platform:METRIC_HTTP_AVG_LATENCY"),
        meta: { title: t("platform:METRIC_HTTP_AVG_LATENCY"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {number.format(row.original.avgLatencyMs)} ms
          </span>
        ),
        size: 140,
      },
      {
        id: "p95Latency",
        header: t("platform:METRIC_HTTP_P95_LATENCY"),
        meta: { title: t("platform:METRIC_HTTP_P95_LATENCY"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {row.original.p95LatencyMs === null
              ? "—"
              : `${number.format(row.original.p95LatencyMs)} ms`}
          </span>
        ),
        size: 140,
      },
      {
        id: "p99Latency",
        header: t("platform:METRIC_HTTP_P99_LATENCY"),
        meta: { title: t("platform:METRIC_HTTP_P99_LATENCY"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {row.original.p99LatencyMs === null
              ? "—"
              : `${number.format(row.original.p99LatencyMs)} ms`}
          </span>
        ),
        size: 140,
      },
      {
        id: "lastSeen",
        header: t("platform:AUDIT_REQUEST_LAST_SEEN"),
        meta: { title: t("platform:AUDIT_REQUEST_LAST_SEEN"), kind: "meta" },
        cell: ({ row }) => (
          <TruncatedValue children={dateTime.formatDateTime(row.original.lastSeenAt)} />
        ),
        size: 180,
      },
    ],
    [dateTime, number, percent, t],
  );
  const tableHook = useDataTable<
    HTTPRequestGroupWithPercentiles,
    {
      days: number;
      method?: string;
      statusClass?: number;
    }
  >({
    tableId: "system-audit-request-groups",
    columns,
    initialState: { pageSize: 20 },
    extraQuery: {
      days,
      method: method === "ALL" ? undefined : method,
      statusClass: statusClass === "ALL" ? undefined : Number(statusClass),
    },
    features: { sorting: { enabled: false } },
    fetcher: (params) =>
      listSystemHTTPRequestGroups({
        days,
        page: params.page,
        size: params.size,
        q: params.q,
        method: params.method,
        statusClass: params.statusClass,
      }),
    queryOptions: { retry: false, meta: { silent: true } },
  });
  const toolbar = (
    <PageExtraToolbar
      leading={
        <>
          <DataTableSearchInput
            value={tableHook.searchInput}
            onChange={tableHook.setSearchInput}
            placeholder={t("platform:AUDIT_REQUEST_SEARCH_PLACEHOLDER")}
            clearLabel={t("common:CLEAR")}
          />
          <Select value={method} onValueChange={(value) => setMethod(value as typeof method)}>
            <SelectTrigger aria-label={t("platform:AUDIT_REQUEST_METHOD")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHOD_OPTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "ALL" ? t("platform:AUDIT_REQUEST_ALL_METHODS") : value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusClass}
            onValueChange={(value) => setStatusClass(value as typeof statusClass)}
          >
            <SelectTrigger aria-label={t("platform:AUDIT_REQUEST_STATUS")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "ALL" ? t("platform:AUDIT_REQUEST_ALL_STATUSES") : `${value}xx`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
    />
  );

  return (
    <AdminDataTableSection
      table={tableHook.table}
      emptyText={t("platform:AUDIT_REQUEST_EMPTY_TITLE")}
      emptyTitle={t("platform:AUDIT_REQUEST_EMPTY_TITLE")}
      emptyDescription={t("platform:AUDIT_REQUEST_EMPTY_DESCRIPTION")}
      loading={tableHook.isLoading}
      error={tableHook.error}
      onRetry={() => void tableHook.refetch()}
      t={(key, options) => t(key, options)}
      rowHeight="short"
      wrapHeaders
      refreshing={tableHook.isFetching && !tableHook.isLoading}
      infiniteScroll={tableHook.infiniteScroll}
      toolbar={toolbar}
      rowClassName={onSelect ? () => "cursor-pointer" : undefined}
      onRowClick={onSelect ? (row) => onSelect(row.original) : undefined}
    />
  );
}
