import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PlatformAuthProvider } from "@/auth/platform-auth";
import { initializePlatformI18n, i18n } from "@/lib/i18n";
import { PlatformPreferencesProvider } from "@/lib/preferences";
import { routeTree } from "@/routeTree.gen";
import * as setupApi from "@/setup/setup-api";

async function renderRoute(initialEntry: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  await router.load();
  render(
    <PlatformPreferencesProvider>
      <PlatformAuthProvider>
        <RouterProvider router={router} />
      </PlatformAuthProvider>
    </PlatformPreferencesProvider>,
  );
}

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.lang = "en-US";
  await i18n.changeLanguage("en-US");
  vi.mocked(setupApi.getPlatformSetupState).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Platform first-owner setup", () => {
  it("routes an uninitialized deployment to setup and enters the real Owner sign-in path", async () => {
    let setupReady = false;
    vi.mocked(setupApi.getPlatformSetupState).mockImplementation(async () => ({
      status: setupReady ? "ready" : "uninitialized",
      repairReason: null,
    }));
    vi.spyOn(setupApi, "bootstrapPlatformInstance").mockImplementation(async () => {
      setupReady = true;
      return {
        ownerIdentityId: "89f4d354-cf0a-4198-a325-0633d827987c",
        mfaSetupRequired: true,
      };
    });
    const user = userEvent.setup();
    await renderRoute("/sign-in");

    expect(
      await screen.findByRole("heading", { name: "Set up the Platform Console" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Account name")).toHaveAttribute("pattern", "[a-z0-9\\-]+");
    await user.type(screen.getByLabelText("Account name"), "instance-owner");
    await user.type(screen.getByLabelText("Display name"), "Instance Owner");
    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "owner-password-1");
    await user.click(screen.getByRole("button", { name: "Create Instance Owner" }));

    expect(await screen.findByText("Instance Owner created")).toBeVisible();
    expect(screen.getByText(/add and verify a security key or passkey/)).toBeVisible();
    expect(window.localStorage.getItem("arclayer:platform:session")).toBeNull();
    expect(setupApi.bootstrapPlatformInstance).toHaveBeenCalledWith({
      username: "instance-owner",
      displayName: "Instance Owner",
      email: "owner@example.com",
      password: "owner-password-1",
    });

    await user.click(screen.getByRole("button", { name: "Continue to secure sign-in" }));
    expect(
      await screen.findByRole("heading", { name: "Sign in to the Platform Console" }),
    ).toBeVisible();
  });

  it("redirects a ready setup route to Platform sign-in", async () => {
    vi.mocked(setupApi.getPlatformSetupState).mockResolvedValue({
      status: "ready",
      repairReason: null,
    });
    await renderRoute("/setup");

    expect(
      await screen.findByRole("heading", { name: "Sign in to the Platform Console" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create Instance Owner" })).toBeNull();
  });

  it("blocks setup and localizes a mismatched authority state", async () => {
    vi.mocked(setupApi.getPlatformSetupState).mockResolvedValue({
      status: "repair_required",
      repairReason: "state_mismatch",
    });
    await renderRoute("/setup");

    expect(await screen.findByText("Platform setup needs repair")).toBeVisible();
    expect(screen.getByText("The owner and installation records do not agree")).toBeVisible();
    expect(screen.getByText(/reconcile the Instance Owner and installation records/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create Instance Owner" })).toBeNull();
  });

  it("shows a setup-specific error when the Platform API state check fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(setupApi.getPlatformSetupState).mockRejectedValue(
      new setupApi.PlatformSetupApiError("PLATFORM_SETUP_NETWORK_ERROR"),
    );
    await renderRoute("/setup");

    await waitFor(() => {
      expect(screen.getByText("The Platform Console could not check setup state")).toBeVisible();
      expect(screen.getByText(/did not assume setup was complete/)).toBeVisible();
    });
    expect(consoleError).toHaveBeenCalled();
  });
});
