import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { CheckCircle2, PlayCircle, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  listSystemFeedback,
  updateSystemFeedback,
  type FeedbackDetail,
  type FeedbackListItem,
  type FeedbackOrdering,
  type FeedbackPage,
  type UpdateFeedbackPayload,
} from "@/api/feedback";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { FloatingBulkToolbar } from "@/components/common/floating-bulk-toolbar";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { FeedbackDetailSheet } from "@/pages/system/feedback/components/feedback-detail-sheet";
import {
  FeedbackFilterPopover,
  type FeedbackFilters,
} from "@/pages/system/feedback/components/feedback-filter-popover";
import { createFeedbackColumns } from "@/pages/system/feedback/components/feedback-table-columns";
import { Button } from "@arclayer/ui/button";
import { useDataTable } from "@arclayer/ui/data-table";

const FEEDBACK_TABLE_ID = "system-feedback-center";
const DEFAULT_ORDERING: FeedbackOrdering = "-last_activity_at";

type FeedbackUpdateInput = {
  ids: readonly string[];
  payload: UpdateFeedbackPayload;
};

function patchFeedbackCaches(queryClient: QueryClient, updates: readonly FeedbackDetail[]) {
  const updatesById = new Map(updates.map((item) => [item.id, item]));
  queryClient.setQueriesData<FeedbackPage>(
    { queryKey: ["dataTable", FEEDBACK_TABLE_ID] },
    (current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item) => {
          const update = updatesById.get(item.id);
          if (!update) return item;
          return {
            ...item,
            assignee: update.assignee,
            priority: update.priority,
            status: update.status,
            lastActivityAt: update.lastActivityAt,
            resolvedAt: update.resolvedAt,
            closedAt: update.closedAt,
            updatedAt: update.updatedAt,
          };
        }),
      };
    },
  );
  for (const update of updates) {
    queryClient.setQueryData(["system", "feedback", "detail", update.id], update);
  }
}

