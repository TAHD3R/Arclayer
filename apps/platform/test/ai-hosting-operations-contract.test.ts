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
    const [aiApi, hostingApi, aiPage, hostingPage] = await Promise.all([
      readSource("apps/platform/src/ai/ai-services-api.ts"),
      readSource("apps/platform/src/site-delivery/site-delivery-api.ts"),
      readSource("apps/platform/src/pages/ai-services.tsx"),
      readSource("apps/platform/src/pages/site-delivery.tsx"),
    ]);

    expect(aiApi).toContain("platformRetryPlatformAiTask");
    expect(aiApi).toContain("platformCancelPlatformAiTask");
    expect(aiApi).toContain("platformReconcilePlatformAiTask");
    expect(aiApi).toContain("platformPreviewSystemAiProviderAvailability");
    expect(aiApi).toContain("platformApplySystemAiProviderAvailability");
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
    expect(hostingApi).toContain("PlatformDeliveryOperationOut");
    expect(hostingApi).toContain("PlatformDeliveryOperationRequestIn");
    expect(aiPage).toContain("idempotencyKeys.current.get(operationKey)");
    expect(aiPage).toContain("TASK_ACTION_RESULT_TITLE");
    expect(aiPage).toContain("TASK_ACTION_UNCONFIRMED");
    expect(hostingPage).toContain("executeDeliveryIssueAction");
    expect(hostingPage).toContain("recoverDeliveryDomain");
    expect(hostingPage).toContain("testDeliveryStorage");
    expect(hostingPage).toContain("getDeliveryIssueDossier");
    expect(hostingPage).toContain("getDeliveryDomainDossier");
    expect(hostingPage).toContain("getDeliveryStorageDossier");
    expect(hostingPage).toContain("previewDeliveryPolicy");
    expect(hostingPage).toContain("applyDeliveryPolicy");
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
