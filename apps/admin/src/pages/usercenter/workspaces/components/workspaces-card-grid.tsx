import { useEffect, useMemo, useRef } from "react";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { listOrganizationWorkspaces } from "@/api/organization-workspaces";
import { listMyWorkspaces } from "@/api/workspaces";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { Spinner } from "@arclayer/ui/spinner";

import type {
  UserCenterWorkspaceListItem,
  UserCenterWorkspacesTranslateFn,
  WorkspaceMenuItem,
} from "../types";
import {
  mapOrganizationWorkspaceToListItem,
  mapPersonalWorkspaceToListItem,
  matchesWorkspaceSearch,
} from "../workspace-list-items";
import { WorkspaceCard } from "./workspace-card";

interface WorkspacesCardGridProps {
  organizationId?: string;
  archived: boolean;
  searchInput: string;
  buildMenuItems: (ws: UserCenterWorkspaceListItem) => WorkspaceMenuItem[];
  onCardClick?: (ws: UserCenterWorkspaceListItem) => void;
  emptyTitle: string;
  emptyDescription: string;
  t: UserCenterWorkspacesTranslateFn;
}

const PAGE_SIZE = 12;

export function WorkspacesCardGrid(props: WorkspacesCardGridProps) {
  const {
    organizationId,
    archived,
    searchInput,
    buildMenuItems,
    onCardClick,
    emptyTitle,
    emptyDescription,
    t,
  } = props;

  const scope = organizationId ?? "me";
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const includePersonalWorkspace = !organizationId && !archived;

  const query = useInfiniteQuery({
    queryKey: ["organization-workspaces-cards", scope, archived, searchInput],
    queryFn: async ({ pageParam }) =>
      listOrganizationWorkspaces({
        organizationId,
        page: typeof pageParam === "number" ? pageParam : 1,
        size: PAGE_SIZE,
        q: searchInput || undefined,
        archived,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    staleTime: 30 * 1000,
    meta: { silent: true },
  });

  const personalWorkspaceQuery = useQuery({
    queryKey: ["me", "workspaces", "usercenter-cards"],
    queryFn: listMyWorkspaces,
    enabled: includePersonalWorkspace,
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const items = useMemo(
    () => {
      const teamItems = (query.data?.pages ?? [])
        .flatMap((page) => page.items ?? [])
        .map(mapOrganizationWorkspaceToListItem);
      const personalWorkspace =
        includePersonalWorkspace &&
        personalWorkspaceQuery.data?.switcher.personalSpace.status === "ready"
          ? personalWorkspaceQuery.data.switcher.personalSpace.workspace
          : null;
      const personalItem =
        personalWorkspace && matchesWorkspaceSearch(mapPersonalWorkspaceToListItem(personalWorkspace), searchInput)
          ? [mapPersonalWorkspaceToListItem(personalWorkspace)]
          : [];

      return [...personalItem, ...teamItems];
    },
    [includePersonalWorkspace, personalWorkspaceQuery.data, query.data?.pages, searchInput],
  );

  const loading = query.isLoading || (includePersonalWorkspace && personalWorkspaceQuery.isLoading);
  const error = personalWorkspaceQuery.error ?? query.error;
  const empty = !loading && items.length === 0;

  // IntersectionObserver: auto-load next page when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (query.isError) return;
    if (query.hasNextPage !== true) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (query.isError) return;
        if (query.isFetchingNextPage) return;
        query.fetchNextPage().catch(() => {});
      },
      { root: null, rootMargin: "400px", threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [query.fetchNextPage, query.hasNextPage, query.isError, query.isFetchingNextPage]);

  return (
    <ContentGuard
      loading={loading}
      error={error}
      onRetry={() => {
        void query.refetch();
        if (includePersonalWorkspace) {
          void personalWorkspaceQuery.refetch();
        }
      }}
      empty={empty}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      wrapperSpacing="flush"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((workspace) => (
          <WorkspaceCard
            key={workspace.workspaceId}
            workspace={workspace}
            menuItems={buildMenuItems(workspace)}
            t={t}
            onClick={onCardClick ? () => onCardClick(workspace) : undefined}
          />
        ))}
      </div>

      <div className="flex justify-center py-4">
        <div className="flex h-6 w-6 items-center justify-center">
          {query.isFetchingNextPage ? <Spinner className="size-4 text-label-secondary" /> : null}
        </div>
      </div>
      <div ref={sentinelRef} />
    </ContentGuard>
  );
}
