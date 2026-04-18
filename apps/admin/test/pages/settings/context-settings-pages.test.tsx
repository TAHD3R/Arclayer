import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  ProjectGeneralSettingsPage,
  ProjectMembersSettingsPage,
  WorkspaceMembersSettingsPage,
} from "@/pages/settings/context-settings-pages";

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
    children: ReactNode;
  }) => (
    <div
      data-testid="context-settings-shell"
      data-title={props.title}
      data-description={props.description}
      data-pathname={props.pathname}
    >
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

vi.mock("@/pages/workspaces/settings/site/page", () => ({
  GeneralSettingsPage: (props: {
    activeTab: string;
    workspaceIdOverride?: string | null;
    embedded?: boolean;
  }) => (
    <div
      data-testid="general-settings-page"
      data-active-tab={props.activeTab}
      data-workspace-id={props.workspaceIdOverride ?? ""}
      data-embedded={String(Boolean(props.embedded))}
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
      "SETTINGS_WORKSPACE_TITLE",
    );
    expect(screen.getByTestId("team-members-view")).toHaveAttribute("data-workspace-id", "ws-1");
    expect(screen.getByTestId("team-members-view")).toHaveAttribute("data-query", "alice");
    expect(screen.getByTestId("team-members-view")).toHaveAttribute("data-member-id", "member-1");
  });

  it("renders project general settings through the project shell with embedded general settings", () => {
    renderWithQueryClient(<ProjectGeneralSettingsPage />);

    expect(screen.getByTestId("context-settings-shell")).toHaveAttribute(
      "data-title",
      "account:SETTINGS_PROJECT_TITLE",
    );
    expect(screen.getByTestId("general-settings-page")).toHaveAttribute(
      "data-active-tab",
      "basics",
    );
    expect(screen.getByTestId("general-settings-page")).toHaveAttribute("data-workspace-id", "");
    expect(screen.getByTestId("general-settings-page")).toHaveAttribute("data-embedded", "true");
  });

  it("renders project members settings with member data", async () => {
    renderWithQueryClient(<ProjectMembersSettingsPage projectId="project-1" />);

    expect(screen.getByTestId("context-settings-shell")).toHaveAttribute(
      "data-title",
      "account:SETTINGS_PROJECT_TITLE",
    );
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
  });
});
