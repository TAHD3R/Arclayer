import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OrganizationWorkspacesDialogs } from "@/pages/organization/workspaces/components/organization-workspaces-dialogs";

function renderDialogs() {
  return render(
    <OrganizationWorkspacesDialogs
      t={(key: string) => key}
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

describe("OrganizationWorkspacesDialogs", () => {
  it("does not show the required name error until the field has been interacted with", async () => {
    const user = userEvent.setup();
    renderDialogs();

    expect(screen.queryByText("common:ORG_WORKSPACES_FIELD_NAME_REQUIRED")).not.toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText("common:ORG_WORKSPACES_FIELD_NAME_PLACEHOLDER");
    await user.click(nameInput);
    await user.tab();

    expect(screen.getByText("common:ORG_WORKSPACES_FIELD_NAME_REQUIRED")).toBeInTheDocument();
  });
});
