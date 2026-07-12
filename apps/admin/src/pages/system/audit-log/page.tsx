import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import * as activityApi from "@/api/activity";
import { listSystemDirectoryUsers, listSystemDirectoryWorkspaces } from "@/api/system-directory";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { ActivityDetailDialog } from "@/pages/workspaces/shared/activity/components/activity-detail-dialog";
import {
  ActivityFilterPopover,
  type ActivityFilters,
} from "@/pages/workspaces/shared/activity/components/activity-filter-popover";
import { ActivityTimeline } from "@/pages/workspaces/shared/activity/components/activity-timeline";
import { useActivityInfiniteScroll } from "@/pages/workspaces/shared/activity/hooks/use-activity-infinite-scroll";
import {
  ACTIVITY_PAGE_SIZE,
  createDefaultActivityFilters,
  normalizeActivityFilters,
  stableStringify,
} from "@/pages/workspaces/shared/activity/utils";
import { Spinner } from "@arclayer/ui/spinner";
import type { ActivityEvent, SystemDirectoryWorkspace } from "@arclayer/openapi/admin-types";

async function listAllSystemWorkspaces(): Promise<SystemDirectoryWorkspace[]> {
  const firstPage = await listSystemDirectoryWorkspaces({ page: 1, size: 100, ordering: "name" });
  const remainingPageNumbers = Array.from(
    { length: Math.max(0, firstPage.pages - 1) },
    (_, index) => index + 2,
  );
  const remainingPages = await Promise.all(
    remainingPageNumbers.map((page) =>
      listSystemDirectoryWorkspaces({ page, size: 100, ordering: "name" }),
    ),
  );

  return [firstPage, ...remainingPages].flatMap((page) => page.items);
}

export function SystemAuditLogPage() {
  const { t } = useTranslation(["common", "activity", "platform"]);
  const defaultFilters = useMemo<ActivityFilters>(() => createDefaultActivityFilters(), []);
  const [filters, setFilters] = useState<ActivityFilters>(() => defaultFilters);
  const [selected, setSelected] = useState<ActivityEvent | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const normalizedFilters = useMemo(
    () => normalizeActivityFilters(filters, { includeWorkspaceId: true }),
    [filters],
  );
  const filtersKey = stableStringify(normalizedFilters);

  useEffect(() => scrollRef.current?.scrollTo({ top: 0 }), [filtersKey]);

  const workspacesQuery = useQuery({
    queryKey: ["system", "audit", "workspaces"] as const,
    queryFn: listAllSystemWorkspaces,
    retry: false,
    meta: { silent: true },
  });
  const listQuery = useInfiniteQuery({
    queryKey: ["activity", "system", ACTIVITY_PAGE_SIZE, filtersKey] as const,
    retry: false,
    meta: { silent: true },
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
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
  const items = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((page) => page.items ?? []),
    [listQuery.data?.pages],
  );
  const workspaceLabelById = useMemo(
    () =>
      Object.fromEntries(
        (workspacesQuery.data ?? []).map((workspace) => [workspace.workspaceId, workspace.name]),
      ),
    [workspacesQuery.data],
  );

  useActivityInfiniteScroll({
    root: scrollRef.current,
    target: sentinelRef.current,
    hasNextPage: Boolean(listQuery.hasNextPage),
    isFetchingNextPage: listQuery.isFetchingNextPage,
    fetchNextPage: listQuery.fetchNextPage,
    extraDeps: [items.length],
  });

  const retry = () => {
    void Promise.all([listQuery.refetch(), workspacesQuery.refetch()]);
  };

  return (
    <DefaultPage
      title={t("platform:AUDIT_TITLE")}
      description={t("platform:AUDIT_DESCRIPTION")}
      showFavoriteToggle={false}
      contentClassName="min-h-0 flex flex-col"
      extra={
        <PageExtraToolbar
          leading={
            <>
              <DataTableSearchInput
                value={filters.eventName ?? ""}
                onChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    eventName: value.trim() || undefined,
                  }))
                }
                placeholder={t("activity:ACTIVITY_FILTER_EVENT_NAME_PLACEHOLDER")}
                clearLabel={t("common:CLEAR")}
              />
              <ActivityFilterPopover
                scope="org"
                value={filters}
                defaultValue={defaultFilters}
                onApply={setFilters}
                workspaceItems={workspacesQuery.data}
                workspacesLoading={workspacesQuery.isLoading}
                fetchUserOptions={async (workspaceId, query) => {
                  const users = await listSystemDirectoryUsers({
                    workspaceId,
                    q: query,
                    page: 1,
                    size: 20,
                  });
                  return users.items.map((user) => ({
                    value: user.userId,
                    label: user.displayName || user.username || user.email || user.userId,
                    avatarUrl: user.avatarUrl ?? null,
                  }));
                }}
              />
            </>
          }
          trailing={
            listQuery.isFetching && !listQuery.isLoading ? (
              <Spinner className="size-4 text-label-secondary" />
            ) : null
          }
        />
      }
    >
      <ContentGuard
        loading={listQuery.isLoading || workspacesQuery.isLoading}
        error={listQuery.error ?? workspacesQuery.error}
        onRetry={retry}
        empty={items.length === 0}
        loadingVariant="table"
        emptyTitle={t("platform:AUDIT_EMPTY_TITLE")}
        emptyDescription={t("platform:AUDIT_EMPTY_DESCRIPTION")}
        className="flex min-h-0 flex-1"
      >
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-4">
          <div className="py-4">
            <ActivityTimeline
              items={items}
              onSelect={setSelected}
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
