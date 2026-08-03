import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SystemPluginCatalogItemOut,
  SystemPluginOperationOut,
} from "@arclayer/platform-openapi";

import {
  disableExtension,
  installExtension,
  listExtensionCatalog,
  recoverExtension,
} from "@/extensions/extensions-api";
import {
  ExtensionInstallDialog,
  ExtensionLifecycleActions,
} from "@/extensions/extension-lifecycle-dialogs";
import { initializePlatformI18n, i18n } from "@/lib/i18n";
import { ExtensionsCatalogPage } from "@/pages/extensions";

vi.mock("@/extensions/extensions-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/extensions/extensions-api")>();
  return {
    ...actual,
    disableExtension: vi.fn(),
    installExtension: vi.fn(),
    listExtensionCatalog: vi.fn(),
    recoverExtension: vi.fn(),
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

async function renderLifecycleActions(item: SystemPluginCatalogItemOut) {
  const rootRoute = createRootRoute({ component: Outlet });
  const lifecycleRoute = createRoute({
    component: () => <ExtensionLifecycleActions item={item} onOperationCreated={vi.fn()} />,
    getParentRoute: () => rootRoute,
    path: "/",
  });
  const historyRoute = createRoute({
    component: () => null,
    getParentRoute: () => rootRoute,
    path: "/extensions/history",
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute.addChildren([lifecycleRoute, historyRoute]),
  });

  await router.load();
  render(<RouterProvider router={router} />);
}

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

  it("reuses an install key after an unconfirmed request and clears it after resolution", async () => {
    vi.mocked(installExtension)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ id: "operation-1" } as SystemPluginOperationOut)
      .mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();

    render(
      <ExtensionInstallDialog
        item={catalogItem}
        onOpenChange={vi.fn()}
        onOperationCreated={vi.fn()}
        open
      />,
    );

    const confirm = () => screen.getByRole("button", { name: "Approve selected access" });
    await user.click(screen.getByRole("checkbox", { name: "extensions:mail:read" }));
    await user.click(screen.getByRole("checkbox", { name: "extensions:mail:send" }));
    await user.click(confirm());
    expect(await screen.findByRole("alert")).toHaveTextContent("network");

    await user.click(confirm());
    await waitFor(() => expect(installExtension).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(confirm()).not.toBeDisabled());

    await user.click(confirm());
    await waitFor(() => expect(installExtension).toHaveBeenCalledTimes(3));

    const keys = vi.mocked(installExtension).mock.calls.map(([, idempotencyKey]) => idempotencyKey);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("creates new install keys when approved permissions or target version change", async () => {
    vi.mocked(installExtension).mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    const initialItem = {
      ...catalogItem,
      permissions: ["extensions:mail:read"],
    } as SystemPluginCatalogItemOut;
    const { rerender } = render(
      <ExtensionInstallDialog
        item={initialItem}
        onOpenChange={vi.fn()}
        onOperationCreated={vi.fn()}
        open
      />,
    );

    const confirm = () => screen.getByRole("button", { name: "Approve selected access" });
    await user.click(screen.getByRole("checkbox", { name: "extensions:mail:read" }));
    await user.click(confirm());
    await waitFor(() => expect(installExtension).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(confirm()).not.toBeDisabled());

    rerender(
      <ExtensionInstallDialog
        item={{ ...initialItem, permissions: ["extensions:mail:read", "extensions:mail:send"] }}
        onOpenChange={vi.fn()}
        onOperationCreated={vi.fn()}
        open
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: "extensions:mail:send" }));
    await user.click(confirm());
    await waitFor(() => expect(installExtension).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(confirm()).not.toBeDisabled());

    rerender(
      <ExtensionInstallDialog
        item={{
          ...initialItem,
          availableVersion: "1.2.4",
          permissions: ["extensions:mail:read", "extensions:mail:send"],
        }}
        onOpenChange={vi.fn()}
        onOperationCreated={vi.fn()}
        open
      />,
    );
    await user.click(confirm());
    await waitFor(() => expect(installExtension).toHaveBeenCalledTimes(3));

    const keys = vi.mocked(installExtension).mock.calls.map(([, idempotencyKey]) => idempotencyKey);
    expect(keys[1]).not.toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("reuses unconfirmed lifecycle keys, clears resolved keys, and scopes them by action", async () => {
    vi.mocked(disableExtension)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ id: "operation-2" } as SystemPluginOperationOut)
      .mockRejectedValueOnce(new Error("network"));
    vi.mocked(recoverExtension).mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    const lifecycleItem = {
      ...catalogItem,
      approvedPermissions: catalogItem.permissions,
      desiredEnabled: true,
      lifecycleState: "failed",
    } as SystemPluginCatalogItemOut;

    await renderLifecycleActions(lifecycleItem);

    const disable = () => screen.getByRole("button", { name: "Disable" });
    await user.click(disable());
    expect(await screen.findByRole("alert")).toHaveTextContent("network");

    await user.click(screen.getByRole("button", { name: "Recover" }));
    await waitFor(() => expect(recoverExtension).toHaveBeenCalledTimes(1));

    await user.click(disable());
    await waitFor(() => expect(disableExtension).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(disable()).not.toBeDisabled());

    await user.click(disable());
    await waitFor(() => expect(disableExtension).toHaveBeenCalledTimes(3));

    const disableKeys = vi
      .mocked(disableExtension)
      .mock.calls.map(([, , idempotencyKey]) => idempotencyKey);
    const recoverKey = vi.mocked(recoverExtension).mock.calls[0]?.[2];
    expect(disableKeys[0]).toBeTruthy();
    expect(recoverKey).not.toBe(disableKeys[0]);
    expect(disableKeys[1]).toBe(disableKeys[0]);
    expect(disableKeys[2]).not.toBe(disableKeys[1]);
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
