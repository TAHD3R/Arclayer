import { platformApiClient } from "@/api/client";

export type PlatformSystemSettings = Readonly<{
  revision: number;
  identity: Readonly<{
    instance_name: string;
    description: string | null;
    contact_email: string | null;
    logo_url: string | null;
    favicon_url: string | null;
  }>;
  domains: Readonly<{
    primary_domain: string;
    console_domain: string;
    reserved_labels: readonly string[];
  }>;
  languages: readonly Readonly<{
    locale: string;
    language_name: string;
    native_name: string;
    flag_code: string;
    enabled: boolean;
    is_default: boolean;
    sort_order: number;
    bundle_ready: boolean;
  }>[];
  regional: Readonly<{
    timezone: string;
    date_format: string;
    number_format: string;
  }>;
  site_metadata: Readonly<{
    default_title: string | null;
    title_format: string;
    default_description: string | null;
  }>;
  sections?: readonly Readonly<{
    id: string;
    title: string;
    fields: readonly Readonly<{
      key: string;
      type: string;
      label: string;
      description: string | null;
      secret: boolean;
      options: readonly Readonly<{ value: unknown; label: string | null }>[];
    }>[];
    values: Readonly<Record<string, unknown>>;
    secret_keys: readonly string[];
    editable: boolean;
  }>[];
}>;

type PlatformSystemSettingsWire = Readonly<{
  revision: number;
  identity: Readonly<{
    instanceName: string;
    description: string | null;
    contactEmail: string | null;
    logoUrl: string | null;
    faviconUrl: string | null;
  }>;
  domains: Readonly<{
    primaryDomain: string;
    consoleDomain: string;
    reservedLabels: readonly string[];
  }>;
  languages: readonly Readonly<{
    locale: string;
    languageName: string;
    nativeName: string;
    flagCode: string;
    enabled: boolean;
    isDefault: boolean;
    sortOrder: number;
    bundleReady: boolean;
  }>[];
  regional: Readonly<{
    timezone: string;
    dateFormat: string;
    numberFormat: string;
  }>;
  siteMetadata: Readonly<{
    defaultTitle: string | null;
    titleFormat: string;
    defaultDescription: string | null;
  }>;
  sections?: readonly Readonly<{
    id: string;
    title: string;
    fields: readonly Readonly<{
      key: string;
      type: string;
      label: string;
      description: string | null;
      secret: boolean;
      options: readonly Readonly<{ value: unknown; label: string | null }>[];
    }>[];
    values: Readonly<Record<string, unknown>>;
    secretKeys: readonly string[];
    editable: boolean;
  }>[];
}>;

type PlatformSystemSettingsEnvelope = Readonly<{
  data?: PlatformSystemSettingsWire | null;
  error?: string | null;
}>;

type PlatformSystemSettingsResponses = Readonly<{ 200: PlatformSystemSettingsEnvelope }>;
type PlatformLanguageCatalogDraft = Readonly<{
  draft_revision: number;
  status: string;
  enabled_locales: readonly string[];
  default_locale: string;
  bundle_ready: boolean;
}>;
type PlatformLanguageCatalogDraftWire = Readonly<{
  draftRevision: number;
  status: string;
  enabledLocales: readonly string[];
  defaultLocale: string;
  bundleReady: boolean;
}>;
type PlatformLanguageCatalogImpact = Readonly<{
  draft_revision: number;
  affected_surfaces: readonly string[];
  requires_product_todo: boolean;
  ready_to_publish: boolean;
}>;
type PlatformLanguageCatalogImpactWire = Readonly<{
  draftRevision: number;
  affectedSurfaces: readonly string[];
  requiresProductTodo: boolean;
  readyToPublish: boolean;
}>;
type PlatformSystemSettingsWritePayload = Readonly<{
  expected_revision: number;
  idempotency_key: string;
}>;

const PLATFORM_BEARER_SECURITY = [{ scheme: "bearer", type: "http" }] as const;

export class PlatformSystemSettingsApiError extends Error {
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(code);
    this.name = "PlatformSystemSettingsApiError";
    this.status = status;
  }
}

