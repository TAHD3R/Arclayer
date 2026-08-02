import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

describe("Platform Extensions durable operation truth", () => {
  it("keeps returned receipts inspectable through generated SDK evidence", async () => {
    const [api, ui, dialogs, route, english, chinese] = await Promise.all([
      source("apps/platform/src/extensions/extensions-api.ts"),
      source("apps/platform/src/extensions/extensions-ui.tsx"),
      source("apps/platform/src/extensions/extension-lifecycle-dialogs.tsx"),
      source("apps/platform/src/routes/_authenticated/extensions/history.tsx"),
      source("apps/platform/locales/en-US/extensions.json"),
      source("apps/platform/locales/zh-CN/extensions.json"),
    ]);

    expect(api).toContain("platformGetSystemPluginOperation");
    expect(api).toContain("getExtensionOperation");
    expect(ui).toContain("ExtensionOperationReceipt");
    expect(ui).toContain("setOperations((current) => [");
    expect(dialogs).toContain("const operation = await installExtension(");
    expect(dialogs).toContain("const operation = await lifecycleOperation(");
    expect(ui).toContain("useExtensionOperation");
    expect(ui).toContain("operationNeedsRefresh");
    expect(ui).toContain("activationVerified");
    expect(ui).toContain("failureSummary");
    expect(ui).not.toContain("OPERATION_ACCEPTED");
    expect(route).toContain("validateSearch");
    expect(route).toContain("operationId");
    expect(english).toContain('"INSPECT_OPERATION"');
    expect(chinese).toContain('"INSPECT_OPERATION"');
  });
});
