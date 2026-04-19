import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceSettingsBasicsView } from "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-basics-view";

vi.mock("@arclayer/ui/chrome-tabs", () => ({
  ChromeTabs: (props: { children?: ReactNode }) => (
    <div data-testid="chrome-tabs">{props.children}</div>
  ),
}));

vi.mock("@/pages/workspaces/settings/workspace/components/workspace-settings-tabs", () => ({
  WorkspaceSettingsTabs: () => <div data-testid="workspace-settings-tabs" />,
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: (props: { children?: ReactNode; extra?: ReactNode; headerVisibility?: string }) => (
    <div data-testid="default-page" data-header-visibility={props.headerVisibility ?? "auto"}>
      <div data-testid="default-page-extra">{props.extra}</div>
      <div data-testid="default-page-content">{props.children}</div>
    </div>
  ),
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: (props: { children?: ReactNode }) => (
    <div data-testid="content-guard">{props.children}</div>
  ),
}));

vi.mock(
  "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-basics-form",
  () => ({
    WorkspaceSettingsBasicsForm: () => <div data-testid="workspace-settings-basics-form" />,
  }),
);

vi.mock(
  "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-assign-role-dialog",
  () => ({
    WorkspaceSettingsAssignRoleDialog: () => (
      <div data-testid="workspace-settings-assign-role-dialog" />
    ),
  }),
);

vi.mock(
  "@/pages/workspaces/settings/workspace/basics/hooks/use-workspace-settings-basics-controller",
  () => ({
    useWorkspaceSettingsBasicsController: () => ({
      t: (key: string) => key,
      onTabChange: vi.fn(),
      detailQuery: { isError: false, isLoading: false, data: {}, refetch: vi.fn() },
      coreQuery: { isError: false, refetch: vi.fn() },
      rolesQuery: { isError: false, isLoading: false, refetch: vi.fn() },
    }),
  }),
);

describe("WorkspaceSettingsBasicsView", () => {
  it("mounts workspace tabs in the page extra surface and keeps header visibility explicit", () => {
    render(<WorkspaceSettingsBasicsView workspaceId="ws-1" />);

    expect(screen.getByTestId("default-page")).toHaveAttribute("data-header-visibility", "always");
    expect(screen.getByTestId("default-page-extra")).toContainElement(
      screen.getByTestId("workspace-settings-tabs"),
    );
    expect(screen.getByTestId("default-page-content")).toContainElement(
      screen.getByTestId("content-guard"),
    );
  });

  it("does not render a separate danger tab in workspace settings tabs", () => {
    render(<WorkspaceSettingsBasicsView workspaceId="ws-1" />);

    expect(screen.queryByText("settings:SETTINGS_WORKSPACE_TAB_DANGER")).not.toBeInTheDocument();
  });
});
