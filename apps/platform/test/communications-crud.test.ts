import {
  platformCreateEmailTemplate,
  platformCreateNotificationCampaign,
  platformDeleteEmailTemplate,
  platformDisableMailServiceProfile,
  platformGetEmailTemplate,
  platformGetEmailTemplateRevision,
  platformGetNotificationCampaign,
  platformListEmailTemplateHistory,
  platformPreviewEmailTemplate,
  platformRecoverMailServiceProfile,
  platformRestoreDefaultEmailTemplate,
  platformRotateMailServiceCredentials,
  platformSwitchMailProvider,
  platformTestMailServiceProfile,
  platformTestSendEmailTemplate,
  platformUpdateEmailTemplate,
  platformUpdateMailServiceProfile,
  platformUpdateNotificationCampaign,
  platformWriteMailServiceCredentials,
  type MailServiceOut,
  type MailTemplateOut,
  type NotificationCampaignDetailOut,
} from "@arclayer/platform-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { platformApiClient } from "@/api/client";
import {
  createCampaign,
  createTemplate,
  deleteTemplate,
  disableMailService,
  getCampaign,
  getTemplate,
  getTemplateRevision,
  listTemplateHistory,
  previewTemplate,
  recoverMailService,
  restoreTemplate,
  rotateMailServiceCredentials,
  switchMailProvider,
  testMailService,
  testSendTemplate,
  updateCampaign,
  updateMailService,
  updateTemplate,
  writeMailServiceCredentials,
} from "@/communications/communications-api";
import { parseCampaignAudienceIds } from "@/communications/campaign-draft-dialog";
import {
  parseTemplateVariableNames,
  parseTemplateVariableValues,
} from "@/communications/email-template-editor-dialog";

vi.mock("@arclayer/platform-openapi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arclayer/platform-openapi")>();
  return {
    ...actual,
    platformCreateEmailTemplate: vi.fn(),
    platformCreateNotificationCampaign: vi.fn(),
    platformDeleteEmailTemplate: vi.fn(),
    platformDisableMailServiceProfile: vi.fn(),
    platformGetEmailTemplate: vi.fn(),
    platformGetEmailTemplateRevision: vi.fn(),
    platformGetNotificationCampaign: vi.fn(),
    platformListEmailTemplateHistory: vi.fn(),
    platformPreviewEmailTemplate: vi.fn(),
    platformRecoverMailServiceProfile: vi.fn(),
    platformRestoreDefaultEmailTemplate: vi.fn(),
    platformRotateMailServiceCredentials: vi.fn(),
    platformSwitchMailProvider: vi.fn(),
    platformTestMailServiceProfile: vi.fn(),
    platformTestSendEmailTemplate: vi.fn(),
    platformUpdateEmailTemplate: vi.fn(),
    platformUpdateMailServiceProfile: vi.fn(),
    platformUpdateNotificationCampaign: vi.fn(),
    platformWriteMailServiceCredentials: vi.fn(),
  };
});
vi.unmock("@/communications/communications-api");

const response = <T>(data: T) => ({
  data: { data, message: "OK", timestamp: 1 },
  request: new Request("https://platform.test/platform-api/v1/communications"),
  response: new Response(null, { status: 200 }),
});

const template: MailTemplateOut = {
  createdAt: "2026-08-03T00:00:00Z",
  description: "Account notice",
  htmlTemplate: "<p>Hello {{ name }}</p>",
  id: "template-1",
  isEnabled: true,
  key: "account_notice",
  locale: "en-US",
  name: "Account notice",
  subjectTemplate: "Hello {{ name }}",
  textTemplate: "Hello {{ name }}",
  updatedAt: "2026-08-03T00:00:00Z",
  variables: ["name"],
  version: 3,
};

const mailService: MailServiceOut = {
  active: true,
  configured: true,
  credentialConfigured: true,
  degraded: false,
  desiredActive: true,
  installed: true,
  permittedActions: [],
  provider: "smtp",
  reachable: true,
  readiness: "active",
  revision: 5,
  sender: { address: "mail@example.com", domain: "example.com", name: "Arclayer" },
  senderVerified: true,
  transportRevision: 2,
  unavailable: false,
};

