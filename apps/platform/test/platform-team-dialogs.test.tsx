import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PlatformInvitationCandidateOut,
  PlatformRoleCatalogItemOut,
} from "@arclayer/platform-openapi";

import {
  invitePlatformOperator,
  getPlatformInvitationOptions,
  PlatformAccessApiError,
} from "@/access/access-api";
import { InviteOperatorDialog } from "@/access/platform-team-dialogs";
import { initializePlatformI18n, i18n } from "@/lib/i18n";

vi.mock("@/access/access-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/access/access-api")>();
  return {
    ...actual,
    invitePlatformOperator: vi.fn(),
    getPlatformInvitationOptions: vi.fn(),
  };
});
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

    expect(
      await screen.findByText("Your current Platform authority does not allow this change."),
    ).toBeVisible();
    expect(onCompleted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
