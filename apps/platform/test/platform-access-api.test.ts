import {
  platformApplyPlatformCustomRoleRevision,
  platformAssignPlatformOperatorRoles,
  platformGetPlatformInvitationOptions,
  platformInvitePlatformOperator,
  platformPreviewPlatformCustomRoleRevision,
  platformRemoveCurrentPlatformMfaMethod,
  platformRevokeCurrentPlatformSession,
} from "@arclayer/platform-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyPlatformCustomRoleRevision,
  assignPlatformOperatorRoles,
  getPlatformInvitationOptions,
  invitePlatformOperator,
  PlatformAccessApiError,
  previewPlatformCustomRoleRevision,
  removeCurrentPlatformMfaMethod,
  revokeCurrentPlatformSession,
} from "@/access/access-api";
import { platformApiClient } from "@/api/client";

vi.mock("@arclayer/platform-openapi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arclayer/platform-openapi")>();
  return {
    ...actual,
    platformApplyPlatformCustomRoleRevision: vi.fn(),
    platformAssignPlatformOperatorRoles: vi.fn(),
    platformGetPlatformInvitationOptions: vi.fn(),
    platformInvitePlatformOperator: vi.fn(),
    platformPreviewPlatformCustomRoleRevision: vi.fn(),
    platformRemoveCurrentPlatformMfaMethod: vi.fn(),
    platformRevokeCurrentPlatformSession: vi.fn(),
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

  it("assigns additional roles through the revision-bound operator endpoint", async () => {
    const body = {
      correlationId: "correlation-role",
      expectedOperatorRevision: 4,
      idempotencyKey: "idempotency-role",
      roleIds: ["role-2"],
      stepUpProof: "step-up-proof",
    };
    vi.mocked(platformAssignPlatformOperatorRoles).mockResolvedValue({
      data: {
        data: { ...mutationReceipt, entityId: "user-2", mutation: "assign_platform_roles" },
        message: "OK",
        timestamp: 1,
      },
      request: new Request(
        "https://platform.test/platform-api/v1/access/team/operators/user-2/roles",
      ),
      response: new Response(null, { status: 200 }),
    });

    await expect(assignPlatformOperatorRoles("user-2", body)).resolves.toEqual(
      expect.objectContaining({ mutation: "assign_platform_roles" }),
    );
    expect(platformAssignPlatformOperatorRoles).toHaveBeenCalledWith({
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
