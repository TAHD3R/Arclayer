import { api } from "@/lib/http";
import { workspacePath } from "@/api/_workspace";

export type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
  next?: number | null;
  prev?: number | null;
};

export type Role = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isSuperuser: boolean;
};

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null) continue;
        qs.append(k, String(item));
      }
      continue;
    }
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function listWorkspaceRoles(
  workspaceId: string,
  params: { page?: number; size?: number } = {},
): Promise<PageData<Role>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 200,
  });
  return api.get<PageData<Role>>(workspacePath(workspaceId, `/rbac/roles${query}`));
}
