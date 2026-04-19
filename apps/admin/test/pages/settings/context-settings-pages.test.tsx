import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ProjectGeneralSettingsPage,
  ProjectMembersSettingsPage,
  WorkspaceInvitationsSettingsPage,
  WorkspaceMembersSettingsPage,
  WorkspaceRolesSettingsPage,
} from "@/pages/settings/context-settings-pages";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: "/settings/workspace/members" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/pages/settings/context-settings-shell", () => ({
  ContextSettingsShell: (props: {
    title: string;
    description: string;
    pathname: string;
    action?: ReactNode;
    children: ReactNode;
  }) => (
    <div
      data-testid="context-settings-shell"
      data-title={props.title}
      data-description={props.description}
      data-pathname={props.pathname}
    >
      <div data-testid="context-settings-shell-action">{props.action}</div>
      {props.children}
    </div>
  ),
}));

vi.mock("@/pages/workspaces/team/members/components/team-members-view", () => ({
  TeamMembersView: (props: {
    workspaceIdOverride?: string | null;
    initialSearchQuery?: string;
    initialInspectMemberId?: string;
  }) => (
    <div
      data-testid="team-members-view"
      data-workspace-id={props.workspaceIdOverride ?? ""}
      data-query={props.initialSearchQuery ?? ""}
      data-member-id={props.initialInspectMemberId ?? ""}
    />
  ),
}));

vi.mock("@/pages/workspaces/team/invitations/page", () => ({
  TeamInvitationsPage: (props: {
    workspaceIdOverride?: string | null;
    inviteLinkOpen?: boolean;
    inviteEmailOpen?: boolean;
  }) => (
    <div
      data-testid="team-invitations-page"
      data-workspace-id={props.workspaceIdOverride ?? ""}
      data-link-open={String(Boolean(props.inviteLinkOpen))}
      data-email-open={String(Boolean(props.inviteEmailOpen))}
    />
  ),
}));

vi.mock("@/pages/workspaces/team/roles/page", () => ({
  TeamRolesPage: (props: { workspaceIdOverride?: string | null; createOpen?: boolean }) => (
    <div
      data-testid="team-roles-page"
      data-workspace-id={props.workspaceIdOverride ?? ""}
      data-create-open={String(Boolean(props.createOpen))}
    />
  ),
}));

vi.mock("@/pages/workspaces/settings/site/basics/page", () => ({
  GeneralSiteSettingsPage: (props: { workspaceId?: string | null }) => (
    <div data-testid="general-site-settings-page" data-workspace-id={props.workspaceId ?? ""} />
  ),
}));

vi.mock("@/pages/workspaces/settings/site/localization/page", () => ({
  GeneralLocalizationSettingsPage: (props: { workspaceId?: string | null }) => (
    <div
      data-testid="general-localization-settings-page"
      data-workspace-id={props.workspaceId ?? ""}
    />
  ),
}));

vi.mock("@/api/project-members", () => ({
  listProjectMembers: vi.fn(async () => ({
    items: [
      {
        id: "membership-1",
        projectId: "project-1",
        workspaceId: "workspace-1",
        userId: "user-1",
        username: "ada",
        email: "ada@example.com",
        displayName: "Ada Lovelace",
        avatarUrl: null,
        userStatus: "active",
        role: "owner",
      },
    ],
    total: 1,
    page: 1,
    size: 20,
    pages: 1,
    next: null,
    prev: null,
  })),
  updateProjectMemberRole: vi.fn(),
}));

describe("context settings pages", () => {
  function renderWithQueryClient(node: ReactNode) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
  }

  beforeEach(() => {
    useWorkspaceStore.setState({
      currentWorkspaceId: "ws-store",
      currentProjectId: "project-store",
      lastWorkspaceId: "ws-store",
    });
  });

  it("renders workspace members under the context shell with the selected workspace context", () => {
    renderWithQueryClient(
      <WorkspaceMembersSettingsPage
        workspaceId="ws-1"
        initialSearchQuery="alice"
        initialInspectMemberId="member-1"
      />,
    );

    expect(screen.getByTestId("context-settings-shell")).toHaveAttribute(
      "data-title",
      "SETTINGS_WORKSPACE_MEMBERS_TITLE",
    );
    expect(screen.getByTestId("team-members-view")).toHaveAttribute("data-workspace-id", "ws-1");
    expect(screen.getByTestId("team-members-view")).toHaveAttribute("data-query", "alice");
    expect(screen.getByTestId("team-members-view")).toHaveAttribute("data-member-id", "member-1");
    expect(screen.getByTestId("context-settings-shell-action")).toHaveTextContent(
      "TEAM_INVITE_MEMBER",
    );
  });

  it("renders project general settings through the site settings page with workspace context from store", () => {
    renderWithQueryClient(<ProjectGeneralSettingsPage />);

    expect(screen.getByTestId("general-site-settings-page")).toHaveAttribute(
      "data-workspace-id",
      "ws-store",
    );
  });

  it("renders project members settings with member data", async () => {
    renderWithQueryClient(<ProjectMembersSettingsPage projectId="project-1" />);

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("renders workspace invitations with both header actions in the context shell", () => {
    renderWithQueryClient(<WorkspaceInvitationsSettingsPage workspaceId="ws-1" />);

    expect(screen.getByTestId("team-invitations-page")).toHaveAttribute(
      "data-workspace-id",
      "ws-1",
    );
    expect(screen.getByTestId("context-settings-shell-action")).toHaveTextContent(
      "TEAM_INVITE_CREATE_LINK_ACTION",
    );
    expect(screen.getByTestId("context-settings-shell-action")).toHaveTextContent(
      "common:ORG_MEMBERS_INVITE",
    );
  });

  it("renders workspace roles with the header action in the context shell", () => {
    renderWithQueryClient(<WorkspaceRolesSettingsPage workspaceId="ws-1" />);

    expect(screen.getByTestId("team-roles-page")).toHaveAttribute("data-workspace-id", "ws-1");
    expect(screen.getByTestId("context-settings-shell-action")).toHaveTextContent(
      "TEAM_ROLES_ADD_ROLE",
    );
  });
});
