import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PlatformMfaMethodReadinessOut,
  PlatformMfaWebAuthnRegistrationOut,
  PlatformTotpSetup,
  PlatformWebAuthnRegistrationCredential,
} from "@arclayer/platform-openapi";

import {
  beginCurrentPlatformTotpMethod,
  beginCurrentPlatformWebauthnMethod,
  completeCurrentPlatformWebauthnMethod,
  confirmCurrentPlatformTotpMethod,
  removeCurrentPlatformMfaMethod,
} from "@/access/access-api";
import {
  AddAuthenticatorAppDialog,
  AddSecurityKeyDialog,
  RemoveMfaMethodDialog,
} from "@/access/platform-mfa-dialogs";
import { verifyPlatformAction } from "@/access/platform-step-up";
import { createPlatformSecurityKey } from "@/auth/webauthn";
import { initializePlatformI18n, i18n } from "@/lib/i18n";

vi.mock("@/access/access-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/access/access-api")>();
  return {
    ...actual,
    beginCurrentPlatformTotpMethod: vi.fn(),
    beginCurrentPlatformWebauthnMethod: vi.fn(),
    completeCurrentPlatformWebauthnMethod: vi.fn(),
    confirmCurrentPlatformTotpMethod: vi.fn(),
    removeCurrentPlatformMfaMethod: vi.fn(),
  };
});
vi.mock("@/access/platform-step-up", () => ({ verifyPlatformAction: vi.fn() }));
vi.mock("@/auth/webauthn", () => ({ createPlatformSecurityKey: vi.fn() }));

const userId = "user-1";
const setup: PlatformTotpSetup = {
  accountLabel: "Arclayer Platform",
  issuer: "Arclayer",
  methodId: "totp-method-1",
  secret: "JBSWY3DPEHPK3PXP",
  state: "pending_verification",
};
const registration: PlatformMfaWebAuthnRegistrationOut = {
  options: {
    challenge: "challenge",
    challengeId: "challenge-1",
    pubKeyCredParams: [{ alg: -7, type: "public-key" }],
    rp: { id: "platform.test", name: "Arclayer" },
    timeout: 60_000,
    user: { displayName: "Ada Operator", id: userId, name: "ada" },
  },
};
const credential: PlatformWebAuthnRegistrationCredential = {
  id: "credential-1",
  rawId: "credential-1",
  response: { attestationObject: "attestation", clientDataJSON: "client-data" },
  type: "public-key",
};
const method: PlatformMfaMethodReadinessOut = {
  kind: "webauthn",
  label: "Office passkey",
  lastUsedAt: null,
  methodId: "method-1",
  verifiedAt: "2026-08-02T00:00:00.000Z",
};

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en-US");
});

