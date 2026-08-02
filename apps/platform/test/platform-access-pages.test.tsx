import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCurrentMfaReadiness,
  getCurrentSessions,
  getSignInReadiness,
  listPlatformPermissions,
  listPlatformRoles,
  PlatformAccessApiError,
  revokeCurrentPlatformSession,
  revokeOtherCurrentPlatformSessions,
} from "@/access/access-api";
import { initializePlatformI18n, i18n } from "@/lib/i18n";
import { PlatformMfaPage } from "@/pages/access-mfa";
import { PlatformRolesPage } from "@/pages/access-roles";
import { PlatformSessionsPage } from "@/pages/access-sessions";
import { PlatformSignInReadinessPage } from "@/pages/access-sign-in";

vi.mock("@/access/access-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/access/access-api")>();
  return {
    ...actual,
    getCurrentMfaReadiness: vi.fn(),
    getCurrentSessions: vi.fn(),
    getSignInReadiness: vi.fn(),
    listPlatformPermissions: vi.fn(),
    listPlatformRoles: vi.fn(),
    revokeCurrentPlatformSession: vi.fn(),
    revokeOtherCurrentPlatformSessions: vi.fn(),
  };
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function platformSession(sessionId: string, deviceLabel: string, isCurrent: boolean) {
  return {
    absoluteExpiresAt: "2026-08-03T01:00:00.000Z",
    actorUserId: "user-1",
    assurance: "mfa",
    deviceLabel,
    inactivityExpiresAt: "2026-08-02T05:00:00.000Z",
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
});

afterEach(() => {
  cleanup();
});

describe("Platform Access & Security pages", () => {
  it("renders the server-owned role and permission catalog without a deferred-workflow notice", async () => {
    vi.mocked(listPlatformRoles).mockResolvedValue([
      {
        code: "platform-operator",
        description: "Operate the Platform Console.",
        kind: "built_in",
        name: "Platform operator",
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

    expect(await screen.findByText("Platform operator")).toBeVisible();
    expect(screen.getByText("Review Platform team")).toBeVisible();
    expect(
      screen.queryByText(/until their reviewed workflow is available/i),
    ).not.toBeInTheDocument();
  });

  it("renders registration and provider readiness from the Platform SDK", async () => {
    vi.mocked(getSignInReadiness).mockResolvedValue({
      providers: [
        { configured: true, enabled: true, installed: true, key: "google", label: "Google" },
      ],
      registration: {
        emailDomainsAllowlist: ["example.com"],
        publicRegistrationEnabled: false,
        requireEmail: true,
        requireEmailVerification: true,
      },
    });

    render(<PlatformSignInReadinessPage />);

    expect(await screen.findByText("Google")).toBeVisible();
    expect(screen.getByText("Ready for sign-in")).toBeVisible();
    expect(screen.getByText("example.com")).toBeVisible();
  });

  it("shows only safe local MFA readiness facts and recovery-code availability", async () => {
    vi.mocked(getCurrentMfaReadiness).mockResolvedValue({
      availableRecoveryCodeCount: 6,
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

    render(<PlatformMfaPage />);

    expect(await screen.findByText("Office passkey")).toBeVisible();
    expect(screen.getByText("Security verification is ready")).toBeVisible();
    expect(screen.getByText("6 recovery codes remaining")).toBeVisible();
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
        absoluteExpiresAt: "2026-08-03T01:00:00.000Z",
        actorUserId: "user-1",
        assurance: "mfa",
        deviceLabel: "MacBook Pro",
        inactivityExpiresAt: "2026-08-02T05:00:00.000Z",
        isCurrent: true,
        policyRevision: 1,
        recentActivityAt: "2026-08-02T01:00:00.000Z",
        sessionId: "session-1",
      },
    ]);

    render(<PlatformSessionsPage />);

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
          absoluteExpiresAt: "2026-08-03T01:00:00.000Z",
          actorUserId: "user-1",
          assurance: "mfa",
          deviceLabel: "Recovered session inventory",
          inactivityExpiresAt: "2026-08-02T05:00:00.000Z",
          isCurrent: false,
          policyRevision: 1,
          recentActivityAt: "2026-08-02T01:00:00.000Z",
          sessionId: "session-2",
        },
      ]);
    const user = userEvent.setup();

    render(<PlatformSessionsPage />);

    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Recovered session inventory")).toBeVisible();
    await waitFor(() => expect(getCurrentSessions).toHaveBeenCalledTimes(2));
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

    render(<PlatformSessionsPage />);

    await user.click(await screen.findByRole("button", { name: "Revoke session" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke session" }),
    );

    expect(await screen.findByText("The device session could not be revoked")).toBeVisible();
    expect(screen.getByText("PLATFORM_SESSION_REVISION_STALE")).toBeVisible();
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
    expect(await screen.findByText("The device session was revoked")).toBeVisible();
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

    render(<PlatformSessionsPage />);

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

    render(<PlatformSessionsPage />);

    await user.click(await screen.findByRole("button", { name: "Revoke other sessions" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Revoke session" }),
    );

    await waitFor(() => expect(revokeOtherCurrentPlatformSessions).toHaveBeenCalledOnce());
    expect(await screen.findByText("The other device sessions were revoked")).toBeVisible();
    expect(await screen.findByText("Current device")).toBeVisible();
    expect(screen.queryByText("Other device")).not.toBeInTheDocument();
  });

  it("declares each canonical Access peer route without changing the generated route tree", async () => {
    const routes = await Promise.all(
      ["roles", "sign-in", "mfa", "sessions"].map((name) =>
        readFile(
          path.join(root, `apps/platform/src/routes/_authenticated/access/${name}.tsx`),
          "utf8",
        ),
      ),
    );

    expect(routes[0]).toContain('createFileRoute("/_authenticated/access/roles")');
    expect(routes[1]).toContain('createFileRoute("/_authenticated/access/sign-in")');
    expect(routes[2]).toContain('createFileRoute("/_authenticated/access/mfa")');
    expect(routes[3]).toContain('createFileRoute("/_authenticated/access/sessions")');
  });
});
