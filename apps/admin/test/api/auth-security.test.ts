import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { api } from "@/lib/http";
import {
  beginLoginTwoFactorWebAuthn,
  beginSecurityActionWebAuthn,
  beginTwoFactorSetup,
  beginTwoFactorWebAuthnRegistration,
  completeLoginTwoFactorWebAuthn,
  completeSecurityActionWebAuthn,
  completeTwoFactorWebAuthnRegistration,
  confirmMyEmailChange,
  confirmRemoveMyPassword,
  confirmTwoFactorSetup,
  disableTwoFactor,
  getMySecurityCapabilities,
  getTwoFactorCapabilities,
  getTwoFactorStatus,
  listTwoFactorWebAuthnCredentials,
  listMySessions,
  logout,
  loginTwoFactor,
  requestRemoveMyPassword,
  regenerateTwoFactorBackupCodes,
  removeTwoFactorWebAuthnCredential,
  revokeMySession,
  revokeOtherSessions,
  setMyPassword,
  verifySecurityActionTotp,
} from "@/api/auth";
import type {
  AuthSessionOut as AuthSessionRow,
  TwoFactorCapabilitiesOut as TwoFactorCapabilities,
  TwoFactorStatusOut as TwoFactorStatus,
} from "@arclayer/openapi";

