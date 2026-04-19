import type { AdminContentItem, AdminContentOpenIntent } from "@/types/api";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

function safeReturnTo(value: string | null | undefined): string | null {
  const raw = (value || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

function getCurrentReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  return safeReturnTo(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
}

export function workspaceContentLibraryPath(workspaceId: string): string {
  const projectId =
    useWorkspaceStore.getState().currentProjectId ??
    useWorkspaceStore.getState().lastProjectId ??
    workspaceId;
  return `/projects/${encodeURIComponent(projectId)}/content/library`;
}

export function workspaceContentLibraryItemPath(workspaceId: string, itemId: string): string {
  return `${workspaceContentLibraryPath(workspaceId)}/${encodeURIComponent(itemId)}`;
}

export function workspaceContentModelsPath(workspaceId: string): string {
  const projectId =
    useWorkspaceStore.getState().currentProjectId ??
    useWorkspaceStore.getState().lastProjectId ??
    workspaceId;
  return `/projects/${encodeURIComponent(projectId)}/content/models`;
}

export function workspaceContentReleasesPath(workspaceId: string): string {
  const projectId =
    useWorkspaceStore.getState().currentProjectId ??
    useWorkspaceStore.getState().lastProjectId ??
    workspaceId;
  return `/projects/${encodeURIComponent(projectId)}/content/releases`;
}

export function workspaceContentAutomationPath(workspaceId: string): string {
  const projectId =
    useWorkspaceStore.getState().currentProjectId ??
    useWorkspaceStore.getState().lastProjectId ??
    workspaceId;
  return `/projects/${encodeURIComponent(projectId)}/content/automation`;
}

export function workspaceContentCreatePath(workspaceId: string): string {
  const projectId =
    useWorkspaceStore.getState().currentProjectId ??
    useWorkspaceStore.getState().lastProjectId ??
    workspaceId;
  return `/projects/${encodeURIComponent(projectId)}/content/create`;
}

export function buildWorkspaceContentLibraryFocusSearch(itemId: string): {
  view: "draft";
  focusItemId: string;
} {
  return {
    view: "draft",
    focusItemId: itemId,
  };
}

export function workspaceContentLibraryFocusedItemHref(
  workspaceId: string,
  itemId: string,
): string {
  const search = new URLSearchParams(buildWorkspaceContentLibraryFocusSearch(itemId));
  return `${workspaceContentLibraryPath(workspaceId)}?${search.toString()}`;
}

export function resolveContentItemContinuationTarget(
  item: Pick<AdminContentItem, "continuationTarget" | "openIntent">,
): AdminContentOpenIntent | null {
  return item.continuationTarget ?? item.openIntent ?? null;
}

export function resolveContentItemContinuationRoute(
  item: Pick<AdminContentItem, "continuationTarget" | "openIntent">,
): string | null {
  return safeReturnTo(resolveContentItemContinuationTarget(item)?.route);
}

export function buildWorkspaceContentEditorUrl(params: {
  siteId: string;
  itemId: string;
  token: string;
  returnTo?: string | null;
}): string {
  const url = new URL(`/editor/site/${encodeURIComponent(params.siteId)}`, window.location.origin);
  url.searchParams.set("token", params.token);
  url.searchParams.set("source", "admin");
  url.searchParams.set("itemId", params.itemId);

  const returnTo = safeReturnTo(params.returnTo) ?? getCurrentReturnTo();
  if (returnTo) url.searchParams.set("returnTo", returnTo);

  return `${url.pathname}${url.search}`;
}
