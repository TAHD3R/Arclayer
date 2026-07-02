import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ProjectActionDialogs } from "@/pages/usercenter/projects/components/usercenter-projects-dialogs";
import type { ProjectIconDialogValues } from "@/pages/usercenter/projects/hooks/use-project-menu-actions";

const translations: Record<string, string> = {
  "common:CANCEL": "Cancel",
  "account:ACCOUNT_PROJECTS_ACTION_CHANGE_ICON": "Change project icon",
  "account:ACCOUNT_PROJECTS_ICON_DIALOG_DESC": "Update the project icon for {{name}}.",
  "account:ACCOUNT_PROJECTS_ARCHIVE_CONFIRM_TITLE": "Archive project",
  "account:ACCOUNT_PROJECTS_ARCHIVE_CONFIRM_DESC":
    "This will archive {{name}}. You can restore it later.",
  "account:ACCOUNT_PROJECTS_ACTION_ARCHIVE": "Archive project",
  "account:ACCOUNT_PROJECTS_DELETE_CONFIRM_TITLE": "Delete project",
  "account:ACCOUNT_PROJECTS_DELETE_CONFIRM_DESC":
    "This permanently deletes {{name}} and related resources. This action cannot be undone.",
  "account:ACCOUNT_PROJECTS_DELETE_CONFIRM_INPUT_LABEL": "Type {{name}} to confirm deletion",
  "account:ACCOUNT_PROJECTS_DELETE_CONFIRM_INPUT_HELP":
    "Type the exact project name to confirm this irreversible operation.",
  "account:ACCOUNT_PROJECTS_DELETE_CONFIRM_INPUT_PLACEHOLDER": "Enter project name",
  "account:ACCOUNT_PROJECTS_ACTION_DELETE": "Delete project",
  "common:ORG_WORKSPACES_ICON_COLOR_TITLE": "Background color",
  "common:ORG_WORKSPACES_ICON_GALLERY_TITLE": "Icon",
  "common:ORG_WORKSPACES_ICON_UPLOAD_PHOTO_TOOLTIP": "Upload photo",
  "common:ORG_WORKSPACES_ICON_REPLACE_PHOTO_TOOLTIP": "Replace photo",
  "common:ORG_WORKSPACES_ICON_REMOVE_PHOTO_LABEL": "Remove photo",
};

function translate(key: string, options?: { name?: string }) {
  return (translations[key] ?? key).replace("{{name}}", options?.name ?? "");
}

function project(overrides: Partial<ProjectIconDialogValues> = {}) {
  return {
    id: "project-1",
    projectId: "project-1",
    workspaceId: "ws-1",
    slug: "alpha",
    name: "Project Alpha",
    description: null,
    iconMode: overrides.iconMode ?? "initials",
    iconColor: overrides.iconColor ?? "#337ea9",
    iconGlyph: overrides.iconGlyph ?? null,
    iconEmoji: overrides.iconEmoji ?? null,
    iconUrl: overrides.iconUrl ?? null,
    isArchived: false,
    archivedAt: null,
    archivedByUserId: null,
    memberCount: 2,
    membersPreview: [],
    createdAt: "2026-04-15T00:00:00Z",
    updatedAt: "2026-04-16T00:00:00Z",
    enterable: true,
    primaryRuntime: null,
  };
}

function renderActionDialogs(
  options: {
    iconDialogOpen?: boolean;
    iconMode?: ProjectIconDialogValues["iconMode"];
    iconUrl?: string | null;
  } = {},
) {
  return render(
    <ProjectActionDialogs
      t={translate as never}
      archiveDialog={{
        project: null,
        setProject: vi.fn(),
        pending: false,
        onConfirm: vi.fn().mockResolvedValue(undefined),
      }}
      deleteDialog={{
        project: null,
        setProject: vi.fn(),
        confirmName: "",
        setConfirmName: vi.fn(),
        confirmMatches: false,
        pending: false,
        onConfirm: vi.fn().mockResolvedValue(undefined),
      }}
      iconDialog={{
        project: options.iconDialogOpen
          ? project({ iconMode: options.iconMode, iconUrl: options.iconUrl })
          : null,
        setProject: vi.fn(),
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

function StatefulIconDialog(props: { initialValues: ProjectIconDialogValues }) {
  const [values, setValues] = useState<ProjectIconDialogValues>(props.initialValues);

  return (
    <ProjectActionDialogs
      t={translate as never}
      archiveDialog={{
        project: null,
        setProject: vi.fn(),
        pending: false,
        onConfirm: vi.fn().mockResolvedValue(undefined),
      }}
      deleteDialog={{
        project: null,
        setProject: vi.fn(),
        confirmName: "",
        setConfirmName: vi.fn(),
        confirmMatches: false,
        pending: false,
        onConfirm: vi.fn().mockResolvedValue(undefined),
      }}
      iconDialog={{
        project: project(values),
        setProject: vi.fn(),
        values,
        setValues,
        pending: false,
        onConfirm: vi.fn().mockResolvedValue(undefined),
        onClose: vi.fn(),
      }}
    />
  );
}

describe("ProjectActionDialogs", () => {
  it("renders the change-icon dialog with color, icon, and photo sections", () => {
    renderActionDialogs({ iconDialogOpen: true });

    expect(screen.getByText("Change project icon")).toBeInTheDocument();
    expect(screen.getByText("Background color")).toBeInTheDocument();
    expect(screen.getByText("Icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeInTheDocument();
  });

  it("shows replace and remove controls when an uploaded photo already exists", () => {
    renderActionDialogs({ iconDialogOpen: true, iconMode: "image", iconUrl: "/assets/icon-1" });

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

    expect(screen.getByRole("img", { name: "Project Alpha" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "#111827" }));

    expect(screen.queryByRole("img", { name: "Project Alpha" })).not.toBeInTheDocument();
  });
});
