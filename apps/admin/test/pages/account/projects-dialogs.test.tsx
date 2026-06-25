import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  UserCenterProjectsDialogs,
  type CreateProjectFormValues,
} from "@/pages/usercenter/projects/components/usercenter-projects-dialogs";
import type { ProjectIconDialogValues } from "@/pages/usercenter/projects/hooks/use-project-menu-actions";

vi.mock("@/api/projects", () => ({
  checkProjectSlugAvailability: vi.fn(),
}));

vi.mock("@/lib/auth/form-feedback", () => ({
  useDebouncedValue: (value: string) => value,
}));

import { checkProjectSlugAvailability } from "@/api/projects";

const translations: Record<string, string> = {
  "common:CANCEL": "Cancel",
  "common:CONFIRM": "Confirm",
  "account:ACCOUNT_PROJECTS_CREATE_TITLE": "Create project",
  "account:ACCOUNT_PROJECTS_CREATE_DESC": "Create a project for sites and publishing.",
  "account:ACCOUNT_PROJECTS_FIELD_NAME": "Project name",
  "account:ACCOUNT_PROJECTS_FIELD_NAME_DESC":
    "Use a clear name your team will recognize in navigation and settings.",
  "account:ACCOUNT_PROJECTS_FIELD_NAME_PLACEHOLDER": "e.g. Marketing site",
  "account:ACCOUNT_PROJECTS_FIELD_NAME_REQUIRED": "Project name is required",
  "account:ACCOUNT_PROJECTS_FIELD_WORKSPACE_REQUIRED": "Workspace is required",
  "account:ACCOUNT_PROJECTS_FIELD_SLUG": "Project URL",
  "account:ACCOUNT_PROJECTS_FIELD_SLUG_HELP":
    "Review or adjust the project URL used in links and admin routing.",
  "account:ACCOUNT_PROJECTS_FIELD_SLUG_PLACEHOLDER": "e.g. marketing-site",
  "account:ACCOUNT_PROJECTS_FIELD_SLUG_REQUIRED": "Project URL is required",
  "account:ACCOUNT_PROJECTS_FIELD_SLUG_CHECKING": "Checking project URL",
  "account:ACCOUNT_PROJECTS_FIELD_SLUG_CHECK_FAILED": "Project URL check failed",
  "account:ACCOUNT_PROJECTS_FIELD_SLUG_AVAILABLE": "Project URL is available",
  "account:ACCOUNT_PROJECTS_FIELD_SLUG_INVALID": "Project URL format is invalid",
  "account:ACCOUNT_PROJECTS_FIELD_SLUG_RESERVED": "Project URL is reserved",
  "account:ACCOUNT_PROJECTS_FIELD_SLUG_EXISTS": "Project URL already exists",
  "account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION": "Description",
  "account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION_DESC":
    "Capture the purpose of this project so people understand what ships here.",
  "account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION_PLACEHOLDER":
    "Landing pages, launch campaigns, and growth content.",
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

function buildInitialCreateValues(
  overrides: Partial<CreateProjectFormValues> = {},
): CreateProjectFormValues {
  return {
    workspaceId: "ws-1",
    name: "",
    slug: "",
    slugSource: "name-seed",
    description: "",
    ...overrides,
  };
}

function renderDialogs(
  options: {
    iconDialogOpen?: boolean;
    iconMode?: ProjectIconDialogValues["iconMode"];
    iconUrl?: string | null;
  } = {},
) {
  return render(
    <UserCenterProjectsDialogs
      t={(key: string) => translations[key] ?? key}
      createDialog={{
        open: !options.iconDialogOpen,
        workspaceId: "ws-1",
        setOpen: vi.fn(),
        values: buildInitialCreateValues(),
        setValues: vi.fn(),
        pending: false,
        onSubmit: vi.fn().mockResolvedValue(undefined),
      }}
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
          ? {
              id: "project-1",
              projectId: "project-1",
              workspaceId: "ws-1",
              slug: "alpha",
              name: "Project Alpha",
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
              updatedAt: "2026-04-16T00:00:00Z",
              enterable: true,
              primaryRuntime: null,
            }
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
    <UserCenterProjectsDialogs
      t={(key: string) => translations[key] ?? key}
      createDialog={{
        open: false,
        workspaceId: "ws-1",
        setOpen: vi.fn(),
        values: buildInitialCreateValues(),
        setValues: vi.fn(),
        pending: false,
        onSubmit: vi.fn().mockResolvedValue(undefined),
      }}
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
        project: {
          id: "project-1",
          projectId: "project-1",
          workspaceId: "ws-1",
          slug: "alpha",
          name: "Project Alpha",
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
          updatedAt: "2026-04-16T00:00:00Z",
          enterable: true,
          primaryRuntime: null,
        },
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

function StatefulCreateDialog(props: {
  initialValues?: Partial<CreateProjectFormValues>;
  onSubmit?: (values: CreateProjectFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<CreateProjectFormValues>(() =>
    buildInitialCreateValues(props.initialValues),
  );

  return (
    <UserCenterProjectsDialogs
      t={(key: string) => translations[key] ?? key}
      createDialog={{
        open: true,
        workspaceId: "ws-1",
        setOpen: vi.fn(),
        values,
        setValues,
        pending: false,
        onSubmit: props.onSubmit ?? vi.fn().mockResolvedValue(undefined),
      }}
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
        project: null,
        setProject: vi.fn(),
        values: {
          iconMode: "initials",
          iconColor: "#337ea9",
          iconGlyph: null,
          iconEmoji: null,
          iconUrl: null,
        },
        setValues: vi.fn(),
        pending: false,
        onConfirm: vi.fn().mockResolvedValue(undefined),
        onClose: vi.fn(),
      }}
    />
  );
}

describe("UserCenterProjectsDialogs", () => {
  beforeEach(() => {
    vi.mocked(checkProjectSlugAvailability).mockReset();
    vi.mocked(checkProjectSlugAvailability).mockImplementation(async (_workspaceId, slug) => ({
      normalizedSlug: slug,
      available: true,
      reason: null,
    }));
  });

  it("uses team-oriented create copy", () => {
    renderDialogs();

    expect(screen.getByText("Create project")).toBeInTheDocument();
    expect(screen.getByText("Create a project for sites and publishing.")).toBeInTheDocument();
  });

  it("does not show the required name error until the field has been interacted with", async () => {
    const user = userEvent.setup();
    renderDialogs();

    expect(screen.queryByText("Project name is required")).not.toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText("e.g. Marketing site");
    await user.click(nameInput);
    await user.tab();

    expect(screen.getByText("Project name is required")).toBeInTheDocument();
  });

  it("generates a slug from the project name and submits it after availability succeeds", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<StatefulCreateDialog onSubmit={onSubmit} />);

    await user.type(screen.getByPlaceholderText("e.g. Marketing site"), "Marketing site");

    await waitFor(() => {
      expect(screen.getByDisplayValue("marketing-site")).toBeInTheDocument();
    });
    expect(await screen.findByText("Project URL is available")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onSubmit).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      name: "Marketing site",
      slug: "marketing-site",
      slugSource: "name-seed",
      description: undefined,
    });
  });

  it("generates a pinyin slug from a Chinese project name", async () => {
    const user = userEvent.setup();

    render(<StatefulCreateDialog />);

    await user.type(screen.getByPlaceholderText("e.g. Marketing site"), "中文项目");

    await waitFor(() => {
      expect(screen.getByDisplayValue("zhong-wen-xiang-mu")).toBeInTheDocument();
    });
  });

  it("keeps a manually edited slug when the name changes later", async () => {
    const user = userEvent.setup();

    render(<StatefulCreateDialog />);

    const nameInput = screen.getByPlaceholderText("e.g. Marketing site");
    const slugInput = screen.getByPlaceholderText("e.g. marketing-site");

    await user.type(nameInput, "Marketing site");
    await waitFor(() => {
      expect(screen.getByDisplayValue("marketing-site")).toBeInTheDocument();
    });

    await user.clear(slugInput);
    await user.type(slugInput, "custom-project");
    await waitFor(() => {
      expect(screen.getByDisplayValue("custom-project")).toBeInTheDocument();
    });

    await user.clear(nameInput);
    await user.type(nameInput, "Marketing site v2");

    await waitFor(() => {
      expect(screen.getByDisplayValue("custom-project")).toBeInTheDocument();
    });
  });

  it("renders the change-icon dialog with color, icon, and photo sections", () => {
    renderDialogs({ iconDialogOpen: true });

    expect(screen.getByText("Change project icon")).toBeInTheDocument();
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

    expect(screen.getByRole("img", { name: "Project Alpha" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "#111827" }));

    expect(screen.queryByRole("img", { name: "Project Alpha" })).not.toBeInTheDocument();
  });
});
