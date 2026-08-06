import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function readSource(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

describe("AI and Hosting Platform operation contracts", () => {
  it("registers canonical AI and Hosting file-route modules", async () => {
    const routes = await Promise.all(
      [
        "apps/platform/src/routes/_authenticated/ai/tasks.tsx",
        "apps/platform/src/routes/_authenticated/ai/providers.tsx",
        "apps/platform/src/routes/_authenticated/ai/assistants.tsx",
        "apps/platform/src/routes/_authenticated/ai/policies.tsx",
        "apps/platform/src/routes/_authenticated/hosting/issues.tsx",
        "apps/platform/src/routes/_authenticated/hosting/domains.tsx",
        "apps/platform/src/routes/_authenticated/hosting/storage.tsx",
        "apps/platform/src/routes/_authenticated/hosting/policies.tsx",
      ].map(readSource),
    );

    expect(routes.join("\n")).toContain('createFileRoute("/_authenticated/ai/tasks")');
    expect(routes.join("\n")).toContain('createFileRoute("/_authenticated/hosting/policies")');
  });

  it("uses generated SDK actions and preserves Hosting operation semantics", async () => {
    const [
      aiApi,
      assistantsApi,
      hostingApi,
      aiPage,
      hostingPage,
      providerDialogs,
      assistantDialogs,
    ] = await Promise.all([
      readSource("apps/platform/src/ai/ai-services-api.ts"),
      readSource("apps/platform/src/ai/ai-assistants-api.ts"),
      readSource("apps/platform/src/site-delivery/site-delivery-api.ts"),
      readSource("apps/platform/src/pages/ai-services.tsx"),
      readSource("apps/platform/src/pages/site-delivery.tsx"),
      readSource("apps/platform/src/ai/ai-provider-dialogs.tsx"),
      readSource("apps/platform/src/ai/ai-assistant-dialogs.tsx"),
    ]);

    expect(aiApi).toContain("platformRetryPlatformAiTask");
    expect(aiApi).toContain("platformCancelPlatformAiTask");
    expect(aiApi).toContain("platformReconcilePlatformAiTask");
    expect(aiApi).toContain("platformPreviewSystemAiProviderAvailability");
    expect(aiApi).toContain("platformApplySystemAiProviderAvailability");
    expect(aiApi).toContain("platformDeleteSystemAiProvider");
    expect(aiApi).toContain("platformGetAiPolicy");
    expect(aiApi).toContain("platformSaveAiPolicyDraft");
    expect(aiApi).toContain("platformPreviewAiPolicy");
    expect(aiApi).toContain("platformPublishAiPolicy");
    expect(aiApi).toContain("platformApplyAiPolicy");
    expect(hostingApi).toContain("platformRetryPlatformDeliveryIssue");
    expect(hostingApi).toContain("platformReconcilePlatformDeliveryIssue");
    expect(hostingApi).toContain("platformRestorePlatformDeliveryIssue");
    expect(hostingApi).toContain("platformRecoverPlatformDeliveryDomain");
    expect(hostingApi).toContain("platformTestPlatformDeliveryStorage");
    expect(hostingApi).toContain("platformGetPlatformDeliveryIssueDossier");
    expect(hostingApi).toContain("platformGetPlatformDeliveryDomainDossier");
    expect(hostingApi).toContain("platformGetPlatformDeliveryStorageDossier");
    expect(hostingApi).toContain("platformGetPlatformDeliveryContinuityPolicy");
    expect(hostingApi).toContain("platformPreviewPlatformDeliveryPolicy");
    expect(hostingApi).toContain("platformApplyPlatformDeliveryPolicy");
    expect(hostingApi).toContain("platformCreateStorageProfile");
    expect(hostingApi).toContain("platformUpdateStorageProfile");
    expect(hostingApi).toContain("platformDeleteStorageProfile");
    expect(hostingApi).toContain("PlatformDeliveryOperationOut");
    expect(hostingApi).toContain("PlatformDeliveryOperationRequestIn");
    expect(aiPage).toContain("idempotencyKeys.current.get(operationKey)");
    expect(aiPage).toContain("TASK_ACTION_RESULT_TITLE");
    expect(aiPage).toContain("TASK_ACTION_UNCONFIRMED");
    expect(aiPage).toContain("AiProviderEditorDialog");
    expect(aiPage).toContain("AiAssistantEditorDialog");
    expect(aiPage).toContain("AiAssistantVersionDialog");
    expect(aiPage).toContain("retireAiAssistantVersion");
    expect(aiPage).toContain("POLICY_DRAFT_TITLE");
    expect(aiPage).not.toContain("window.prompt");
    expect(providerDialogs).toContain("createAiProvider");
    expect(providerDialogs).toContain("updateAiProvider");
    expect(providerDialogs).toContain("<Sheet");
    expect(providerDialogs).toContain("modelMappings: cleanMappings");
    expect(providerDialogs).toContain("icon.lightUrl && icon.darkUrl");
    expect(providerDialogs).toContain("const update = providerUpdate(props.provider!, body)");
    expect(providerDialogs).not.toContain("updateRequiresApiKey");
    expect(providerDialogs).toContain("if (apiKey) update.providerApiKey = apiKey");
    expect(providerDialogs).toContain("toast.error");
    expect(providerDialogs).toContain("flex min-h-0 w-full flex-col gap-0 overflow-hidden p-0");
    expect(providerDialogs).toContain("flex-1 space-y-6 overflow-x-hidden overflow-y-auto");
    expect(providerDialogs).toContain('SheetFooter className="mt-0 shrink-0 border-t');
    expect(providerDialogs).not.toContain("pb-24");
    expect(providerDialogs).not.toContain("fixed inset-x-0 bottom-0");
    expect(providerDialogs).not.toContain("sm:absolute");
    expect(providerDialogs).toContain("PLACEHOLDER_PROVIDER_LABEL");
    expect(providerDialogs).toContain("PLACEHOLDER_API_KEY");
    expect(providerDialogs).toContain("PLACEHOLDER_TEST_PROMPT");
    expect(aiPage).toContain("<Table>");
    expect(aiPage).toContain("deleteAiProvider");
    expect(aiPage).toContain("provider.isActive && !provider.isArchived");
    expect(aiPage).toContain("PROVIDER_EMPTY_ALL_TITLE");
    expect(aiPage).toContain("PROVIDER_EMPTY_ACTIVE_TITLE");
    expect(aiPage).toContain("PROVIDER_EMPTY_ARCHIVED_TITLE");
    expect(aiPage).toContain("ProviderIconImage");
    expect(providerDialogs).toContain('type="password"');
    expect(assistantsApi).toContain("platformCreateSystemAgent");
    expect(assistantsApi).toContain("platformUpdateSystemAgent");
    expect(assistantsApi).toContain("platformCreateSystemAgentVersion");
    expect(assistantsApi).toContain("platformRetireSystemAgentVersion");
    expect(assistantDialogs).toContain("createAiAssistant");
    expect(assistantDialogs).toContain("createAiAssistantVersion");
    expect(assistantDialogs).toContain("toast.error");
    expect(assistantDialogs).not.toContain("<Alert");
    expect(hostingPage).toContain("executeDeliveryIssueAction");
    expect(hostingPage).toContain("recoverDeliveryDomain");
    expect(hostingPage).toContain("testDeliveryStorage");
    expect(hostingPage).toContain("getDeliveryIssueDossier");
    expect(hostingPage).toContain("getDeliveryDomainDossier");
    expect(hostingPage).toContain("getDeliveryStorageDossier");
    expect(hostingPage).toContain("previewDeliveryPolicy");
    expect(hostingPage).toContain("applyDeliveryPolicy");
    expect(hostingPage).toContain("StorageProfileEditorDialog");
    expect(hostingPage).toContain("DeleteStorageProfileDialog");
    expect(hostingPage).toContain("crypto.randomUUID()");
    expect(hostingPage).toContain("failedTargetCount");
    expect(hostingPage).toContain('result.state === "partial"');
    expect(hostingPage).toContain("affectedActiveTransitionCount");
    expect(hostingPage).toContain("ACTION_CONFLICT_TITLE");
    expect(hostingPage).not.toContain("ReadOnlyActionNotice");
    expect(hostingPage).not.toContain("ISSUE_RETRY_UNAVAILABLE");
    expect(hostingPage).not.toContain("DOMAIN_ACTIONS_UNAVAILABLE");
    expect(hostingPage).not.toContain("POLICY_ACTIONS_UNAVAILABLE");
    expect(hostingPage).not.toContain("fetch(");
  });
});
