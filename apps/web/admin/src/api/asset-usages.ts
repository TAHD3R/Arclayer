import { api } from "@/lib/http";
import { toQueryString, workspacePath } from "@/lib/api";
import type { PageData, AdminAssetUsage, UpsertAdminAssetUsagePayload } from "@/types/api";

export async function listAdminAssetUsages(params: {
  workspaceId: string;
  assetId: string;
  page?: number;
  size?: number;
}): Promise<PageData<AdminAssetUsage>> {
  const query = toQueryString({ page: params.page ?? 1, size: params.size ?? 50 });
  return api.get<PageData<AdminAssetUsage>>(
    workspacePath(params.workspaceId, `/assets/${params.assetId}/usages${query}`),
  );
}

export async function upsertAdminAssetUsage(
  workspaceId: string,
  payload: UpsertAdminAssetUsagePayload,
): Promise<AdminAssetUsage> {
  return api.put<AdminAssetUsage>(workspacePath(workspaceId, "/asset-usages"), payload);
}

export async function deleteAdminAssetUsageByRef(payload: {
  workspaceId: string;
  entityType: string;
  entityId: string;
  fieldKey: string;
}): Promise<{ deleted: boolean }> {
  // 注意：DELETE + body 在部分 fetch 封装里不好用，这里使用 POST 版本。
  const { workspaceId, ...rest } = payload;
  return api.post<{ deleted: boolean }>(workspacePath(workspaceId, "/asset-usages/delete"), rest);
}
