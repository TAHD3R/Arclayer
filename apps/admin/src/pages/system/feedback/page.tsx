import { PanelRightOpen, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";

import {
  listSystemFeedback,
  type FeedbackCategory,
  type FeedbackListItem,
  type FeedbackPriority,
  type FeedbackStatus,
} from "@/api/feedback";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { BaseTag } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { FeedbackDetailSheet } from "@/pages/system/feedback/components/feedback-detail-sheet";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_CONTEXT_LABELS,
  FEEDBACK_PRIORITIES,
  FEEDBACK_PRIORITY_LABELS,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
} from "@/pages/system/feedback/model";
import { Button } from "@arclayer/ui/button";
import { useDataTable } from "@arclayer/ui/data-table";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@arclayer/ui/select";

type StatusFilter = FeedbackStatus | "all";
type PriorityFilter = FeedbackPriority | "all";
type CategoryFilter = FeedbackCategory | "all";

function priorityColor(priority: FeedbackPriority) {
  if (priority === "urgent") return "red" as const;
  if (priority === "high") return "gold" as const;
  return "default" as const;
}

function statusColor(status: FeedbackStatus) {
  if (status === "resolved" || status === "closed") return "green" as const;
  if (status === "in_progress") return "blue" as const;
  if (status === "waiting_for_customer") return "gold" as const;
  return "default" as const;
}

function TruncatedValue(props: { children: string }) {
  return (
    <span className="block max-w-full truncate" title={props.children}>
      {props.children}
    </span>
  );
}

