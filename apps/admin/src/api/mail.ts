import { api } from "@/lib/http";

export type MailProviderId = "smtp" | "resend" | "cloudflare" | "ses";

export type MailProviderInfo = {
  provider_id: MailProviderId;
  label: string;
  active: boolean;
  configured: boolean;
  available: boolean;
  error?: string | null;
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
  return api.get<MailProviderInfo[]>(`/system/mail/providers`);
}

export async function switchMailProvider(params: {
  provider: MailProviderId;
}): Promise<MailProviderInfo[]> {
  return api.post<MailProviderInfo[]>(`/system/mail/providers/switch`, {
    provider: params.provider,
  });
}
