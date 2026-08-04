import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import {
  getCurrentMfaReadiness,
  getCurrentPlatformActorProfile,
  getCurrentPlatformTeamIdentity,
  getCurrentSessions,
  getSignInSettings,
  listPlatformPermissions,
  listPlatformRoles,
  PlatformAccessApiError,
  revokeCurrentPlatformSession,
  revokeOtherCurrentPlatformSessions,
  updateSignInPolicy,
  updateSignInProvider,
  updateCurrentPlatformActorProfile,
} from "@/access/access-api";
import { verifyPlatformAction } from "@/access/platform-step-up";
import { PlatformAccountSettings } from "@/account/platform-account-settings";
import { initializePlatformI18n, i18n } from "@/lib/i18n";
import { PlatformPreferencesProvider } from "@/lib/preferences";
import { PlatformRolesPage } from "@/pages/access-roles";
import { PlatformSignInSettingsPage } from "@/pages/access-sign-in";

vi.mock("@/access/access-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/access/access-api")>();
  return {
    ...actual,
    getCurrentMfaReadiness: vi.fn(),
    getCurrentPlatformActorProfile: vi.fn(),
    getCurrentPlatformTeamIdentity: vi.fn(),
    getCurrentSessions: vi.fn(),
    getSignInSettings: vi.fn(),
    listPlatformPermissions: vi.fn(),
    listPlatformRoles: vi.fn(),
    revokeCurrentPlatformSession: vi.fn(),
    revokeOtherCurrentPlatformSessions: vi.fn(),
    updateSignInPolicy: vi.fn(),
    updateSignInProvider: vi.fn(),
    updateCurrentPlatformActorProfile: vi.fn(),
  };
});
vi.mock("@/access/platform-step-up", () => ({ verifyPlatformAction: vi.fn() }));
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function platformSession(sessionId: string, deviceLabel: string, isCurrent: boolean) {
  return {
    absoluteExpiresAt: "2099-08-03T01:00:00.000Z",
    actorUserId: "user-1",
    assurance: "mfa",
    createdAt: "2026-08-01T01:00:00.000Z",
    deviceLabel,
    inactivityExpiresAt: "2099-08-02T05:00:00.000Z",
    isCurrent,
    policyRevision: 1,
    recentActivityAt: "2026-08-02T01:00:00.000Z",
    sessionId,
  };
}

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en-US");
  vi.mocked(getCurrentPlatformTeamIdentity).mockResolvedValue({
    delegablePermissions: [],
    effectivePermissions: [],
    isInstanceOwner: true,
    operatorId: null,
    operatorRevision: null,
    operatorStatus: null,
    userId: "user-1",
  });
  vi.mocked(getCurrentPlatformActorProfile).mockResolvedValue({
    avatarUrl: null,
    displayName: "Platform administrator",
    email: "operator@example.test",
    username: "operator",
  });
  vi.mocked(getCurrentSessions).mockResolvedValue([]);
  vi.mocked(getSignInSettings).mockResolvedValue(signInSettings());
  vi.mocked(getCurrentMfaReadiness).mockResolvedValue({
    availableRecoveryCodeCount: null,
    methods: [
      {
        kind: "webauthn",
        label: "Office passkey",
        lastUsedAt: "2026-08-02T01:00:00.000Z",
        methodId: "method-1",
        verifiedAt: "2026-08-01T01:00:00.000Z",
      },
    ],
    ready: true,
    userId: "user-1",
  });
  vi.mocked(verifyPlatformAction).mockResolvedValue("step-up-proof");
  vi.mocked(updateSignInPolicy).mockResolvedValue(signInSettings());
  vi.mocked(updateSignInProvider).mockResolvedValue(signInSettings());
  vi.mocked(updateCurrentPlatformActorProfile).mockResolvedValue({
    avatarUrl: null,
    displayName: "Platform administrator",
    email: "operator@example.test",
    username: "operator",
  });
});

afterEach(() => {
  cleanup();
});

