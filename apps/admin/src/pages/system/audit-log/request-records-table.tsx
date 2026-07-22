import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";

import {
  listSystemHTTPRequestRecords,
  type HTTPRequestRecord,
  type HTTPRequestRecordOrdering,
} from "@/api/platform-observability";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { BaseTag } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { Button } from "@arclayer/ui/button";
import { useDataTable } from "@arclayer/ui/data-table";

import { AuditRequestControls, type AuditRequestFilters } from "./audit-table-controls";
import { AuditTablePagination } from "./audit-table-pagination";
import { AuditUserIdentity } from "./audit-user-identity";

type RequestRecordsTableProps = {
  days: number;
  workspaceLabelById: Readonly<Record<string, string>>;
  projectLabelById: Readonly<Record<string, string>>;
  onSelect: (record: HTTPRequestRecord) => void;
};

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
  const [filters, setFilters] = useState<AuditRequestFilters>({});
  const [ordering, setOrdering] = useState<HTTPRequestRecordOrdering>("-occurred_at");
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const number = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );
  const columns = useMemo<ColumnDef<HTTPRequestRecord, unknown>[]>(
    () => [
      {
        id: "occurredAt",
        header: t("platform:AUDIT_EVENT_TIME"),
        meta: { title: t("platform:AUDIT_EVENT_TIME"), kind: "meta" },
        cell: ({ row }) => (
          <span className="block truncate tabular-nums">
            {dateTime.formatDateTime(row.original.occurredAt)}
          </span>
        ),
        size: 180,
      },
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
          <AuditUserIdentity
            user={row.original.actor}
            userId={row.original.actorUserId}
            onFilter={(actorUserId) => setFilters((current) => ({ ...current, actorUserId }))}
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
        id: "actions",
        header: "",
        meta: buildDataTableActionsColumnMeta("right", "right"),
        enableHiding: false,
        cell: ({ row }) => (
          <DataTableActionsCell>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                props.onSelect(row.original);
              }}
            >
              <Eye className="size-3.5" />
              {t("platform:AUDIT_ACTION_DETAILS")}
            </Button>
          </DataTableActionsCell>
        ),
        size: 112,
      },
    ],
    [dateTime, number, props.projectLabelById, props.workspaceLabelById, t],
  );
  const tableHook = useDataTable<
    HTTPRequestRecord,
    {
      days: number;
      method?: string;
      statusClass?: number;
      workspaceId?: string;
      projectId?: string;
      actorUserId?: string;
      hasError?: boolean;
    }
  >({
    tableId: "system-audit-request-records",
    columns,
    initialState: { pageSize: 20 },
    extraQuery: {
      days: props.days,
      ...filters,
    },
    orderingOverride: ordering,
    features: { sorting: { enabled: false } },
    fetcher: (params) =>
      listSystemHTTPRequestRecords({
        days: props.days,
        page: params.page,
        size: params.size,
        q: params.q,
        method: params.method,
        statusClass: params.statusClass,
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        actorUserId: params.actorUserId,
        hasError: params.hasError,
        ordering,
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
          <AuditRequestControls
            mode="records"
            value={filters}
            onChange={setFilters}
            ordering={ordering}
            onOrderingChange={(value) => setOrdering(value as HTTPRequestRecordOrdering)}
            workspaceLabelById={props.workspaceLabelById}
            projectLabelById={props.projectLabelById}
          />
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
      toolbar={toolbar}
      footerSlot={<AuditTablePagination table={tableHook.table} total={tableHook.total} />}
      rowClassName={() => "cursor-pointer"}
      onRowClick={(row) => props.onSelect(row.original)}
    />
  );
}
