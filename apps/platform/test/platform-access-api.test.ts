import {
  platformApplyPlatformCustomRoleRevision,
  platformCompletePlatformStepUpTotp,
  platformDeletePlatformSignInProvider,
  platformGetPlatformSignInSettings,
  platformGetPlatformInvitationOptions,
  platformInvitePlatformOperator,
  platformListPlatformOperatorSessions,
  platformPreviewPlatformCustomRoleRevision,
  platformReplacePlatformOperatorRoles,
  platformRemoveCurrentPlatformMfaMethod,
  platformRevokeCurrentPlatformSession,
  platformRevokePlatformOperatorSession,
  platformResetPlatformOperatorMfa,
  platformUpdatePlatformSignInPolicy,
  platformUpdatePlatformSignInProvider,
} from "@arclayer/platform-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyPlatformCustomRoleRevision,
  completePlatformTotpStepUp,
  deleteSignInProvider,
  getPlatformInvitationOptions,
  getSignInSettings,
  invitePlatformOperator,
  listPlatformOperatorSessions,
  PlatformAccessApiError,
  previewPlatformCustomRoleRevision,
  replacePlatformOperatorRoles,
  removeCurrentPlatformMfaMethod,
  revokeCurrentPlatformSession,
  revokePlatformOperatorSession,
  resetPlatformOperatorMfa,
  updateSignInPolicy,
  updateSignInProvider,
} from "@/access/access-api";
import { platformApiClient } from "@/api/client";

vi.mock("@arclayer/platform-openapi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arclayer/platform-openapi")>();
  return {
    ...actual,
    platformApplyPlatformCustomRoleRevision: vi.fn(),
    platformCompletePlatformStepUpTotp: vi.fn(),
    platformDeletePlatformSignInProvider: vi.fn(),
    platformGetPlatformSignInSettings: vi.fn(),
    platformGetPlatformInvitationOptions: vi.fn(),
    platformInvitePlatformOperator: vi.fn(),
    platformListPlatformOperatorSessions: vi.fn(),
    platformPreviewPlatformCustomRoleRevision: vi.fn(),
    platformReplacePlatformOperatorRoles: vi.fn(),
    platformRemoveCurrentPlatformMfaMethod: vi.fn(),
    platformRevokeCurrentPlatformSession: vi.fn(),
    platformRevokePlatformOperatorSession: vi.fn(),
    platformResetPlatformOperatorMfa: vi.fn(),
    platformUpdatePlatformSignInPolicy: vi.fn(),
    platformUpdatePlatformSignInProvider: vi.fn(),
  };
});
vi.unmock("@/access/access-api");

const mutationReceipt = {
  correlationId: "correlation-1",
  entityId: "operator-1",
  mutation: "invite_operator" as const,
  replayed: false,
};

