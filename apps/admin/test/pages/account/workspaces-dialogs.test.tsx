import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { UserCenterWorkspacesDialogs } from "@/pages/usercenter/workspaces/components/usercenter-workspaces-dialogs";
import type { WorkspaceIconDialogValues } from "@/pages/usercenter/workspaces/hooks/use-workspace-menu-actions";

const translations: Record<string, string> = {
  "common:ORG_WORKSPACES_CREATE_TEAM": "Create team workspace",
  "common:ORG_WORKSPACES_CREATE_TEAM_DIALOG_DESC":
    "Create a shared workspace for teammates, projects, and client work.",
  "common:ORG_WORKSPACES_FIELD_NAME_PLACEHOLDER": "e.g. Marketing website",
  "common:ORG_WORKSPACES_FIELD_NAME_REQUIRED": "Workspace name is required",
  "common:ORG_WORKSPACES_ACTION_CHANGE_ICON": "Change icon",
  "common:ORG_WORKSPACES_ICON_DIALOG_DESC": "Update the workspace icon for {{name}}.",
  "common:ORG_WORKSPACES_ICON_COLOR_TITLE": "Background color",
  "common:ORG_WORKSPACES_ICON_GALLERY_TITLE": "Icon",
  "common:ORG_WORKSPACES_ICON_UPLOAD_PHOTO_TOOLTIP": "Upload photo",
  "common:ORG_WORKSPACES_ICON_REPLACE_PHOTO_TOOLTIP": "Replace photo",
  "common:ORG_WORKSPACES_ICON_REMOVE_PHOTO_LABEL": "Remove photo",
};

function renderDialogs(
  options: {
    iconDialogOpen?: boolean;
    iconMode?: WorkspaceIconDialogValues["iconMode"];
    iconUrl?: string | null;
  } = {},
) {
  return render(
    <UserCenterWorkspacesDialogs
      t={(key: string) => translations[key] ?? key}
      createDialog={{
        open: !options.iconDialogOpen,
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
      iconDialog={{
        workspace: options.iconDialogOpen
          ? {
              id: "ws-1",
              workspaceId: "ws-1",
              organizationId: "org-1",
              slug: "alpha",
              name: "Workspace Alpha",
              kind: "team",
              description: null,
              iconMode: options.iconMode ?? "initials",
              iconColor: "#337ea9",
              iconGlyph: null,
              iconEmoji: null,
              iconUrl: options.iconUrl ?? null,
              isArchived: false,
              archivedAt: null,
              archivedByUserId: null,
              memberCount: 2,
              membersPreview: [],
              createdAt: "2026-04-15T00:00:00Z",
              enterable: true,
            }
          : null,
        setWorkspace: vi.fn(),
        values: {
          iconMode: options.iconMode ?? "initials",
          iconColor: "#337ea9",
          iconGlyph: null,
          iconEmoji: null,
          iconUrl: options.iconUrl ?? null,
        },
        setValues: vi.fn(),
        pending: false,
        onConfirm: vi.fn().mockResolvedValue(undefined),
        onClose: vi.fn(),
      }}
    />,
  );
}

function StatefulIconDialog(props: { initialValues: WorkspaceIconDialogValues }) {
  const [values, setValues] = useState<WorkspaceIconDialogValues>(props.initialValues);

  return (
    <UserCenterWorkspacesDialogs
      t={(key: string) => translations[key] ?? key}
      createDialog={{
        open: false,
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
      iconDialog={{
        workspace: {
          id: "ws-1",
          workspaceId: "ws-1",
          organizationId: "org-1",
          slug: "alpha",
          name: "Workspace Alpha",
          kind: "team",
          description: null,
          iconMode: values.iconMode,
          iconColor: values.iconColor,
          iconGlyph: values.iconGlyph,
          iconEmoji: values.iconEmoji,
          iconUrl: values.iconUrl,
          isArchived: false,
          archivedAt: null,
          archivedByUserId: null,
          memberCount: 2,
          membersPreview: [],
          createdAt: "2026-04-15T00:00:00Z",
          enterable: true,
        },
        setWorkspace: vi.fn(),
        values,
        setValues,
        pending: false,
        onConfirm: vi.fn().mockResolvedValue(undefined),
        onClose: vi.fn(),
      }}
    />
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

  it("renders the change-icon dialog with color, icon, and photo sections", () => {
    renderDialogs({ iconDialogOpen: true });

    expect(screen.getByText("Change icon")).toBeInTheDocument();
    expect(screen.getByText("Background color")).toBeInTheDocument();
    expect(screen.getByText("Icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeInTheDocument();
  });

  it("shows replace and remove controls when an uploaded photo already exists", () => {
    renderDialogs({ iconDialogOpen: true, iconMode: "image", iconUrl: "/assets/icon-1" });

    expect(screen.getByRole("button", { name: "Replace photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeInTheDocument();
  });

  it("switches the preview away from the uploaded image when a background color is chosen", async () => {
    const user = userEvent.setup();

    render(
      <StatefulIconDialog
        initialValues={{
          iconMode: "image",
          iconColor: "#337ea9",
          iconGlyph: null,
          iconEmoji: null,
          iconUrl: "/assets/icon-1",
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "Workspace Alpha" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "#111827" }));

    expect(screen.queryByRole("img", { name: "Workspace Alpha" })).not.toBeInTheDocument();
  });
});
