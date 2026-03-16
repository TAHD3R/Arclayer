import { useInfiniteQuery } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import * as activityApi from "@/api/activity";
import { listTeamUserOptions } from "@/api/team";
import { ContentGuard } from "@/components/common/content-guard";
import { DefaultPage } from "@/components/common/default-page";
import { Button } from "@arclayer/ui/button";
import { Spinner } from "@arclayer/ui/spinner";
import { ActivityDetailDialog } from "@/pages/organization/activity/components/activity-detail-dialog";
import {
  ActivityFilterPopover,
  type ActivityFilters,
} from "@/pages/organization/activity/components/activity-filter-popover";
import { ActivityTimeline } from "@/pages/organization/activity/components/activity-timeline";
import { useActivityInfiniteScroll } from "@/pages/organization/activity/hooks/use-activity-infinite-scroll";
import {
  ACTIVITY_PAGE_SIZE,
  createDefaultActivityFilters,
  normalizeActivityFilters,
  stableStringify,
} from "@/pages/organization/activity/utils";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { ActivityEvent } from "@/types/api";

export function WorkspaceActivityPage() {
  const { t } = useTranslation(["nav", "activity"]);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const defaultFilters = React.useMemo<ActivityFilters>(() => createDefaultActivityFilters(), []);
  const [filters, setFilters] = React.useState<ActivityFilters>(() => defaultFilters);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  const normalizedFilters = React.useMemo(() => normalizeActivityFilters(filters), [filters]);
  const filtersKey = stableStringify({
    ...normalizedFilters,
    workspaceId: workspaceId || "",
  });

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [filtersKey]);

  const queryEnabled = Boolean(workspaceId && String(workspaceId).trim());
  const listQuery = useInfiniteQuery({
    queryKey: ["activity", "workspace", workspaceId, ACTIVITY_PAGE_SIZE, filtersKey] as const,
    enabled: queryEnabled,
    retry: false,
    meta: { silent: true },
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      activityApi.listWorkspaceActivity(String(workspaceId), {
        page: Number(pageParam) || 1,
        size: ACTIVITY_PAGE_SIZE,
        occurredFrom: normalizedFilters.occurredFrom,
        occurredTo: normalizedFilters.occurredTo,
        eventName: normalizedFilters.eventName,
        actorUserId: normalizedFilters.actorUserId,
        subjectUserId: normalizedFilters.subjectUserId,
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

  const empty = items.length === 0;
  const [selected, setSelected] = React.useState<ActivityEvent | null>(null);

  return (
    <DefaultPage
      title={t("nav:NAV_SETTINGS_MAINTENANCE_ACTIVITY")}
      description={t("activity:ACTIVITY_DESC_WORKSPACE")}
      contentClassName="min-h-0 flex flex-col"
      action={
        <div className="flex items-center gap-2">
          <ActivityFilterPopover
            scope="workspace"
            workspaceId={workspaceId}
            value={filters}
            defaultValue={defaultFilters}
            onApply={(next) => setFilters(next)}
            fetchUserOptions={async (wid, q) => {
              const pageData = await listTeamUserOptions(String(wid), {
                q,
                page: 1,
                size: 20,
              });
              return (pageData.items ?? []).map((user) => ({
                value: user.value,
                label: user.label,
                avatarUrl: user.avatarUrl ?? null,
              }));
            }}
          />
          <Button variant="outline" onClick={() => {}}>
            {t("activity:ACTIVITY_ACTION_IMPORT_EXPORT")}
          </Button>

          {listQuery.isFetching && !listQuery.isLoading ? (
            <Spinner className="size-4 text-label-secondary" />
          ) : null}
        </div>
      }
    >
      <ContentGuard
        loading={listQuery.isLoading}
        error={listQuery.error}
        onRetry={() => void listQuery.refetch()}
        empty={empty}
        loadingVariant="table"
        emptyTitle={t("activity:ACTIVITY_EMPTY_TITLE")}
        emptyDescription={t("activity:ACTIVITY_EMPTY_DESC")}
        className="flex-1 min-h-0"
      >
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto px-4">
          <div className="py-4">
            <ActivityTimeline
              items={items}
              onSelect={(event) => setSelected(event)}
              loading={listQuery.isFetchingNextPage}
            />

            <div ref={sentinelRef} className="h-10" />
          </div>
        </div>
      </ContentGuard>

      <ActivityDetailDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        event={selected}
      />
    </DefaultPage>
  );
}
