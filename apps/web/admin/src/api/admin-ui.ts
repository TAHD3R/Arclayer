import { api } from "@/lib/http";

export interface AdminUINavNode {
  id: string;
  title: string;
  icon?: string | null;
  path?: string | null;
  sort?: number;
  children: AdminUINavNode[];
}

export interface AdminUIActionState {
  id: string;
  title: string;
  enabled: boolean;
  required_permissions_any: string[];
  required_permissions_all: string[];
}

export interface AdminUIContext {
  nav_tree: AdminUINavNode[];
  actions: Record<string, AdminUIActionState>;
}

export async function getContext(): Promise<AdminUIContext> {
  return api.get<AdminUIContext>("/admin/ui/context");
}
