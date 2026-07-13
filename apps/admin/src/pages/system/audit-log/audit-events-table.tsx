import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";

import { listSystemActivity } from "@/api/activity";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { BaseTag } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { useDataTable } from "@arclayer/ui/data-table";
import type { ActivityEvent } from "@arclayer/openapi/admin-types";

type AuditEventsTableProps = {
  onSelect: (event: ActivityEvent) => void;
};

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

function actorLabel(event: ActivityEvent) {
  return event.actor?.displayName ?? event.actor?.username ?? event.actorUserId ?? "—";
}

export function AuditEventsTable({ onSelect }: AuditEventsTableProps) {
  const { t } = useTranslation(["platform", "activity", "common"]);
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const columns = useMemo<ColumnDef<ActivityEvent, unknown>[]>(
    () => [
      {
        id: "event",
        header: t("platform:AUDIT_EVENT_NAME"),
        meta: { title: t("platform:AUDIT_EVENT_NAME"), kind: "primary" },
        cell: ({ row }) => <TruncatedValue mono children={row.original.eventName} />,
        size: 300,
        minSize: 220,
      },
      {
        id: "source",
        header: t("platform:AUDIT_EVENT_SOURCE"),
        meta: { title: t("platform:AUDIT_EVENT_SOURCE"), kind: "meta" },
        cell: ({ row }) => <BaseTag>{row.original.source ?? "—"}</BaseTag>,
        size: 130,
      },
      {
        id: "actor",
        header: t("platform:AUDIT_EVENT_ACTOR"),
        meta: { title: t("platform:AUDIT_EVENT_ACTOR"), kind: "meta" },
        cell: ({ row }) => <TruncatedValue children={actorLabel(row.original)} />,
        size: 180,
      },
      {
        id: "scope",
        header: t("platform:AUDIT_EVENT_SCOPE"),
        meta: { title: t("platform:AUDIT_EVENT_SCOPE"), kind: "meta" },
        cell: ({ row }) => (
          <TruncatedValue
            mono
            children={
              row.original.projectId ?? row.original.workspaceId ?? t("platform:AUDIT_GLOBAL_SCOPE")
            }
          />
        ),
        size: 220,
      },
      {
        id: "entity",
        header: t("platform:AUDIT_EVENT_TARGET"),
        meta: { title: t("platform:AUDIT_EVENT_TARGET"), kind: "meta" },
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            {row.original.entityType ? <BaseTag>{row.original.entityType}</BaseTag> : null}
            <TruncatedValue mono children={row.original.entityId ?? "—"} />
          </div>
        ),
        size: 260,
      },
      {
        id: "trace",
        header: t("platform:AUDIT_EVENT_TRACE"),
        meta: { title: t("platform:AUDIT_EVENT_TRACE"), kind: "meta" },
        cell: ({ row }) => <TruncatedValue mono children={row.original.traceId ?? "—"} />,
        size: 180,
      },
      {
        id: "occurredAt",
        header: t("platform:AUDIT_EVENT_TIME"),
        meta: { title: t("platform:AUDIT_EVENT_TIME"), kind: "meta" },
        cell: ({ row }) => (
          <TruncatedValue children={dateTime.formatDateTime(row.original.occurredAt)} />
        ),
        size: 180,
      },
    ],
    [dateTime, t],
  );
  const tableHook = useDataTable<ActivityEvent>({
    tableId: "system-audit-events",
    columns,
    initialState: { pageSize: 20 },
    features: { sorting: { enabled: false } },
    fetcher: (params) =>
      listSystemActivity({
        page: params.page,
        size: params.size,
        eventName: params.q,
      }),
    queryOptions: { retry: false, meta: { silent: true } },
  });
  const toolbar = (
    <PageExtraToolbar
      leading={
        <DataTableSearchInput
          value={tableHook.searchInput}
          onChange={tableHook.setSearchInput}
          placeholder={t("activity:ACTIVITY_FILTER_EVENT_NAME_PLACEHOLDER")}
          clearLabel={t("common:CLEAR")}
        />
      }
    />
  );

  return (
    <AdminDataTableSection
      table={tableHook.table}
      emptyText={t("platform:AUDIT_EMPTY_TITLE")}
      emptyTitle={t("platform:AUDIT_EMPTY_TITLE")}
      emptyDescription={t("platform:AUDIT_EMPTY_DESCRIPTION")}
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
      onRowClick={(row) => onSelect(row.original)}
    />
  );
}
