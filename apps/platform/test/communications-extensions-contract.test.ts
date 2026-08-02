import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

describe("Platform Messages & Feedback and Extensions routes", () => {
  it("owns every canonical Messages & Feedback route", async () => {
    const routes = await Promise.all(
      ["feedback", "deliveries", "campaigns", "templates", "email"].map((name) =>
        source(`apps/platform/src/routes/_authenticated/messages/${name}.tsx`),
      ),
    );

    expect(routes.join("\n")).toContain('"/_authenticated/messages/feedback"');
    expect(routes.join("\n")).toContain('"/_authenticated/messages/deliveries"');
    expect(routes.join("\n")).toContain('"/_authenticated/messages/campaigns"');
    expect(routes.join("\n")).toContain('"/_authenticated/messages/templates"');
    expect(routes.join("\n")).toContain('"/_authenticated/messages/email"');
  });

  it("keeps delivery evidence tied to its available durable campaign ledger", async () => {
    const [route, page, api] = await Promise.all([
      source("apps/platform/src/routes/_authenticated/messages/deliveries.tsx"),
      source("apps/platform/src/communications/communications-ui.tsx"),
      source("apps/platform/src/communications/communications-api.ts"),
    ]);

    expect(route).toContain("campaignId");
    expect(page).toContain("DELIVERY_SCOPE_REQUIRED_TITLE");
    expect(api).toContain("platformListNotificationCampaignDeliveries");
    expect(api).toContain("platformRetryPlatformFeedbackReplyDelivery");
    expect(api).not.toContain("fetch(");
  });

  it("owns every canonical Extensions route and uses durable lifecycle SDK operations", async () => {
    const [routes, api, ui, dialogs] = await Promise.all([
      Promise.all(
        ["installed", "catalog", "connections", "history", "$pluginId"].map((name) =>
          source(`apps/platform/src/routes/_authenticated/extensions/${name}.tsx`),
        ),
      ),
      source("apps/platform/src/extensions/extensions-api.ts"),
      source("apps/platform/src/extensions/extensions-ui.tsx"),
      source("apps/platform/src/extensions/extension-lifecycle-dialogs.tsx"),
    ]);

    expect(routes.join("\n")).toContain('"/_authenticated/extensions/installed"');
    expect(routes.join("\n")).toContain('"/_authenticated/extensions/catalog"');
    expect(routes.join("\n")).toContain('"/_authenticated/extensions/connections"');
    expect(routes.join("\n")).toContain('"/_authenticated/extensions/history"');
    expect(routes.join("\n")).toContain('"/_authenticated/extensions/$pluginId"');
    expect(api).toContain("platformInstallSystemPlugin");
    expect(api).toContain("platformUpgradeSystemPlugin");
    expect(api).toContain("platformRollbackSystemPlugin");
    expect(api).toContain("platformRecoverSystemPlugin");
    expect(api).not.toContain("fetch(");
    expect(ui).toContain("includeOnline: true");
    expect(ui).toContain("configurationReadiness");
    expect(ui).not.toContain("window.confirm");
    expect(dialogs).not.toContain("window.confirm");
    expect(dialogs).not.toContain("approvedPermissions: item.permissions");
  });
});
