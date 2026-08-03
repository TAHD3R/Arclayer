import {
  platformAddPlatformFeedbackMessage,
  platformArchiveNotificationCampaign,
  platformCancelNotificationCampaign,
  platformCreateEmailTemplate,
  platformCreateNotificationCampaign,
  platformDeleteEmailTemplate,
  platformDisableMailServiceProfile,
  platformEstimateNotificationCampaignAudience,
  platformGetEmailTemplate,
  platformGetEmailTemplateRevision,
  platformGetMailServiceProfile,
  platformGetNotificationCampaign,
  platformGetPlatformFeedbackDetail,
  platformListEmailTemplates,
  platformListEmailTemplateHistory,
  platformListMailProviders,
  platformListNotificationDeliveryDirectory,
  platformListNotificationCampaigns,
  platformListNotificationCampaignDeliveries,
  platformListPlatformFeedback,
  platformPreviewEmailTemplate,
  platformPreviewNotificationCampaign,
  platformPublishNotificationCampaign,
  platformRecoverMailServiceProfile,
  platformRestoreDefaultEmailTemplate,
  platformRotateMailServiceCredentials,
  platformRetryNotificationCampaignFailures,
  platformRetryPlatformFeedbackReplyDelivery,
  platformSwitchMailProvider,
  platformTestMailServiceProfile,
  platformTestSendEmailTemplate,
  platformUpdateEmailTemplate,
  platformUpdateMailServiceProfile,
  platformUpdateNotificationCampaign,
  platformUpdatePlatformFeedback,
  platformWriteMailServiceCredentials,
  type FeedbackMessageCreate,
  type FeedbackTicketDetailOut,
  type FeedbackTicketUpdate,
  type MailCredentialWriteOut,
  type MailCredentialWriteRequestWritable,
  type MailProviderInfo,
  type MailServiceMutationRequest,
  type MailServiceOut,
  type MailServiceTestRequest,
  type MailTemplatePreviewRequest,
  type MailTemplateCreateRequest,
  type MailTemplateOut,
  type MailTemplatePatchRequest,
  type MailTemplateRevisionDetailOut,
  type MailTemplateRevisionMutationRequest,
  type MailTemplateTestSendRequest,
  type NotificationCampaignCreateRequest,
  type NotificationCampaignDetailOut,
  type NotificationCampaignPatchRequest,
  type NotificationCampaignPublishRequest,
  type NotificationCampaignRevisionRequest,
  type PageDataFeedbackTicketListItemOut,
  type PageDataMailTemplateGroupOut,
  type PageDataMailTemplateRevisionOut,
  type PageDataNotificationCampaignSummaryOut,
  type PageDataNotificationDeliveryDirectoryOut,
  type PageDataNotificationDeliveryOut,
  type PlatformListEmailTemplateHistoryData,
  type PlatformListEmailTemplatesData,
  type PlatformListNotificationCampaignDeliveriesData,
  type PlatformListNotificationDeliveryDirectoryData,
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

function unwrapVoid(result: SdkResult<null>): void {
  if (result.error !== undefined) throw new Error("PLATFORM_COMMUNICATIONS_REQUEST_FAILED");
  if (!result.data || result.data.error) {
    throw new Error(result.data?.error ?? "PLATFORM_COMMUNICATIONS_RESPONSE_INVALID");
  }
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

export function getFeedback(ticketId: string): Promise<FeedbackTicketDetailOut> {
  return platformGetPlatformFeedbackDetail({
    client: platformApiClient,
    path: { ticket_id: ticketId },
  }).then(unwrap);
}

export function updateFeedback(
  ticketId: string,
  body: FeedbackTicketUpdate,
): Promise<FeedbackTicketDetailOut> {
  return platformUpdatePlatformFeedback({
    client: platformApiClient,
    path: { ticket_id: ticketId },
    body,
  }).then(unwrap);
}

export function addFeedbackMessage(
  ticketId: string,
  body: FeedbackMessageCreate,
): Promise<FeedbackTicketDetailOut> {
  return platformAddPlatformFeedbackMessage({
    client: platformApiClient,
    path: { ticket_id: ticketId },
    body,
  }).then(unwrap);
}

export function retryFeedbackReplyDelivery(
  ticketId: string,
  messageId: string,
  idempotencyKey: string,
): Promise<FeedbackTicketDetailOut> {
  return platformRetryPlatformFeedbackReplyDelivery({
    client: platformApiClient,
    path: { ticket_id: ticketId, message_id: messageId },
    headers: { "Idempotency-Key": idempotencyKey },
  }).then(unwrap);
}

export function createCampaign(
  body: NotificationCampaignCreateRequest,
): Promise<NotificationCampaignDetailOut> {
  return platformCreateNotificationCampaign({ client: platformApiClient, body }).then(unwrap);
}

export function getCampaign(campaignId: string): Promise<NotificationCampaignDetailOut> {
  return platformGetNotificationCampaign({
    client: platformApiClient,
    path: { campaign_id: campaignId },
  }).then(unwrap);
}

export function updateCampaign(
  campaignId: string,
  body: NotificationCampaignPatchRequest,
): Promise<NotificationCampaignDetailOut> {
  return platformUpdateNotificationCampaign({
    client: platformApiClient,
    path: { campaign_id: campaignId },
    body,
  }).then(unwrap);
}

export function estimateCampaignAudience(campaignId: string) {
  return platformEstimateNotificationCampaignAudience({
    client: platformApiClient,
    path: { campaign_id: campaignId },
  }).then(unwrap);
}

export function previewCampaign(campaignId: string) {
  return platformPreviewNotificationCampaign({
    client: platformApiClient,
    path: { campaign_id: campaignId },
  }).then(unwrap);
}

export function publishCampaign(campaignId: string, body: NotificationCampaignPublishRequest) {
  return platformPublishNotificationCampaign({
    client: platformApiClient,
    path: { campaign_id: campaignId },
    body,
  }).then(unwrap);
}

export function cancelCampaign(campaignId: string, body: NotificationCampaignRevisionRequest) {
  return platformCancelNotificationCampaign({
    client: platformApiClient,
    path: { campaign_id: campaignId },
    body,
  }).then(unwrap);
}

export function archiveCampaign(campaignId: string, body: NotificationCampaignRevisionRequest) {
  return platformArchiveNotificationCampaign({
    client: platformApiClient,
    path: { campaign_id: campaignId },
    body,
  }).then(unwrap);
}

export function listCampaignDeliveries(
  campaignId: string,
  query?: NonNullable<PlatformListNotificationCampaignDeliveriesData["query"]>,
): Promise<PageDataNotificationDeliveryOut> {
  return platformListNotificationCampaignDeliveries({
    client: platformApiClient,
    path: { campaign_id: campaignId },
    query,
  }).then(unwrap);
}

export function listDeliveryDirectory(
  query?: NonNullable<PlatformListNotificationDeliveryDirectoryData["query"]>,
): Promise<PageDataNotificationDeliveryDirectoryOut> {
  return platformListNotificationDeliveryDirectory({ client: platformApiClient, query }).then(
    unwrap,
  );
}

export function retryCampaignFailures(campaignId: string, idempotencyKey: string) {
  return platformRetryNotificationCampaignFailures({
    client: platformApiClient,
    path: { campaign_id: campaignId },
    headers: { "Idempotency-Key": idempotencyKey },
  }).then(unwrap);
}

export function getMailService(): Promise<MailServiceOut> {
  return platformGetMailServiceProfile({ client: platformApiClient }).then(unwrap);
}

export function switchMailProvider(provider: string): Promise<Array<MailProviderInfo>> {
  return platformSwitchMailProvider({ client: platformApiClient, body: { provider } }).then(unwrap);
}

export function updateMailService(
  body: Parameters<typeof platformUpdateMailServiceProfile>[0]["body"],
): Promise<MailServiceOut> {
  return platformUpdateMailServiceProfile({ client: platformApiClient, body }).then(unwrap);
}

export function disableMailService(body: MailServiceMutationRequest): Promise<MailServiceOut> {
  return platformDisableMailServiceProfile({ client: platformApiClient, body }).then(unwrap);
}

export function recoverMailService(body: MailServiceMutationRequest): Promise<MailServiceOut> {
  return platformRecoverMailServiceProfile({ client: platformApiClient, body }).then(unwrap);
}

export function testMailService(body: MailServiceTestRequest) {
  return platformTestMailServiceProfile({ client: platformApiClient, body }).then(unwrap);
}

export function previewTemplate(body: MailTemplatePreviewRequest) {
  return platformPreviewEmailTemplate({ client: platformApiClient, body }).then(unwrap);
}

export function createTemplate(body: MailTemplateCreateRequest): Promise<MailTemplateOut> {
  return platformCreateEmailTemplate({ client: platformApiClient, body }).then(unwrap);
}

export function getTemplate(templateId: string): Promise<MailTemplateOut> {
  return platformGetEmailTemplate({
    client: platformApiClient,
    path: { template_id: templateId },
  }).then(unwrap);
}

export function updateTemplate(
  templateId: string,
  body: MailTemplatePatchRequest,
): Promise<MailTemplateOut> {
  return platformUpdateEmailTemplate({
    client: platformApiClient,
    path: { template_id: templateId },
    body,
  }).then(unwrap);
}

export function deleteTemplate(templateId: string, expectedVersion: number): Promise<void> {
  return platformDeleteEmailTemplate({
    client: platformApiClient,
    path: { template_id: templateId },
    query: { expected_version: expectedVersion },
  }).then(unwrapVoid);
}

export function getTemplateRevision(revisionId: string): Promise<MailTemplateRevisionDetailOut> {
  return platformGetEmailTemplateRevision({
    client: platformApiClient,
    path: { revision_id: revisionId },
  }).then(unwrap);
}

export function restoreTemplate(templateId: string, body: MailTemplateRevisionMutationRequest) {
  return platformRestoreDefaultEmailTemplate({
    client: platformApiClient,
    path: { template_id: templateId },
    body,
  }).then(unwrap);
}

export function testSendTemplate(templateId: string, body: MailTemplateTestSendRequest) {
  return platformTestSendEmailTemplate({
    client: platformApiClient,
    path: { template_id: templateId },
    body,
  }).then(unwrap);
}

export function listTemplateHistory(
  templateKey: string,
  query?: NonNullable<PlatformListEmailTemplateHistoryData["query"]>,
): Promise<PageDataMailTemplateRevisionOut> {
  return platformListEmailTemplateHistory({
    client: platformApiClient,
    path: { template_key: templateKey },
    query,
  }).then(unwrap);
}

export function writeMailServiceCredentials(
  body: MailCredentialWriteRequestWritable,
): Promise<MailCredentialWriteOut> {
  return platformWriteMailServiceCredentials({ client: platformApiClient, body }).then(unwrap);
}

export function rotateMailServiceCredentials(
  body: MailCredentialWriteRequestWritable,
): Promise<MailCredentialWriteOut> {
  return platformRotateMailServiceCredentials({ client: platformApiClient, body }).then(unwrap);
}

export type { MailProviderInfo };
