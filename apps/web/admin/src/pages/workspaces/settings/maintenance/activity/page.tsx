import { Button as AntButton } from "antd";
import { useInfiniteQuery } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { LoaderOne } from "@/components/ui/loader";
import { ActivityDetailDialog } from "@/components/activity/activity-detail-dialog";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import {
  ActivityFilterPopover,
  type ActivityFilters,
} from "@/components/activity/activity-filter-popover";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import * as activityApi from "@/api/activity";
import { listTeamUserOptions } from "@/api/team";

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeFilters(filters: ActivityFilters): ActivityFilters {
  const trimOrUndef = (v: string | undefined) => {
    const s = String(v || "").trim();
    return s ? s : undefined;
  };

  return {
    occurredFrom: trimOrUndef(filters.occurredFrom),
    occurredTo: trimOrUndef(filters.occurredTo),
    eventName: trimOrUndef(filters.eventName),
    actorUserId: trimOrUndef(filters.actorUserId),
    subjectUserId: trimOrUndef(filters.subjectUserId),
  };
}

export function WorkspaceActivityPage() {
  const { t } = useTranslation(["nav", "activity"]);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const defaultFilters = React.useMemo<ActivityFilters>(() => {
    const to = new Date();
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return {
      occurredFrom: from.toISOString(),
      occurredTo: to.toISOString(),
    };
  }, []);

  const [filters, setFilters] = React.useState<ActivityFilters>(() => defaultFilters);

  const pageSize = 20;
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  const normalizedFilters = React.useMemo(() => normalizeFilters(filters), [filters]);
  const filtersKey = stableStringify({
    ...normalizedFilters,
    workspaceId: workspaceId || "",
  });
  React.useEffect(() => {
    // Reset scroll position when filters change (so user sees the newest results).
    scrollRef.current?.scrollTo({ top: 0 });
  }, [filtersKey]);

  const queryEnabled = Boolean(workspaceId && String(workspaceId).trim());
  const listQuery = useInfiniteQuery({
    queryKey: ["activity", "workspace", workspaceId, pageSize, filtersKey] as const,
    enabled: queryEnabled,
    retry: false,
    meta: { silent: true },
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      activityApi.listWorkspaceActivity(String(workspaceId), {
        page: Number(pageParam) || 1,
        size: pageSize,
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
    return pages.flatMap((p) => p.items ?? []);
  }, [listQuery.data?.pages]);

  const empty = items.length === 0;

  React.useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return;
    if (!listQuery.hasNextPage) return;
    if (listQuery.isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (!listQuery.hasNextPage) return;
        if (listQuery.isFetchingNextPage) return;
        void listQuery.fetchNextPage();
      },
      {
        root,
        rootMargin: "200px",
        threshold: 0,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [listQuery.fetchNextPage, listQuery.hasNextPage, listQuery.isFetchingNextPage, items.length]);

  const [selected, setSelected] = React.useState<activityApi.ActivityEvent | null>(null);

  return (
    <DefaultPage
      width="full"
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
              return (pageData.items ?? []).map((u) => ({
                value: u.value,
                label: u.label,
                avatarUrl: u.avatarUrl ?? null,
              }));
            }}
          />
          <AntButton onClick={() => {}}>{t("activity:ACTIVITY_ACTION_IMPORT_EXPORT")}</AntButton>

          {listQuery.isFetching && !listQuery.isLoading ? <LoaderOne /> : null}
        </div>
      }
    >
      <PageState
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
              onSelect={(e) => setSelected(e)}
              loading={listQuery.isFetchingNextPage}
              titleSpan={4}
            />

            <div ref={sentinelRef} className="h-10" />
          </div>
        </div>
      </PageState>

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
