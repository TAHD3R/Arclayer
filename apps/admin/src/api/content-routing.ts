import { api } from "@/lib/http";
import type { HierarchyNodeOut, RouteBindingOut } from "@celestial/api-client";

export type { HierarchyNodeOut, RouteBindingOut } from "@celestial/api-client";

export type UpsertRouteBindingInput = {
  locale?: string;
  path: string;
  isActive?: boolean;
};

export type UpsertHierarchyNodeInput = {
  parentItemId?: string | null;
  sortOrder?: number;
};

export async function listWorkspaceContentRouteBindings(
  workspaceId: string,
): Promise<RouteBindingOut[]> {
  return api.get<RouteBindingOut[]>(`/workspaces/${workspaceId}/content/routing/bindings`);
}

export async function upsertWorkspaceContentRouteBinding(
  workspaceId: string,
  itemId: string,
  input: UpsertRouteBindingInput,
): Promise<RouteBindingOut> {
  return api.put<RouteBindingOut>(`/workspaces/${workspaceId}/content/routing/bindings/${itemId}`, {
    locale: input.locale ?? "zh-CN",
    path: input.path,
    isActive: input.isActive ?? true,
  });
}

export async function listWorkspaceContentHierarchyNodes(
  workspaceId: string,
): Promise<HierarchyNodeOut[]> {
  return api.get<HierarchyNodeOut[]>(`/workspaces/${workspaceId}/content/routing/hierarchy`);
}

export async function upsertWorkspaceContentHierarchyNode(
  workspaceId: string,
  itemId: string,
  input: UpsertHierarchyNodeInput,
): Promise<HierarchyNodeOut> {
  return api.put<HierarchyNodeOut>(
    `/workspaces/${workspaceId}/content/routing/hierarchy/${itemId}`,
    {
      parentItemId: input.parentItemId ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  );
}
