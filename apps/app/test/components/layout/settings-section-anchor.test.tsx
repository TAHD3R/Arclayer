import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  SettingsScreenProvider,
  SettingsSectionAnchor,
  useSettingsScreen,
} from "@/components/layout/settings-screen-provider";
import { WorkspaceSettingsBasicsView } from "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-basics-view";

vi.mock(
  "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-basics-form",
  () => ({
    WorkspaceSettingsBasicsForm: () => (
      <div>
        <SettingsSectionAnchor section="workspace-icon" data-testid="anchor-workspace-icon">
          icon
        </SettingsSectionAnchor>
        <SettingsSectionAnchor section="workspace-access" data-testid="anchor-workspace-access">
          access
        </SettingsSectionAnchor>
        <SettingsSectionAnchor section="workspace-danger" data-testid="anchor-workspace-danger">
          danger
        </SettingsSectionAnchor>
      </div>
    ),
  }),
);

vi.mock(
  "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-assign-role-dialog",
  () => ({
    WorkspaceSettingsAssignRoleDialog: () => null,
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

function FocusWorkspaceDangerButton() {
  const settings = useSettingsScreen();

  return (
    <button
      type="button"
      onClick={() =>
        settings.openSettings({
          screen: "workspace.general",
          section: "workspace-danger",
        })
      }
    >
      Focus workspace danger
    </button>
  );
}

describe("SettingsSectionAnchor", () => {
  it("flashes the target section mounted inside workspace settings surfaces", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <SettingsScreenProvider>
        <FocusWorkspaceDangerButton />
        <WorkspaceSettingsBasicsView workspaceId="ws-1" embedded />
      </SettingsScreenProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Focus workspace danger" }));

    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.getByTestId("anchor-workspace-danger")).toHaveClass("settings-section-flash");
    expect(document.activeElement).toBe(screen.getByTestId("anchor-workspace-danger"));
  });
});
