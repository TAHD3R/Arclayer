import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, PanelRightOpen, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  listSystemFeedback,
  type FeedbackCategory,
  type FeedbackPriority,
  type FeedbackStatus,
} from "@/api/feedback";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
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
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@arclayer/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
type StatusFilter = FeedbackStatus | "all";
type PriorityFilter = FeedbackPriority | "all";
type CategoryFilter = FeedbackCategory | "all";

function statusVariant(status: FeedbackStatus) {
  if (status === "resolved" || status === "closed") return "secondary" as const;
  if (status === "new" || status === "triaged") return "outline" as const;
  return "default" as const;
}

function priorityVariant(priority: FeedbackPriority) {
  if (priority === "urgent") return "destructive" as const;
  if (priority === "high") return "default" as const;
  return "outline" as const;
}

export function SystemFeedbackCenterPage() {
  const { t, i18n } = useTranslation(["common", "platform"]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [priority, setPriority] = useState<PriorityFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => setPage(1), [debouncedSearch, status, priority, category]);

  const feedbackQuery = useQuery({
    queryKey: ["system", "feedback", "list", debouncedSearch, status, priority, category, page],
    queryFn: () =>
      listSystemFeedback({
        search: debouncedSearch || undefined,
        status: status === "all" ? undefined : status,
        priority: priority === "all" ? undefined : priority,
        category: category === "all" ? undefined : category,
        page,
        size: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const items = feedbackQuery.data?.items ?? [];
  const pages = feedbackQuery.data?.pages ?? 1;

  return (
    <DefaultPage
      title={t("platform:FEEDBACK_CENTER_TITLE")}
      description={t("platform:FEEDBACK_CENTER_DESCRIPTION")}
      showFavoriteToggle={false}
      contentClassName="min-h-0 flex flex-col"
      extra={
        <PageExtraToolbar
          leading={
            <>
              <DataTableSearchInput
                value={search}
                onChange={setSearch}
                placeholder={t("platform:FEEDBACK_FILTER_SEARCH_PLACEHOLDER")}
                clearLabel={t("common:CLEAR")}
              />
              <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
                <SelectTrigger className="w-40" aria-label={t("platform:FEEDBACK_COLUMN_STATUS")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">
                      {t("platform:FEEDBACK_FILTER_ALL_STATUSES")}
                    </SelectItem>
                    {FEEDBACK_STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`platform:${FEEDBACK_STATUS_LABELS[value]}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as PriorityFilter)}
              >
                <SelectTrigger className="w-40" aria-label={t("platform:FEEDBACK_COLUMN_PRIORITY")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">
                      {t("platform:FEEDBACK_FILTER_ALL_PRIORITIES")}
                    </SelectItem>
                    {FEEDBACK_PRIORITIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`platform:${FEEDBACK_PRIORITY_LABELS[value]}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as CategoryFilter)}
              >
                <SelectTrigger
                  className="w-44"
                  aria-label={t("platform:FEEDBACK_DIALOG_CATEGORY_LABEL")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">
                      {t("platform:FEEDBACK_FILTER_ALL_CATEGORIES")}
                    </SelectItem>
                    {FEEDBACK_CATEGORIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`platform:${FEEDBACK_CATEGORY_LABELS[value]}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </>
          }
          trailing={
            <Button
              type="button"
              variant="outline"
              size="icon"
              loading={feedbackQuery.isFetching}
              aria-label={t("platform:ACTION_REFRESH")}
              onClick={() => void feedbackQuery.refetch()}
            >
              <RefreshCw />
            </Button>
          }
        />
      }
    >
      <ContentGuard
        loading={feedbackQuery.isLoading}
        error={feedbackQuery.error}
        empty={!feedbackQuery.isLoading && !feedbackQuery.error && items.length === 0}
        emptyTitle={t("platform:FEEDBACK_EMPTY_TITLE")}
        emptyDescription={t("platform:FEEDBACK_EMPTY_DESCRIPTION")}
        onRetry={() => void feedbackQuery.refetch()}
        loadingVariant="table"
        className="min-h-0 flex-1"
      >
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("platform:FEEDBACK_COLUMN_MESSAGE")}</TableHead>
                <TableHead>{t("platform:FEEDBACK_COLUMN_REPORTER")}</TableHead>
                <TableHead>{t("platform:FEEDBACK_COLUMN_CONTEXT")}</TableHead>
                <TableHead>{t("platform:FEEDBACK_COLUMN_PRIORITY")}</TableHead>
                <TableHead>{t("platform:FEEDBACK_COLUMN_STATUS")}</TableHead>
                <TableHead>{t("platform:FEEDBACK_COLUMN_ASSIGNEE")}</TableHead>
                <TableHead>{t("platform:FEEDBACK_COLUMN_LAST_ACTIVITY")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("platform:FEEDBACK_ACTION_VIEW")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-96 py-3">
                    <div className="truncate font-medium">{item.messagePreview}</div>
                    <div className="mt-1 text-caption text-label-secondary">
                      {t(`platform:${FEEDBACK_CATEGORY_LABELS[item.category]}`)}
                    </div>
                  </TableCell>
                  <TableCell>{item.reporter.displayName || item.reporter.username}</TableCell>
                  <TableCell>
                    {t(`platform:${FEEDBACK_CONTEXT_LABELS[item.contextType]}`)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={priorityVariant(item.priority)}>
                      {t(`platform:${FEEDBACK_PRIORITY_LABELS[item.priority]}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(item.status)}>
                      {t(`platform:${FEEDBACK_STATUS_LABELS[item.status]}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.assignee?.displayName ||
                      item.assignee?.username ||
                      t("platform:FEEDBACK_ASSIGNEE_UNASSIGNED")}
                  </TableCell>
                  <TableCell>{formatter.format(new Date(item.lastActivityAt))}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("platform:FEEDBACK_ACTION_VIEW_ARIA", {
                        message: item.messagePreview,
                      })}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <PanelRightOpen aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pages > 1 ? (
            <div className="mt-4 flex items-center justify-end gap-2">
              <span className="text-footnote text-label-secondary">
                {t("platform:FEEDBACK_PAGE", { page, pages })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t("common:PREVIOUS")}
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t("common:NEXT")}
                disabled={page >= pages}
                onClick={() => setPage((value) => Math.min(pages, value + 1))}
              >
                <ChevronRight />
              </Button>
            </div>
          ) : null}
        </div>
      </ContentGuard>

      <FeedbackDetailSheet
        feedbackId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </DefaultPage>
  );
}
