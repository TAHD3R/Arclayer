import * as React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Spinner } from "@arclayer/ui/spinner";

import * as activityApi from "@/api/activity";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { ActivityDetailDialog } from "@/pages/workspaces/shared/activity/components/activity-detail-dialog";
import { ActivityTimeline } from "@/pages/workspaces/shared/activity/components/activity-timeline";
import { useActivityInfiniteScroll } from "@/pages/workspaces/shared/activity/hooks/use-activity-infinite-scroll";
import {
  ACTIVITY_PAGE_SIZE,
  createDefaultActivityFilters,
  normalizeActivityFilters,
  stableStringify,
} from "@/pages/workspaces/shared/activity/utils";
import type { ActivityEvent } from "@/types/api";

type SystemActivityFilters = {
  eventName?: string;
};

export function SystemSettingsActivityPage() {
  const { t } = useTranslation(["settings", "activity", "common"]);
  const defaultFilters = React.useMemo<SystemActivityFilters>(
    () => createDefaultActivityFilters(),
    [],
  );
  const [filters, setFilters] = React.useState<SystemActivityFilters>(() => defaultFilters);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const normalizedFilters = React.useMemo(() => normalizeActivityFilters(filters), [filters]);
  const filtersKey = stableStringify(normalizedFilters);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [filtersKey]);

  const listQuery = useInfiniteQuery({
    queryKey: ["activity", "system", ACTIVITY_PAGE_SIZE, filtersKey] as const,
    retry: false,
    meta: { silent: true },
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      activityApi.listSystemActivity({
        page: Number(pageParam) || 1,
        size: ACTIVITY_PAGE_SIZE,
        eventName: normalizedFilters.eventName,
      }),
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
  });

  const items = React.useMemo(() => {
    const pages = listQuery.data?.pages ?? [];
    return pages.flatMap((page) => page.items ?? []);
  }, [listQuery.data?.pages]);

  useActivityInfiniteScroll({
    root: scrollRef.current,
    target: sentinelRef.current,
    hasNextPage: Boolean(listQuery.hasNextPage),
    isFetchingNextPage: listQuery.isFetchingNextPage,
    fetchNextPage: listQuery.fetchNextPage,
    extraDeps: [items.length],
  });

  const [selected, setSelected] = React.useState<ActivityEvent | null>(null);

  return (
    <ContentGuard
      loading={listQuery.isLoading}
      error={listQuery.error}
      onRetry={() => void listQuery.refetch()}
      empty={items.length === 0}
      emptyTitle={t("activity:ACTIVITY_EMPTY_TITLE")}
      emptyDescription={t("settings:SETTINGS_SYSTEM_ACTIVITY_EMPTY_DESC")}
      className="min-h-0 flex-1"
    >
      <div className="space-y-5">
        <header className="space-y-1">
          <h2 className="text-title2 font-bold">
            {t("settings:SETTINGS_SYSTEM_ACTIVITY_PAGE_TITLE")}
          </h2>
          <p className="text-body text-label-secondary">
            {t("settings:SETTINGS_SYSTEM_ACTIVITY_PAGE_DESC")}
          </p>
        </header>

        <PageExtraToolbar
          leading={
            <DataTableSearchInput
              value={filters.eventName ?? ""}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, eventName: value.trim() || undefined }))
              }
              placeholder={t("activity:ACTIVITY_FILTER_EVENT_NAME_PLACEHOLDER")}
              clearLabel={t("common:CLEAR")}
            />
          }
          trailing={
            listQuery.isFetching && !listQuery.isLoading ? (
              <Spinner className="size-4 text-label-secondary" />
            ) : null
          }
        />

        <div
          ref={scrollRef}
          className="min-h-0 overflow-auto rounded-2xl border border-border bg-card px-4"
        >
          <div className="py-4">
            <ActivityTimeline
              items={items}
              onSelect={(event) => setSelected(event)}
              loading={listQuery.isFetchingNextPage}
            />
            <div ref={sentinelRef} className="h-10" />
          </div>
        </div>
      </div>

      <ActivityDetailDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        event={selected}
      />
    </ContentGuard>
  );
}
