import { Button as AntButton } from "antd";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import * as activityApi from "@/api/activity";
import { listTeamUserOptions } from "@/api/team";
import { listMyWorkspaces } from "@/api/workspaces";
import { ContentGuard } from "@/components/common/content-guard";
import { DefaultPage } from "@/components/common/default-page";
import { LoaderOne } from "@celestial/ui/loader";
import { ActivityDetailDialog } from "@/pages/organization/activity/components/activity-detail-dialog";
import {
  ActivityFilterPopover,
  type ActivityFilters,
} from "@/pages/organization/activity/components/activity-filter-popover";
import { ActivityTimeline } from "@/pages/organization/activity/components/activity-timeline";
import { useActivityInfiniteScroll } from "@/pages/organization/activity/hooks/use-activity-infinite-scroll";
import type { WorkspaceLabelById } from "@/pages/organization/activity/types";
import {
  ACTIVITY_PAGE_SIZE,
  createDefaultActivityFilters,
  normalizeActivityFilters,
  stableStringify,
} from "@/pages/organization/activity/utils";
import type { ActivityEvent } from "@/types/api";
import { useAuthStore } from "@/stores/use-auth-store";

export function OrganizationActivityPage() {
  const { t } = useTranslation(["nav", "activity"]);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);

  const defaultFilters = React.useMemo<ActivityFilters>(() => createDefaultActivityFilters(), []);
  const [filters, setFilters] = React.useState<ActivityFilters>(() => defaultFilters);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  const normalizedFilters = React.useMemo(
    () => normalizeActivityFilters(filters, { includeWorkspaceId: true }),
    [filters],
  );
  const filtersKey = stableStringify(normalizedFilters);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [filtersKey]);

  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces", sessionVersion],
    queryFn: async () => listMyWorkspaces(),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const workspaceItems = workspacesQuery.data?.items ?? [];

  const workspaceLabelById = React.useMemo<WorkspaceLabelById>(() => {
    const map: WorkspaceLabelById = {};
    for (const workspace of workspaceItems) {
      map[String(workspace.workspaceId)] =
        workspace.name || workspace.slug || workspace.workspaceId;
    }
    return map;
  }, [workspaceItems]);

  const listQuery = useInfiniteQuery({
    queryKey: ["activity", "org", ACTIVITY_PAGE_SIZE, filtersKey] as const,
    retry: false,
    meta: { silent: true },
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      activityApi.listSystemActivity({
        page: Number(pageParam) || 1,
        size: ACTIVITY_PAGE_SIZE,
        occurredFrom: normalizedFilters.occurredFrom,
        occurredTo: normalizedFilters.occurredTo,
        eventName: normalizedFilters.eventName,
        workspaceId: normalizedFilters.workspaceId,
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
      width="fixed"
      title={t("nav:NAV_ORG_ACTIVITY")}
      description={t("activity:ACTIVITY_DESC_ORG")}
      contentClassName="min-h-0 flex flex-col"
      action={
        <div className="flex items-center gap-2">
          <ActivityFilterPopover
            scope="org"
            value={filters}
            defaultValue={defaultFilters}
            onApply={(next) => setFilters(next)}
            workspaceItems={workspaceItems}
            workspacesLoading={workspacesQuery.isLoading}
            fetchUserOptions={async (wid, q) => {
              const pageData = await listTeamUserOptions(String(wid), { q, page: 1, size: 20 });
              return (pageData.items ?? []).map((user) => ({
                value: user.value,
                label: user.label,
                avatarUrl: user.avatarUrl ?? null,
              }));
            }}
          />
          <AntButton onClick={() => {}} autoInsertSpace={false}>
            {t("activity:ACTIVITY_ACTION_IMPORT_EXPORT")}
          </AntButton>
          {listQuery.isFetching && !listQuery.isLoading ? <LoaderOne /> : null}
        </div>
      }
    >
      <ContentGuard
        loading={listQuery.isLoading || workspacesQuery.isLoading}
        error={listQuery.error || workspacesQuery.error}
        onRetry={() => {
          void workspacesQuery.refetch();
          void listQuery.refetch();
        }}
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
        workspaceLabelById={workspaceLabelById}
      />
    </DefaultPage>
  );
}
