import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceSettingsBasicsCommercePanel } from "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-basics-commerce-panel";

const { accessMock, openSettingsMock } = vi.hoisted(() => ({
  accessMock: vi.fn(),
  openSettingsMock: vi.fn(),
}));

vi.mock("@/hooks/use-workspace-commerce-management-access", () => ({
  useWorkspaceCommerceManagementAccess: (...args: unknown[]) => accessMock(...args),
}));
vi.mock("@/components/layout/settings-screen-provider", () => ({
  useSettingsScreen: () => ({ openSettings: openSettingsMock }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("WorkspaceSettingsBasicsCommercePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMock.mockReturnValue({ managementAccessStatus: "manage" });
  });

  it("deep-links authorized managers to the canonical default member limit", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSettingsBasicsCommercePanel workspaceId="workspace-1" />);

    await user.click(
      screen.getByRole("button", { name: "account:SETTINGS_NAV_WORKSPACE_PLAN_USAGE" }),
    );

    expect(accessMock).toHaveBeenCalledWith("workspace-1");
    expect(openSettingsMock).toHaveBeenCalledWith({
      screen: "workspace.plan-usage",
      section: "default-member-credit-limit",
    });
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("does not expose the Commerce entry to ordinary members", () => {
    accessMock.mockReturnValue({ managementAccessStatus: "view" });

    const { container } = render(
      <WorkspaceSettingsBasicsCommercePanel workspaceId="workspace-1" />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(openSettingsMock).not.toHaveBeenCalled();
  });
});