describe("Platform communications real CRUD", () => {
  beforeEach(() => vi.clearAllMocks());

  it("connects complete email template CRUD and revision operations to the generated SDK", async () => {
    vi.mocked(platformCreateEmailTemplate).mockResolvedValue(response(template));
    vi.mocked(platformGetEmailTemplate).mockResolvedValue(response(template));
    vi.mocked(platformUpdateEmailTemplate).mockResolvedValue(
      response({ ...template, name: "Updated", version: 4 }),
    );
    vi.mocked(platformDeleteEmailTemplate).mockResolvedValue(response(null));
    vi.mocked(platformPreviewEmailTemplate).mockResolvedValue(
      response({ html: "<p>Hello Ada</p>", subject: "Hello Ada", text: "Hello Ada" }),
    );
    vi.mocked(platformTestSendEmailTemplate).mockResolvedValue(
      response({ attempts: 1, latencyMs: 10, provider: "smtp", state: "accepted" as const }),
    );
    vi.mocked(platformListEmailTemplateHistory).mockResolvedValue(
      response({ items: [], next: null, page: 1, pages: 0, prev: null, size: 50, total: 0 }),
    );
    vi.mocked(platformGetEmailTemplateRevision).mockResolvedValue(
      response({
        ...template,
        action: "updated" as const,
        actor: null,
        changedFields: ["subject_template"],
        createdAt: template.updatedAt,
        templateId: template.id,
      }),
    );
    vi.mocked(platformRestoreDefaultEmailTemplate).mockResolvedValue(
      response({ ...template, version: 4 }),
    );

    const createBody = {
      htmlTemplate: template.htmlTemplate,
      key: template.key,
      locale: template.locale,
      name: template.name,
      subjectTemplate: template.subjectTemplate,
      textTemplate: template.textTemplate,
    };
    await createTemplate(createBody);
    await getTemplate(template.id);
    await updateTemplate(template.id, { expectedVersion: 3, name: "Updated" });
    await expect(deleteTemplate(template.id, 3)).resolves.toBeUndefined();
    await previewTemplate({
      htmlTemplate: template.htmlTemplate,
      subjectTemplate: template.subjectTemplate,
      textTemplate: template.textTemplate,
      variables: { name: "Ada" },
    });
    await testSendTemplate(template.id, {
      recipient: "ada@example.com",
      variables: { name: "Ada" },
    });
    await listTemplateHistory(template.key, { locale: template.locale, page: 1, size: 50 });
    await getTemplateRevision("revision-1");
    await restoreTemplate(template.id, { expectedVersion: 3 });

    expect(platformCreateEmailTemplate).toHaveBeenCalledWith({
      body: createBody,
      client: platformApiClient,
    });
    expect(platformGetEmailTemplate).toHaveBeenCalledWith({
      client: platformApiClient,
      path: { template_id: template.id },
    });
    expect(platformUpdateEmailTemplate).toHaveBeenCalledWith({
      body: { expectedVersion: 3, name: "Updated" },
      client: platformApiClient,
      path: { template_id: template.id },
    });
    expect(platformDeleteEmailTemplate).toHaveBeenCalledWith({
      client: platformApiClient,
      path: { template_id: template.id },
      query: { expected_version: 3 },
    });
  });

  it("writes and rotates credentials without any readback field and uses revision-bound service mutations", async () => {
    vi.mocked(platformUpdateMailServiceProfile).mockResolvedValue(response(mailService));
    vi.mocked(platformWriteMailServiceCredentials).mockResolvedValue(
      response({ configured: true, provider: "smtp", revision: 6, rotated: false }),
    );
    vi.mocked(platformRotateMailServiceCredentials).mockResolvedValue(
      response({ configured: true, provider: "smtp", revision: 7, rotated: true }),
    );
    vi.mocked(platformTestMailServiceProfile).mockResolvedValue(
      response({
        attempts: 1,
        latencyMs: 10,
        provider: "smtp",
        service: mailService,
        state: "accepted" as const,
      }),
    );
    vi.mocked(platformDisableMailServiceProfile).mockResolvedValue(
      response({ ...mailService, active: false }),
    );
    vi.mocked(platformRecoverMailServiceProfile).mockResolvedValue(response(mailService));
    vi.mocked(platformSwitchMailProvider).mockResolvedValue(response([]));

    await updateMailService({
      expectedRevision: 5,
      idempotencyKey: "profile-update",
      senderName: "Arc",
    });
    const write = await writeMailServiceCredentials({
      expectedRevision: 5,
      idempotencyKey: "credential-write",
      secret: "secret-value",
      username: "mailer",
    });
    const rotate = await rotateMailServiceCredentials({
      expectedRevision: 6,
      idempotencyKey: "credential-rotate",
      secret: "rotated-value",
      username: "mailer",
    });
    await testMailService({
      expectedRevision: 7,
      idempotencyKey: "service-test",
      recipient: "ada@example.com",
    });
    await disableMailService({ expectedRevision: 7, idempotencyKey: "service-disable" });
    await recoverMailService({ expectedRevision: 8, idempotencyKey: "service-recover" });
    await switchMailProvider("smtp");

    expect(write).toEqual({ configured: true, provider: "smtp", revision: 6, rotated: false });
    expect(rotate).toEqual({ configured: true, provider: "smtp", revision: 7, rotated: true });
    expect(write).not.toHaveProperty("secret");
    expect(rotate).not.toHaveProperty("secret");
    expect(platformWriteMailServiceCredentials).toHaveBeenCalledWith({
      body: expect.objectContaining({ secret: "secret-value" }),
      client: platformApiClient,
    });
    expect(platformRotateMailServiceCredentials).toHaveBeenCalledWith({
      body: expect.objectContaining({ secret: "rotated-value" }),
      client: platformApiClient,
    });
  });

  it("loads and updates campaign drafts and parses immutable form inputs", async () => {
    const campaign = { id: "campaign-1", revision: 2 } as NotificationCampaignDetailOut;
    vi.mocked(platformCreateNotificationCampaign).mockResolvedValue(response(campaign));
    vi.mocked(platformGetNotificationCampaign).mockResolvedValue(response(campaign));
    vi.mocked(platformUpdateNotificationCampaign).mockResolvedValue(response(campaign));

    await createCampaign({ audience: { kind: "all_active_users" }, name: "Launch" });
    await getCampaign(campaign.id);
    await updateCampaign(campaign.id, { expectedRevision: 2, name: "Launch updated" });

    expect(platformUpdateNotificationCampaign).toHaveBeenCalledWith({
      body: { expectedRevision: 2, name: "Launch updated" },
      client: platformApiClient,
      path: { campaign_id: campaign.id },
    });
    expect(parseTemplateVariableNames("name, workspace\nname")).toEqual(["name", "workspace"]);
    expect(parseTemplateVariableValues('{"name":"Ada","workspace":"Arc"}')).toEqual({
      name: "Ada",
      workspace: "Arc",
    });
    expect(() => parseTemplateVariableValues("not-json")).toThrow();
    expect(parseCampaignAudienceIds("user-1, user-2\nuser-1")).toEqual(["user-1", "user-2"]);
  });
});
