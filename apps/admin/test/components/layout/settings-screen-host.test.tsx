import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SettingsScreenProvider,
  useSettingsScreen,
} from "@/components/layout/settings-screen-provider";
import { SettingsScreenHost } from "@/components/layout/usercenter-overlay-host";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { SettingsScreen } from "@/lib/settings/settings-screen";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/pages/usercenter/profile/components/user-profile-view", () => ({
  UserProfileView: () => <div data-testid="overlay-profile-view">profile</div>,
}));

vi.mock("@/pages/usercenter/appearance/components/user-appearance-view", () => ({
  UserAppearanceView: () => <div data-testid="overlay-appearance-view">appearance</div>,
}));

vi.mock("@/pages/usercenter/notifications/components/user-notification-settings-view", () => ({
  UserNotificationSettingsView: () => (
    <div data-testid="overlay-notifications-view">notifications</div>
  ),
}));

vi.mock(
  "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-basics-view",
  () => ({
    WorkspaceSettingsBasicsView: ({ workspaceId }: { workspaceId: string }) => (
      <div data-testid="overlay-workspace-general-view">{workspaceId}</div>
    ),
  }),
);

vi.mock("@/pages/workspaces/team/members/components/team-members-view", () => ({
  TeamMembersView: ({
    workspaceIdOverride,
    inviteOpen,
  }: {
    workspaceIdOverride: string;
    inviteOpen?: boolean;
  }) => (
    <>
      <div data-testid="overlay-workspace-members-view">{workspaceIdOverride}</div>
      <div data-testid="overlay-workspace-members-invite-state">{String(Boolean(inviteOpen))}</div>
    </>
  ),
}));

vi.mock("@/pages/workspaces/team/invitations/page", () => ({
  TeamInvitationsPage: ({
    workspaceIdOverride,
    inviteLinkOpen,
    inviteEmailOpen,
  }: {
    workspaceIdOverride: string;
    inviteLinkOpen?: boolean;
    inviteEmailOpen?: boolean;
  }) => (
    <>
      <div data-testid="overlay-workspace-invitations-view">{workspaceIdOverride}</div>
      <div data-testid="overlay-workspace-invitations-link-state">
        {String(Boolean(inviteLinkOpen))}
      </div>
      <div data-testid="overlay-workspace-invitations-email-state">
        {String(Boolean(inviteEmailOpen))}
      </div>
    </>
  ),
}));

vi.mock("@/pages/workspaces/team/roles/page", () => ({
  TeamRolesPage: ({
    workspaceIdOverride,
    createOpen,
  }: {
    workspaceIdOverride: string;
    createOpen?: boolean;
  }) => (
    <>
      <div data-testid="overlay-workspace-roles-view">{workspaceIdOverride}</div>
      <div data-testid="overlay-workspace-roles-create-state">{String(Boolean(createOpen))}</div>
    </>
  ),
}));

function OpenSettingsButton(props: { screen: SettingsScreen }) {
  const settings = useSettingsScreen();
  return (
    <button type="button" onClick={() => settings.openSettings({ screen: props.screen })}>
      Open settings
    </button>
  );
}

