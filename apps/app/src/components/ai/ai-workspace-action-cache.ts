import type { QueryClient } from "@tanstack/react-query";

import { buildContentModelsQueryKey } from "@/api/content";
import type { AIWorkspaceActionResponse } from "@/api/ai";
import { buildProjectReleasesQueryKey } from "@/api/project-releases";
import {
  buildContentLibraryItemsQueryKey,
  buildContentLibraryModelsQueryKey,
  buildContentLibraryViewsQueryKey,
} from "@/pages/projects/content/library/runtime";

type InvalidateWorkspaceActionOptions = {
  fallbackProjectId?: string | null;
};

const PROJECT_LIST_QUERY_KEYS = [
  ["home", "recent-projects"],
  ["projects"],
  ["scope-switcher", "projects"],
  ["projects-cards"],
  ["global-nav", "projects"],
  ["dataTable"],
] as const;

const CONTENT_MODEL_ACTIONS = new Set([
  "create_content_model",
  "update_content_model",
  "delete_content_model",
]);

const CONTENT_ITEM_ACTIONS = new Set([
  "create_content_item",
  "update_content_item",
  "update_homepage",
  "delete_content_item",
]);

const PROJECT_SOURCE_ACTIONS = new Set([
  "write_project_source_file",
  "delete_project_source_file",
  "update_site_settings",
]);

function addProjectId(ids: Set<string>, value: string | null | undefined) {
  const id = value?.trim();
  if (id) ids.add(id);
}

function projectIdFromNavigationPath(path: string | null | undefined): string | null {
  const match = path?.match(/^\/projects\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function collectWorkspaceActionProjectIds(
  result: AIWorkspaceActionResponse,
  fallbackProjectId?: string | null,
) {
  const ids = new Set<string>();
  addProjectId(ids, result.project?.id);
  addProjectId(ids, projectIdFromNavigationPath(result.navigation?.path));
  if (ids.size === 0) addProjectId(ids, fallbackProjectId);

  return [...ids];
}

function shouldInvalidateProjectLists(result: AIWorkspaceActionResponse) {
  return result.action === "create_project";
}

function shouldInvalidateContentModels(result: AIWorkspaceActionResponse) {
  return Boolean(result.action && CONTENT_MODEL_ACTIONS.has(result.action));
}

function shouldInvalidateContentItems(result: AIWorkspaceActionResponse) {
  return Boolean(result.action && CONTENT_ITEM_ACTIONS.has(result.action));
}

function shouldInvalidateProjectSource(result: AIWorkspaceActionResponse) {
  if (result.action && PROJECT_SOURCE_ACTIONS.has(result.action)) return true;
  if (result.action === "read_project_source") return false;
  return Boolean(result.sourceManifest || result.sourceFile || result.sourceFileDelete);
}

export async function invalidateAIWorkspaceActionQueries(
  queryClient: QueryClient,
  result: AIWorkspaceActionResponse | null,
  options: InvalidateWorkspaceActionOptions = {},
) {
  if (!result || result.status !== "completed") return;

  const projectIds = collectWorkspaceActionProjectIds(result, options.fallbackProjectId);
  const invalidations: Array<Promise<unknown>> = [];

  if (shouldInvalidateProjectLists(result)) {
    for (const queryKey of PROJECT_LIST_QUERY_KEYS) {
      invalidations.push(queryClient.invalidateQueries({ queryKey }));
    }
  }

  for (const projectId of projectIds) {
    if (result.action === "create_project") {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: ["project", "detail", projectId] }),
      );
    }

    if (result.action === "create_project" || shouldInvalidateProjectSource(result)) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: ["project", "source", projectId] }),
      );
    }

    if (result.action === "create_project" || result.action === "update_site_settings") {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: ["settings", "project", "core", projectId] }),
      );
    }

    if (result.action === "create_project" || result.domain) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: ["project", "domains", projectId] }),
      );
    }

    if (result.action === "create_project" || result.release) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: buildProjectReleasesQueryKey(projectId) }),
      );
    }

    if (result.action === "create_project" || shouldInvalidateContentModels(result)) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: buildContentModelsQueryKey(projectId) }),
      );
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: buildContentLibraryModelsQueryKey(projectId) }),
      );
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: buildContentLibraryItemsQueryKey(projectId) }),
      );
      invalidations.push(queryClient.invalidateQueries({ queryKey: ["dataTable"] }));
    }

    if (result.action === "create_project" || shouldInvalidateContentItems(result)) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: buildContentLibraryItemsQueryKey(projectId) }),
      );
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: buildContentLibraryViewsQueryKey(projectId) }),
      );
      invalidations.push(queryClient.invalidateQueries({ queryKey: ["dataTable"] }));
    }
  }

  await Promise.all(invalidations);
}
