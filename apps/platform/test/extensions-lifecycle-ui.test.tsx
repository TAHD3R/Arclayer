import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SystemPluginCatalogItemOut,
  SystemPluginOperationOut,
} from "@arclayer/platform-openapi";

import { installExtension, listExtensionCatalog } from "@/extensions/extensions-api";
import { ExtensionInstallDialog } from "@/extensions/extension-lifecycle-dialogs";
import { initializePlatformI18n, i18n } from "@/lib/i18n";
import { ExtensionsCatalogPage } from "@/pages/extensions";

vi.mock("@/extensions/extensions-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/extensions/extensions-api")>();
  return {
    ...actual,
    installExtension: vi.fn(),
    listExtensionCatalog: vi.fn(),
  };
});

const catalogItem = {
  approvedPermissions: [],
  artifactChecksum: "artifact-checksum",
  availableVersion: "1.2.3",
  compatibility: { compatible: true },
  manifestDigest: "manifest-digest",
  name: "mail-connector",
  packageChecksum: "package-checksum",
  permissions: ["extensions:mail:read", "extensions:mail:send"],
  provenanceStatus: "verified",
  provides: {},
  sourceLocator: "https://catalog.example.test/mail-connector",
  sourceType: "catalog",
} as SystemPluginCatalogItemOut;

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en-US");
});

afterEach(cleanup);

describe("Platform Extensions lifecycle UI", () => {
  it("requires explicit approval for every newly requested permission", async () => {
    vi.mocked(installExtension).mockResolvedValue({} as SystemPluginOperationOut);
    const onOpenChange = vi.fn();
    const onOperationCreated = vi.fn();
    const user = userEvent.setup();

    render(
      <ExtensionInstallDialog
        item={catalogItem}
        onOpenChange={onOpenChange}
        onOperationCreated={onOperationCreated}
        open
      />,
    );

    const confirm = screen.getByRole("button", { name: "Approve selected access" });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "extensions:mail:read" }));
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "extensions:mail:send" }));
    await user.click(confirm);

    await waitFor(() =>
      expect(installExtension).toHaveBeenCalledWith(
        {
          approvedPermissions: ["extensions:mail:read", "extensions:mail:send"],
          pluginName: "mail-connector",
          sourceType: "catalog",
          targetVersion: "1.2.3",
        },
        expect.any(String),
      ),
    );
    expect(onOperationCreated).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("requests the online catalog explicitly instead of masking an online failure", async () => {
    vi.mocked(listExtensionCatalog).mockResolvedValue({ items: [catalogItem] });

    render(<ExtensionsCatalogPage />);

    expect(await screen.findByText("mail-connector")).toBeVisible();
    expect(listExtensionCatalog).toHaveBeenCalledWith({
      includeOnline: true,
      installedOnly: false,
    });
  });
});
