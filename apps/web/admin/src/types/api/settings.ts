export type SettingsDetail = {
  namespace: string;
  value: Record<string, unknown>;
  secrets?: Record<string, boolean>;
  updatedAt?: string | null;
};

export type SettingsFieldItem = {
  key: string;
  type: string;
  default?: unknown;
  secret?: boolean;
  options?: SettingsOptionItem[];
  ui?: Record<string, unknown> | null;
  label?: string | null;
  description?: string | null;
};

export type SettingsOptionItem = {
  value: unknown;
  label?: string | null;
  description?: string | null;
};

export type SettingsSectionItem = {
  id: string;
  title?: string | null;
  fields: SettingsFieldItem[];
};

export type SettingsSchemaItem = {
  sections: SettingsSectionItem[];
};

export type SystemSettingsDetail = {
  namespace: string;
  settingSchema: SettingsSchemaItem;
  value: Record<string, unknown>;
  secrets: Record<string, boolean>;
  updatedAt?: string | null;
};
