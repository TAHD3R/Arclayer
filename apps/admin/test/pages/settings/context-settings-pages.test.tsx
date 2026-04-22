import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ProjectGeneralSettingsPage,
  WorkspaceInvitationsSettingsPage,
  WorkspaceMembersSettingsPage,
  WorkspaceRolesSettingsPage,
} from "@/pages/settings/context-settings-pages";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

vi.mock("@/api/rbac", () => ({
  listWorkspacePermissionActions: vi.fn(async () => [
    {
      code: "system:content:read",
      description: "Read content",
      subjectKinds: ["workspace_member"],
      permissionCodes: ["system:content:read"],
    },
    {
      code: "delivery:graphql:read",
      description: "Read GraphQL delivery",
      subjectKinds: ["delivery_api_key"],
      permissionCodes: [],
    },
  ]),
}));

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
  TeamRolesPage: (props: {
    workspaceIdOverride?: string | null;
    createOpen?: boolean;
    onCreateOpenChange?: (open: boolean) => void;
  }) => (
    <div
      data-testid="team-roles-page"
      data-workspace-id={props.workspaceIdOverride ?? ""}
      data-create-open={String(Boolean(props.createOpen))}
      onClick={() => props.onCreateOpenChange?.(true)}
    />
  ),
}));

vi.mock("@/pages/projects/settings/site/basics/page", () => ({
  GeneralSiteSettingsPage: (props: { projectId: string }) => (
    <div data-testid="general-site-settings-page" data-project-id={props.projectId} />
  ),
}));

vi.mock("@/pages/projects/settings/project/page", () => ({
  ProjectSettingsPage: (props: { activeTab: string; projectId: string }) => (
    <div
      data-testid="project-settings-page"
      data-active-tab={props.activeTab}
      data-project-id={props.projectId}
    />
  ),
}));

vi.mock("@/pages/projects/settings/site/localization/page", () => ({
  GeneralLocalizationSettingsPage: (props: { projectId: string }) => (
    <div data-testid="general-localization-settings-page" data-project-id={props.projectId} />
  ),
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

  it("renders project general settings through the project settings shell with project context", () => {
    renderWithQueryClient(<ProjectGeneralSettingsPage projectId="project-1" />);

    expect(screen.getByTestId("project-settings-page")).toHaveAttribute(
      "data-active-tab",
      "general",
    );
    expect(screen.getByTestId("project-settings-page")).toHaveAttribute(
      "data-project-id",
      "project-1",
    );
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

  it("renders workspace permissions governance view with action catalog and role matrix", async () => {
    renderWithQueryClient(<WorkspaceRolesSettingsPage workspaceId="ws-1" />);

    expect(screen.getByTestId("team-roles-page")).toHaveAttribute("data-workspace-id", "ws-1");
    expect(screen.getByTestId("context-settings-shell-action")).toHaveTextContent(
      "TEAM_ROLES_ADD_ROLE",
    );

    const permissionsView = await screen.findByTestId("workspace-permissions-settings-view");
    expect(
      within(permissionsView).getByText("settings:SETTINGS_WORKSPACE_PERMISSIONS_CATALOG_TITLE"),
    ).toBeInTheDocument();
    expect((await within(permissionsView).findAllByText("system:content:read")).length).toBe(2);
    expect(
      within(permissionsView).getByText("delivery:graphql:read", {
        selector: "div",
      }),
    ).toBeInTheDocument();
  });
});
