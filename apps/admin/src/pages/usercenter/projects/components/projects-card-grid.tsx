import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";

import { useInfiniteQuery } from "@tanstack/react-query";

import { listProjects } from "@/api/projects";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { Spinner } from "@arclayer/ui/spinner";

import type {
  ProjectMenuItem,
  UserCenterProjectListItem,
  UserCenterProjectsTranslateFn,
} from "../types";
import type { ProjectEditingField } from "../hooks/use-project-menu-actions";
import { mapProjectToListItem } from "../project-list-items";
import { ProjectCard } from "./project-card";

interface ProjectsCardGridProps {
  workspaceId?: string;
  archived: boolean;
  searchInput: string;
  buildMenuItems: (project: UserCenterProjectListItem) => ProjectMenuItem[];
  onPrepareProjectMenu?: (projectId: string) => void;
  editingProjectId: string | null;
  editingProjectField: ProjectEditingField | null;
  editingProjectName: string;
  editingProjectDescription: string;
  onEditingProjectNameChange: (value: string) => void;
  onEditingProjectDescriptionChange: (value: string) => void;
  onCommitProjectEdit: (project: UserCenterProjectListItem, field: ProjectEditingField) => void;
  onCancelProjectEdit: () => void;
  disableProjectNavigation?: boolean;
  onCardClick?: (project: UserCenterProjectListItem) => void;
  emptyTitle: string;
  emptyDescription: string;
  emptyExtra?: ReactNode;
  appendCard?: ReactNode;
  t: UserCenterProjectsTranslateFn;
}

const PAGE_SIZE = 12;

export function ProjectsCardGrid(props: ProjectsCardGridProps) {
  const {
    workspaceId,
    archived,
    searchInput,
    buildMenuItems,
    onPrepareProjectMenu,
    editingProjectId,
    editingProjectField,
    editingProjectName,
    editingProjectDescription,
    onEditingProjectNameChange,
    onEditingProjectDescriptionChange,
    onCommitProjectEdit,
    onCancelProjectEdit,
    disableProjectNavigation,
    onCardClick,
    emptyTitle,
    emptyDescription,
    emptyExtra,
    appendCard,
    t,
  } = props;

  const scope = workspaceId ? `workspace:${workspaceId}` : "pending-workspace";
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const query = useInfiniteQuery({
    queryKey: ["projects-cards", scope, archived, searchInput],
    queryFn: async ({ pageParam }) =>
      listProjects({
        workspaceId,
        page: typeof pageParam === "number" ? pageParam : 1,
        size: PAGE_SIZE,
        q: searchInput || undefined,
        archived,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    enabled: Boolean(workspaceId),
    staleTime: 30 * 1000,
    meta: { silent: true },
  });

  const items = useMemo(
    () => (query.data?.pages ?? []).flatMap((page) => page.items ?? []).map(mapProjectToListItem),
    [query.data?.pages],
  );

  const loading = query.isLoading;
  const error = query.error;
  const empty = !loading && items.length === 0;

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
        {items.map((project) => (
          <ProjectCard
            key={project.projectId}
            project={project}
            menuItems={buildMenuItems(project)}
            onPrepareMenu={() => onPrepareProjectMenu?.(project.projectId)}
            t={t}
            editing={editingProjectId === project.projectId}
            editingField={editingProjectField}
            editingName={editingProjectName}
            editingDescription={editingProjectDescription}
            onEditingNameChange={onEditingProjectNameChange}
            onEditingDescriptionChange={onEditingProjectDescriptionChange}
            onCommitName={() => void onCommitProjectEdit(project, "name")}
            onCommitDescription={() => void onCommitProjectEdit(project, "description")}
            onCancelEdit={onCancelProjectEdit}
            onClick={
              !disableProjectNavigation && onCardClick ? () => onCardClick(project) : undefined
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
