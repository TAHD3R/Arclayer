import { api } from "@/lib/http";

export type AdminUIExtension = {
  pluginId: string;
  id: string;
  slot: string;
  title: string;
  titleI18n?: string | null;
  kind: string;
  icon?: string | null;
  permissionCode?: string | null;
  meta?: Record<string, unknown> | null;
};

export async function listAdminUIExtensions(
  workspaceId: string,
  opts: { slot?: string | null } = {},
): Promise<AdminUIExtension[]> {
  const id = encodeURIComponent(String(workspaceId));
  const params = new URLSearchParams();
  if (opts.slot) params.set("slot", String(opts.slot));
  const qs = params.toString();
  return api.get<AdminUIExtension[]>(`/workspaces/${id}/extensions/admin${qs ? `?${qs}` : ""}`);
}
