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