export async function getPlatformSystemSettings(): Promise<PlatformSystemSettings> {
  const result = await platformApiClient.get<PlatformSystemSettingsResponses>({
    security: PLATFORM_BEARER_SECURITY,
    url: "/platform-api/v1/settings",
  });
  if (result.error !== undefined) {
    throw new PlatformSystemSettingsApiError(
      "PLATFORM_SYSTEM_SETTINGS_REQUEST_FAILED",
      result.response?.status,
    );
  }
  if (!result.data?.data || result.data.error) {
    throw new PlatformSystemSettingsApiError(
      result.data?.error ?? "PLATFORM_SYSTEM_SETTINGS_RESPONSE_INVALID",
      result.response?.status,
    );
  }
  return normalizePlatformSystemSettings(result.data.data);
}

export async function updatePlatformSystemSettingsSection(
  section: "identity" | "domains" | "regional" | "site-metadata",
  payload: PlatformSystemSettingsWritePayload & Record<string, unknown>,
): Promise<PlatformSystemSettings> {
  const result = await platformApiClient.put<PlatformSystemSettingsResponses>({
    security: PLATFORM_BEARER_SECURITY,
    url: `/platform-api/v1/settings/${section}`,
    body: toPlatformSystemSettingsSectionWirePayload(section, payload),
    headers: { "Content-Type": "application/json" },
  });
  if (result.error !== undefined || !result.data?.data || result.data.error) {
    throw new PlatformSystemSettingsApiError(
      result.data?.error ?? "PLATFORM_SYSTEM_SETTINGS_WRITE_FAILED",
      result.response?.status,
    );
  }
  return normalizePlatformSystemSettings(result.data.data);
}

export async function updatePlatformSystemSettingsGenericSection(
  section: string,
  payload: PlatformSystemSettingsWritePayload & { values: Readonly<Record<string, unknown>> },
): Promise<PlatformSystemSettings> {
  const result = await platformApiClient.put<PlatformSystemSettingsResponses>({
    security: PLATFORM_BEARER_SECURITY,
    url: `/platform-api/v1/settings/sections/${encodeURIComponent(section)}`,
    body: {
      expectedRevision: payload.expected_revision,
      idempotencyKey: payload.idempotency_key,
      values: payload.values,
    },
    headers: { "Content-Type": "application/json" },
  });
  if (result.error !== undefined || !result.data?.data || result.data.error) {
    throw new PlatformSystemSettingsApiError(
      result.data?.error ?? "PLATFORM_SYSTEM_SETTINGS_WRITE_FAILED",
      result.response?.status,
    );
  }
  return normalizePlatformSystemSettings(result.data.data);
}

export async function createPlatformLanguageDraft(
  payload: Readonly<{
    expected_revision: number;
    idempotency_key: string;
    enabled_locales: readonly string[];
    default_locale: string;
  }>,
): Promise<PlatformLanguageCatalogDraft> {
  const result = await platformApiClient.post<{
    200: Readonly<{ data?: PlatformLanguageCatalogDraftWire | null; error?: string | null }>;
  }>({
    security: PLATFORM_BEARER_SECURITY,
    url: "/platform-api/v1/settings/languages/drafts",
    body: {
      expectedRevision: payload.expected_revision,
      idempotencyKey: payload.idempotency_key,
      enabledLocales: payload.enabled_locales,
      defaultLocale: payload.default_locale,
    },
    headers: { "Content-Type": "application/json" },
  });
  if (result.error !== undefined || !result.data?.data || result.data.error) {
    throw new PlatformSystemSettingsApiError(
      result.data?.error ?? "PLATFORM_LANGUAGE_DRAFT_FAILED",
      result.response?.status,
    );
  }
  return normalizePlatformLanguageCatalogDraft(result.data.data);
}

export async function previewPlatformLanguageDraft(
  draftRevision: number,
): Promise<PlatformLanguageCatalogImpact> {
  const result = await platformApiClient.post<{
    200: Readonly<{ data?: PlatformLanguageCatalogImpactWire | null; error?: string | null }>;
  }>({
    security: PLATFORM_BEARER_SECURITY,
    url: `/platform-api/v1/settings/languages/drafts/${draftRevision}/impact`,
  });
  if (result.error !== undefined || !result.data?.data || result.data.error) {
    throw new PlatformSystemSettingsApiError(
      result.data?.error ?? "PLATFORM_LANGUAGE_IMPACT_FAILED",
      result.response?.status,
    );
  }
  return normalizePlatformLanguageCatalogImpact(result.data.data);
}

