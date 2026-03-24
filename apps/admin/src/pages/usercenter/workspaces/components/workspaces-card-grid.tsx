import { useEffect, useMemo, useRef } from "react";

import { useInfiniteQuery } from "@tanstack/react-query";

import { listOrganizationWorkspaces } from "@/api/organization-workspaces";
import type { OrganizationWorkspace } from "@/types/api";
import { ContentGuard } from "@/components/common/content-guard";
import { Spinner } from "@arclayer/ui/spinner";

import type { UserCenterWorkspacesTranslateFn, WorkspaceMenuItem } from "../types";
import { WorkspaceCard } from "./workspace-card";

interface WorkspacesCardGridProps {
  organizationId?: string;
  archived: boolean;
  searchInput: string;
  buildMenuItems: (ws: OrganizationWorkspace) => WorkspaceMenuItem[];
  onCardClick?: (ws: OrganizationWorkspace) => void;
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

  const items = useMemo(
    () => (query.data?.pages ?? []).flatMap((p) => p.items ?? []),
    [query.data?.pages],
  );

  const empty = !query.isLoading && items.length === 0;

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
      loading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
      empty={empty}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      className="py-4"
    >
      <div className="grid grid-cols-1 gap-4 py-4 md:grid-cols-2 xl:grid-cols-3">
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
