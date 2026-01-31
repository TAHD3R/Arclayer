import { api } from "@/lib/http";

export async function sendTestEmail(params: { recipient: string }): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(`/admin/mail/test`, {
    recipient: params.recipient,
  });
}
