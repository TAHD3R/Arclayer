import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";

import { listSystemActivity } from "@/api/activity";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { BaseTag } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { ActivityUserPill } from "@/pages/workspaces/shared/activity/components/activity-user-pill";
import { useDataTable } from "@arclayer/ui/data-table";
import type { ActivityEvent } from "@arclayer/openapi/admin-types";

import {
  auditEventName,
  auditScopeLabel,
  auditSourceLabel,
  auditTargetLabel,
} from "./audit-event-presenters";

type AuditEventsTableProps = {
  onSelect: (event: ActivityEvent) => void;
  workspaceLabelById?: Readonly<Record<string, string>>;
  projectLabelById?: Readonly<Record<string, string>>;
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

export function AuditEventsTable({
  onSelect,
  workspaceLabelById = {},
  projectLabelById = {},
}: AuditEventsTableProps) {
  const { t } = useTranslation(["platform", "activity", "common"]);
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const columns = useMemo<ColumnDef<ActivityEvent, unknown>[]>(
    () => [
      {
        id: "event",
        header: t("platform:AUDIT_EVENT_NAME"),
        meta: { title: t("platform:AUDIT_EVENT_NAME"), kind: "primary" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <TruncatedValue children={auditEventName(t, row.original.eventName)} />
            <TruncatedValue mono children={row.original.eventName} />
          </div>
        ),
        size: 300,
        minSize: 220,
      },
      {
        id: "source",
        header: t("platform:AUDIT_EVENT_SOURCE"),
        meta: { title: t("platform:AUDIT_EVENT_SOURCE"), kind: "meta" },
        cell: ({ row }) => <BaseTag>{auditSourceLabel(t, row.original.source)}</BaseTag>,
        size: 130,
      },
      {
        id: "actor",
        header: t("platform:AUDIT_EVENT_ACTOR"),
        meta: { title: t("platform:AUDIT_EVENT_ACTOR"), kind: "meta" },
        cell: ({ row }) => (
          <a
            href="/system/tenants/users"
            className="block min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event) => event.stopPropagation()}
          >
            <ActivityUserPill
              user={row.original.actor}
              secondary={row.original.actorUserId ?? undefined}
            />
          </a>
        ),
        size: 180,
      },
      {
        id: "scope",
        header: t("platform:AUDIT_EVENT_SCOPE"),
        meta: { title: t("platform:AUDIT_EVENT_SCOPE"), kind: "meta" },
        cell: ({ row }) => {
          const label = auditScopeLabel(t, row.original, workspaceLabelById, projectLabelById);
          const href = row.original.projectId
            ? "/system/tenants/projects"
            : row.original.workspaceId
              ? "/system/tenants/workspaces"
              : null;
          return href ? (
            <a
              href={href}
              className="block truncate rounded-sm text-label-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={label}
              onClick={(event) => event.stopPropagation()}
            >
              {label}
            </a>
          ) : (
            <TruncatedValue children={label} />
          );
        },
        size: 220,
      },
      {
        id: "entity",
        header: t("platform:AUDIT_EVENT_TARGET"),
        meta: { title: t("platform:AUDIT_EVENT_TARGET"), kind: "meta" },
        cell: ({ row }) => <TruncatedValue children={auditTargetLabel(t, row.original)} />,
        size: 260,
      },
      {
        id: "trace",
        header: t("platform:AUDIT_EVENT_TRACE"),
        meta: { title: t("platform:AUDIT_EVENT_TRACE"), kind: "meta" },
        cell: ({ row }) => (
          <TruncatedValue
            mono
            children={row.original.traceId ?? t("platform:AUDIT_EVENT_TRACE_MISSING")}
          />
        ),
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
    [dateTime, projectLabelById, t, workspaceLabelById],
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
