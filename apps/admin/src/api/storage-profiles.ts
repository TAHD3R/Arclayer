import { api } from "@/lib/http";
import type {
  StorageProfileCreateRequest,
  StorageProfileDeleteOut,
  StorageProfileListOut,
  StorageProfileOut,
  StorageProfileTestResultOut,
  StorageProfileUpdateRequest,
} from "@arclayer/openapi";

export const SYSTEM_STORAGE_PROFILES_QUERY_KEY = ["system", "storage-profiles"] as const;

export async function listStorageProfiles(): Promise<StorageProfileOut[]> {
  const data = await api.get<StorageProfileListOut>("/system/storage-profiles");
  return data.items ?? [];
}

export async function createStorageProfile(
  payload: StorageProfileCreateRequest,
): Promise<StorageProfileOut> {
  return api.post<StorageProfileOut>("/system/storage-profiles", payload);
}

export async function updateStorageProfile(
  profileId: string,
  payload: StorageProfileUpdateRequest,
): Promise<StorageProfileOut> {
  return api.patch<StorageProfileOut>(
    `/system/storage-profiles/${encodeURIComponent(profileId)}`,
    payload,
  );
}

export async function testStorageProfile(profileId: string): Promise<StorageProfileTestResultOut> {
  return api.post<StorageProfileTestResultOut>(
    `/system/storage-profiles/${encodeURIComponent(profileId)}/test`,
  );
}

export async function deleteStorageProfile(profileId: string): Promise<StorageProfileDeleteOut> {
  return api.delete<StorageProfileDeleteOut>(
    `/system/storage-profiles/${encodeURIComponent(profileId)}`,
  );
}
