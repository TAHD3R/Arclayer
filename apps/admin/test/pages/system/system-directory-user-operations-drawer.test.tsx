import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserOperationsDrawer } from "@/pages/system/directory/users/user-operations-drawer";
import type { SystemDirectoryUser, SystemDirectoryUserDetail } from "@arclayer/openapi/admin-types";

const mocks = vi.hoisted(() => ({
  detailHook: vi.fn(),
  onDelete: vi.fn(),
  onDisableTwoFactor: vi.fn(),
  onEdit: vi.fn(),
  onOpenChange: vi.fn(),
  onResetPassword: vi.fn(),
  onRevokeSessions: vi.fn(),
  onSendResetPasswordEmail: vi.fn(),
  onToggleAccess: vi.fn(),
  onToggleSuperAdmin: vi.fn(),
  onUnlinkOAuth: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

vi.mock("@/components/common/entity-avatar", () => ({
  UserAvatar: ({ name }: { name: string }) => <span>{name}</span>,
  WorkspaceAvatar: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock("@/components/common/project-avatar", () => ({
  ProjectAvatar: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock("@/components/ui/tags", () => ({
  BaseTag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/pages/system/audit-log/audit-event-presenters", () => ({
  auditEventName: (_t: unknown, name: string) => name,
  auditSourceLabel: (_t: unknown, source: string) => source,
}));

vi.mock("@arclayer/ui/drawer", () => ({
  Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DrawerBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/pages/system/directory/hooks", () => ({
  useSystemDirectoryUserDetail: mocks.detailHook,
}));

vi.mock("@/pages/system/directory/system-directory-table", () => ({
  useSystemDirectoryDateTimeFormatter: () => ({
    formatDateTime: (value: string) => `date:${value}`,
  }),
}));

const USER = {
  userId: "user-1",
  username: "philip",
  displayName: "Philip Cole",
  email: "philip@example.com",
  status: "active",
  avatarUrl: null,
  isSuperAdmin: false,
  hasPassword: true,
  twoFactorEnabled: true,
  linkedOauthProviders: ["github"],
  createdAt: "2026-07-01T08:00:00Z",
  lastLoginAt: "2026-07-23T01:00:00Z",
  workspaceMembershipCount: 1,
  projectMembershipCount: 1,
  restrictions: [],
} satisfies SystemDirectoryUser;

const DETAIL = {
  ...USER,
  updatedAt: "2026-07-23T02:00:00Z",
  ownedWorkspaceCount: 1,
  ownedProjectCount: 1,
  workspaceMemberships: [
    {
      workspaceId: "workspace-1",
      workspaceName: "Commerce Workspace",
      status: "active",
      roleCodes: ["owner"],
      isOwner: true,
      joinedAt: "2026-07-01T08:00:00Z",
    },
  ],
  projectMemberships: [
    {
      projectId: "project-1",
      projectName: "Storefront",
      workspaceId: "workspace-1",
      workspaceName: "Commerce Workspace",
      role: "owner",
      joinedAt: "2026-07-01T08:00:00Z",
    },
  ],
  recentAuditActivity: [
    {
      eventId: "audit-1",
      eventName: "user.detail.reviewed",
      occurredAt: "2026-07-23T02:00:00Z",
      source: "api",
      workspaceId: null,
      projectId: null,
    },
  ],
  recentFeedbackActivity: [
    {
      feedbackId: "feedback-1",
      intent: "problem",
      status: "new",
      source: "header",
      message: "The account cannot complete checkout.",
      lastActivityAt: "2026-07-23T02:10:00Z",
    },
  ],
  restrictionHistory: [
    {
      commandId: "command-1",
      restrictionType: "user_disabled",
      state: "lifted",
      reasonCategory: "security_risk",
      reasonCode: "suspicious-login",
      operatorNote: "Identity review completed.",
      actorUserId: "operator-1",
      changedAt: "2026-07-22T08:00:00Z",
      revision: 2,
    },
  ],
} satisfies SystemDirectoryUserDetail;

function renderDrawer() {
  return render(
    <UserOperationsDrawer
      user={USER}
      currentUserId="operator-1"
      onOpenChange={mocks.onOpenChange}
      onEdit={mocks.onEdit}
      onResetPassword={mocks.onResetPassword}
      onSendResetPasswordEmail={mocks.onSendResetPasswordEmail}
      onDisableTwoFactor={mocks.onDisableTwoFactor}
      onUnlinkOAuth={mocks.onUnlinkOAuth}
      onRevokeSessions={mocks.onRevokeSessions}
      onToggleSuperAdmin={mocks.onToggleSuperAdmin}
      onToggleAccess={mocks.onToggleAccess}
      onDelete={mocks.onDelete}
    />,
  );
}

describe("UserOperationsDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.detailHook.mockReturnValue({
      detail: DETAIL,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("loads the selected user and exposes six investigation areas", () => {
    renderDrawer();

    expect(mocks.detailHook).toHaveBeenCalledWith("user-1");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(
      screen.getByRole("tab", { name: "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_OVERVIEW" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_ACCESS" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", {
        name: "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_MEMBERSHIPS",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_ACTIVITY" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", {
        name: "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_RESTRICTIONS",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_ACTIONS" }),
    ).toBeInTheDocument();
  });

  it("shows memberships, audit, feedback, and restriction evidence in their tabs", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(
      screen.getByRole("tab", {
        name: "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_MEMBERSHIPS",
      }),
    );
    expect(screen.getAllByText("Commerce Workspace")).toHaveLength(2);
    expect(screen.getAllByText("Storefront")).toHaveLength(2);

    await user.click(
      screen.getByRole("tab", { name: "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_ACTIVITY" }),
    );
    expect(screen.getByText("user.detail.reviewed")).toBeVisible();
    expect(screen.getByText("The account cannot complete checkout.")).toBeVisible();
    expect(
      screen.getByRole("link", { name: /SETTINGS_SYSTEM_DIRECTORY_DETAILS_VIEW_AUDIT/ }),
    ).toHaveAttribute("href", "/system/audit-log?view=events&actorUserId=user-1");
    expect(
      screen.getByRole("link", { name: /SETTINGS_SYSTEM_DIRECTORY_DETAILS_VIEW_FEEDBACK/ }),
    ).toHaveAttribute("href", "/system/feedback?reporterUserId=user-1");

    await user.click(
      screen.getByRole("tab", {
        name: "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_RESTRICTIONS",
      }),
    );
    expect(screen.getByText("Identity review completed.")).toBeVisible();
    expect(screen.getByText("suspicious-login · r2")).toBeVisible();
  });

  it("closes the drawer before handing governed actions to confirmation flows", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(
      screen.getByRole("tab", { name: "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_ACTIONS" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_EDIT_ACCOUNT",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_ACCOUNT",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_ACCOUNT",
      }),
    );

    expect(mocks.onOpenChange).toHaveBeenCalledTimes(3);
    expect(mocks.onEdit).toHaveBeenCalledWith(USER);
    expect(mocks.onToggleAccess).toHaveBeenCalledWith(USER);
    expect(mocks.onDelete).toHaveBeenCalledWith(USER);
  });
});
