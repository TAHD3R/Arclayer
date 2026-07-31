import {
  platformListEmailTemplates,
  platformListMailProviders,
  platformListNotificationCampaigns,
  platformListPlatformFeedback,
  type MailProviderInfo,
  type PageDataFeedbackTicketListItemOut,
  type PageDataMailTemplateGroupOut,
  type PageDataNotificationCampaignSummaryOut,
  type PlatformListEmailTemplatesData,
  type PlatformListNotificationCampaignsData,
  type PlatformListPlatformFeedbackData,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

type ApiEnvelope<T> = Readonly<{ data?: T | null; error?: string | null }>;
type SdkResult<T> = Readonly<{ data?: ApiEnvelope<T>; error?: unknown; response?: Response }>;

function unwrap<T>(result: SdkResult<T>): T {
  if (result.error !== undefined) throw new Error("PLATFORM_COMMUNICATIONS_REQUEST_FAILED");
  if (!result.data || result.data.error || result.data.data == null) {
    throw new Error(result.data?.error ?? "PLATFORM_COMMUNICATIONS_RESPONSE_INVALID");
  }
  return result.data.data;
}

export function listFeedback(
  query?: NonNullable<PlatformListPlatformFeedbackData["query"]>,
): Promise<PageDataFeedbackTicketListItemOut> {
  return platformListPlatformFeedback({ client: platformApiClient, query }).then(unwrap);
}

export function listCampaigns(
  query?: NonNullable<PlatformListNotificationCampaignsData["query"]>,
): Promise<PageDataNotificationCampaignSummaryOut> {
  return platformListNotificationCampaigns({ client: platformApiClient, query }).then(unwrap);
}

export function listMailProviders(): Promise<Array<MailProviderInfo>> {
  return platformListMailProviders({ client: platformApiClient }).then(unwrap);
}

export function listTemplates(
  query?: NonNullable<PlatformListEmailTemplatesData["query"]>,
): Promise<PageDataMailTemplateGroupOut> {
  return platformListEmailTemplates({ client: platformApiClient, query }).then(unwrap);
}

export type { MailProviderInfo };
