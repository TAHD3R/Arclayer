import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, FolderKanban, Globe2, PanelsTopLeft } from "lucide-react";

import { listSystemActivity, type ActivityOrdering } from "@/api/activity";
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
import type { ActivityEvent } from "@arclayer/openapi/admin-types";

import {
  auditEventName,
  auditScopeLabel,
  auditSourceLabel,
  auditTargetLabel,
} from "./audit-event-presenters";
import { AuditEventControls, type AuditEventFilters } from "./audit-table-controls";
import { AuditTablePagination } from "./audit-table-pagination";
import { AuditUserIdentity } from "./audit-user-identity";

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
  const [filters, setFilters] = useState<AuditEventFilters>({});
  const [ordering, setOrdering] = useState<ActivityOrdering>("-occurred_at");
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const columns = useMemo<ColumnDef<ActivityEvent, unknown>[]>(
    () => [
      {
        id: "occurredAt",
        header: t("platform:AUDIT_EVENT_TIME"),
        meta: { title: t("platform:AUDIT_EVENT_TIME"), kind: "meta" },
        cell: ({ row }) => (
          <TruncatedValue children={dateTime.formatDateTime(row.original.occurredAt)} />
        ),
        size: 180,
      },
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
          <AuditUserIdentity
            user={row.original.actor}
            userId={row.original.actorUserId}
            onFilter={(actorUserId) => setFilters((current) => ({ ...current, actorUserId }))}
          />
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
              <span className="flex min-w-0 items-center gap-2">
                {row.original.projectId ? (
                  <FolderKanban className="size-3.5 shrink-0 text-label-tertiary" />
                ) : (
                  <PanelsTopLeft className="size-3.5 shrink-0 text-label-tertiary" />
                )}
                <span className="truncate">{label}</span>
              </span>
            </a>
          ) : (
            <span className="flex min-w-0 items-center gap-2">
              <Globe2 className="size-3.5 shrink-0 text-label-tertiary" />
              <TruncatedValue children={label} />
            </span>
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
                onSelect(row.original);
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
    [dateTime, onSelect, projectLabelById, t, workspaceLabelById],
  );
  const tableHook = useDataTable<ActivityEvent, AuditEventFilters>({
    tableId: "system-audit-events",
    columns,
    initialState: { pageSize: 20 },
    extraQuery: filters,
    orderingOverride: ordering,
    features: { sorting: { enabled: false } },
    fetcher: (params) =>
      listSystemActivity({
        page: params.page,
        size: params.size,
        eventName: params.q,
        occurredFrom: params.occurredFrom,
        occurredTo: params.occurredTo,
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        actorUserId: params.actorUserId,
        entityType: params.entityType,
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
            placeholder={t("activity:ACTIVITY_FILTER_EVENT_NAME_PLACEHOLDER")}
            clearLabel={t("common:CLEAR")}
          />
          <AuditEventControls
            value={filters}
            onChange={setFilters}
            ordering={ordering}
            onOrderingChange={setOrdering}
            workspaceLabelById={workspaceLabelById}
            projectLabelById={projectLabelById}
          />
        </>
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
      toolbar={toolbar}
      footerSlot={<AuditTablePagination table={tableHook.table} total={tableHook.total} />}
      rowClassName={() => "cursor-pointer"}
      onRowClick={(row) => onSelect(row.original)}
    />
  );
}
