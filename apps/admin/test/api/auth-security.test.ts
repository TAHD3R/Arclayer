import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { api } from "@/lib/http";
import {
  beginTwoFactorSetup,
  confirmMyEmailChange,
  confirmRemoveMyPassword,
  confirmTwoFactorSetup,
  disableTwoFactor,
  getMySecurityCapabilities,
  getTwoFactorCapabilities,
  getTwoFactorStatus,
  listMySessions,
  logout,
  loginTwoFactor,
  requestRemoveMyPassword,
  regenerateTwoFactorBackupCodes,
  revokeMySession,
  revokeOtherSessions,
  setMyPassword,
} from "@/api/auth";
import type {
  AuthSessionRow,
  TwoFactorCapabilities,
  TwoFactorStatus,
} from "@arclayer/openapi/admin-types";

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

  it("posts loginTwoFactor with snake_case payload", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ access_token: "a" });

    await loginTwoFactor({ twoFactorToken: "challenge-1", code: "123456" });

    expect(api.post).toHaveBeenCalledWith(
      "/auth/login/2fa",
      { two_factor_token: "challenge-1", code: "123456" },
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
    vi.mocked(api.post).mockResolvedValue({ ok: true });

    await beginTwoFactorSetup({ password: "secret" });
    await confirmTwoFactorSetup({ code: "123456" });
    await disableTwoFactor({ backupCode: "ABCD-1234" });
    await regenerateTwoFactorBackupCodes({ code: "654321" });
    await revokeMySession("session-1");
    await revokeOtherSessions();

    expect(api.post).toHaveBeenNthCalledWith(1, "/auth/2fa/setup", { password: "secret" });
    expect(api.post).toHaveBeenNthCalledWith(2, "/auth/2fa/confirm", { code: "123456" });
    expect(api.post).toHaveBeenNthCalledWith(3, "/auth/2fa/disable", { backup_code: "ABCD-1234" });
    expect(api.post).toHaveBeenNthCalledWith(4, "/auth/2fa/backup-codes/regenerate", {
      code: "654321",
    });
    expect(api.post).toHaveBeenNthCalledWith(5, "/auth/sessions/session-1/revoke");
    expect(api.post).toHaveBeenNthCalledWith(6, "/auth/sessions/revoke-others");
  });

  it("posts logout with optional refresh token payload", async () => {
    vi.mocked(api.post).mockResolvedValue(null);

    await logout({ refreshToken: "refresh-1" });
    await logout();

    expect(api.post).toHaveBeenNthCalledWith(1, "/auth/logout", { refresh_token: "refresh-1" });
    expect(api.post).toHaveBeenNthCalledWith(2, "/auth/logout", {});
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
    await setMyPassword({ new_password: "newpass1", code: "123456" });
    await confirmMyEmailChange({ new_email: "next@example.com", code: "654321" });
    await requestRemoveMyPassword({ current_password: "oldpass1" });
    await confirmRemoveMyPassword({ code: "123456" });

    expect(api.get).toHaveBeenCalledWith("/auth/me/security-capabilities");
    expect(api.post).toHaveBeenNthCalledWith(1, "/auth/me/set-password", {
      new_password: "newpass1",
      code: "123456",
    });
    expect(api.post).toHaveBeenNthCalledWith(2, "/auth/me/email/confirm", {
      new_email: "next@example.com",
      code: "654321",
    });
    expect(api.post).toHaveBeenNthCalledWith(3, "/auth/me/remove-password/request", {
      current_password: "oldpass1",
    });
    expect(api.post).toHaveBeenNthCalledWith(4, "/auth/me/remove-password/confirm", {
      code: "123456",
    });
  });
});
