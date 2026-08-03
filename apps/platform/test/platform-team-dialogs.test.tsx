import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PlatformInvitationCandidateOut,
  PlatformInvitationDetailOut,
  PlatformRoleCatalogItemOut,
  PlatformTeamOperatorOut,
} from "@arclayer/platform-openapi";

import {
  assignPlatformOperatorRoles,
  invitePlatformOperator,
  getPlatformInvitationOptions,
  PlatformAccessApiError,
  revokePlatformInvitation,
} from "@/access/access-api";
import {
  AssignOperatorRolesDialog,
  InviteOperatorDialog,
  RevokeInvitationDialog,
} from "@/access/platform-team-dialogs";
import { verifyPlatformAction } from "@/access/platform-step-up";
import { initializePlatformI18n, i18n } from "@/lib/i18n";

vi.mock("@/access/access-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/access/access-api")>();
  return {
    ...actual,
    assignPlatformOperatorRoles: vi.fn(),
    invitePlatformOperator: vi.fn(),
    getPlatformInvitationOptions: vi.fn(),
    revokePlatformInvitation: vi.fn(),
  };
});
vi.mock("@/access/platform-step-up", () => ({ verifyPlatformAction: vi.fn() }));
const person: PlatformInvitationCandidateOut = {
  displayName: "Ada Operator",
  userId: "user-ada",
  username: "ada",
};
const role: PlatformRoleCatalogItemOut = {
  code: "workspace-support",
  description: "Investigate Workspace health and support requests.",
  kind: "custom",
  name: "Workspace support",
  permissionCodes: ["platform:tenant-workspaces:read"],
  revisionId: "role-revision-1",
  revisionSequence: 1,
  roleId: "role-1",
};
const operator: PlatformTeamOperatorOut = {
  activatedAt: "2026-08-01T00:00:00.000Z",
  deactivatedAt: null,
  mfa: { phishingResistantReady: true, verifiedMethodCount: 1 },
  operatorId: "operator-1",
  revision: 3,
  roles: [],
  sessions: { activeSessionCount: 1, mostRecentActivityAt: "2026-08-03T01:00:00.000Z" },
  status: "active",
  user: person,
};
const invitation: PlatformInvitationDetailOut = {
  acceptedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  expiresAt: "2026-08-08T00:00:00.000Z",
  invalidatedAt: null,
  invitationId: "invitation-1",
  inviter: { displayName: "Instance Owner", userId: "owner-1", username: "owner" },
  isEffective: true,
  recipient: person,
  recipientAcceptedAt: null,
  revision: 5,
  revokedAt: null,
  roles: [],
  status: "pending",
};

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en-US");
  vi.mocked(getPlatformInvitationOptions).mockResolvedValue({
    candidates: [person],
    roles: [role],
  });
});

describe("Platform team dialogs", () => {
  it("requires a person and at least one role before inviting", async () => {
    render(<InviteOperatorDialog open onCompleted={vi.fn()} onOpenChange={vi.fn()} />);

    fireEvent.submit(document.querySelector("#invite-platform-operator")!);

    await waitFor(() => {
      expect(screen.getByText("Choose a person and at least one role.")).toBeVisible();
    });
    expect(invitePlatformOperator).not.toHaveBeenCalled();
  });

  it("submits an invitation for the selected account and role", async () => {
    vi.mocked(invitePlatformOperator).mockResolvedValue({
      correlationId: "correlation-1",
      entityId: "invitation-1",
      mutation: "invite_operator",
      replayed: false,
    });
    const onCompleted = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<InviteOperatorDialog open onCompleted={onCompleted} onOpenChange={onOpenChange} />);

    await user.click(await screen.findByRole("combobox", { name: "Person" }));
    await user.click(screen.getByRole("option", { name: "Ada Operator · ada" }));
    await user.click(screen.getByRole("checkbox", { name: /Workspace support/ }));
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    await waitFor(() => expect(invitePlatformOperator).toHaveBeenCalledOnce());
    expect(invitePlatformOperator).toHaveBeenCalledWith({
      correlationId: expect.any(String),
      expiresAt: expect.any(String),
      idempotencyKey: expect.any(String),
      intendedRoles: [
        {
          permissionCodes: role.permissionCodes,
          roleId: role.roleId,
          roleRevisionId: role.revisionId,
        },
      ],
      invitationId: expect.any(String),
      recipientUserId: person.userId,
    });
    expect(onCompleted).toHaveBeenCalledWith("OPERATOR_INVITED");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows permission denial without closing the invitation", async () => {
    vi.mocked(invitePlatformOperator).mockRejectedValue(
      new PlatformAccessApiError("PLATFORM_PERMISSION_DENIED", 403),
    );
    const onCompleted = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<InviteOperatorDialog open onCompleted={onCompleted} onOpenChange={onOpenChange} />);

    await user.click(await screen.findByRole("combobox", { name: "Person" }));
    await user.click(screen.getByRole("option", { name: "Ada Operator · ada" }));
    await user.click(screen.getByRole("checkbox", { name: /Workspace support/ }));
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("You don't have permission to make this change.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(invitePlatformOperator).toHaveBeenCalledTimes(2));
    expect(vi.mocked(invitePlatformOperator).mock.calls[1]).toEqual(
      vi.mocked(invitePlatformOperator).mock.calls[0],
    );
    expect(onCompleted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("reuses the role assignment identity and step-up proof after an unknown result", async () => {
    vi.mocked(verifyPlatformAction).mockResolvedValue("step-up-proof");
    vi.mocked(assignPlatformOperatorRoles)
      .mockRejectedValueOnce(new Error("network result unknown"))
      .mockResolvedValueOnce({
        correlationId: "correlation-1",
        entityId: operator.operatorId,
        mutation: "assign_platform_roles",
        replayed: true,
      });
    const user = userEvent.setup();
    render(
      <AssignOperatorRolesDialog
        open
        onCompleted={vi.fn()}
        onOpenChange={vi.fn()}
        operator={operator}
        roles={[role]}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /Workspace support/ }));
    await user.click(screen.getByRole("button", { name: "Verify and add roles" }));
    expect(await screen.findByText("The change could not be completed")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Verify and add roles" }));

    await waitFor(() => expect(assignPlatformOperatorRoles).toHaveBeenCalledTimes(2));
    expect(verifyPlatformAction).toHaveBeenCalledOnce();
    expect(vi.mocked(assignPlatformOperatorRoles).mock.calls[1]).toEqual(
      vi.mocked(assignPlatformOperatorRoles).mock.calls[0],
    );
  });

  it("reuses the invitation revoke identity after an unknown result", async () => {
    vi.mocked(revokePlatformInvitation)
      .mockRejectedValueOnce(new Error("network result unknown"))
      .mockResolvedValueOnce({
        correlationId: "correlation-2",
        entityId: invitation.invitationId,
        mutation: "revoke_operator_invitation",
        replayed: true,
      });
    const user = userEvent.setup();
    render(
      <RevokeInvitationDialog
        invitation={invitation}
        open
        onCompleted={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Revoke invitation" }));
    expect(await screen.findByText("The change could not be completed")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Revoke invitation" }));

    await waitFor(() => expect(revokePlatformInvitation).toHaveBeenCalledTimes(2));
    expect(vi.mocked(revokePlatformInvitation).mock.calls[1]).toEqual(
      vi.mocked(revokePlatformInvitation).mock.calls[0],
    );
  });
});