describe("Platform MFA dialogs", () => {
  it("reuses the authenticator setup identity and proof after an unknown result", async () => {
    vi.mocked(verifyPlatformAction).mockResolvedValue("step-up-proof");
    vi.mocked(beginCurrentPlatformTotpMethod)
      .mockRejectedValueOnce(new Error("network result unknown"))
      .mockResolvedValueOnce(setup);
    const user = userEvent.setup();
    render(
      <AddAuthenticatorAppDialog
        open
        onCompleted={vi.fn()}
        onOpenChange={vi.fn()}
        userId={userId}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Verify and start setup" }));
    expect(await screen.findByText("The change could not be completed")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Verify and start setup" }));

    await waitFor(() => expect(beginCurrentPlatformTotpMethod).toHaveBeenCalledTimes(2));
    expect(verifyPlatformAction).toHaveBeenCalledOnce();
    expect(vi.mocked(beginCurrentPlatformTotpMethod).mock.calls[1]).toEqual(
      vi.mocked(beginCurrentPlatformTotpMethod).mock.calls[0],
    );
  });

  it("reuses the authenticator confirmation identity and proof after an unknown result", async () => {
    vi.mocked(verifyPlatformAction).mockResolvedValue("step-up-proof");
    vi.mocked(beginCurrentPlatformTotpMethod).mockResolvedValue(setup);
    vi.mocked(confirmCurrentPlatformTotpMethod)
      .mockRejectedValueOnce(new Error("network result unknown"))
      .mockResolvedValueOnce({
        availableRecoveryCodeCount: 8,
        methods: [],
        ready: true,
        userId,
      });
    const user = userEvent.setup();
    render(
      <AddAuthenticatorAppDialog
        open
        onCompleted={vi.fn()}
        onOpenChange={vi.fn()}
        userId={userId}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Verify and start setup" }));
    await user.type(await screen.findByLabelText("Verification code"), "123 456");
    await user.click(screen.getByRole("button", { name: "Verify and add method" }));
    expect(await screen.findByText("The change could not be completed")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Verify and add method" }));

    await waitFor(() => expect(confirmCurrentPlatformTotpMethod).toHaveBeenCalledTimes(2));
    expect(verifyPlatformAction).toHaveBeenCalledTimes(2);
    expect(vi.mocked(confirmCurrentPlatformTotpMethod).mock.calls[1]).toEqual(
      vi.mocked(confirmCurrentPlatformTotpMethod).mock.calls[0],
    );
  });

  it("reuses the security-key registration identity and proof after an unknown completion", async () => {
    vi.mocked(verifyPlatformAction).mockResolvedValue("step-up-proof");
    vi.mocked(beginCurrentPlatformWebauthnMethod).mockResolvedValue(registration);
    vi.mocked(createPlatformSecurityKey)
      .mockResolvedValueOnce(credential)
      .mockResolvedValueOnce({ ...credential, id: "credential-2", rawId: "credential-2" });
    vi.mocked(completeCurrentPlatformWebauthnMethod)
      .mockRejectedValueOnce(new Error("network result unknown"))
      .mockResolvedValueOnce({
        availableRecoveryCodeCount: 8,
        methods: [],
        ready: true,
        userId,
      });
    const user = userEvent.setup();
    render(
      <AddSecurityKeyDialog open onCompleted={vi.fn()} onOpenChange={vi.fn()} userId={userId} />,
    );

    await user.click(screen.getByRole("button", { name: "Verify and add security key" }));
    expect(
      within(screen.getByRole("dialog")).getByText("The change could not be completed"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Verify and add security key" }));

    await waitFor(() => expect(completeCurrentPlatformWebauthnMethod).toHaveBeenCalledTimes(2));
    expect(verifyPlatformAction).toHaveBeenCalledOnce();
    expect(beginCurrentPlatformWebauthnMethod).toHaveBeenCalledOnce();
    expect(createPlatformSecurityKey).toHaveBeenCalledOnce();
    expect(vi.mocked(completeCurrentPlatformWebauthnMethod).mock.calls[1]).toEqual(
      vi.mocked(completeCurrentPlatformWebauthnMethod).mock.calls[0],
    );
  });

  it("reuses an unknown removal attempt, then clears it after the SDK resolves", async () => {
    vi.mocked(verifyPlatformAction)
      .mockResolvedValueOnce("step-up-proof-1")
      .mockResolvedValueOnce("step-up-proof-2");
    vi.mocked(removeCurrentPlatformMfaMethod)
      .mockRejectedValueOnce(new Error("network result unknown"))
      .mockResolvedValue({
        correlationId: "correlation-1",
        entityId: method.methodId,
        mutation: "remove_platform_mfa_method",
      });
    const user = userEvent.setup();
    render(
      <RemoveMfaMethodDialog
        method={method}
        open
        onCompleted={vi.fn()}
        onOpenChange={vi.fn()}
        userId={userId}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Verify and remove method" }));
    expect(await screen.findByText("The change could not be completed")).toBeVisible();
    const failedRequest = vi.mocked(removeCurrentPlatformMfaMethod).mock.calls[0]?.[1];
    await user.click(screen.getByRole("button", { name: "Verify and remove method" }));
    await waitFor(() => expect(removeCurrentPlatformMfaMethod).toHaveBeenCalledTimes(2));
    expect(verifyPlatformAction).toHaveBeenCalledOnce();
    expect(vi.mocked(removeCurrentPlatformMfaMethod).mock.calls[1]?.[1]).toEqual(failedRequest);

    await user.click(screen.getByRole("button", { name: "Verify and remove method" }));
    await waitFor(() => expect(removeCurrentPlatformMfaMethod).toHaveBeenCalledTimes(3));
    expect(verifyPlatformAction).toHaveBeenCalledTimes(2);
    expect(vi.mocked(removeCurrentPlatformMfaMethod).mock.calls[2]?.[1]).not.toEqual(failedRequest);
  });
});
