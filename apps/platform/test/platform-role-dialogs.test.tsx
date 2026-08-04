import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PlatformCustomRolePreviewOut,
  PlatformPermissionCatalogItemOut,
  PlatformRoleCatalogItemOut,
} from "@arclayer/platform-openapi";

import {
  applyPlatformCustomRoleRevision,
  copyPlatformCustomRole,
  createPlatformCustomRole,
  previewPlatformCustomRoleRevision,
  retirePlatformCustomRole,
} from "@/access/access-api";
import { CreateRoleDialog, EditRoleDialog, RetireRoleDialog } from "@/access/platform-role-dialogs";
import { verifyPlatformAction } from "@/access/platform-step-up";
import { initializePlatformI18n, i18n } from "@/lib/i18n";

vi.mock("@/access/access-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/access/access-api")>();
  return {
    ...actual,
    applyPlatformCustomRoleRevision: vi.fn(),
    copyPlatformCustomRole: vi.fn(),
    createPlatformCustomRole: vi.fn(),
    previewPlatformCustomRoleRevision: vi.fn(),
    retirePlatformCustomRole: vi.fn(),
  };
});
vi.mock("@/access/platform-step-up", () => ({ verifyPlatformAction: vi.fn() }));

const permission: PlatformPermissionCatalogItemOut = {
  catalogRevision: 1,
  code: "platform:tenant-workspaces:read",
  descriptionI18N: "Review tenant workspaces.",
  isDelegable: true,
  nameI18N: "Review tenant workspaces",
  ownerDomain: "access",
};

const role: PlatformRoleCatalogItemOut = {
  code: "workspace-support",
  description: "Review tenant workspace health.",
  descriptionI18N: null,
  kind: "custom",
  name: "Workspace support",
  nameI18N: null,
  permissionCodes: [permission.code],
  revisionId: "role-revision-1",
  revisionSequence: 1,
  roleId: "role-1",
};

const preview: PlatformCustomRolePreviewOut = {
  actorLosesPermissions: [],
  addedPermissionCodes: [],
  affectedOperatorIds: [],
  expectedRoleRevisionId: role.revisionId,
  invalidatedInvitationCount: 0,
  previewId: "preview-1",
  removedPermissionCodes: [],
  roleId: role.roleId,
};

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en-US");
});