export function SystemFeedbackCenterPage() {
  const { t } = useTranslation(["common", "platform"]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [priority, setPriority] = useState<PriorityFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const columns = useMemo<ColumnDef<FeedbackListItem, unknown>[]>(
    () => [
      {
        id: "message",
        header: t("platform:FEEDBACK_COLUMN_MESSAGE"),
        meta: { title: t("platform:FEEDBACK_COLUMN_MESSAGE"), kind: "primary" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <TruncatedValue>{row.original.messagePreview}</TruncatedValue>
            <div className="mt-1 truncate text-caption text-label-secondary">
              {t(`platform:${FEEDBACK_CATEGORY_LABELS[row.original.category]}`)}
            </div>
          </div>
        ),
        size: 320,
        minSize: 240,
      },
      {
        id: "reporter",
        header: t("platform:FEEDBACK_COLUMN_REPORTER"),
        meta: { title: t("platform:FEEDBACK_COLUMN_REPORTER"), kind: "meta" },
        cell: ({ row }) => (
          <TruncatedValue>
            {row.original.reporter.displayName || row.original.reporter.username}
          </TruncatedValue>
        ),
        size: 180,
      },
      {
        id: "context",
        header: t("platform:FEEDBACK_COLUMN_CONTEXT"),
        meta: { title: t("platform:FEEDBACK_COLUMN_CONTEXT"), kind: "meta" },
        cell: ({ row }) => (
          <BaseTag>{t(`platform:${FEEDBACK_CONTEXT_LABELS[row.original.contextType]}`)}</BaseTag>
        ),
        size: 140,
      },
      {
        id: "priority",
        header: t("platform:FEEDBACK_COLUMN_PRIORITY"),
        meta: { title: t("platform:FEEDBACK_COLUMN_PRIORITY"), kind: "meta" },
        cell: ({ row }) => (
          <BaseTag color={priorityColor(row.original.priority)}>
            {t(`platform:${FEEDBACK_PRIORITY_LABELS[row.original.priority]}`)}
          </BaseTag>
        ),
        size: 110,
      },
      {
        id: "status",
        header: t("platform:FEEDBACK_COLUMN_STATUS"),
        meta: { title: t("platform:FEEDBACK_COLUMN_STATUS"), kind: "meta" },
        cell: ({ row }) => (
          <BaseTag color={statusColor(row.original.status)}>
            {t(`platform:${FEEDBACK_STATUS_LABELS[row.original.status]}`)}
          </BaseTag>
        ),
        size: 140,
      },
      {
        id: "assignee",
        header: t("platform:FEEDBACK_COLUMN_ASSIGNEE"),
        meta: { title: t("platform:FEEDBACK_COLUMN_ASSIGNEE"), kind: "meta" },
        cell: ({ row }) => (
          <TruncatedValue>
            {row.original.assignee?.displayName ||
              row.original.assignee?.username ||
              t("platform:FEEDBACK_ASSIGNEE_UNASSIGNED")}
          </TruncatedValue>
        ),
        size: 180,
      },
      {
        id: "lastActivity",
        header: t("platform:FEEDBACK_COLUMN_LAST_ACTIVITY"),
        meta: { title: t("platform:FEEDBACK_COLUMN_LAST_ACTIVITY"), kind: "meta" },
        cell: ({ row }) => (
          <TruncatedValue>{dateTime.formatDateTime(row.original.lastActivityAt)}</TruncatedValue>
        ),
        size: 180,
      },
      {
        id: "actions",
        header: t("platform:FEEDBACK_ACTION_VIEW"),
        meta: { title: t("platform:FEEDBACK_ACTION_VIEW"), kind: "actions" },
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("platform:FEEDBACK_ACTION_VIEW_ARIA", {
              message: row.original.messagePreview,
            })}
            onClick={() => setSelectedId(row.original.id)}
          >
            <PanelRightOpen aria-hidden="true" />
          </Button>
        ),
        size: 72,
      },
    ],
    [dateTime, t],
  );
  const tableHook = useDataTable<
    FeedbackListItem,
    {
      status?: FeedbackStatus;
      priority?: FeedbackPriority;
      category?: FeedbackCategory;
    }
  >({
    tableId: "system-feedback-center",
    columns,
    initialState: { pageSize: 20 },
    extraQuery: {
      status: status === "all" ? undefined : status,
      priority: priority === "all" ? undefined : priority,
      category: category === "all" ? undefined : category,
    },
    features: { sorting: { enabled: false } },
    fetcher: (params) =>
      listSystemFeedback({
        search: params.q,
        status: params.status,
        priority: params.priority,
        category: params.category,
        page: params.page,
        size: params.size,
      }),
    queryOptions: { retry: false },
  });
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
          <FeedbackFilter
            value={status}
            onChange={(value) => setStatus(value as StatusFilter)}
            label={t("platform:FEEDBACK_COLUMN_STATUS")}
            allLabel={t("platform:FEEDBACK_FILTER_ALL_STATUSES")}
            options={FEEDBACK_STATUSES.map((value) => ({
              value,
              label: t(`platform:${FEEDBACK_STATUS_LABELS[value]}`),
            }))}
          />
          <FeedbackFilter
            value={priority}
            onChange={(value) => setPriority(value as PriorityFilter)}
            label={t("platform:FEEDBACK_COLUMN_PRIORITY")}
            allLabel={t("platform:FEEDBACK_FILTER_ALL_PRIORITIES")}
            options={FEEDBACK_PRIORITIES.map((value) => ({
              value,
              label: t(`platform:${FEEDBACK_PRIORITY_LABELS[value]}`),
            }))}
          />
          <FeedbackFilter
            value={category}
            onChange={(value) => setCategory(value as CategoryFilter)}
            label={t("platform:FEEDBACK_DIALOG_CATEGORY_LABEL")}
            allLabel={t("platform:FEEDBACK_FILTER_ALL_CATEGORIES")}
            options={FEEDBACK_CATEGORIES.map((value) => ({
              value,
              label: t(`platform:${FEEDBACK_CATEGORY_LABELS[value]}`),
            }))}
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
    </DefaultPage>
  );
}

function FeedbackFilter(props: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  allLabel: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <Select value={props.value} onValueChange={props.onChange}>
      <SelectTrigger className="w-40" aria-label={props.label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="all">{props.allLabel}</SelectItem>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