describe("Platform Access & Security pages", () => {
  it("renders the server-owned role and permission catalog without a deferred-workflow notice", async () => {
    vi.mocked(listPlatformRoles).mockResolvedValue([
      {
        code: "access-security-operator",
        description: null,
        descriptionI18N: "platform.role.access_security_operator.description",
        kind: "built_in",
        name: "access-security-operator",
        nameI18N: "platform.role.access_security_operator.name",
        permissionCodes: ["platform:access-team:read"],
        revisionId: "role-revision-1",
        revisionSequence: 1,
        roleId: "role-1",
      },
    ]);
    vi.mocked(listPlatformPermissions).mockResolvedValue([
      {
        catalogRevision: 1,
        code: "platform:access-team:read",
        descriptionI18N: "Review the Platform team.",
        isDelegable: true,
        nameI18N: "Review Platform team",
        ownerDomain: "access",
      },
    ]);

    render(<PlatformRolesPage />);

    expect(await screen.findByText("Access & Security Manager")).toBeVisible();
    expect(screen.getByText("access-security-operator")).toBeVisible();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Permission catalog" }));
    expect(screen.getByText("View the Platform team")).toBeVisible();
    expect(
      screen.queryByText(/until their reviewed workflow is available/i),
    ).not.toBeInTheDocument();
  });

  it("keeps deployment policy and OAuth configuration on the sign-in page", async () => {
    const user = userEvent.setup();
    render(<PlatformSignInSettingsPage />);

    expect(await screen.findByRole("checkbox", { name: "Public registration" })).toBeEnabled();
    const heading = screen.getByRole("heading", { name: "Sign-in & verification" });
    const pageHeader = heading.closest("header");
    expect(pageHeader).not.toBeNull();
    expect(within(pageHeader!).getByRole("button", { name: "Save changes" })).toBeVisible();
    expect(
      document.querySelector("#platform-sign-in-policy-form button[type='submit']"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "OAuth sign-in" }));
    expect(screen.getByRole("button", { name: "Edit sign-in service" })).toBeVisible();

    expect(
      screen.queryByRole("tab", { name: "Multi-factor verification" }),
    ).not.toBeInTheDocument();
  });

  it("moves current-account MFA management into account settings", async () => {
    const user = userEvent.setup();
    renderAccountSettings();

    await user.click(await screen.findByRole("button", { name: "Security" }));
    expect(screen.getByRole("button", { name: "Add authenticator app" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add security key or passkey" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Replace" })).toBeVisible();
  });

  it("edits the current Platform account profile and exposes guarded account deletion", async () => {
    const user = userEvent.setup();
    renderAccountSettings();

    const displayName = await screen.findByLabelText("Display name");
    await user.clear(displayName);
    await user.type(displayName, "Security administrator");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(updateCurrentPlatformActorProfile).toHaveBeenCalledWith({
        displayName: "Security administrator",
      }),
    );
    expect(screen.getByRole("link", { name: /Review deletion requirements/ })).toHaveAttribute(
      "href",
      expect.stringContaining("settings=personal.profile&section=danger"),
    );
  });

  it("updates the sign-in and registration policy with action-bound verification", async () => {
    vi.mocked(updateSignInPolicy).mockResolvedValueOnce({
      ...signInSettings(),
      registration: {
        ...signInSettings().registration,
        emailDomainsAllowlist: ["example.org", "example.net"],
        publicRegistrationEnabled: true,
      },
      revision: 8,
    });
    const user = userEvent.setup();
    render(<PlatformSignInSettingsPage />);

    await user.click(await screen.findByRole("checkbox", { name: "Public registration" }));
    await user.clear(screen.getByLabelText("Allowed email domains"));
    await user.type(screen.getByLabelText("Allowed email domains"), " example.org\nexample.net ");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateSignInPolicy).toHaveBeenCalledOnce());
    expect(verifyPlatformAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionCode: "platform.access.change_sign_in_settings",
        expectedRevision: 7,
        scope: { operation: "update_policy" },
      }),
    );
    expect(updateSignInPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        emailDomainsAllowlist: ["example.org", "example.net"],
        expectedRevision: 7,
        publicRegistrationEnabled: true,
        stepUpProof: "step-up-proof",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Sign-in and registration settings were saved.");
    expect(getSignInSettings).toHaveBeenCalledOnce();
  });

  it("does not misreport a step-up policy error as a settings revision conflict", async () => {
    vi.mocked(updateSignInPolicy).mockRejectedValueOnce(
      new PlatformAccessApiError("PLATFORM_STEP_UP_POLICY_UNAVAILABLE", 409),
    );
    const user = userEvent.setup();
    render(<PlatformSignInSettingsPage />);

    await user.click(await screen.findByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("The change could not be completed", {
        description:
          "This deployment's security verification policy is not ready. No settings were changed. Complete the deployment update and try again.",
      }),
    );
    expect(toast.error).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        description:
          "The settings changed while you were editing. Refresh the page and review them again.",
      }),
    );
  });

  it("edits an OAuth provider without returning the existing write-only secret", async () => {
    vi.mocked(updateSignInProvider).mockResolvedValueOnce({
      ...signInSettings(),
      providers: [{ ...signInSettings().providers[0]!, clientId: "new-client-id" }],
      revision: 8,
    });
    const user = userEvent.setup();
    render(<PlatformSignInSettingsPage />);

    await user.click(await screen.findByRole("tab", { name: "OAuth sign-in" }));
    await user.click(screen.getByRole("button", { name: "Edit sign-in service" }));
    const dialog = screen.getByRole("dialog");
    await user.clear(within(dialog).getByLabelText("Client ID"));
    await user.type(within(dialog).getByLabelText("Client ID"), "new-client-id");
    await user.click(within(dialog).getByRole("button", { name: "Verify and save" }));

    await waitFor(() => expect(updateSignInProvider).toHaveBeenCalledOnce());
    expect(updateSignInProvider).toHaveBeenCalledWith(
      "google",
      expect.objectContaining({
        clientId: "new-client-id",
        clientSecret: null,
        clearClientSecret: false,
        enabled: true,
        expectedRevision: 7,
        stepUpProof: "step-up-proof",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "The OAuth sign-in service configuration was saved.",
    );
    expect(await screen.findByText("new-client-id")).toBeVisible();
    expect(getSignInSettings).toHaveBeenCalledOnce();
  });

  it("renders the authenticated actor's device sessions without a deferred-workflow notice", async () => {
    vi.mocked(getCurrentMfaReadiness).mockResolvedValue({
      availableRecoveryCodeCount: null,
      methods: [],
      ready: false,
      userId: "user-1",
    });
    vi.mocked(getCurrentSessions).mockResolvedValue([
      {
        absoluteExpiresAt: "2099-08-03T01:00:00.000Z",
        actorUserId: "user-1",
        assurance: "mfa",
        createdAt: "2026-08-01T01:00:00.000Z",
        deviceLabel: "MacBook Pro",
        inactivityExpiresAt: "2099-08-02T05:00:00.000Z",
        isCurrent: true,
        policyRevision: 1,
        recentActivityAt: "2026-08-02T01:00:00.000Z",
        sessionId: "session-1",
      },
    ]);

    renderAccountSettings();
    await userEvent.click(await screen.findByRole("button", { name: "Signed-in devices" }));

    expect(await screen.findByText("MacBook Pro")).toBeVisible();
    expect(screen.getByText("This device")).toBeVisible();
    expect(screen.queryByText(/changes are not available/i)).not.toBeInTheDocument();
  });

  it("retries a failed device-session inventory request instead of presenting stale session state", async () => {
    vi.mocked(getCurrentMfaReadiness).mockResolvedValue({
      availableRecoveryCodeCount: null,
      methods: [],
      ready: false,
      userId: "user-1",
    });
    vi.mocked(getCurrentSessions)
      .mockRejectedValueOnce(new Error("session inventory unavailable"))
      .mockResolvedValueOnce([
        {
          absoluteExpiresAt: "2099-08-03T01:00:00.000Z",
          actorUserId: "user-1",
          assurance: "mfa",
          createdAt: "2026-08-01T01:00:00.000Z",
          deviceLabel: "Recovered session inventory",
          inactivityExpiresAt: "2099-08-02T05:00:00.000Z",
          isCurrent: false,
          policyRevision: 1,
          recentActivityAt: "2026-08-02T01:00:00.000Z",
          sessionId: "session-2",
        },
      ]);
    const user = userEvent.setup();

    renderAccountSettings();

    await user.click(await screen.findByRole("button", { name: "Try again" }));
    await user.click(await screen.findByRole("button", { name: "Signed-in devices" }));

    expect(await screen.findByText("Recovered session inventory")).toBeVisible();
    await waitFor(() => expect(getCurrentSessions).toHaveBeenCalledTimes(2));
  });

  it("sorts device history newest first and excludes expired records from active actions", async () => {
    vi.mocked(getCurrentSessions).mockResolvedValue([
      {
        ...platformSession("session-expired", "Expired device", false),
        absoluteExpiresAt: "2026-08-03T01:00:00.000Z",
        inactivityExpiresAt: "2026-08-03T00:30:00.000Z",
        recentActivityAt: "2026-08-03T00:00:00.000Z",
      },
      {
        ...platformSession("session-current", "Current device", true),
        recentActivityAt: "2026-08-04T01:00:00.000Z",
      },
    ]);

    renderAccountSettings();
    await userEvent.click(await screen.findByRole("button", { name: "Signed-in devices" }));

    const current = await screen.findByText("Current device");
    const expired = screen.getByText("Expired device");
    expect(
      current.compareDocumentPosition(expired) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("Expired")).toBeVisible();
    expect(screen.getByRole("button", { name: "Revoke other sessions" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Revoke session" })).not.toBeInTheDocument();
  });

  it("revokes one other device session and refreshes the server-owned inventory", async () => {
    vi.mocked(getCurrentMfaReadiness).mockResolvedValue({
      availableRecoveryCodeCount: null,
      methods: [],
      ready: false,
      userId: "user-1",
    });
    const currentSession = platformSession("session-1", "Current device", true);
    vi.mocked(getCurrentSessions)
      .mockResolvedValueOnce([currentSession, platformSession("session-2", "Other device", false)])
      .mockResolvedValueOnce([currentSession]);
    vi.mocked(revokeCurrentPlatformSession)
      .mockRejectedValueOnce(new PlatformAccessApiError("PLATFORM_SESSION_REVISION_STALE", 409))
      .mockResolvedValueOnce({
        correlationId: "correlation-1",
        entityId: "session-2",
        mutation: "revoke_platform_session",
      });
    const user = userEvent.setup();

    renderAccountSettings();
    await user.click(await screen.findByRole("button", { name: "Signed-in devices" }));

    await user.click(await screen.findByRole("button", { name: "Revoke session" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke session" }),
    );

    expect(await screen.findByText("The device session could not be revoked")).toBeVisible();
    expect(screen.queryByText("PLATFORM_SESSION_REVISION_STALE")).not.toBeInTheDocument();
    const firstRequest = vi.mocked(revokeCurrentPlatformSession).mock.calls[0]?.[1];
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke session" }),
    );

    await waitFor(() =>
      expect(revokeCurrentPlatformSession).toHaveBeenCalledWith(
        "session-2",
        expect.objectContaining({
          correlationId: expect.any(String),
          idempotencyKey: expect.any(String),
        }),
      ),
    );
    expect(vi.mocked(revokeCurrentPlatformSession).mock.calls[1]?.[1]).toEqual(firstRequest);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("The device session was revoked"),
    );
    await waitFor(() => expect(getCurrentSessions).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Current device")).toBeVisible();
    expect(screen.queryByText("Other device")).not.toBeInTheDocument();
  });

  it("revokes the current device and clears only the local Platform Session", async () => {
    vi.mocked(getCurrentMfaReadiness).mockResolvedValue({
      availableRecoveryCodeCount: null,
      methods: [],
      ready: false,
      userId: "user-1",
    });
    vi.mocked(getCurrentSessions).mockResolvedValue([
      platformSession("session-1", "Current device", true),
    ]);
    vi.mocked(revokeCurrentPlatformSession).mockResolvedValue({
      correlationId: "correlation-2",
      entityId: "session-1",
      mutation: "revoke_platform_session",
    });
    window.localStorage.setItem("arclayer:platform:session", "stored-platform-session");
    const user = userEvent.setup();

    renderAccountSettings();
    await user.click(await screen.findByRole("button", { name: "Signed-in devices" }));

    await user.click(await screen.findByRole("button", { name: "Sign out this device" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke session" }),
    );

    await waitFor(() => expect(revokeCurrentPlatformSession).toHaveBeenCalledOnce());
    expect(window.localStorage.getItem("arclayer:platform:session")).toBeNull();
    expect(window.sessionStorage.getItem("arclayer:platform:session-notice")).toBe("revoked");
  });

  it("revokes every other Platform device session while retaining the current device", async () => {
    vi.mocked(getCurrentMfaReadiness).mockResolvedValue({
      availableRecoveryCodeCount: null,
      methods: [],
      ready: false,
      userId: "user-1",
    });
    const currentSession = platformSession("session-1", "Current device", true);
    vi.mocked(getCurrentSessions)
      .mockResolvedValueOnce([currentSession, platformSession("session-2", "Other device", false)])
      .mockResolvedValueOnce([currentSession]);
    vi.mocked(revokeOtherCurrentPlatformSessions).mockResolvedValue({
      correlationId: "correlation-3",
      entityId: "session-1",
      mutation: "revoke_other_platform_sessions",
    });
    const user = userEvent.setup();

    renderAccountSettings();
    await user.click(await screen.findByRole("button", { name: "Signed-in devices" }));

    await user.click(await screen.findByRole("button", { name: "Revoke other sessions" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke session" }),
    );

    await waitFor(() => expect(revokeOtherCurrentPlatformSessions).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("The other device sessions were revoked"),
    );
    expect(await screen.findByText("Current device")).toBeVisible();
    expect(screen.queryByText("Other device")).not.toBeInTheDocument();
  });

  it("declares each canonical Access peer route without changing the generated route tree", async () => {
    const routes = await Promise.all(
      ["roles", "sign-in"].map((name) =>
        readFile(
          path.join(root, `apps/platform/src/routes/_authenticated/access/${name}.tsx`),
          "utf8",
        ),
      ),
    );

    expect(routes[0]).toContain('createFileRoute("/_authenticated/access/roles")');
    expect(routes[1]).toContain('createFileRoute("/_authenticated/access/sign-in")');
    const routeTree = await readFile(path.join(root, "apps/platform/src/routeTree.gen.ts"), "utf8");
    expect(routeTree).not.toContain("/access/mfa");
    expect(routeTree).not.toContain("/access/sessions");
    await expect(
      readFile(path.join(root, "apps/platform/src/routes/_authenticated/access/mfa.tsx"), "utf8"),
    ).rejects.toThrow();
    await expect(
      readFile(
        path.join(root, "apps/platform/src/routes/_authenticated/access/sessions.tsx"),
        "utf8",
      ),
    ).rejects.toThrow();
  });
});

function renderAccountSettings() {
  return render(
    <PlatformPreferencesProvider>
      <PlatformAccountSettings
        onOpenChange={() => undefined}
        onProfileUpdated={() => undefined}
        onSessionEnded={() => undefined}
        open
      />
    </PlatformPreferencesProvider>,
  );
}

function signInSettings() {
  return {
    providers: [
      {
        clientId: "client-id",
        configured: true,
        enabled: true,
        hasClientSecret: true,
        installed: true,
        key: "google",
        label: "Google",
      },
    ],
    provisioning: { autoAcceptEmailInvites: false, autoProvisionEnabled: true },
    registration: {
      emailDomainsAllowlist: ["example.com"],
      publicRegistrationEnabled: false,
      requireEmail: true,
      requireEmailVerification: true,
    },
    revision: 7,
  };
}
