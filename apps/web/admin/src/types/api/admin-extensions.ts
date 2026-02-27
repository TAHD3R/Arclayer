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
