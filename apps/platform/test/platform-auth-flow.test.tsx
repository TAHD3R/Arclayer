import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as authApi from "@/auth/auth-api";
import { PlatformAuthProvider } from "@/auth/platform-auth";
import { initializePlatformI18n, i18n } from "@/lib/i18n";
import { PlatformPreferencesProvider } from "@/lib/preferences";
import { routeTree } from "@/routeTree.gen";
import type { PlatformSessionIssuedOut } from "@arclayer/platform-openapi";

function issuedSession(recoveryCodes?: Array<string>): PlatformSessionIssuedOut {
  return {
    state: "authenticated",
    credential: {
      accessToken: "operator-platform-token",
      expiresIn: 600,
      session: {
        absoluteExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        actorId: "operator-user",
        isInstanceOwner: false,
        operatorId: "operator-id",
        policyRevision: 1,
        sessionId: "operator-session",
      },
    },
    recoveryCodes: recoveryCodes
      ? { codes: recoveryCodes, state: "recovery_enrollment_required" }
      : null,
  };
}

async function renderSignIn() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/sign-in"] }),
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

async function enterCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email address or username"), "operator@example.com");
  await user.type(screen.getByLabelText("Password"), "correct-password");
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.lang = "en-US";
  await i18n.changeLanguage("en-US");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Platform sign-in and MFA", () => {
  it("keeps an Instance Owner on the required security-key setup path", async () => {
    vi.spyOn(authApi, "signInToPlatform").mockResolvedValue({
      state: "phishing_resistant_setup_required",
      flowToken: "owner-flow-token-with-enough-length",
      expiresIn: 300,
      methods: [{ kind: "authenticator_app", label: "Phone", methodId: "totp-id" }],
    });
    const user = userEvent.setup();
    await renderSignIn();
    await enterCredentials(user);

    expect((await screen.findAllByText("Identity confirmed")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Add a security key or passkey" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Set up authenticator app" })).toBeNull();
  });

  it("enrolls an Operator authenticator app and shows recovery codes once", async () => {
    vi.spyOn(authApi, "signInToPlatform").mockResolvedValue({
      state: "mfa_setup_required",
      flowToken: "operator-setup-flow-with-enough-length",
      expiresIn: 300,
      methods: [],
    });
    vi.spyOn(authApi, "beginAuthenticatorAppSetup").mockResolvedValue({
      state: "mfa_setup_required",
      setup: {
        accountLabel: "operator@example.com",
        issuer: "Arclayer",
        methodId: "totp-method-id",
        secret: "SETUP-SECRET",
        state: "pending_verification",
      },
    });
    vi.spyOn(authApi, "confirmAuthenticatorAppSetup").mockResolvedValue(
      issuedSession(["recovery-one", "recovery-two"]),
    );
    const user = userEvent.setup();
    await renderSignIn();
    await enterCredentials(user);
    await user.click(await screen.findByRole("button", { name: "Set up authenticator app" }));
    await user.type(await screen.findByLabelText("Verification code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify and continue" }));

    expect(await screen.findByText("recovery-one")).toBeVisible();
    expect(screen.getByText("recovery-two")).toBeVisible();
    expect(window.localStorage.getItem("arclayer:platform:session")).toContain(
      "operator-platform-token",
    );
  });

  it("persists a Platform Session after an Operator code challenge", async () => {
    vi.spyOn(authApi, "signInToPlatform").mockResolvedValue({
      state: "mfa_challenge_required",
      flowToken: "operator-challenge-flow-with-enough-length",
      expiresIn: 300,
      methods: [{ kind: "authenticator_app", label: "Authenticator", methodId: "totp-method-id" }],
    });
    vi.spyOn(authApi, "completeAuthenticatorAppChallenge").mockResolvedValue(issuedSession());
    const user = userEvent.setup();
    await renderSignIn();
    await enterCredentials(user);
    await user.type(await screen.findByLabelText("Verification code"), "654321");
    await user.click(screen.getByRole("button", { name: "Verify and continue" }));

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeVisible();
    expect(window.localStorage.getItem("arclayer:platform:session")).toContain(
      "operator-platform-token",
    );
  });

  it("maps API failures to explicit localized recovery copy", async () => {
    vi.spyOn(authApi, "signInToPlatform").mockRejectedValue(
      new authApi.PlatformAuthApiError("PLATFORM_ACCESS_REQUIRED", 403),
    );
    const user = userEvent.setup();
    await renderSignIn();
    await enterCredentials(user);

    expect(
      await screen.findByText("This account cannot access the Platform Console"),
    ).toBeVisible();
    expect(screen.getByText(/contact the Instance Owner/)).toBeVisible();
    await waitFor(() => {
      expect(window.localStorage.getItem("arclayer:platform:session")).toBeNull();
    });
  });
});