describe("api/auth security wrappers", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it("exposes auth security types", () => {
    const capabilities: TwoFactorCapabilities = {
      enabled: false,
      canSetup: true,
      setupRequiredReauthMethods: ["password"],
      disableRequiredReauthMethods: [],
      regenerateBackupCodesRequiredReauthMethods: [],
      hasPassword: true,
    };
    const status: TwoFactorStatus = { enabled: true, backupCodesRemaining: 8 };
    const row: AuthSessionRow = {
      sessionId: "session-1",
      issuedAt: "2026-03-06T12:00:00Z",
      lastUsedAt: "2026-03-06T12:05:00Z",
      current: true,
      ipAddress: "203.0.113.8",
      userAgent: "Mozilla/5.0",
      deviceLabel: "Chrome on macOS",
      locationLabel: null,
      authMethod: "password+2fa",
      revocable: false,
    };

    expect(capabilities.canSetup).toBe(true);
    expect(status.backupCodesRemaining).toBe(8);
    expect(row.authMethod).toBe("password+2fa");
  });

  it("posts loginTwoFactor with the generated payload", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ accessToken: "a" });

    await loginTwoFactor({ twoFactorToken: "challenge-1", code: "123456" });

    expect(api.post).toHaveBeenCalledWith(
      "/auth/login/2fa",
      { twoFactorToken: "challenge-1", code: "123456" },
      { auth: { skipRefresh: true } },
    );
  });

  it("posts WebAuthn login begin and complete without refresh interception", async () => {
    const credential = {
      id: "credential-1",
      rawId: "raw-1",
      type: "public-key" as const,
      response: {
        authenticatorData: "authenticator-data",
        clientDataJSON: "client-data",
        signature: "signature",
        userHandle: null,
      },
    };
    vi.mocked(api.post).mockResolvedValue({});

    await beginLoginTwoFactorWebAuthn({ twoFactorToken: "challenge-1" });
    await completeLoginTwoFactorWebAuthn({
      twoFactorToken: "challenge-1",
      challengeId: "webauthn-challenge-1",
      credential,
    });

    expect(api.post).toHaveBeenNthCalledWith(
      1,
      "/auth/login/2fa/webauthn/options",
      { twoFactorToken: "challenge-1" },
      { auth: { skipRefresh: true } },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      "/auth/login/2fa/webauthn/complete",
      {
        twoFactorToken: "challenge-1",
        challengeId: "webauthn-challenge-1",
        credential,
      },
      { auth: { skipRefresh: true } },
    );
  });

  it("gets 2fa status and capabilities", async () => {
    vi.mocked(api.get).mockResolvedValue({ enabled: true });

    await getTwoFactorStatus();
    await getTwoFactorCapabilities();

    expect(api.get).toHaveBeenNthCalledWith(1, "/auth/2fa");
    expect(api.get).toHaveBeenNthCalledWith(2, "/auth/2fa/capabilities");
  });

  it("posts 2fa management endpoints", async () => {
    vi.mocked(api.post)
      .mockResolvedValue({ ok: true })
      .mockResolvedValueOnce({ secret: "secret", otpauthUri: "otpauth://totp/example" })
      .mockResolvedValueOnce({ backupCodes: [] })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ backupCodes: [] })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ revokedCount: 1 });

    await beginTwoFactorSetup({ password: "secret" });
    await confirmTwoFactorSetup({ code: "123456" });
    await disableTwoFactor({ backupCode: "ABCD-1234" });
    await regenerateTwoFactorBackupCodes({ code: "654321" });
    await revokeMySession("session-1");
    await revokeOtherSessions();

    expect(api.post).toHaveBeenNthCalledWith(1, "/auth/2fa/setup", { password: "secret" });
    expect(api.post).toHaveBeenNthCalledWith(2, "/auth/2fa/confirm", { code: "123456" });
    expect(api.post).toHaveBeenNthCalledWith(3, "/auth/2fa/disable", { backupCode: "ABCD-1234" });
    expect(api.post).toHaveBeenNthCalledWith(4, "/auth/2fa/backup-codes/regenerate", {
      code: "654321",
    });
    expect(api.post).toHaveBeenNthCalledWith(5, "/auth/sessions/session-1/revoke");
    expect(api.post).toHaveBeenNthCalledWith(6, "/auth/sessions/revoke-others");
  });

  it("wraps passkey registration, removal, and action verification endpoints", async () => {
    const authenticationCredential = {
      id: "credential-1",
      rawId: "raw-1",
      type: "public-key" as const,
      response: {
        authenticatorData: "authenticator-data",
        clientDataJSON: "client-data",
        signature: "signature",
        userHandle: null,
      },
    };
    const registrationCredential = {
      id: "credential-2",
      rawId: "raw-2",
      type: "public-key" as const,
      response: {
        attestationObject: "attestation-object",
        clientDataJSON: "client-data",
        transports: ["internal"],
      },
    };
    vi.mocked(api.get).mockResolvedValue({ items: [] });
    vi.mocked(api.post).mockResolvedValue({});

    await listTwoFactorWebAuthnCredentials();
    await beginTwoFactorWebAuthnRegistration({ password: "secret" });
    await completeTwoFactorWebAuthnRegistration({
      challengeId: "registration-challenge",
      credential: registrationCredential,
      label: "MacBook",
    });
    await removeTwoFactorWebAuthnCredential("credential/1", { mfaProof: "proof-1" });
    await verifySecurityActionTotp({ action: "change_password", code: "123456" });
    await beginSecurityActionWebAuthn({ action: "delete_my_account" });
    await completeSecurityActionWebAuthn({
      action: "delete_my_account",
      challengeId: "action-challenge",
      credential: authenticationCredential,
    });

    expect(api.get).toHaveBeenCalledWith("/auth/2fa/webauthn");
    expect(api.post).toHaveBeenNthCalledWith(1, "/auth/2fa/webauthn/registration/options", {
      password: "secret",
    });
    expect(api.post).toHaveBeenNthCalledWith(2, "/auth/2fa/webauthn/registration/complete", {
      challengeId: "registration-challenge",
      credential: registrationCredential,
      label: "MacBook",
    });
    expect(api.post).toHaveBeenNthCalledWith(3, "/auth/2fa/webauthn/credential%2F1/remove", {
      mfaProof: "proof-1",
    });
    expect(api.post).toHaveBeenNthCalledWith(4, "/auth/me/security-verification/totp", {
      action: "change_password",
      code: "123456",
    });
    expect(api.post).toHaveBeenNthCalledWith(5, "/auth/me/security-verification/webauthn/options", {
      action: "delete_my_account",
    });
    expect(api.post).toHaveBeenNthCalledWith(
      6,
      "/auth/me/security-verification/webauthn/complete",
      {
        action: "delete_my_account",
        challengeId: "action-challenge",
        credential: authenticationCredential,
      },
    );
  });

  it("posts logout with optional refresh token payload", async () => {
    vi.mocked(api.post).mockResolvedValue(null);

    await logout({ refreshToken: "refresh-1" });
    await logout();

    expect(api.post).toHaveBeenNthCalledWith(1, "/auth/logout", { refreshToken: "refresh-1" });
    expect(api.post).toHaveBeenNthCalledWith(2, "/auth/logout", { refreshToken: undefined });
  });

  it("gets session list", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ items: [], total: 0 });

    await listMySessions();

    expect(api.get).toHaveBeenCalledWith("/auth/sessions");
  });

  it("posts profile security endpoints", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      hasPassword: false,
      twoFactorEnabled: true,
      hasLinkedOauthIdentities: true,
      setPasswordRequiredReauthMethods: ["2fa"],
      emailChangeRequiredReauthMethods: ["2fa"],
    });
    vi.mocked(api.post).mockResolvedValue(null);

    await getMySecurityCapabilities();
    await setMyPassword({ newPassword: "newpass1", mfaProof: "proof" });
    await confirmMyEmailChange({ newEmail: "next@example.com", code: "654321" });
    await requestRemoveMyPassword({ currentPassword: "oldpass1" });
    await confirmRemoveMyPassword({ code: "123456" });

    expect(api.get).toHaveBeenCalledWith("/auth/me/security-capabilities");
    expect(api.post).toHaveBeenNthCalledWith(1, "/auth/me/set-password", {
      newPassword: "newpass1",
      mfaProof: "proof",
    });
    expect(api.post).toHaveBeenNthCalledWith(2, "/auth/me/email/confirm", {
      newEmail: "next@example.com",
      code: "654321",
    });
    expect(api.post).toHaveBeenNthCalledWith(3, "/auth/me/remove-password/request", {
      currentPassword: "oldpass1",
    });
    expect(api.post).toHaveBeenNthCalledWith(4, "/auth/me/remove-password/confirm", {
      code: "123456",
    });
  });
});