export async function publishPlatformLanguageDraft(
  payload: Readonly<{
    expected_revision: number;
    idempotency_key: string;
    draft_revision: number;
  }>,
): Promise<PlatformSystemSettings> {
  const result = await platformApiClient.post<PlatformSystemSettingsResponses>({
    security: PLATFORM_BEARER_SECURITY,
    url: "/platform-api/v1/settings/languages/publish",
    body: {
      expectedRevision: payload.expected_revision,
      idempotencyKey: payload.idempotency_key,
      draftRevision: payload.draft_revision,
    },
    headers: { "Content-Type": "application/json" },
  });
  if (result.error !== undefined || !result.data?.data || result.data.error) {
    throw new PlatformSystemSettingsApiError(
      result.data?.error ?? "PLATFORM_LANGUAGE_PUBLISH_FAILED",
      result.response?.status,
    );
  }
  return normalizePlatformSystemSettings(result.data.data);
}

function toPlatformSystemSettingsSectionWirePayload(
  section: "identity" | "domains" | "regional" | "site-metadata",
  payload: PlatformSystemSettingsWritePayload & Record<string, unknown>,
): Record<string, unknown> {
  const shared = {
    expectedRevision: payload.expected_revision,
    idempotencyKey: payload.idempotency_key,
  };
  if (section === "identity") {
    return {
      ...shared,
      instanceName: payload.instance_name,
      description: payload.description,
      contactEmail: payload.contact_email,
      logoUrl: payload.logo_url,
      faviconUrl: payload.favicon_url,
    };
  }
  if (section === "domains") {
    return {
      ...shared,
      primaryDomain: payload.primary_domain,
      consoleSubdomain: payload.console_subdomain,
      reservedLabels: payload.reserved_labels,
    };
  }
  if (section === "regional") {
    return {
      ...shared,
      timezone: payload.timezone,
      dateFormat: payload.date_format,
      numberFormat: payload.number_format,
    };
  }
  return {
    ...shared,
    defaultTitle: payload.default_title,
    titleFormat: payload.title_format,
    defaultDescription: payload.default_description,
  };
}

function normalizePlatformSystemSettings(
  value: PlatformSystemSettingsWire,
): PlatformSystemSettings {
  return {
    revision: value.revision,
    identity: {
      instance_name: value.identity.instanceName,
      description: value.identity.description,
      contact_email: value.identity.contactEmail,
      logo_url: value.identity.logoUrl,
      favicon_url: value.identity.faviconUrl,
    },
    domains: {
      primary_domain: value.domains.primaryDomain,
      console_domain: value.domains.consoleDomain,
      reserved_labels: value.domains.reservedLabels,
    },
    languages: value.languages.map((language) => ({
      locale: language.locale,
      language_name: language.languageName,
      native_name: language.nativeName,
      flag_code: language.flagCode,
      enabled: language.enabled,
      is_default: language.isDefault,
      sort_order: language.sortOrder,
      bundle_ready: language.bundleReady,
    })),
    regional: {
      timezone: value.regional.timezone,
      date_format: value.regional.dateFormat,
      number_format: value.regional.numberFormat,
    },
    site_metadata: {
      default_title: value.siteMetadata.defaultTitle,
      title_format: value.siteMetadata.titleFormat,
      default_description: value.siteMetadata.defaultDescription,
    },
    sections: value.sections?.map((section) => ({
      id: section.id,
      title: section.title,
      fields: section.fields,
      values: section.values,
      secret_keys: section.secretKeys,
      editable: section.editable,
    })),
  };
}

function normalizePlatformLanguageCatalogDraft(
  value: PlatformLanguageCatalogDraftWire,
): PlatformLanguageCatalogDraft {
  return {
    draft_revision: value.draftRevision,
    status: value.status,
    enabled_locales: value.enabledLocales,
    default_locale: value.defaultLocale,
    bundle_ready: value.bundleReady,
  };
}

function normalizePlatformLanguageCatalogImpact(
  value: PlatformLanguageCatalogImpactWire,
): PlatformLanguageCatalogImpact {
  return {
    draft_revision: value.draftRevision,
    affected_surfaces: value.affectedSurfaces,
    requires_product_todo: value.requiresProductTodo,
    ready_to_publish: value.readyToPublish,
  };
}