async function renderSettingsHost(initialScreen: SettingsScreen = "personal.profile") {
  const user = userEvent.setup();
  render(
    <SettingsScreenProvider>
      <OpenSettingsButton screen={initialScreen} />
      <SettingsScreenHost />
    </SettingsScreenProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Open settings" }));
  return user;
}

describe("SettingsScreenHost", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      currentWorkspaceId: "ws-alpha",
      currentProjectId: "project-alpha",
      lastWorkspaceId: "ws-alpha",
      lastProjectId: "project-alpha",
    });
  });

  it("renders the shared settings frame inside the overlay chrome", async () => {
    await renderSettingsHost();

    await waitFor(() => {
      expect(
        screen.getByRole("navigation", { name: "account:SETTINGS_SHELL_TITLE" }),
      ).toBeVisible();
    });

    const closeButton = screen.getByRole("button", { name: "Close" });
    const overlayContent = screen.getByTestId("settings-shell-frame");
    const nav = screen.getByRole("navigation", { name: "account:SETTINGS_SHELL_TITLE" });

    expect(overlayContent).toHaveClass(
      "h-full",
      "w-full",
      "max-w-none",
      "rounded-none",
      "border-0",
      "shadow-none",
    );
    expect(nav).toBeVisible();
    expect(closeButton).toHaveAttribute("data-variant", "ghost");
    expect(closeButton).toHaveAttribute("data-size", "icon-sm");
    expect(closeButton).toHaveClass("shrink-0");
    expect(screen.getByRole("button", { name: "account:ACCOUNT_NAV_PROFILE" })).toBeVisible();
    expect(screen.getByRole("button", { name: "account:ACCOUNT_NAV_APPEARANCE" })).toBeVisible();
    expect(screen.getByRole("button", { name: "account:ACCOUNT_NAV_NOTIFICATIONS" })).toBeVisible();
    expect(screen.getByText("account:SETTINGS_NAV_SECTION_PERSONAL")).toBeVisible();
    expect(screen.getByText("account:SETTINGS_NAV_SECTION_WORKSPACE")).toBeVisible();
    expect(screen.getByText("account:SETTINGS_NAV_WORKSPACE_GENERAL")).toBeVisible();
    expect(screen.getByText("account:ME_TAB_PROFILE")).toBeVisible();
    expect(screen.getByText("account:ME_TAB_PROFILE_DESC")).toBeVisible();
    expect(screen.getByTestId("overlay-profile-view")).toBeVisible();
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("bg-background/80");
  });

  it("switches screens inside the same provider-driven overlay", async () => {
    const user = await renderSettingsHost();

    await user.click(screen.getByRole("button", { name: "account:ACCOUNT_NAV_NOTIFICATIONS" }));

    await waitFor(() => {
      expect(screen.getByText("account:ME_TAB_NOTIFICATIONS")).toBeVisible();
      expect(screen.getByTestId("overlay-notifications-view")).toBeVisible();
    });

    await user.click(
      screen.getByRole("button", { name: "account:SETTINGS_NAV_WORKSPACE_MEMBERS" }),
    );

    await waitFor(() => {
      expect(screen.getByText("settings:SETTINGS_WORKSPACE_MEMBERS_TITLE")).toBeVisible();
      expect(screen.getByTestId("overlay-workspace-members-view")).toHaveTextContent("ws-alpha");
    });
  });

  it("shows the workspace members primary action in the overlay header and controls invite state", async () => {
    const user = await renderSettingsHost("workspace.members");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "TEAM_INVITE_MEMBER" })).toBeVisible();
    });
    expect(screen.getByTestId("overlay-workspace-members-invite-state")).toHaveTextContent("false");

    await user.click(screen.getByRole("button", { name: "TEAM_INVITE_MEMBER" }));

    expect(screen.getByTestId("overlay-workspace-members-invite-state")).toHaveTextContent("true");
  });

  it("shows the workspace invitations header actions in the overlay and controls both dialogs", async () => {
    const user = await renderSettingsHost("workspace.invitations");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "TEAM_INVITE_CREATE_LINK_ACTION" })).toBeVisible();
      expect(screen.getByRole("button", { name: "common:ORG_MEMBERS_INVITE" })).toBeVisible();
    });
    expect(screen.getByTestId("overlay-workspace-invitations-link-state")).toHaveTextContent(
      "false",
    );
    expect(screen.getByTestId("overlay-workspace-invitations-email-state")).toHaveTextContent(
      "false",
    );

    await user.click(screen.getByRole("button", { name: "TEAM_INVITE_CREATE_LINK_ACTION" }));
    expect(screen.getByTestId("overlay-workspace-invitations-link-state")).toHaveTextContent(
      "true",
    );

    await user.click(screen.getByRole("button", { name: "common:ORG_MEMBERS_INVITE" }));
    expect(screen.getByTestId("overlay-workspace-invitations-email-state")).toHaveTextContent(
      "true",
    );
  });

  it("shows the workspace roles header action in the overlay and controls create state", async () => {
    const user = await renderSettingsHost("workspace.roles");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "TEAM_ROLES_ADD_ROLE" })).toBeVisible();
    });
    expect(screen.getByTestId("overlay-workspace-roles-create-state")).toHaveTextContent("false");

    await user.click(screen.getByRole("button", { name: "TEAM_ROLES_ADD_ROLE" }));

    expect(screen.getByTestId("overlay-workspace-roles-create-state")).toHaveTextContent("true");
  });

  it("mounts a dedicated internal scroll region for overlay content", async () => {
    await renderSettingsHost();

    expect(screen.getByTestId("settings-shell-scroll-region")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
    );
  });

  it("closes through provider state without router navigation", async () => {
    const user = await renderSettingsHost();

    await user.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByTestId("settings-shell-frame")).toBeNull();
    });
  });

  it("keeps the host mounted so expandable-screen can run exit animation", async () => {
    const user = await renderSettingsHost();

    await waitFor(() => {
      expect(screen.getByTestId("settings-shell-frame")).toBeVisible();
    });
    expect(document.body.dataset.expandableScreen).toBe("open");

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(document.body.dataset.expandableScreen).toBe("closed");
    await waitFor(() => {
      expect(screen.queryByTestId("settings-shell-frame")).toBeNull();
    });
  });
});
