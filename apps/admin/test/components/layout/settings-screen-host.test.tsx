import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SettingsScreenProvider,
  useSettingsScreen,
} from "@/components/layout/settings-screen-provider";
import { SettingsScreenHost } from "@/components/layout/usercenter-overlay-host";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { SettingsScreen } from "@/lib/settings/settings-screen";
import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";

const commerceMocks = vi.hoisted(() => ({
  getWorkspaceCommerceOverview: vi.fn(),
}));
const identityMocks = vi.hoisted(() => ({
  profile: null as null | {
    displayName?: string | null;
    username?: string | null;
    email: string;
    avatarUrl?: string | null;
    avatarAssetId?: string | null;
  },
  listMyWorkspaces: vi.fn(),
}));

vi.mock("@/api/commerce", () => ({
  getWorkspaceCommerceOverview: commerceMocks.getWorkspaceCommerceOverview,
}));

vi.mock("@/api/workspaces", () => ({
  listMyWorkspaces: identityMocks.listMyWorkspaces,
}));

vi.mock("@/hooks/use-current-user-profile", () => ({
  useCurrentUserProfile: () => ({ profile: identityMocks.profile }),
}));

vi.mock("@/components/common/entity-avatar", () => ({
  UserAvatar: (props: { name: string; assetRef?: string | null }) => (
    <span
      data-testid="settings-profile-avatar"
      data-name={props.name}
      data-asset-ref={props.assetRef}
    />
  ),
  WorkspaceAvatar: (props: { name: string; assetRef?: string | null }) => (
    <span
      data-testid="settings-workspace-avatar"
      data-name={props.name}
      data-asset-ref={props.assetRef}
    />
  ),
  workspaceAvatarPropsFromIdentity: (workspace: { iconUrl?: string | null }) => ({
    assetRef: workspace.iconUrl,
  }),
}));

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

vi.mock("@/pages/workspaces/settings/workspace/plan-usage/plan-usage-view", () => ({
  WorkspacePlanUsageView: ({ workspaceId }: { workspaceId: string }) => (
    <div data-testid="overlay-workspace-plan-usage-view">{workspaceId}</div>
  ),
}));

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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ChromeTabsProvider
        labels={{ scrollLeftAriaLabel: "Scroll left", scrollRightAriaLabel: "Scroll right" }}
        userReducedMotion
      >
        <SettingsScreenProvider>
          <OpenSettingsButton screen={initialScreen} />
          <SettingsScreenHost />
        </SettingsScreenProvider>
      </ChromeTabsProvider>
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Open settings" }));
  return user;
}

