import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { listWorkspaceContentModels } from "@/api/content-models";
import {
  getSiteBuilderPublishImpact,
  listSiteBuilderGlobalSections,
  listSiteBuilderPagesTree,
  listSiteBuilderRouteTemplates,
  siteBuilderQueryKeys,
  type SiteBuilderPageNode,
  type SiteBuilderRouteTemplate,
} from "@/api/content/site-builder";
import { openStudioPageEditor } from "@/lib/routing/studio-editor";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import {
  useCreateMutation,
  useCreateRouteMutation,
  usePublishMutation,
  useToggleRouteMutation,
  useUnpublishMutation,
  type SiteBuilderControllerDeps,
  type TranslationFn,
} from "./site-builder-controller-mutations";

type StructureCounts = {
  totalPages: number;
  publishedPages: number;
};

function collectStructureCounts(nodes: readonly SiteBuilderPageNode[]): StructureCounts {
  return nodes.reduce(
    (counts, node) => {
      const childCounts = collectStructureCounts(node.children ?? []);
      return {
        totalPages: counts.totalPages + 1 + childCounts.totalPages,
        publishedPages:
          counts.publishedPages + (node.publishedRevision ? 1 : 0) + childCounts.publishedPages,
      };
    },
    { totalPages: 0, publishedPages: 0 },
  );
}

function useSiteBuilderQueries(workspaceId: string | null) {
  const pagesQuery = useQuery({
    queryKey: siteBuilderQueryKeys.pages(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => listSiteBuilderPagesTree(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const globalSectionsQuery = useQuery({
    queryKey: siteBuilderQueryKeys.globals(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => listSiteBuilderGlobalSections(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const routeTemplatesQuery = useQuery({
    queryKey: siteBuilderQueryKeys.routes(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => listSiteBuilderRouteTemplates(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const publishImpactQuery = useQuery({
    queryKey: siteBuilderQueryKeys.publishImpact(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => getSiteBuilderPublishImpact(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const modelsQuery = useQuery({
    queryKey: ["content", "models", workspaceId, "site-builder"],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceContentModels(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  return { pagesQuery, globalSectionsQuery, routeTemplatesQuery, publishImpactQuery, modelsQuery };
}

function useRefreshBuilderQueries(workspaceId: string | null) {
  const queryClient = useQueryClient();

  return async () => {
    await queryClient.invalidateQueries({ queryKey: siteBuilderQueryKeys.pages(workspaceId) });
    await queryClient.invalidateQueries({ queryKey: siteBuilderQueryKeys.globals(workspaceId) });
    await queryClient.invalidateQueries({ queryKey: siteBuilderQueryKeys.routes(workspaceId) });
    await queryClient.invalidateQueries({
      queryKey: siteBuilderQueryKeys.publishImpact(workspaceId),
    });
  };
}

export function useSiteBuilderController(t: TranslationFn) {
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [routeProcessingIds, setRouteProcessingIds] = useState<Set<string>>(new Set());

  const queries = useSiteBuilderQueries(workspaceId);
  const refreshBuilderQueries = useRefreshBuilderQueries(workspaceId);
  const deps: SiteBuilderControllerDeps = {
    setDialogOpen,
    setRouteDialogOpen,
    setProcessingIds,
    setRouteProcessingIds,
    t,
    workspaceId,
  };

  const createMutation = useCreateMutation(deps);
  const publishMutation = usePublishMutation(deps, refreshBuilderQueries);
  const unpublishMutation = useUnpublishMutation(deps, refreshBuilderQueries);
  const createRouteMutation = useCreateRouteMutation(deps);
  const toggleRouteMutation = useToggleRouteMutation(deps, refreshBuilderQueries);

  const pagesTree = (queries.pagesQuery.data?.items ?? []) as SiteBuilderPageNode[];
  const globalSections = queries.globalSectionsQuery.data?.items ?? [];
  const routeTemplates = (queries.routeTemplatesQuery.data?.items ??
    []) as SiteBuilderRouteTemplate[];
  const counts = collectStructureCounts(pagesTree);
  const siteBuilderModels = (queries.modelsQuery.data?.items ?? []).filter(
    (item) => item.category === "site_builder",
  );

  const openEditor = (page: SiteBuilderPageNode) => {
    if (!workspaceId) return;
    openStudioPageEditor({ workspaceId: String(workspaceId), pageId: page.id });
  };

  return {
    workspaceId,
    dialogOpen,
    routeDialogOpen,
    setDialogOpen,
    setRouteDialogOpen,
    processingIds,
    routeProcessingIds,
    pagesTree,
    globalSections,
    routeTemplates,
    counts,
    queries,
    siteBuilderModels,
    createMutation,
    publishMutation,
    unpublishMutation,
    createRouteMutation,
    toggleRouteMutation,
    openEditor,
  };
}