describe("Platform access mutation API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends operator invitations through the generated Platform SDK", async () => {
    const body = {
      correlationId: "correlation-1",
      expiresAt: "2026-08-08T00:00:00.000Z",
      idempotencyKey: "idempotency-1",
      intendedRoles: [
        {
          permissionCodes: ["platform:tenant-workspaces:read"],
          roleId: "role-1",
          roleRevisionId: "role-revision-1",
        },
      ],
      invitationId: "invitation-1",
      recipientUserId: "user-1",
    };
    vi.mocked(platformInvitePlatformOperator).mockResolvedValue({
      data: { data: mutationReceipt, message: "OK", timestamp: 1 },
      request: new Request("https://platform.test/platform-api/v1/access/team/invitations"),
      response: new Response(null, { status: 200 }),
    });

    await expect(invitePlatformOperator(body)).resolves.toEqual(mutationReceipt);
    expect(platformInvitePlatformOperator).toHaveBeenCalledWith({
      body,
      client: platformApiClient,
    });
  });

  it("loads invitation candidates and assignable roles from the invite-only projection", async () => {
    const options = { candidates: [], roles: [] };
    vi.mocked(platformGetPlatformInvitationOptions).mockResolvedValue({
      data: { data: options, message: "OK", timestamp: 1 },
      request: new Request("https://platform.test/platform-api/v1/access/team/invitation-options"),
      response: new Response(null, { status: 200 }),
    });

    await expect(getPlatformInvitationOptions("ada")).resolves.toEqual(options);
    expect(platformGetPlatformInvitationOptions).toHaveBeenCalledWith({
      client: platformApiClient,
      query: { q: "ada" },
    });
  });

  it("uses generated SDK operations for sign-in policy and provider configuration", async () => {
    const settings = {
      providers: [],
      provisioning: { autoAcceptEmailInvites: false, autoProvisionEnabled: true },
      registration: {
        emailDomainsAllowlist: [],
        publicRegistrationEnabled: false,
        requireEmail: true,
        requireEmailVerification: true,
      },
      revision: 7,
    };
    const response = (url: string) => ({
      data: { data: settings, message: "OK", timestamp: 1 },
      request: new Request(url),
      response: new Response(null, { status: 200 }),
    });
    vi.mocked(platformGetPlatformSignInSettings).mockResolvedValue(
      response("https://platform.test/platform-api/v1/access/sign-in/settings"),
    );

    await expect(getSignInSettings()).resolves.toEqual(settings);
    expect(platformGetPlatformSignInSettings).toHaveBeenCalledWith({ client: platformApiClient });

    const policyBody = {
      autoAcceptEmailInvites: false,
      autoProvisionEnabled: true,
      correlationId: "correlation-policy",
      emailDomainsAllowlist: ["example.com"],
      expectedRevision: 7,
      idempotencyKey: "idempotency-policy",
      publicRegistrationEnabled: false,
      requireEmail: true,
      requireEmailVerification: true,
      stepUpProof: "step-up-proof",
    };
    vi.mocked(platformUpdatePlatformSignInPolicy).mockResolvedValue(
      response("https://platform.test/platform-api/v1/access/sign-in/settings/policy"),
    );
    await expect(updateSignInPolicy(policyBody)).resolves.toEqual(settings);
    expect(platformUpdatePlatformSignInPolicy).toHaveBeenCalledWith({
      body: policyBody,
      client: platformApiClient,
    });

    const providerBody = {
      clearClientSecret: false,
      clientId: "client-id",
      clientSecret: "client-secret",
      correlationId: "correlation-provider",
      enabled: true,
      expectedRevision: 7,
      idempotencyKey: "idempotency-provider",
      stepUpProof: "step-up-proof",
    };
    vi.mocked(platformUpdatePlatformSignInProvider).mockResolvedValue(
      response("https://platform.test/platform-api/v1/access/sign-in/settings/providers/google"),
    );
    await expect(updateSignInProvider("google", providerBody)).resolves.toEqual(settings);
    expect(platformUpdatePlatformSignInProvider).toHaveBeenCalledWith({
      body: providerBody,
      client: platformApiClient,
      path: { provider_key: "google" },
    });

    const deleteBody = {
      correlationId: "correlation-delete",
      expectedRevision: 7,
      idempotencyKey: "idempotency-delete",
      stepUpProof: "step-up-proof",
    };
    vi.mocked(platformDeletePlatformSignInProvider).mockResolvedValue(
      response("https://platform.test/platform-api/v1/access/sign-in/settings/providers/google"),
    );
    await expect(deleteSignInProvider("google", deleteBody)).resolves.toEqual(settings);
    expect(platformDeletePlatformSignInProvider).toHaveBeenCalledWith({
      body: deleteBody,
      client: platformApiClient,
      path: { provider_key: "google" },
    });
  });

  it("preserves a nested API error code instead of collapsing every 409 response", async () => {
    vi.mocked(platformUpdatePlatformSignInPolicy).mockResolvedValue({
      data: undefined,
      error: {
        detail: {
          error: "PLATFORM_STEP_UP_POLICY_UNAVAILABLE",
        },
      } as never,
      request: new Request("https://platform.test/platform-api/v1/access/sign-in/settings/policy"),
      response: new Response(null, { status: 409 }),
    });

    await expect(
      updateSignInPolicy({
        autoAcceptEmailInvites: false,
        autoProvisionEnabled: true,
        correlationId: "correlation-policy",
        emailDomainsAllowlist: [],
        expectedRevision: 7,
        idempotencyKey: "idempotency-policy",
        publicRegistrationEnabled: false,
        requireEmail: true,
        requireEmailVerification: true,
        stepUpProof: "step-up-proof",
      }),
    ).rejects.toMatchObject({
      message: "PLATFORM_STEP_UP_POLICY_UNAVAILABLE",
      status: 409,
    });
  });

  it("completes authenticator-app step-up through the generated SDK", async () => {
    const body = {
      actionCode: "platform.access.manage_current_mfa",
      actorUserId: "actor-1",
      code: "123456",
      idempotencyKey: "step-up-1",
      methodId: "totp-1",
      scope: { operation: "webauthn_enrollment", replace_method_id: null },
      sessionId: "session-1",
      targetId: "actor-1",
      targetType: "platform_mfa_actor",
    };
    const proof = {
      assurance: "local_mfa" as const,
      expiresAt: "2026-08-04T12:00:00.000Z",
      policyRevision: 1,
      proof: "proof-1",
      proofId: "proof-id-1",
    };
    vi.mocked(platformCompletePlatformStepUpTotp).mockResolvedValue({
      data: { data: proof, message: "OK", timestamp: 1 },
      request: new Request(
        "https://platform.test/platform-api/v1/access/step-up/authenticator-app/complete",
      ),
      response: new Response(null, { status: 200 }),
    });

    await expect(completePlatformTotpStepUp(body)).resolves.toEqual(proof);
    expect(platformCompletePlatformStepUpTotp).toHaveBeenCalledWith({
      body,
      client: platformApiClient,
    });
  });

  it("replaces the complete role set through the revision-bound operator endpoint", async () => {
    const body = {
      correlationId: "correlation-role",
      expectedOperatorRevision: 4,
      idempotencyKey: "idempotency-role",
      roleIds: ["role-1", "role-2"],
      stepUpProof: "step-up-proof",
    };
    vi.mocked(platformReplacePlatformOperatorRoles).mockResolvedValue({
      data: {
        data: { ...mutationReceipt, entityId: "user-2", mutation: "replace_platform_roles" },
        message: "OK",
        timestamp: 1,
      },
      request: new Request(
        "https://platform.test/platform-api/v1/access/team/operators/user-2/roles",
      ),
      response: new Response(null, { status: 200 }),
    });

    await expect(replacePlatformOperatorRoles("user-2", body)).resolves.toEqual(
      expect.objectContaining({ mutation: "replace_platform_roles" }),
    );
    expect(platformReplacePlatformOperatorRoles).toHaveBeenCalledWith({
      body,
      client: platformApiClient,
      path: { target_user_id: "user-2" },
    });
  });

  it("previews and applies a custom-role revision through generated SDK operations", async () => {
    const previewBody = {
      description: "Can manage tenant users.",
      expectedRoleRevisionId: "role-revision-1",
      name: "User manager",
      permissionCodes: ["platform:tenant-users:manage"],
    };
    const preview = {
      actorLosesPermissions: [],
      addedPermissionCodes: ["platform:tenant-users:manage"],
      affectedOperatorIds: ["operator-1"],
      expectedRoleRevisionId: "role-revision-1",
      invalidatedInvitationCount: 0,
      previewId: "preview-1",
      removedPermissionCodes: [],
      roleId: "role-1",
    };
    vi.mocked(platformPreviewPlatformCustomRoleRevision).mockResolvedValue({
      data: { data: preview, message: "OK", timestamp: 1 },
      request: new Request("https://platform.test/platform-api/v1/access/roles/role-1/preview"),
      response: new Response(null, { status: 200 }),
    });

    await expect(previewPlatformCustomRoleRevision("role-1", previewBody)).resolves.toEqual(
      preview,
    );
    expect(platformPreviewPlatformCustomRoleRevision).toHaveBeenCalledWith({
      body: previewBody,
      client: platformApiClient,
      path: { role_id: "role-1" },
    });

    const applyBody = {
      correlationId: "correlation-apply",
      expectedRoleRevisionId: "role-revision-1",
      idempotencyKey: "idempotency-apply",
      previewId: "preview-1",
      stepUpProof: "step-up-proof",
    };
    vi.mocked(platformApplyPlatformCustomRoleRevision).mockResolvedValue({
      data: {
        data: { ...mutationReceipt, entityId: "role-1", mutation: "apply_custom_role_revision" },
        message: "OK",
        timestamp: 1,
      },
      request: new Request("https://platform.test/platform-api/v1/access/roles/custom/apply"),
      response: new Response(null, { status: 200 }),
    });

    await expect(applyPlatformCustomRoleRevision(applyBody)).resolves.toEqual(
      expect.objectContaining({ mutation: "apply_custom_role_revision" }),
    );
    expect(platformApplyPlatformCustomRoleRevision).toHaveBeenCalledWith({
      body: applyBody,
      client: platformApiClient,
    });
  });

  it("removes an MFA method only through the action-bound Platform endpoint", async () => {
    const body = {
      correlationId: "correlation-mfa",
      idempotencyKey: "idempotency-mfa",
      stepUpProof: "step-up-proof",
    };
    vi.mocked(platformRemoveCurrentPlatformMfaMethod).mockResolvedValue({
      data: {
        data: { ...mutationReceipt, entityId: "method-1", mutation: "remove_platform_mfa_method" },
        message: "OK",
        timestamp: 1,
      },
      request: new Request(
        "https://platform.test/platform-api/v1/access/mfa/methods/method-1/remove",
      ),
      response: new Response(null, { status: 200 }),
    });

    await expect(removeCurrentPlatformMfaMethod("method-1", body)).resolves.toEqual(
      expect.objectContaining({ mutation: "remove_platform_mfa_method" }),
    );
    expect(platformRemoveCurrentPlatformMfaMethod).toHaveBeenCalledWith({
      body,
      client: platformApiClient,
      path: { method_id: "method-1" },
    });
  });

  it("forwards the opaque Platform Session id unchanged when revoking a device", async () => {
    const sessionId = "LqVpBuzAEzGFbgyzVOS4rA";
    const body = {
      correlationId: "correlation-session",
      idempotencyKey: "idempotency-session",
    };
    vi.mocked(platformRevokeCurrentPlatformSession).mockResolvedValue({
      data: {
        data: { ...mutationReceipt, entityId: sessionId, mutation: "revoke_platform_session" },
        message: "OK",
        timestamp: 1,
      },
      request: new Request(
        `https://platform.test/platform-api/v1/access/sessions/me/${sessionId}/revoke`,
      ),
      response: new Response(null, { status: 200 }),
    });

    await expect(revokeCurrentPlatformSession(sessionId, body)).resolves.toEqual(
      expect.objectContaining({ entityId: sessionId, mutation: "revoke_platform_session" }),
    );
    expect(platformRevokeCurrentPlatformSession).toHaveBeenCalledWith({
      body,
      client: platformApiClient,
      path: { session_id: sessionId },
    });
  });

  it("uses generated operator security endpoints for sessions and MFA recovery", async () => {
    vi.mocked(platformListPlatformOperatorSessions).mockResolvedValue({
      data: { data: [], message: "OK", timestamp: 1 },
      request: new Request(
        "https://platform.test/platform-api/v1/access/team/operators/operator-1/sessions",
      ),
      response: new Response(null, { status: 200 }),
    });
    await expect(listPlatformOperatorSessions("operator-1")).resolves.toEqual([]);
    expect(platformListPlatformOperatorSessions).toHaveBeenCalledWith({
      client: platformApiClient,
      path: { operator_id: "operator-1" },
    });

    const revokeBody = { correlationId: "correlation-revoke", idempotencyKey: "revoke-1" };
    vi.mocked(platformRevokePlatformOperatorSession).mockResolvedValue({
      data: {
        data: {
          ...mutationReceipt,
          entityId: "session-1",
          mutation: "revoke_operator_platform_session",
        },
        message: "OK",
        timestamp: 1,
      },
      request: new Request(
        "https://platform.test/platform-api/v1/access/team/operators/operator-1/sessions/session-1/revoke",
      ),
      response: new Response(null, { status: 200 }),
    });
    await revokePlatformOperatorSession("operator-1", "session-1", revokeBody);
    expect(platformRevokePlatformOperatorSession).toHaveBeenCalledWith({
      body: revokeBody,
      client: platformApiClient,
      path: { operator_id: "operator-1", session_id: "session-1" },
    });

    const resetBody = {
      correlationId: "correlation-reset",
      expectedOperatorRevision: 3,
      idempotencyKey: "reset-1",
      reason: "Lost devices",
      stepUpProof: "step-up-proof",
    };
    vi.mocked(platformResetPlatformOperatorMfa).mockResolvedValue({
      data: {
        data: {
          ...mutationReceipt,
          entityId: "operator-1",
          mutation: "reset_platform_operator_mfa",
        },
        message: "OK",
        timestamp: 1,
      },
      request: new Request(
        "https://platform.test/platform-api/v1/access/team/operators/operator-1/mfa/reset",
      ),
      response: new Response(null, { status: 200 }),
    });
    await resetPlatformOperatorMfa("operator-1", resetBody);
    expect(platformResetPlatformOperatorMfa).toHaveBeenCalledWith({
      body: resetBody,
      client: platformApiClient,
      path: { operator_id: "operator-1" },
    });
  });

  it.each([403, 409])("preserves %s status for the productized recovery state", async (status) => {
    vi.mocked(platformInvitePlatformOperator).mockResolvedValue({
      data: undefined,
      error: { detail: [] },
      request: new Request("https://platform.test/platform-api/v1/access/team/invitations"),
      response: new Response(null, { status }),
    });

    await expect(
      invitePlatformOperator({
        correlationId: "correlation-error",
        expiresAt: "2026-08-08T00:00:00.000Z",
        idempotencyKey: "idempotency-error",
        intendedRoles: [],
        invitationId: "invitation-error",
        recipientUserId: "user-error",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PlatformAccessApiError>>({
        message: "PLATFORM_ACCESS_REQUEST_FAILED",
        status,
      }),
    );
  });
});
