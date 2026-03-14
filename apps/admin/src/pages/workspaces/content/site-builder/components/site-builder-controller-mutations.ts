import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";

import {
  createSiteBuilderPage,
  createSiteBuilderRouteTemplate,
  publishSiteBuilderPage,
  siteBuilderQueryKeys,
  toggleSiteBuilderRouteTemplateActive,
  unpublishSiteBuilderPage,
  type SiteBuilderPageNode,
  type SiteBuilderRouteTemplate,
} from "@/api/content/site-builder";
import { notifyError, notifySuccessText } from "@/lib/notifications";

import type { CreateRouteTemplateInput } from "./create-route-template-dialog";
import type { CreateSitePageInput } from "./create-site-page-dialog";

export type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

export type SiteBuilderControllerDeps = {
  setDialogOpen: (value: boolean) => void;
  setRouteDialogOpen: (value: boolean) => void;
  setProcessingIds: Dispatch<SetStateAction<Set<string>>>;
  setRouteProcessingIds: Dispatch<SetStateAction<Set<string>>>;
  t: TranslationFn;
  workspaceId: string | null;
};

function addProcessingId(
  current: ReadonlySet<string>,
  rowId: string,
  processing: boolean,
): Set<string> {
  const next = new Set(current);
  if (processing) next.add(rowId);
  else next.delete(rowId);
  return next;
}

export function useCreateMutation(deps: SiteBuilderControllerDeps) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSitePageInput) => {
      if (!deps.workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      await createSiteBuilderPage(String(deps.workspaceId), input);
    },
    onSuccess: async () => {
      notifySuccessText(deps.t("content_library:SITE_BUILDER_TOAST_CREATE_SUCCESS"));
      deps.setDialogOpen(false);
      await queryClient.invalidateQueries({
        queryKey: siteBuilderQueryKeys.pages(deps.workspaceId),
      });
    },
    onError: (error) => notifyError(error),
  });
}

export function usePublishMutation(
  deps: SiteBuilderControllerDeps,
  refreshBuilderQueries: () => Promise<void>,
) {
  return useMutation({
    mutationFn: async (page: SiteBuilderPageNode) => {
      if (!deps.workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      deps.setProcessingIds((current) => addProcessingId(current, page.id, true));
      try {
        return await publishSiteBuilderPage(String(deps.workspaceId), page.id, {
          revision: page.draftRevision ?? undefined,
        });
      } finally {
        deps.setProcessingIds((current) => addProcessingId(current, page.id, false));
      }
    },
    onSuccess: async () => {
      notifySuccessText(deps.t("content_library:SITE_BUILDER_TOAST_PUBLISH_SUCCESS"));
      await refreshBuilderQueries();
    },
    onError: (error) => notifyError(error),
  });
}

export function useUnpublishMutation(
  deps: SiteBuilderControllerDeps,
  refreshBuilderQueries: () => Promise<void>,
) {
  return useMutation({
    mutationFn: async (page: SiteBuilderPageNode) => {
      if (!deps.workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      if (!page.publishedRevision) {
        throw new Error("SITE_BUILDER_PAGE_NOT_PUBLISHED");
      }
      deps.setProcessingIds((current) => addProcessingId(current, page.id, true));
      try {
        return await unpublishSiteBuilderPage(
          String(deps.workspaceId),
          page.id,
          page.publishedRevision,
        );
      } finally {
        deps.setProcessingIds((current) => addProcessingId(current, page.id, false));
      }
    },
    onSuccess: async () => {
      notifySuccessText(deps.t("content_library:SITE_BUILDER_TOAST_UNPUBLISH_SUCCESS"));
      await refreshBuilderQueries();
    },
    onError: (error) => notifyError(error),
  });
}

export function useCreateRouteMutation(deps: SiteBuilderControllerDeps) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateRouteTemplateInput) => {
      if (!deps.workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      await createSiteBuilderRouteTemplate(String(deps.workspaceId), input);
    },
    onSuccess: async () => {
      notifySuccessText(deps.t("content_library:SITE_BUILDER_TOAST_ROUTE_CREATE_SUCCESS"));
      deps.setRouteDialogOpen(false);
      await queryClient.invalidateQueries({
        queryKey: siteBuilderQueryKeys.routes(deps.workspaceId),
      });
    },
    onError: (error) => notifyError(error),
  });
}

export function useToggleRouteMutation(
  deps: SiteBuilderControllerDeps,
  refreshBuilderQueries: () => Promise<void>,
) {
  return useMutation({
    mutationFn: async (route: SiteBuilderRouteTemplate) => {
      if (!deps.workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      deps.setRouteProcessingIds((current) => addProcessingId(current, route.id, true));
      try {
        return await toggleSiteBuilderRouteTemplateActive(String(deps.workspaceId), route);
      } finally {
        deps.setRouteProcessingIds((current) => addProcessingId(current, route.id, false));
      }
    },
    onSuccess: async (_, route) => {
      notifySuccessText(
        route.isActive
          ? deps.t("content_library:SITE_BUILDER_TOAST_ROUTE_DISABLED")
          : deps.t("content_library:SITE_BUILDER_TOAST_ROUTE_ENABLED"),
      );
      await refreshBuilderQueries();
    },
    onError: (error) => notifyError(error),
  });
}
