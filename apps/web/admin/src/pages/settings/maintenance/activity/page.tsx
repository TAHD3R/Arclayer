import { DatePicker, Input as AntInput, Modal, Pagination, Tag } from "antd";
import { Search } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { flexRender, type ColumnDef } from "@tanstack/react-table";

import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { DebounceSelect, type DebounceSelectOption } from "@/components/inputs/debounce-select";
import { useDataTable } from "@/components/data-table";
import { LoaderOne } from "@/components/ui/loader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDateTimeWithPattern } from "@/lib/time/date-time";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import * as activityApi from "@/api/activity";
import { listTeamUserOptions } from "@/api/team";

type ActivityFilters = {
  occurredFrom?: string;
  occurredTo?: string;
  eventName?: string;
  actorUserId?: string;
};

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function WorkspaceActivityPage() {
  const { t } = useTranslation(["nav", "activity"]);
  const prefs = usePreferencesStore();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const [filters, setFilters] = React.useState<ActivityFilters>(() => {
    const to = new Date();
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return {
      occurredFrom: from.toISOString(),
      occurredTo: to.toISOString(),
    };
  });

  const [rangeValue, setRangeValue] = React.useState<any[] | null>(null);
  React.useEffect(() => {
    if (!filters.occurredFrom && !filters.occurredTo) {
      setRangeValue(null);
    }
  }, [filters.occurredFrom, filters.occurredTo]);

  const [selected, setSelected] = React.useState<activityApi.ActivityEvent | null>(null);

  const columns = React.useMemo<ColumnDef<activityApi.ActivityEvent>[]>(
    () => [
      {
        id: "occurredAt",
        header: t("activity:ACTIVITY_TABLE_TIME"),
        cell: ({ row }) => {
          const value = row.original.occurredAt;
          const date = value ? new Date(value) : null;
          if (!date) return <span className="text-muted-foreground">-</span>;
          const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
          return (
            <span className="whitespace-nowrap">
              {formatDateTimeWithPattern({
                date,
                locale: prefs.locale,
                timeZone,
                dateFormat: "YYYY-MM-DD",
                includeTime: true,
              })}
            </span>
          );
        },
      },
      {
        id: "eventName",
        header: t("activity:ACTIVITY_TABLE_EVENT"),
        cell: ({ row }) => (
          <div className="min-w-56">
            <div className="font-mono text-xs">{row.original.eventName}</div>
            {row.original.source ? (
              <div className="mt-1 text-xs text-muted-foreground">
                {t("activity:ACTIVITY_FIELD_SOURCE")}: {row.original.source}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: "actor",
        header: t("activity:ACTIVITY_TABLE_ACTOR"),
        cell: ({ row }) => {
          const actor = row.original.actorUserId;
          return actor ? (
            <span className="font-mono text-xs">{actor}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        id: "entity",
        header: t("activity:ACTIVITY_TABLE_ENTITY"),
        cell: ({ row }) => {
          const entityType = row.original.entityType;
          const entityId = row.original.entityId;
          if (!entityType && !entityId) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="min-w-48">
              <div className="font-mono text-xs">{entityType ?? "-"}</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">{entityId ?? "-"}</div>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs",
                "hover:bg-muted text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setSelected(row.original)}
            >
              {t("activity:ACTIVITY_ACTION_VIEW_DETAIL")}
            </button>
          </div>
        ),
      },
    ],
    [prefs.locale, t],
  );

  const tableHook = useDataTable<activityApi.ActivityEvent, activityApi.ListActivityParams>({
    tableId: "workspace-activity",
    columns,
    extraQuery: {
      from: filters.occurredFrom,
      to: filters.occurredTo,
      event_name: filters.eventName,
      actor_user_id: filters.actorUserId,
    },
    fetcher: (params) => activityApi.listWorkspaceActivity(String(workspaceId || ""), params),
    search: { debounceMs: 350 },
    initialState: { pageSize: 20, q: "" },
    queryOptions: {
      enabled: Boolean(workspaceId && String(workspaceId).trim()),
    },
  });

  const table = tableHook.table;
  const empty = (tableHook.pageData?.items?.length ?? 0) === 0;

  const currentPage = tableHook.pageData?.page ?? 1;
  const currentSize = tableHook.pageData?.size ?? 20;

  return (
    <DefaultPage
      width="full"
      title={t("nav:NAV_SETTINGS_MAINTENANCE_ACTIVITY")}
      description={t("activity:ACTIVITY_DESC_WORKSPACE")}
      contentClassName="min-h-0 flex flex-col"
      extra={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <DatePicker.RangePicker
              showTime
              allowClear
              value={rangeValue as any}
              onChange={(values) => {
                setRangeValue((values as any) ?? null);
                const start = (values as any)?.[0];
                const end = (values as any)?.[1];
                const from = start?.toDate ? start.toDate().toISOString() : start?.toISOString?.();
                const to = end?.toDate ? end.toDate().toISOString() : end?.toISOString?.();
                setFilters((prev) => ({
                  ...prev,
                  occurredFrom: from || undefined,
                  occurredTo: to || undefined,
                }));
              }}
            />

            <AntInput
              variant="borderless"
              value={filters.eventName ?? ""}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, eventName: e.target.value || undefined }))
              }
              placeholder={t("activity:ACTIVITY_FILTER_EVENT_NAME")}
              allowClear
              prefix={<Search className="size-4 text-muted-foreground" />}
              style={{ width: 280, maxWidth: "100%" }}
            />

            <DebounceSelect
              labelInValue
              value={
                filters.actorUserId
                  ? ({
                      value: filters.actorUserId,
                      label: filters.actorUserId,
                    } as DebounceSelectOption)
                  : undefined
              }
              allowClear
              disabled={!workspaceId}
              placeholder={t("activity:ACTIVITY_FILTER_ACTOR")}
              style={{ width: 260, maxWidth: "100%" }}
              fetchOptions={async (search) => {
                if (!workspaceId) return [];
                const page = await listTeamUserOptions(String(workspaceId), {
                  q: search,
                  page: 1,
                  size: 20,
                });
                return (page.items ?? []).map((u) => ({
                  value: u.value,
                  label: u.label,
                  avatarUrl: u.avatarUrl ?? null,
                }));
              }}
              onChange={(value) => {
                const v = (value as any)?.value ?? null;
                setFilters((prev) => ({ ...prev, actorUserId: v ? String(v) : undefined }));
              }}
            />
          </div>

          {tableHook.isFetching && !tableHook.isLoading ? <LoaderOne /> : null}
        </div>
      }
    >
      <PageState
        loading={tableHook.isLoading}
        error={tableHook.error}
        onRetry={() => void tableHook.refetch()}
        empty={empty}
        loadingVariant="table"
        emptyTitle={t("activity:ACTIVITY_EMPTY_TITLE")}
        emptyDescription={t("activity:ACTIVITY_EMPTY_DESC")}
        className="flex-1 min-h-0"
      >
        <div className="rounded-md border overflow-auto flex-1 min-h-0">
          <Table>
            <TableHeader className="sticky top-0 z-20 bg-card">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {t("activity:ACTIVITY_EMPTY_TABLE")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-end pt-4">
          <Pagination
            current={currentPage}
            pageSize={currentSize}
            total={tableHook.pageData?.total ?? 0}
            showSizeChanger
            onChange={(page, pageSize) => {
              tableHook.table.setPageIndex(Math.max(0, page - 1));
              tableHook.table.setPageSize(pageSize);
            }}
          />
        </div>
      </PageState>

      <Modal
        open={Boolean(selected)}
        title={t("activity:ACTIVITY_DETAIL_TITLE")}
        onCancel={() => setSelected(null)}
        footer={null}
        width={760}
      >
        {selected ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Tag color="blue">{selected.eventName}</Tag>
              {selected.source ? <Tag>{selected.source}</Tag> : null}
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">
                {t("activity:ACTIVITY_FIELD_EVENT_NAME")}
              </div>
              <div className="mt-1 font-mono text-xs">{selected.eventName}</div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">
                {t("activity:ACTIVITY_FIELD_PROPERTIES")}
              </div>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
                {safeJsonStringify(selected.properties)}
              </pre>
            </div>
          </div>
        ) : null}
      </Modal>
    </DefaultPage>
  );
}