export function SystemFeedbackCenterPage(props: { initialReporterUserId?: string }) {
  const { t } = useTranslation(["common", "platform"]);
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<FeedbackFilters>(() =>
    props.initialReporterUserId ? { reporterUserId: props.initialReporterUserId } : {},
  );
  const [ordering, setOrdering] = useState<FeedbackOrdering>(DEFAULT_ORDERING);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  useEffect(() => {
    setFilters((current) => {
      if (props.initialReporterUserId) {
        return { ...current, reporterUserId: props.initialReporterUserId };
      }
      const { reporterUserId: _removed, ...rest } = current;
      return rest;
    });
  }, [props.initialReporterUserId]);
  const updateMutation = useMutation({
    mutationFn: (input: FeedbackUpdateInput) =>
      Promise.all(input.ids.map((id) => updateSystemFeedback(id, input.payload))),
    onSuccess: (result, input) => {
      patchFeedbackCaches(queryClient, result);
      void queryClient.invalidateQueries({
        queryKey: ["dataTable", FEEDBACK_TABLE_ID],
        refetchType: "none",
      });
      notifySuccessText(
        t("platform:FEEDBACK_BULK_UPDATE_SUCCESS", {
          count: input.ids.length,
        }),
      );
    },
    onError: notifyError,
  });
  const columns = useMemo(
    () =>
      createFeedbackColumns({
        t,
        formatDateTime: dateTime.formatDateTime,
        updating: updateMutation.isPending,
        onView: setSelectedId,
        onQuickUpdate: (feedbackId, payload) =>
          updateMutation.mutate({ ids: [feedbackId], payload }),
        onFilterReporter: (user) =>
          setFilters((current) => ({ ...current, reporterUserId: user.id })),
      }),
    [dateTime.formatDateTime, t, updateMutation.isPending],
  );
  const tableHook = useDataTable<FeedbackListItem, FeedbackFilters>({
    tableId: FEEDBACK_TABLE_ID,
    columns,
    initialState: { pageSize: 20 },
    extraQuery: {
      ...filters,
    },
    orderingOverride: ordering,
    features: { sorting: { enabled: false } },
    rowSelection: { enabled: true, getRowId: (row) => row.id },
    fetcher: (params) =>
      listSystemFeedback({
        search: params.q,
        intent: params.intent,
        status: params.status,
        priority: params.priority,
        source: params.source,
        reporterUserId: params.reporterUserId,
        createdFrom: params.createdFrom,
        createdTo: params.createdTo,
        activityFrom: params.activityFrom,
        activityTo: params.activityTo,
        ordering: params.ordering as FeedbackOrdering | undefined,
        page: params.page,
        size: params.size,
      }),
    queryOptions: { retry: false },
  });
  const selectedIds = tableHook.table.getSelectedRowModel().rows.map((row) => row.original.id);
  const runBulkUpdate = (payload: UpdateFeedbackPayload) => {
    if (selectedIds.length === 0) return;
    updateMutation.mutate({ ids: selectedIds, payload });
  };
  const toolbar = (
    <PageExtraToolbar
      leading={
        <>
          <DataTableSearchInput
            value={tableHook.searchInput}
            onChange={tableHook.setSearchInput}
            placeholder={t("platform:FEEDBACK_FILTER_SEARCH_PLACEHOLDER")}
            clearLabel={t("common:CLEAR")}
          />
          <FeedbackFilterPopover
            value={filters}
            onChange={setFilters}
            ordering={ordering}
            onOrderingChange={setOrdering}
          />
        </>
      }
      trailing={
        <Button
          type="button"
          variant="outline"
          size="icon"
          loading={tableHook.isFetching}
          aria-label={t("platform:ACTION_REFRESH")}
          onClick={() => void tableHook.refetch()}
        >
          <RefreshCw />
        </Button>
      }
    />
  );

  return (
    <DefaultPage
      title={t("platform:FEEDBACK_CENTER_TITLE")}
      description={t("platform:FEEDBACK_CENTER_DESCRIPTION")}
      contentClassName="min-h-0 flex flex-col"
    >
      <AdminDataTableSection
        table={tableHook.table}
        emptyText={t("platform:FEEDBACK_EMPTY_TITLE")}
        emptyTitle={t("platform:FEEDBACK_EMPTY_TITLE")}
        emptyDescription={t("platform:FEEDBACK_EMPTY_DESCRIPTION")}
        loading={tableHook.isLoading}
        error={tableHook.error}
        onRetry={() => void tableHook.refetch()}
        t={(key, options) => t(key, options)}
        rowHeight="short"
        wrapHeaders
        refreshing={tableHook.isFetching && !tableHook.isLoading}
        infiniteScroll={tableHook.infiniteScroll}
        toolbar={toolbar}
      />

      <FeedbackDetailSheet
        feedbackId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
      <FloatingBulkToolbar
        visible={selectedIds.length > 0}
        selectedLabel={t("platform:FEEDBACK_SELECTED_COUNT", { count: selectedIds.length })}
        clearLabel={t("common:DATA_TABLE_CLEAR_SELECTION")}
        onClear={() => tableHook.table.resetRowSelection()}
        actions={[
          {
            key: "start",
            label: t("platform:FEEDBACK_ACTION_START"),
            icon: <PlayCircle className="size-4" />,
            disabled: updateMutation.isPending,
            onClick: () => runBulkUpdate({ status: "in_progress" }),
          },
          {
            key: "resolve",
            label: t("platform:FEEDBACK_ACTION_RESOLVE"),
            icon: <CheckCircle2 className="size-4" />,
            disabled: updateMutation.isPending,
            onClick: () => runBulkUpdate({ status: "resolved" }),
          },
          {
            key: "close",
            label: t("platform:FEEDBACK_ACTION_CLOSE"),
            icon: <XCircle className="size-4" />,
            disabled: updateMutation.isPending,
            onClick: () => runBulkUpdate({ status: "closed" }),
          },
        ]}
      />
    </DefaultPage>
  );
}
