import { api } from "@/lib/http";
import type {
  MailTemplateCreateRequest,
  MailTemplateGroupOut,
  MailTemplateOut,
  MailTemplatePatchRequest,
  MailTemplatePreviewOut,
  MailTemplateRevisionDetailOut,
  MailTemplateRevisionOut,
  MailTemplateTestSendOut,
  MailTemplateTestSendRequest,
} from "@arclayer/openapi";
import type { PageData } from "@arclayer/openapi/admin-types";

export type MailProviderId = string;

export type MailProviderInfo = {
  provider_id: MailProviderId;
  label: string;
  active: boolean;
  configured: boolean;
  available: boolean;
  error?: string | null;
  last_test_status?: "passed" | "failed" | null;
  last_test_message?: string | null;
  last_tested_at?: string | null;
};

type RawMailProviderInfo = Omit<MailProviderInfo, "provider_id"> & {
  provider_id?: MailProviderId;
  providerId?: MailProviderId;
  lastTestStatus?: "passed" | "failed" | null;
  lastTestMessage?: string | null;
  lastTestedAt?: string | null;
};

export async function sendTestEmail(params: { recipient: string }): Promise<{
  ok: boolean;
  provider?: string | null;
}> {
  return api.post<{ ok: boolean; provider?: string | null }>(`/system/mail/test`, {
    recipient: params.recipient,
  });
}

export async function listMailProviders(): Promise<MailProviderInfo[]> {
  const providers = await api.get<RawMailProviderInfo[]>(`/system/mail/providers`);
  return providers.map(normalizeMailProviderInfo);
}

export async function switchMailProvider(params: {
  provider: MailProviderId;
}): Promise<MailProviderInfo[]> {
  const providers = await api.post<RawMailProviderInfo[]>(`/system/mail/providers/switch`, {
    provider: params.provider,
  });
  return providers.map(normalizeMailProviderInfo);
}

function normalizeMailProviderInfo(provider: RawMailProviderInfo): MailProviderInfo {
  const providerId = provider.provider_id ?? provider.providerId;
  if (!providerId) {
    throw new Error("MAIL_PROVIDER_INVALID");
  }
  return {
    ...provider,
    provider_id: providerId,
    last_test_status: provider.last_test_status ?? provider.lastTestStatus ?? null,
    last_test_message: provider.last_test_message ?? provider.lastTestMessage ?? null,
    last_tested_at: provider.last_tested_at ?? provider.lastTestedAt ?? null,
  };
}

export type MailTemplate = MailTemplateOut;
export type MailTemplateGroup = MailTemplateGroupOut;
export type MailTemplateInput = MailTemplateCreateRequest;
export type MailTemplatePatch = MailTemplatePatchRequest;
export type MailTemplatePreview = MailTemplatePreviewOut;
export type MailTemplateRevision = MailTemplateRevisionOut;
export type MailTemplateRevisionDetail = MailTemplateRevisionDetailOut;
export type MailTemplateTestSend = MailTemplateTestSendOut;
export type MailTemplateTestSendInput = MailTemplateTestSendRequest;

export type MailTemplateOrdering =
  | "key"
  | "name"
  | "-updated_at"
  | "updated_at"
  | "-version"
  | "version";

export type MailTemplateFilters = {
  category?: MailTemplateGroup["category"];
  owner?: MailTemplateGroup["owner"];
  locale?: string;
  enabled?: boolean;
  validationState?: "valid" | "invalid";
  sourceState?: "default" | "overridden" | "custom";
};

export type MailTemplateListParams = MailTemplateFilters & {
  page?: number;
  size?: number;
  q?: string;
  ordering?: string;
};

export const MAIL_TEMPLATES_QUERY_KEY = ["system", "mail", "templates"] as const;

export async function listMailTemplates(
  params: MailTemplateListParams = {},
  signal?: AbortSignal,
): Promise<PageData<MailTemplateGroup>> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    const apiKey =
      key === "validationState" ? "validation_state" : key === "sourceState" ? "source_state" : key;
    query.set(apiKey, String(value));
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  const page = await api.get<import("@arclayer/openapi").PageDataMailTemplateGroupOut>(
    `/system/mail/templates${suffix}`,
    { signal },
  );
  return {
    items: page.items ?? [],
    total: page.total,
    page: page.page,
    size: page.size,
    pages: page.pages,
    next: page.next,
    prev: page.prev,
  };
}

export async function getMailTemplate(templateId: string): Promise<MailTemplate> {
  return api.get<MailTemplate>(`/system/mail/templates/${templateId}`);
}

export async function createMailTemplate(input: MailTemplateInput): Promise<MailTemplate> {
  return api.post<MailTemplate>("/system/mail/templates", input);
}

export async function updateMailTemplate(
  templateId: string,
  patch: MailTemplatePatch,
): Promise<MailTemplate> {
  return api.patch<MailTemplate>(`/system/mail/templates/${templateId}`, patch);
}

export async function deleteMailTemplate(
  templateId: string,
  expectedVersion: number,
): Promise<void> {
  const query = new URLSearchParams({ expected_version: String(expectedVersion) });
  await api.delete(`/system/mail/templates/${templateId}?${query.toString()}`);
}

export async function restoreDefaultMailTemplate(
  templateId: string,
  expectedVersion: number,
): Promise<MailTemplate> {
  return api.post<MailTemplate>(`/system/mail/templates/${templateId}/restore-default`, {
    expectedVersion,
  });
}

export async function listMailTemplateHistory(
  templateKey: string,
  params: { page?: number; size?: number; locale?: string } = {},
  signal?: AbortSignal,
): Promise<PageData<MailTemplateRevision>> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    query.set(key, String(value));
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  const page = await api.get<import("@arclayer/openapi").PageDataMailTemplateRevisionOut>(
    `/system/mail/templates/${encodeURIComponent(templateKey)}/history${suffix}`,
    { signal },
  );
  return {
    items: page.items ?? [],
    total: page.total,
    page: page.page,
    size: page.size,
    pages: page.pages,
    next: page.next,
    prev: page.prev,
  };
}

export async function getMailTemplateRevision(
  revisionId: string,
  signal?: AbortSignal,
): Promise<MailTemplateRevisionDetail> {
  return api.get<MailTemplateRevisionDetail>(`/system/mail/templates/revisions/${revisionId}`, {
    signal,
  });
}

export async function previewMailTemplate(input: {
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string;
  variables: Record<string, unknown>;
}): Promise<MailTemplatePreview> {
  return api.post<MailTemplatePreview>("/system/mail/templates/preview", input);
}

export async function testSendMailTemplate(
  templateId: string,
  input: MailTemplateTestSendRequest,
): Promise<MailTemplateTestSend> {
  return api.post<MailTemplateTestSend>(`/system/mail/templates/${templateId}/test-send`, input);
}