describe("SettingsScreenHost", () => {
  beforeEach(() => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    vi.clearAllMocks();
    commerceMocks.getWorkspaceCommerceOverview.mockResolvedValue({
      planRevision: {
        entitlements: [{ key: "workspace.roles.manage", isIncluded: true }],
      },
    });
    identityMocks.profile = null;
    identityMocks.listMyWorkspaces.mockResolvedValue({ items: [] });
    useWorkspaceStore.setState({
      currentWorkspaceId: "ws-alpha",
      currentProjectId: "project-alpha",
      lastWorkspaceId: "ws-alpha",
      lastProjectId: "project-alpha",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    const routeFrame = document.querySelector('[data-slot="admin-route-frame"]');
    const spacer = document.querySelector('[data-slot="page-shell-top-spacer"]');
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
    expect(closeButton.parentElement).toHaveClass("absolute", "z-30");
    expect(routeFrame).toHaveClass(
      "lg:[--admin-route-gutter-x:clamp(2.5rem,calc(15.85365854vw_-_122.439024px),9rem)]",
    );
    expect(spacer).toHaveAttribute("data-preset", "settings-dialog");
    expect(spacer?.firstElementChild).toHaveClass(
      "lg:pb-[clamp(20px,calc(10.36585366vw_-_86.146341px),88px)]",
    );
    expect(screen.getByRole("button", { name: "account:ACCOUNT_NAV_PROFILE" })).toBeVisible();
    expect(screen.getByRole("button", { name: "account:ACCOUNT_NAV_APPEARANCE" })).toBeVisible();
    expect(screen.getByRole("button", { name: "account:ACCOUNT_NAV_NOTIFICATIONS" })).toBeVisible();
    expect(screen.getByText("account:SETTINGS_NAV_SECTION_PERSONAL")).toBeVisible();
    expect(screen.getByText("account:SETTINGS_NAV_SECTION_WORKSPACE")).toBeVisible();
    expect(screen.getByText("account:SETTINGS_NAV_WORKSPACE_GENERAL")).toBeVisible();
    expect(screen.getByText("account:SETTINGS_NAV_WORKSPACE_PEOPLE")).toBeVisible();
    expect(screen.getByText("account:ME_TAB_PROFILE")).toBeVisible();
    expect(screen.getByText("account:ME_TAB_PROFILE_DESC")).toBeVisible();
    expect(screen.getByTestId("overlay-profile-view")).toBeVisible();
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("bg-background/80");
  });

  it("uses the current user and workspace identities for the primary navigation items", async () => {
    identityMocks.profile = {
      displayName: "Philip Cole",
      username: "philip",
      email: "philip@example.com",
      avatarAssetId: "asset-user-1",
    };
    identityMocks.listMyWorkspaces.mockResolvedValue({
      items: [
        {
          id: "ws-alpha",
          workspaceId: "ws-alpha",
          name: "Arclayer Studio",
          iconUrl: "https://assets.example.com/workspace.png",
        },
      ],
    });

    await renderSettingsHost();

    const profileItem = await screen.findByRole("button", { name: "Philip Cole" });
    const workspaceItem = await screen.findByRole("button", { name: "Arclayer Studio" });
    expect(within(profileItem).getByTestId("settings-profile-avatar")).toHaveAttribute(
      "data-asset-ref",
      "asset-user-1",
    );
    expect(within(workspaceItem).getByTestId("settings-workspace-avatar")).toHaveAttribute(
      "data-asset-ref",
      "https://assets.example.com/workspace.png",
    );
  });

  it("switches screens inside the same provider-driven overlay", async () => {
    const user = await renderSettingsHost();

    await user.click(screen.getByRole("button", { name: "account:ACCOUNT_NAV_NOTIFICATIONS" }));

    await waitFor(() => {
      expect(screen.getByText("account:ME_TAB_NOTIFICATIONS")).toBeVisible();
      expect(screen.getByTestId("overlay-notifications-view")).toBeVisible();
    });

    await user.click(screen.getByRole("button", { name: "account:SETTINGS_NAV_WORKSPACE_PEOPLE" }));

    await waitFor(() => {
      expect(screen.getByText("settings:SETTINGS_WORKSPACE_PEOPLE_TITLE")).toBeVisible();
      expect(screen.getByTestId("overlay-workspace-members-view")).toHaveTextContent("ws-alpha");
    });
  });

  it("keeps workspace settings reachable from the narrow navigation sheet by keyboard", async () => {
    const user = await renderSettingsHost();
    const navigationAction = screen.getByRole("button", {
      name: "SETTINGS_SHELL_NAVIGATION_ACTION",
    });

    expect(navigationAction.parentElement).toHaveClass("lg:hidden");
    navigationAction.focus();
    await user.keyboard("{Enter}");

    const dialog = screen.getByRole("dialog", { name: "SETTINGS_SHELL_TITLE" });
    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "account:SETTINGS_NAV_WORKSPACE_GENERAL" }),
      ).toBeVisible();
      expect(
        within(dialog).getByRole("button", { name: "account:SETTINGS_NAV_WORKSPACE_PLAN_USAGE" }),
      ).toBeVisible();
      expect(
        within(dialog).getByRole("button", { name: "account:SETTINGS_NAV_WORKSPACE_PEOPLE" }),
      ).toBeVisible();
      expect(
        within(dialog).getByRole("button", { name: "account:SETTINGS_NAV_WORKSPACE_ROLES" }),
      ).toBeVisible();
    });
    await user.click(
      within(dialog).getByRole("button", { name: "account:SETTINGS_NAV_WORKSPACE_PLAN_USAGE" }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("overlay-workspace-plan-usage-view")).toHaveTextContent("ws-alpha");
    });
    await waitFor(() => {
      expect(dialog).toHaveAttribute("data-state", "closed");
    });
  });

  it("keeps the roles plan gate in the narrow navigation sheet", async () => {
    commerceMocks.getWorkspaceCommerceOverview.mockResolvedValue({
      planRevision: { entitlements: [] },
    });
    const user = await renderSettingsHost();
    const navigationAction = screen.getByRole("button", {
      name: "SETTINGS_SHELL_NAVIGATION_ACTION",
    });

    navigationAction.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "SETTINGS_SHELL_TITLE" });
    await user.click(
      within(dialog).getByRole("button", { name: /account:SETTINGS_NAV_WORKSPACE_ROLES/ }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("workspace-roles-plan-gate")).toBeVisible();
    });
    expect(screen.getByText("workspaceAccess:ROLES_PAID_FEATURE_TITLE")).toBeVisible();
    expect(screen.getByText("workspaceAccess:ROLES_PAID_FEATURE_DESCRIPTION")).toBeVisible();
    expect(screen.getByText("errors:WORKSPACE_ROLE_MANAGEMENT_PLAN_REQUIRED")).toBeVisible();
    expect(
      within(screen.getByTestId("workspace-roles-plan-gate")).getByText(
        "account:SETTINGS_NAV_WORKSPACE_PLAN_USAGE",
      ),
    ).toBeVisible();
    expect(screen.queryByTestId("overlay-workspace-roles-view")).toBeNull();
  });

  it("keeps People, pending invitations, and invite links in one actionable surface", async () => {
    const user = await renderSettingsHost("workspace.people");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "team:TEAM_INVITE_MEMBER" })).toBeVisible();
    });
    expect(screen.getByTestId("overlay-workspace-members-invite-state")).toHaveTextContent("false");

    await user.click(screen.getByRole("button", { name: "team:TEAM_INVITE_MEMBER" }));

    expect(screen.getByTestId("overlay-workspace-members-invite-state")).toHaveTextContent("true");
    await user.click(screen.getByRole("tab", { name: "team:TEAM_PEOPLE_TAB_PENDING" }));
    expect(screen.getByTestId("overlay-workspace-invitations-email-state")).toHaveTextContent(
      "true",
    );

    await user.click(screen.getByRole("tab", { name: "team:TEAM_PEOPLE_TAB_LINKS" }));
    await user.click(screen.getByRole("button", { name: "team:TEAM_INVITE_CREATE_LINK_ACTION" }));
    expect(screen.getByTestId("overlay-workspace-invitations-link-state")).toHaveTextContent(
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

  it("does not mount Roles when the server projection omits the feature", async () => {
    commerceMocks.getWorkspaceCommerceOverview.mockResolvedValue({
      planRevision: { entitlements: [] },
    });
    const user = await renderSettingsHost("workspace.roles");

    await waitFor(() => {
      expect(screen.getByTestId("workspace-roles-plan-gate")).toBeVisible();
    });
    expect(screen.queryByTestId("overlay-workspace-roles-view")).toBeNull();
    expect(screen.getByText("workspaceAccess:ROLES_ELIGIBLE_PLAN_BADGE")).toBeInTheDocument();
    expect(screen.getByText("workspaceAccess:ROLES_PAID_FEATURE_TITLE")).toBeVisible();
    expect(screen.getByText("workspaceAccess:ROLES_PAID_FEATURE_DESCRIPTION")).toBeVisible();
    expect(screen.getByText("errors:WORKSPACE_ROLE_MANAGEMENT_PLAN_REQUIRED")).toBeVisible();

    await user.click(
      within(screen.getByTestId("workspace-roles-plan-gate")).getByRole("button", {
        name: "account:SETTINGS_NAV_WORKSPACE_PLAN_USAGE",
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("overlay-workspace-plan-usage-view")).toHaveTextContent("ws-alpha");
    });
  });

  it("surfaces a capability lookup error without mounting Roles", async () => {
    commerceMocks.getWorkspaceCommerceOverview.mockRejectedValue(new Error("projection failed"));
    await renderSettingsHost("workspace.roles");

    await waitFor(() => {
      expect(screen.getByText("workspaceAccess:ROLES_ACCESS_CHECK_FAILED_BADGE")).toBeVisible();
    });
    expect(screen.queryByTestId("overlay-workspace-roles-view")).toBeNull();
    expect(screen.queryByTestId("workspace-roles-plan-gate")).toBeNull();
  });

  it("does not frame missing workspace selection as a Plan upgrade", async () => {
    useWorkspaceStore.setState({
      currentWorkspaceId: null,
      currentProjectId: null,
      lastWorkspaceId: "ws-previous",
      lastProjectId: null,
    });
    await renderSettingsHost("workspace.roles");

    await waitFor(() => {
      expect(screen.getByText("settings:SETTINGS_WORKSPACE_NOT_SELECTED_TITLE")).toBeVisible();
    });
    expect(screen.getByText("settings:SETTINGS_WORKSPACE_NOT_SELECTED_DESC")).toBeVisible();
    expect(screen.queryByTestId("workspace-roles-plan-gate")).toBeNull();
    expect(screen.queryByTestId("overlay-workspace-roles-view")).toBeNull();
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
