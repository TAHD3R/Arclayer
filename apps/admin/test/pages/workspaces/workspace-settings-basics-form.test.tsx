import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceSettingsBasicsForm } from "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-basics-form";

vi.mock("@arclayer/ui/form", () => ({
  Form: (props: { children?: ReactNode }) => <div>{props.children}</div>,
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

function createController() {
  return {
    form: {},
    onTabChange: vi.fn(),
  } as unknown as React.ComponentProps<typeof WorkspaceSettingsBasicsForm>["controller"];
}

describe("WorkspaceSettingsBasicsForm", () => {
  it("shows the access panel for every workspace", () => {
    render(<WorkspaceSettingsBasicsForm controller={createController()} />);

    expect(screen.getByTestId("workspace-settings-core-panels")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-settings-access-panel")).toBeInTheDocument();
  });
});
