import {
  platformGetPlatformInvitationOptions,
  platformInvitePlatformOperator,
} from "@arclayer/platform-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPlatformInvitationOptions,
  invitePlatformOperator,
  PlatformAccessApiError,
} from "@/access/access-api";
import { platformApiClient } from "@/api/client";

vi.mock("@arclayer/platform-openapi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@arclayer/platform-openapi")>();
  return {
    ...actual,
    platformGetPlatformInvitationOptions: vi.fn(),
    platformInvitePlatformOperator: vi.fn(),
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
