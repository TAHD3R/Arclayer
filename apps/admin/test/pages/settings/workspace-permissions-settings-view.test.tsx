import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspacePermissionsSettingsView } from "@/pages/workspaces/settings/workspace/permissions/components/workspace-permissions-settings-view";

const { teamRolesPageMock } = vi.hoisted(() => ({
  teamRolesPageMock: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/pages/workspaces/team/roles/page", () => ({
  TeamRolesPage: (props: Record<string, unknown>) => {
    teamRolesPageMock(props);
    return <div data-testid="team-roles-page" />;
  },
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: (props: { children?: ReactNode; error?: unknown }) => (
    <div data-testid="content-guard" data-error={String(Boolean(props.error))}>
      {props.children}
    </div>
  ),
}));

describe("WorkspacePermissionsSettingsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the workspace permission matrix and embeds the roles surface directly", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <WorkspacePermissionsSettingsView workspaceId="ws-1" createOpen />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("settings:SETTINGS_WORKSPACE_PERMISSIONS_MATRIX_TITLE"),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("team-roles-page")).toBeInTheDocument();
    expect(teamRolesPageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceIdOverride: "ws-1",
        createOpen: true,
        embedded: true,
      }),
    );
  });
});
