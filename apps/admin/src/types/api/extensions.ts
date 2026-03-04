export type AppKind = "extension" | "integration" | (string & {});

export type AppProvider = "official" | "community" | (string & {});

export type AppScope = "workspace" | "organization" | (string & {});

export type UIEmbedKind = "field" | "entry_panel" | "app_page" | (string & {});

export type CapabilitySummary = {
  capabilityId: string;
  kind: AppKind;
  provider: AppProvider;
  scope: AppScope;
  name: string;
  description?: string | null;
  nameI18n?: string | null;
  descriptionI18n?: string | null;
  version?: string | null;
  enabled: boolean;
  iconUrl?: string | null;
  meta?: Record<string, unknown> | null;
};

export type CapabilityListOut = {
  items: CapabilitySummary[];
};

export type UIEmbedDescriptor = {
  id: string;
  capabilityId: string;
  kind: UIEmbedKind;
  slot: string;
  title: string;
  titleI18n?: string | null;
  icon?: string | null;
  embedUrl: string;
  sandbox?: string | null;
  permissionCode?: string | null;
  meta?: Record<string, unknown> | null;
};

export type UIEmbedListOut = {
  items: UIEmbedDescriptor[];
};
