import { api } from "@/lib/http";

export type AdminMenuNode = {
  id: string;
  code: string;
  title: string;
  titleI18n?: string | null;
  icon?: string | null;
  path?: string | null;
  name?: string | null;
  componentKey?: string | null;
  redirect?: string | null;
  sort: number;
  permissionCode?: string | null;
  meta?: Record<string, unknown> | null;
  children: AdminMenuNode[];
};

export type AdminMenuTree = {
  items: AdminMenuNode[];
};

export async function getMyAdminMenu(workspaceId: string): Promise<AdminMenuTree> {
  const id = encodeURIComponent(String(workspaceId));
  return api.get<AdminMenuTree>(`/workspaces/${id}/menus/me`);
}

export async function getAdminMenuCatalog(workspaceId: string): Promise<AdminMenuTree> {
  const id = encodeURIComponent(String(workspaceId));
  return api.get<AdminMenuTree>(`/workspaces/${id}/menus/catalog`);
}
