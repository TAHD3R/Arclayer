import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceSettingsBasicsForm } from "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-basics-form";

vi.mock("@arclayer/ui/form", () => ({
  Form: (props: { children?: ReactNode }) => <div>{props.children}</div>,
}));

vi.mock("@arclayer/ui/chrome-tabs", () => ({
  ChromeTabs: (props: { children?: ReactNode }) => <div>{props.children}</div>,
  ChromeTabsContent: (props: { children?: ReactNode }) => <div>{props.children}</div>,
}));

vi.mock("@/pages/workspaces/settings/workspace/components/workspace-settings-tabs", () => ({
  WorkspaceSettingsTabs: () => <div data-testid="workspace-settings-tabs" />,
}));

vi.mock(
  "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-basics-core-panels",
  () => ({
    WorkspaceSettingsBasicsCorePanels: () => <div data-testid="workspace-settings-core-panels" />,
  }),
);

vi.mock(
  "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-basics-access-panel",
  () => ({
    WorkspaceSettingsBasicsAccessPanel: () => <div data-testid="workspace-settings-access-panel" />,
  }),
);

function createController(isTeamWorkspace: boolean) {
  return {
    form: {},
    onTabChange: vi.fn(),
    isTeamWorkspace,
  } as unknown as React.ComponentProps<typeof WorkspaceSettingsBasicsForm>["controller"];
}

describe("WorkspaceSettingsBasicsForm", () => {
  it("hides the access panel for personal workspaces", () => {
    render(<WorkspaceSettingsBasicsForm controller={createController(false)} />);

    expect(screen.getByTestId("workspace-settings-core-panels")).toBeInTheDocument();
    expect(screen.queryByTestId("workspace-settings-access-panel")).not.toBeInTheDocument();
  });

  it("shows the access panel for team workspaces", () => {
    render(<WorkspaceSettingsBasicsForm controller={createController(true)} />);

    expect(screen.getByTestId("workspace-settings-access-panel")).toBeInTheDocument();
  });
});
