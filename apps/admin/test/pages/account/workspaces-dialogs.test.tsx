import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  UserCenterWorkspacesDialogs,
  type CreateWorkspaceFormValues,
} from "@/pages/usercenter/workspaces/components/usercenter-workspaces-dialogs";
import type { WorkspaceIconDialogValues } from "@/pages/usercenter/workspaces/hooks/use-workspace-menu-actions";

vi.mock("@/api/organization-workspaces", () => ({
  checkOrganizationWorkspaceSlugAvailability: vi.fn(),
}));

vi.mock("@/lib/auth/form-feedback", () => ({
  useDebouncedValue: (value: string) => value,
}));

import { checkOrganizationWorkspaceSlugAvailability } from "@/api/organization-workspaces";

const translations: Record<string, string> = {
  "common:CANCEL": "Cancel",
  "common:CONFIRM": "Confirm",
  "common:ORG_WORKSPACES_CREATE_TEAM": "Create workspace",
  "common:ORG_WORKSPACES_CREATE_TEAM_DIALOG_DESC":
    "Create a workspace for collaboration, projects, and client work.",
  "common:ORG_WORKSPACES_FIELD_NAME": "Workspace name",
  "common:ORG_WORKSPACES_FIELD_NAME_HELP":
    "Use a clear business name so teammates can identify this workspace quickly.",
  "common:ORG_WORKSPACES_FIELD_NAME_PLACEHOLDER": "e.g. Marketing website",
  "common:ORG_WORKSPACES_FIELD_NAME_REQUIRED": "Workspace name is required",
  "common:ORG_WORKSPACES_FIELD_SLUG": "Workspace URL",
  "common:ORG_WORKSPACES_FIELD_SLUG_HELP":
    "Review or adjust the workspace URL used in links and admin routing.",
  "common:ORG_WORKSPACES_FIELD_SLUG_PLACEHOLDER": "e.g. marketing-website",
  "common:ORG_WORKSPACES_FIELD_SLUG_REQUIRED": "Workspace URL is required",
  "common:ORG_WORKSPACES_FIELD_SLUG_CHECKING": "Checking workspace URL",
  "common:ORG_WORKSPACES_FIELD_SLUG_CHECK_FAILED": "Workspace URL check failed",
  "common:ORG_WORKSPACES_FIELD_SLUG_AVAILABLE": "Workspace URL is available",
  "common:ORG_WORKSPACES_FIELD_SLUG_INVALID": "Workspace URL format is invalid",
  "common:ORG_WORKSPACES_FIELD_SLUG_RESERVED": "Workspace URL is reserved",
  "common:ORG_WORKSPACES_FIELD_SLUG_EXISTS": "Workspace URL already exists",
  "common:ORG_WORKSPACES_FIELD_DESCRIPTION": "Description",
  "common:ORG_WORKSPACES_FIELD_DESCRIPTION_HELP":
    "Summarize the workspace scope and collaboration purpose.",
  "common:ORG_WORKSPACES_FIELD_DESCRIPTION_PLACEHOLDER":
    "Describe the workspace purpose (optional)",
  "common:ORG_WORKSPACES_ACTION_CHANGE_ICON": "Change icon",
  "common:ORG_WORKSPACES_ICON_DIALOG_DESC": "Update the workspace icon for {{name}}.",
  "common:ORG_WORKSPACES_ICON_COLOR_TITLE": "Background color",
  "common:ORG_WORKSPACES_ICON_GALLERY_TITLE": "Icon",
  "common:ORG_WORKSPACES_ICON_UPLOAD_PHOTO_TOOLTIP": "Upload photo",
  "common:ORG_WORKSPACES_ICON_REPLACE_PHOTO_TOOLTIP": "Replace photo",
  "common:ORG_WORKSPACES_ICON_REMOVE_PHOTO_LABEL": "Remove photo",
};

function buildInitialCreateValues(
  overrides: Partial<CreateWorkspaceFormValues> = {},
): CreateWorkspaceFormValues {
  return {
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
        values: buildInitialCreateValues(),
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
        values: buildInitialCreateValues(),
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

function StatefulCreateDialog(props: {
  initialValues?: Partial<CreateWorkspaceFormValues>;
  onSubmit?: (values: CreateWorkspaceFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<CreateWorkspaceFormValues>(() =>
    buildInitialCreateValues(props.initialValues),
  );

  return (
    <UserCenterWorkspacesDialogs
      t={(key: string) => translations[key] ?? key}
      createDialog={{
        open: true,
        organizationId: undefined,
        setOpen: vi.fn(),
        values,
        setValues,
        pending: false,
        onSubmit: props.onSubmit ?? vi.fn().mockResolvedValue(undefined),
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
        workspace: null,
        setWorkspace: vi.fn(),
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

describe("UserCenterWorkspacesDialogs", () => {
  beforeEach(() => {
    vi.mocked(checkOrganizationWorkspaceSlugAvailability).mockReset();
    vi.mocked(checkOrganizationWorkspaceSlugAvailability).mockImplementation(
      async (_organizationId, slug) => ({
        normalizedSlug: slug,
        available: true,
        reason: null,
      }),
    );
  });

  it("uses team-oriented create copy", () => {
    renderDialogs();

    expect(screen.getByText("Create workspace")).toBeInTheDocument();
    expect(
      screen.getByText("Create a workspace for collaboration, projects, and client work."),
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

  it("generates a slug from the workspace name and submits it after availability succeeds", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<StatefulCreateDialog onSubmit={onSubmit} />);

    await user.type(screen.getByPlaceholderText("e.g. Marketing website"), "Marketing website");

    await waitFor(() => {
      expect(screen.getByDisplayValue("marketing-website")).toBeInTheDocument();
    });
    expect(await screen.findByText("Workspace URL is available")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Marketing website",
      slug: "marketing-website",
      slugSource: "name-seed",
      description: undefined,
    });
  });

  it("generates a pinyin slug from a Chinese workspace name", async () => {
    const user = userEvent.setup();

    render(<StatefulCreateDialog />);

    await user.type(screen.getByPlaceholderText("e.g. Marketing website"), "中文工作空间");

    await waitFor(() => {
      expect(screen.getByDisplayValue("zhong-wen-gong-zuo-kong-jian")).toBeInTheDocument();
    });
  });

  it("keeps a manually edited slug when the name changes later", async () => {
    const user = userEvent.setup();

    render(<StatefulCreateDialog />);

    const nameInput = screen.getByPlaceholderText("e.g. Marketing website");
    const slugInput = screen.getByPlaceholderText("e.g. marketing-website");

    await user.type(nameInput, "Marketing website");
    await waitFor(() => {
      expect(screen.getByDisplayValue("marketing-website")).toBeInTheDocument();
    });

    await user.clear(slugInput);
    await user.type(slugInput, "custom-team");
    await waitFor(() => {
      expect(screen.getByDisplayValue("custom-team")).toBeInTheDocument();
    });

    await user.clear(nameInput);
    await user.type(nameInput, "Marketing website v2");

    await waitFor(() => {
      expect(screen.getByDisplayValue("custom-team")).toBeInTheDocument();
    });
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
