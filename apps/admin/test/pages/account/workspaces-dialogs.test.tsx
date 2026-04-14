import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UserCenterWorkspacesDialogs } from "@/pages/usercenter/workspaces/components/usercenter-workspaces-dialogs";

const translations: Record<string, string> = {
  "common:ORG_WORKSPACES_CREATE_TEAM": "Create team workspace",
  "common:ORG_WORKSPACES_CREATE_TEAM_DIALOG_DESC":
    "Create a shared workspace for teammates, projects, and client work.",
  "common:ORG_WORKSPACES_FIELD_NAME_PLACEHOLDER": "e.g. Marketing website",
  "common:ORG_WORKSPACES_FIELD_NAME_REQUIRED": "Workspace name is required",
};

function renderDialogs() {
  return render(
    <UserCenterWorkspacesDialogs
      t={(key: string) => translations[key] ?? key}
      createDialog={{
        open: true,
        setOpen: vi.fn(),
        values: { name: "", description: "" },
        setValues: vi.fn(),
        pending: false,
        onSubmit: vi.fn().mockResolvedValue(undefined),
      }}
      archiveDialog={{
        workspace: null,
        setWorkspace: vi.fn(),
        pending: false,
        onConfirm: vi.fn().mockResolvedValue(undefined),
      }}
      deleteDialog={{
        workspace: null,
        setWorkspace: vi.fn(),
        confirmName: "",
        setConfirmName: vi.fn(),
        confirmMatches: false,
        pending: false,
        onConfirm: vi.fn().mockResolvedValue(undefined),
      }}
    />,
  );
}

describe("UserCenterWorkspacesDialogs", () => {
  it("uses team-oriented create copy", () => {
    renderDialogs();

    expect(screen.getByText("Create team workspace")).toBeInTheDocument();
    expect(
      screen.getByText("Create a shared workspace for teammates, projects, and client work."),
    ).toBeInTheDocument();
  });

  it("does not show the required name error until the field has been interacted with", async () => {
    const user = userEvent.setup();
    renderDialogs();

    expect(screen.queryByText("Workspace name is required")).not.toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText("e.g. Marketing website");
    await user.click(nameInput);
    await user.tab();

    expect(screen.getByText("Workspace name is required")).toBeInTheDocument();
  });
});
