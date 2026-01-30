import { api } from "@/lib/http";
import type { PageData } from "@/api/assets";

export type AdminAssetUsage = {
  id: string;
  createdAt: string;
  updatedAt: string;

  assetId: string;
  purpose: string;
  entityType: string;
  entityId: string;
  fieldKey: string;
  createdByUserId?: string | null;
};

export type UpsertAdminAssetUsagePayload = {
  assetId: string;
  purpose: string;
  entityType: string;
  entityId: string;
  fieldKey: string;
};

export async function listAdminAssetUsages(params: {
  assetId: string;
  page?: number;
  size?: number;
}): Promise<PageData<AdminAssetUsage>> {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("size", String(params.size ?? 50));
  const qs = query.toString();
  return api.get<PageData<AdminAssetUsage>>(
    `/admin/assets/${params.assetId}/usages${qs ? `?${qs}` : ""}`,
  );
}

export async function upsertAdminAssetUsage(
  payload: UpsertAdminAssetUsagePayload,
): Promise<AdminAssetUsage> {
  return api.put<AdminAssetUsage>(`/admin/asset-usages`, payload);
}

export async function deleteAdminAssetUsageByRef(payload: {
  entityType: string;
  entityId: string;
  fieldKey: string;
}): Promise<{ deleted: boolean }> {
  // 注意：DELETE + body 在部分 fetch 封装里不好用，这里使用 POST 版本。
  return api.post<{ deleted: boolean }>(`/admin/asset-usages/delete`, payload);
}
