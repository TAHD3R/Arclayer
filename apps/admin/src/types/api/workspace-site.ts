export type AdminWorkspaceSite = {
  siteId: string;
  workspaceId: string;
  slug: string;
  name: string;
  defaultLocale: string;
  fallbackLocale: string;
  isActive: boolean;
};

export type CreateAdminSitePreviewTokenPayload = {
  ttlSeconds?: number;
};

export type AdminSitePreviewToken = {
  siteId: string;
  token: string;
  expiresAtMs: number;
};
