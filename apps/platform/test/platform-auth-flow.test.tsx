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

vi.mock("@/components/platform-aurora", () => ({
  PlatformAurora: () => <div data-testid="platform-aurora" />,
}));

function issuedSession(recoveryCodes?: Array<string>): PlatformSessionIssuedOut {
  return {
    state: "authenticated",
    credential: {
      accessToken: "operator-platform-token",
      expiresIn: 600,
      session: {
        absoluteExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        actorId: "1jz6k6rWQdK2nZk3fD3d1Q",
        isInstanceOwner: false,
        operatorId: "AAAAAAAAAAAAAAAAAAAAAA",
        policyRevision: 1,
        sessionId: "LqVpBuzAEzGFbgyzVOS4rA",
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
  await user.type(screen.getByLabelText("Email or username"), "operator@example.com");
  await user.type(screen.getByLabelText("Password"), "correct-password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
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
  it("renders the Shadcn login-05 shell for Arclayer Admin", async () => {
    await renderSignIn();

    const main = screen.getByRole("main");
    expect(main).toHaveClass("min-h-svh", "grid");
    expect(screen.getByTestId("platform-login-background")).toBeVisible();
    expect(screen.getByTestId("platform-aurora")).toBeVisible();
    expect(screen.getByRole("banner")).toContainElement(
      screen.getByRole("img", { name: "Arclayer" }),
    );
    expect(screen.getByRole("contentinfo")).toContainElement(
      screen.getByRole("button", { name: "Change language" }),
    );
    expect(document.querySelector('[data-slot="platform-login-form"]')?.parentElement).toHaveClass(
      "w-full",
      "max-w-sm",
    );
    expect(document.querySelector('[data-slot="field-group"]')).toBeVisible();
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(screen.getByText("Structured content, visually built.")).toBeVisible();
    expect(screen.getByRole("img", { name: "Arclayer" })).toHaveAttribute("src", "/logo-full.svg");
    expect(screen.queryByText("Authorized administrators only")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Sign-ins and configuration changes are audited/),
    ).not.toBeInTheDocument();
  });

  it("supports password visibility, language, and color mode controls", async () => {
    const user = userEvent.setup();
    await renderSignIn();

    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("placeholder", "Enter your password");
    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Theme" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("img", { name: "Arclayer" })).toHaveAttribute(
      "src",
      "/logo-full-dark.svg",
    );

    await user.click(screen.getByRole("button", { name: "Change language" }));
    expect(await screen.findByRole("heading", { name: "欢迎回来" })).toBeVisible();
    expect(screen.getByText("结构化内容，可视化构建。")).toBeVisible();
  });

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

    expect((await screen.findAllByText("Password accepted")).length).toBeGreaterThan(0);
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
    const openAdmin = screen.getByRole("button", { name: "Open Arclayer Admin" });
    expect(openAdmin).toBeDisabled();
    await user.click(screen.getByLabelText("I saved these recovery codes in a secure place."));
    expect(openAdmin).toBeEnabled();
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
      await screen.findByText("This account does not have administrator access"),
    ).toBeVisible();
    expect(screen.getByText(/ask the Instance Owner for access/)).toBeVisible();
    await waitFor(() => {
      expect(window.localStorage.getItem("arclayer:platform:session")).toBeNull();
    });
  });
});
