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

export type AdminMenuBlockedReason = "missing_permission" | "plugin_disabled";

export type AdminMenuNodeEffective = {
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
  allowed: boolean;
  blockedReason?: AdminMenuBlockedReason | null;
  requiredPermission?: string | null;
  ownerPluginId?: string | null;
  children: AdminMenuNodeEffective[];
};

export type AdminMenuEffectiveTree = {
  items: AdminMenuNodeEffective[];
};