describe("Platform role dialogs", () => {
  it("searches delegable responsibilities and supports select-all and invert for visible results", async () => {
    const projectPermission: PlatformPermissionCatalogItemOut = {
      ...permission,
      code: "platform:tenant-projects:read",
      descriptionI18N: "Review tenant projects.",
      nameI18N: "Review tenant projects",
    };
    const user = userEvent.setup();
    render(
      <CreateRoleDialog
        open
        onCompleted={vi.fn()}
        onOpenChange={vi.fn()}
        permissions={[permission, projectPermission]}
      />,
    );

    await user.type(screen.getByPlaceholderText(/Search responsibilities/), "projects");
    expect(screen.getByText("0 selected · 1 in current results")).toBeVisible();
    expect(screen.queryByText("View tenant workspaces")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Select all results" }));
    expect(screen.getByText("1 selected · 1 in current results")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Invert results" }));
    expect(screen.getByText("0 selected · 1 in current results")).toBeVisible();
  });

  it("reuses the create-role identity and step-up proof after an unknown result", async () => {
    vi.mocked(verifyPlatformAction).mockResolvedValue("step-up-proof");
    vi.mocked(createPlatformCustomRole)
      .mockRejectedValueOnce(new Error("network result unknown"))
      .mockResolvedValueOnce({
        correlationId: "correlation-1",
        entityId: "role-created",
        mutation: "create_custom_role",
        replayed: true,
      });
    const user = userEvent.setup();
    render(
      <CreateRoleDialog
        open
        onCompleted={vi.fn()}
        onOpenChange={vi.fn()}
        permissions={[permission]}
      />,
    );

    await user.type(screen.getByLabelText("Role name"), "Workspace investigator");
    await user.type(screen.getByLabelText("Role identifier"), "workspace-investigator");
    await user.click(screen.getByRole("checkbox", { name: /View tenant workspaces/ }));
    await user.click(screen.getByRole("button", { name: "Verify and create role" }));
    expect(await screen.findByText("The change could not be completed")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Verify and create role" }));

    await waitFor(() => expect(createPlatformCustomRole).toHaveBeenCalledTimes(2));
    expect(verifyPlatformAction).toHaveBeenCalledOnce();
    expect(vi.mocked(createPlatformCustomRole).mock.calls[1]).toEqual(
      vi.mocked(createPlatformCustomRole).mock.calls[0],
    );
  });

  it("reuses the copy-role identity and step-up proof after an unknown result", async () => {
    vi.mocked(verifyPlatformAction).mockResolvedValue("step-up-proof");
    vi.mocked(copyPlatformCustomRole)
      .mockRejectedValueOnce(new Error("network result unknown"))
      .mockResolvedValueOnce({
        correlationId: "correlation-2",
        entityId: "role-copy",
        mutation: "copy_custom_role",
        replayed: true,
      });
    const user = userEvent.setup();
    render(
      <CreateRoleDialog
        open
        onCompleted={vi.fn()}
        onOpenChange={vi.fn()}
        permissions={[permission]}
        sourceRole={role}
      />,
    );

    await user.type(screen.getByLabelText("Role identifier"), "workspace-support-copy");
    await user.click(screen.getByRole("button", { name: "Verify and create role" }));
    expect(await screen.findByText("The change could not be completed")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Verify and create role" }));

    await waitFor(() => expect(copyPlatformCustomRole).toHaveBeenCalledTimes(2));
    expect(verifyPlatformAction).toHaveBeenCalledOnce();
    expect(vi.mocked(copyPlatformCustomRole).mock.calls[1]).toEqual(
      vi.mocked(copyPlatformCustomRole).mock.calls[0],
    );
  });

  it("reuses the revision apply identity and step-up proof after an unknown result", async () => {
    vi.mocked(previewPlatformCustomRoleRevision).mockResolvedValue(preview);
    vi.mocked(verifyPlatformAction).mockResolvedValue("step-up-proof");
    vi.mocked(applyPlatformCustomRoleRevision)
      .mockRejectedValueOnce(new Error("network result unknown"))
      .mockResolvedValueOnce({
        correlationId: "correlation-3",
        entityId: role.roleId,
        mutation: "apply_custom_role_revision",
        replayed: true,
      });
    const user = userEvent.setup();
    render(
      <EditRoleDialog
        open
        onCompleted={vi.fn()}
        onOpenChange={vi.fn()}
        permissions={[permission]}
        role={role}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Review impact" }));
    await user.click(await screen.findByRole("button", { name: "Verify and apply changes" }));
    expect(await screen.findByText("The change could not be completed")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Verify and apply changes" }));

    await waitFor(() => expect(applyPlatformCustomRoleRevision).toHaveBeenCalledTimes(2));
    expect(verifyPlatformAction).toHaveBeenCalledOnce();
    expect(vi.mocked(applyPlatformCustomRoleRevision).mock.calls[1]).toEqual(
      vi.mocked(applyPlatformCustomRoleRevision).mock.calls[0],
    );
  });

  it("starts a new retire attempt when the role revision changes", async () => {
    vi.mocked(verifyPlatformAction)
      .mockResolvedValueOnce("step-up-proof-1")
      .mockResolvedValueOnce("step-up-proof-2");
    vi.mocked(retirePlatformCustomRole).mockRejectedValue(new Error("network result unknown"));
    const user = userEvent.setup();
    const view = render(
      <RetireRoleDialog
        open
        onCompleted={vi.fn()}
        onOpenChange={vi.fn()}
        permissions={[permission]}
        role={role}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Verify and retire role" }));
    expect(await screen.findByText("The change could not be completed")).toBeVisible();
    const firstRequest = vi.mocked(retirePlatformCustomRole).mock.calls[0]?.[1];
    view.rerender(
      <RetireRoleDialog
        open
        onCompleted={vi.fn()}
        onOpenChange={vi.fn()}
        permissions={[permission]}
        role={{ ...role, revisionId: "role-revision-2" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Verify and retire role" }));

    await waitFor(() => expect(retirePlatformCustomRole).toHaveBeenCalledTimes(2));
    expect(verifyPlatformAction).toHaveBeenCalledTimes(2);
    expect(vi.mocked(retirePlatformCustomRole).mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ expectedRoleRevisionId: "role-revision-2" }),
    );
    expect(vi.mocked(retirePlatformCustomRole).mock.calls[1]?.[1]).not.toEqual(firstRequest);
  });

  it("clears a resolved retire attempt before the next command", async () => {
    vi.mocked(verifyPlatformAction)
      .mockResolvedValueOnce("step-up-proof-1")
      .mockResolvedValueOnce("step-up-proof-2");
    vi.mocked(retirePlatformCustomRole).mockResolvedValue({
      correlationId: "correlation-4",
      entityId: role.roleId,
      mutation: "retire_custom_role",
    });
    const user = userEvent.setup();
    render(
      <RetireRoleDialog
        open
        onCompleted={vi.fn()}
        onOpenChange={vi.fn()}
        permissions={[permission]}
        role={role}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Verify and retire role" }));
    await waitFor(() => expect(retirePlatformCustomRole).toHaveBeenCalledOnce());
    const firstRequest = vi.mocked(retirePlatformCustomRole).mock.calls[0]?.[1];
    await user.click(screen.getByRole("button", { name: "Verify and retire role" }));

    await waitFor(() => expect(retirePlatformCustomRole).toHaveBeenCalledTimes(2));
    expect(verifyPlatformAction).toHaveBeenCalledTimes(2);
    expect(vi.mocked(retirePlatformCustomRole).mock.calls[1]?.[1]).not.toEqual(firstRequest);
  });
});
