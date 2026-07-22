import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";

import { listSystemHTTPRequestRecords, type HTTPRequestRecord } from "@/api/platform-observability";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { BaseTag } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { ActivityUserPill } from "@/pages/workspaces/shared/activity/components/activity-user-pill";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { useDataTable } from "@arclayer/ui/data-table";

type RequestRecordsTableProps = {
  days: number;
  workspaceLabelById: Readonly<Record<string, string>>;
  projectLabelById: Readonly<Record<string, string>>;
  onSelect: (record: HTTPRequestRecord) => void;
};

const METHOD_OPTIONS = ["ALL", "GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const STATUS_OPTIONS = ["ALL", "2", "3", "4", "5"] as const;

function statusTagColor(statusCode: number) {
  if (statusCode >= 500 || statusCode === 0) return "red" as const;
  if (statusCode >= 400) return "gold" as const;
  if (statusCode >= 200 && statusCode < 300) return "green" as const;
  return "default" as const;
}

function requestScope(
  record: HTTPRequestRecord,
  workspaceLabelById: Readonly<Record<string, string>>,
  projectLabelById: Readonly<Record<string, string>>,
  globalLabel: string,
) {
  if (record.projectId) return projectLabelById[record.projectId] ?? record.projectId;
  if (record.workspaceId) return workspaceLabelById[record.workspaceId] ?? record.workspaceId;
  return globalLabel;
}

export function RequestRecordsTable(props: RequestRecordsTableProps) {
  const { t, i18n } = useTranslation(["platform", "common"]);
  const [method, setMethod] = useState<(typeof METHOD_OPTIONS)[number]>("ALL");
  const [statusClass, setStatusClass] = useState<(typeof STATUS_OPTIONS)[number]>("ALL");
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const number = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );
  const columns = useMemo<ColumnDef<HTTPRequestRecord, unknown>[]>(
    () => [
      {
        id: "route",
        header: t("platform:AUDIT_REQUEST_ROUTE"),
        meta: { title: t("platform:AUDIT_REQUEST_ROUTE"), kind: "primary" },
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <BaseTag className="shrink-0">{row.original.method}</BaseTag>
            <span className="truncate font-mono text-footnote" title={row.original.routeTemplate}>
              {row.original.routeTemplate}
            </span>
          </div>
        ),
        size: 340,
        minSize: 240,
      },
      {
        id: "status",
        header: t("platform:AUDIT_REQUEST_STATUS_CODE"),
        meta: { title: t("platform:AUDIT_REQUEST_STATUS_CODE"), kind: "meta" },
        cell: ({ row }) => (
          <BaseTag color={statusTagColor(row.original.statusCode)}>
            {row.original.statusCode || t("platform:AUDIT_REQUEST_INTERRUPTED")}
          </BaseTag>
        ),
        size: 100,
      },
      {
        id: "duration",
        header: t("platform:AUDIT_REQUEST_DURATION"),
        meta: { title: t("platform:AUDIT_REQUEST_DURATION"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block text-right font-mono tabular-nums">
            {number.format(row.original.durationMs)} ms
          </span>
        ),
        size: 120,
      },
      {
        id: "actor",
        header: t("platform:AUDIT_EVENT_ACTOR"),
        meta: { title: t("platform:AUDIT_EVENT_ACTOR"), kind: "meta" },
        cell: ({ row }) => (
          <ActivityUserPill
            user={row.original.actor}
            secondary={row.original.actorUserId ?? undefined}
          />
        ),
        size: 190,
      },
      {
        id: "scope",
        header: t("platform:AUDIT_EVENT_SCOPE"),
        meta: { title: t("platform:AUDIT_EVENT_SCOPE"), kind: "meta" },
        cell: ({ row }) => {
          const label = requestScope(
            row.original,
            props.workspaceLabelById,
            props.projectLabelById,
            t("platform:AUDIT_GLOBAL_SCOPE"),
          );
          return (
            <span className="block truncate" title={label}>
              {label}
            </span>
          );
        },
        size: 190,
      },
      {
        id: "trace",
        header: t("platform:AUDIT_EVENT_TRACE"),
        meta: { title: t("platform:AUDIT_EVENT_TRACE"), kind: "meta" },
        cell: ({ row }) => (
          <span
            className="block truncate font-mono text-footnote"
            title={row.original.traceId ?? undefined}
          >
            {row.original.traceId ?? t("platform:AUDIT_EVENT_TRACE_MISSING")}
          </span>
        ),
        size: 190,
      },
      {
        id: "occurredAt",
        header: t("platform:AUDIT_EVENT_TIME"),
        meta: { title: t("platform:AUDIT_EVENT_TIME"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block truncate">{dateTime.formatDateTime(row.original.occurredAt)}</span>
        ),
        size: 180,
      },
    ],
    [dateTime, number, props.projectLabelById, props.workspaceLabelById, t],
  );
  const tableHook = useDataTable<
    HTTPRequestRecord,
    { days: number; method?: string; statusClass?: number }
  >({
    tableId: "system-audit-request-records",
    columns,
    initialState: { pageSize: 20 },
    extraQuery: {
      days: props.days,
      method: method === "ALL" ? undefined : method,
      statusClass: statusClass === "ALL" ? undefined : Number(statusClass),
    },
    features: { sorting: { enabled: false } },
    fetcher: (params) =>
      listSystemHTTPRequestRecords({
        days: props.days,
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
            placeholder={t("platform:AUDIT_RECORD_SEARCH_PLACEHOLDER")}
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
      emptyText={t("platform:AUDIT_RECORD_EMPTY_TITLE")}
      emptyTitle={t("platform:AUDIT_RECORD_EMPTY_TITLE")}
      emptyDescription={t("platform:AUDIT_RECORD_EMPTY_DESCRIPTION")}
      loading={tableHook.isLoading}
      error={tableHook.error}
      onRetry={() => void tableHook.refetch()}
      t={(key, options) => t(key, options)}
      rowHeight="short"
      wrapHeaders
      refreshing={tableHook.isFetching && !tableHook.isLoading}
      infiniteScroll={tableHook.infiniteScroll}
      toolbar={toolbar}
      rowClassName={() => "cursor-pointer"}
      onRowClick={(row) => props.onSelect(row.original)}
    />
  );
}
