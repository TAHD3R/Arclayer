import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

describe("Platform communications UI contract", () => {
  it("uses generated real CRUD operations and shadcn setting dialogs without browser prompts", async () => {
    const [
      api,
      pageState,
      feedback,
      campaigns,
      deliveries,
      templates,
      email,
      templateEditor,
      templateActions,
      mailDialogs,
      campaignDialog,
      publishDialog,
    ] = await Promise.all([
      source("apps/platform/src/communications/communications-api.ts"),
      source("apps/platform/src/communications/messages-page-state.tsx"),
      source("apps/platform/src/communications/feedback-page.tsx"),
      source("apps/platform/src/communications/campaigns-page.tsx"),
      source("apps/platform/src/communications/deliveries-page.tsx"),
      source("apps/platform/src/communications/templates-page.tsx"),
      source("apps/platform/src/communications/email-service-page.tsx"),
      source("apps/platform/src/communications/email-template-editor-dialog.tsx"),
      source("apps/platform/src/communications/email-template-action-dialogs.tsx"),
      source("apps/platform/src/communications/mail-service-dialogs.tsx"),
      source("apps/platform/src/communications/campaign-draft-dialog.tsx"),
      source("apps/platform/src/communications/campaign-publish-dialog.tsx"),
    ]);
    const pages = [pageState, feedback, campaigns, deliveries, templates, email].join("\n");
    const ui = pages;
    const communicationsSource = [
      ui,
      templateEditor,
      templateActions,
      mailDialogs,
      campaignDialog,
      publishDialog,
    ].join("\n");

    expect(api).toContain("platformCreateEmailTemplate");
    expect(api).toContain("platformGetEmailTemplate");
    expect(api).toContain("platformUpdateEmailTemplate");
    expect(api).toContain("platformDeleteEmailTemplate");
    expect(api).toContain("platformPreviewEmailTemplate");
    expect(api).toContain("platformTestSendEmailTemplate");
    expect(api).toContain("platformListEmailTemplateHistory");
    expect(api).toContain("platformRestoreDefaultEmailTemplate");
    expect(api).toContain("platformWriteMailServiceCredentials");
    expect(api).toContain("platformRotateMailServiceCredentials");
    expect(api).toContain("unwrapVoid");
    expect(communicationsSource).toContain("@/components/setting-dialog");
    expect(communicationsSource).not.toContain("@arclayer/ui/");
    expect(communicationsSource).not.toContain("window.prompt");
    expect(communicationsSource).not.toContain("window.confirm");
    expect(communicationsSource).not.toContain("localStorage");
    expect(communicationsSource).not.toContain("fetch(");
    expect(ui).not.toContain('item.state === "draft" || item.state === "scheduled"');
    expect(campaignDialog).toContain(
      "hasIncompletePresentationAddition(props.campaign, presentations, content.sourceVariantId)",
    );
    expect(campaignDialog).toContain('setError("CAMPAIGN_MULTI_LANGUAGE_PRESENTATION_CHANGE")');
  });

  it("keeps async communications dialogs last-intent-wins", async () => {
    const [campaigns, templates, templateActions] = await Promise.all([
      source("apps/platform/src/communications/campaigns-page.tsx"),
      source("apps/platform/src/communications/templates-page.tsx"),
      source("apps/platform/src/communications/email-template-action-dialogs.tsx"),
    ]);
    const ui = [campaigns, templates].join("\n");

    expect(ui).toContain("const editorRequest = useRef(0);");
    expect(ui).toContain("if (editorRequest.current !== requestId) return;");
    expect(ui).toContain("if (editorRequest.current === requestId) setPending(null);");
    expect(ui).toContain("const templateRequest = useRef(0);");
    expect(ui).toContain("templateRequest.current += 1;");
    expect(ui).toContain("if (templateRequest.current !== requestId) return;");
    expect(ui).toContain("if (templateRequest.current === requestId) setPending(null);");
    expect(templateActions).toContain("const historyRequest = useRef(0);");
    expect(templateActions).toContain("const detailRequest = useRef(0);");
    expect(templateActions).toContain("if (historyRequest.current !== requestId) return;");
    expect(templateActions).toContain("if (detailRequest.current !== requestId) return;");
    expect(templateActions).toContain(
      "if (detailRequest.current === requestId) setDetailLoading(null);",
    );
  });

  it("keeps retry idempotency attempts scoped by fingerprint until matching mutations succeed", async () => {
    const [feedback, campaigns, deliveries, mailDialogs] = await Promise.all([
      source("apps/platform/src/communications/feedback-page.tsx"),
      source("apps/platform/src/communications/campaigns-page.tsx"),
      source("apps/platform/src/communications/deliveries-page.tsx"),
      source("apps/platform/src/communications/mail-service-dialogs.tsx"),
    ]);
    const ui = [feedback, campaigns, deliveries].join("\n");

    expect(ui).toContain(
      "const replyRetryAttempts = useRef<Map<string, IdempotencyAttempt>>(new Map());",
    );
    expect(ui).toContain(
      "const fingerprint = JSON.stringify([ticket.id, messageId, messageBody]);",
    );
    expect(ui).toContain("replyRetryAttempts.current.get(fingerprint) ?? {");
    expect(ui).toContain("replyRetryAttempts.current.set(fingerprint, attempt);");
    expect(ui).toMatch(
      /await retryFeedbackReplyDelivery\(ticket\.id, messageId, attempt\.key\);\s+if \(replyRetryAttempts\.current\.get\(fingerprint\) === attempt\)\s+replyRetryAttempts\.current\.delete\(fingerprint\);/,
    );
    expect(ui).toContain(
      "const campaignRetryAttempts = useRef<Map<string, IdempotencyAttempt>>(new Map());",
    );
    expect(ui).toContain("campaignRetryAttempts.current.get(campaignId) ?? {");
    expect(ui).toContain("campaignRetryAttempts.current.set(campaignId, attempt);");
    expect(ui).toMatch(
      /await retryCampaignFailures\(campaignId, attempt\.key\);\s+if \(campaignRetryAttempts\.current\.get\(campaignId\) === attempt\)\s+campaignRetryAttempts\.current\.delete\(campaignId\);/,
    );
    expect(ui).toContain(
      "const campaignDeliveryRetryAttempts = useRef<Map<string, IdempotencyAttempt>>(new Map());",
    );
    expect(ui).toContain("campaignDeliveryRetryAttempts.current.get(campaignId) ?? {");
    expect(ui).toContain("campaignDeliveryRetryAttempts.current.set(campaignId, attempt);");
    expect(ui).toMatch(
      /await retryCampaignFailures\(campaignId, attempt\.key\);\s+if \(campaignDeliveryRetryAttempts\.current\.get\(campaignId\) === attempt\)\s+campaignDeliveryRetryAttempts\.current\.delete\(campaignId\);/,
    );
    expect(ui).not.toContain("retryCampaignFailures(item.id, crypto.randomUUID())");

    expect(mailDialogs).toContain('crypto.subtle.digest("SHA-256"');
    expect(mailDialogs).toContain("current?.fingerprint === fingerprint");
    expect(mailDialogs).toContain(": { fingerprint, key: crypto.randomUUID() };");
    expect(mailDialogs).toContain(
      "const profileAttempt = useRef<IdempotencyAttempt | null>(null);",
    );
    expect(mailDialogs).toContain(
      "const credentialAttempt = useRef<IdempotencyAttempt | null>(null);",
    );
    expect(mailDialogs).toContain("const testAttempt = useRef<IdempotencyAttempt | null>(null);");
    expect(mailDialogs).toContain("const actionAttempt = useRef<IdempotencyAttempt | null>(null);");
    expect(mailDialogs).toContain(
      'operation: props.rotate ? "credentials:rotate" : "credentials:write"',
    );
    expect(mailDialogs).not.toContain("idempotencyKey: crypto.randomUUID()");
    expect(mailDialogs.match(/idempotencyKey: attempt\.key/g)).toHaveLength(4);
    expect(mailDialogs).toMatch(
      /await updateMailService\(\{ \.\.\.payload, idempotencyKey: attempt\.key \}\);\s+if \(profileAttempt\.current === attempt\) profileAttempt\.current = null;/,
    );
    expect(mailDialogs).toMatch(
      /if \(props\.rotate\) await rotateMailServiceCredentials\(body\);\s+else await writeMailServiceCredentials\(body\);\s+if \(credentialAttempt\.current === attempt\) credentialAttempt\.current = null;/,
    );
    expect(mailDialogs).toMatch(
      /await testMailService\(\{ \.\.\.payload, idempotencyKey: attempt\.key \}\);\s+if \(testAttempt\.current === attempt\) testAttempt\.current = null;/,
    );
    expect(mailDialogs).toMatch(
      /if \(props\.kind === "disable"\) await disableMailService\(body\);\s+else await recoverMailService\(body\);\s+if \(actionAttempt\.current === attempt\) actionAttempt\.current = null;/,
    );
  });
});
