import { api } from "@/lib/http";
import { workspacePath } from "@/lib/api";
import type { AdminMenuTree, AdminMenuEffectiveTree } from "@/types/api";

export async function getMyAdminMenu(workspaceId: string): Promise<AdminMenuTree> {
  return api.get<AdminMenuTree>(workspacePath(workspaceId, "/menus/me"));
}

export async function getAdminMenuCatalog(workspaceId: string): Promise<AdminMenuTree> {
  return api.get<AdminMenuTree>(workspacePath(workspaceId, "/menus/catalog"));
}

export async function getAdminMenuCatalogEffective(
  workspaceId: string,
): Promise<AdminMenuEffectiveTree> {
  return api.get<AdminMenuEffectiveTree>(workspacePath(workspaceId, "/menus/catalog-effective"));
}
