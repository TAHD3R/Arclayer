import { api } from "@/lib/http";

export type MailProviderId = "smtp" | "resend" | "cloudflare" | "ses";

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
