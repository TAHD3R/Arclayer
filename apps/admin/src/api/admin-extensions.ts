import { api } from "@/lib/http";
import { workspacePath, toQueryString } from "@/lib/api";
import type { AdminUIExtension } from "@/types/api";

type AdminUIExtensionListOut = {
  items: AdminUIExtension[];
};

export async function listAdminUIExtensions(
  workspaceId: string,
  opts: { slot?: string | null } = {},
): Promise<AdminUIExtension[]> {
  const out = await api.get<AdminUIExtensionListOut>(
    workspacePath(workspaceId, `/extensions/admin${toQueryString({ slot: opts.slot })}`),
  );
  return Array.isArray(out.items) ? out.items : [];
}
