import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";

import { useInfiniteQuery } from "@tanstack/react-query";

import { listWorkspaces } from "@/api/workspace-management";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { Spinner } from "@arclayer/ui/spinner";

import type {
  UserCenterWorkspaceListItem,
  UserCenterWorkspacesTranslateFn,
  WorkspaceMenuItem,
} from "../types";
import type { WorkspaceEditingField } from "../hooks/use-workspace-menu-actions";
import { mapWorkspaceManageListItemToListItem } from "../workspace-list-items";
import { WorkspaceCard } from "./workspace-card";

interface WorkspacesCardGridProps {
  archived: boolean;
  searchInput: string;
  buildMenuItems: (ws: UserCenterWorkspaceListItem) => WorkspaceMenuItem[];
  onPrepareWorkspaceMenu?: (workspaceId: string) => void;
  editingWorkspaceId: string | null;
  editingWorkspaceField: WorkspaceEditingField | null;
  editingWorkspaceName: string;
  editingWorkspaceDescription: string;
  onEditingWorkspaceNameChange: (value: string) => void;
  onEditingWorkspaceDescriptionChange: (value: string) => void;
  onCommitWorkspaceEdit: (
    workspace: UserCenterWorkspaceListItem,
    field: WorkspaceEditingField,
  ) => void;
  onCancelWorkspaceEdit: () => void;
  disableWorkspaceNavigation?: boolean;
  onCardClick?: (ws: UserCenterWorkspaceListItem) => void;
  emptyTitle: string;
  emptyDescription: string;
  emptyExtra?: ReactNode;
  appendCard?: ReactNode;
  t: UserCenterWorkspacesTranslateFn;
}

const PAGE_SIZE = 12;

export function WorkspacesCardGrid(props: WorkspacesCardGridProps) {
  const {
    archived,
    searchInput,
    buildMenuItems,
    onPrepareWorkspaceMenu,
    editingWorkspaceId,
    editingWorkspaceField,
    editingWorkspaceName,
    editingWorkspaceDescription,
    onEditingWorkspaceNameChange,
    onEditingWorkspaceDescriptionChange,
    onCommitWorkspaceEdit,
    onCancelWorkspaceEdit,
    disableWorkspaceNavigation,
    onCardClick,
    emptyTitle,
    emptyDescription,
    emptyExtra,
    appendCard,
    t,
  } = props;

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const query = useInfiniteQuery({
    queryKey: ["workspace-management-cards", archived, searchInput],
    queryFn: async ({ pageParam }) =>
      listWorkspaces({
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
    () =>
      (query.data?.pages ?? [])
        .flatMap((page) => page.items ?? [])
        .map(mapWorkspaceManageListItemToListItem),
    [query.data?.pages],
  );

  const loading = query.isLoading;
  const error = query.error;
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
      }}
      empty={empty}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyExtra={emptyExtra}
      wrapperSpacing="flush"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((workspace) => (
          <WorkspaceCard
            key={workspace.workspaceId}
            workspace={workspace}
            menuItems={buildMenuItems(workspace)}
            onPrepareMenu={() => onPrepareWorkspaceMenu?.(workspace.workspaceId)}
            t={t}
            editing={editingWorkspaceId === workspace.workspaceId}
            editingField={editingWorkspaceField}
            editingName={editingWorkspaceName}
            editingDescription={editingWorkspaceDescription}
            onEditingNameChange={onEditingWorkspaceNameChange}
            onEditingDescriptionChange={onEditingWorkspaceDescriptionChange}
            onCommitName={() => void onCommitWorkspaceEdit(workspace, "name")}
            onCommitDescription={() => void onCommitWorkspaceEdit(workspace, "description")}
            onCancelEdit={onCancelWorkspaceEdit}
            onClick={
              !disableWorkspaceNavigation && onCardClick ? () => onCardClick(workspace) : undefined
            }
          />
        ))}
        {items.length > 0 ? appendCard : null}
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
