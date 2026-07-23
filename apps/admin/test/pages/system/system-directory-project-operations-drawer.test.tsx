import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectOperationsDrawer } from "@/pages/system/directory/projects/project-operations-drawer";
import type { SystemDirectoryProject } from "@arclayer/openapi/admin-types";

const mocks = vi.hoisted(() => ({
  onOpenChange: vi.fn(),
  onEdit: vi.fn(),
  onChangeIcon: vi.fn(),
  onToggleAccess: vi.fn(),
  onDelete: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#project">{children}</a>,
}));

vi.mock("@/components/common/project-avatar", () => ({
  ProjectAvatar: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock("@/components/common/entity-avatar", () => ({
  UserAvatar: ({ name }: { name: string }) => <span>{name}</span>,
  WorkspaceAvatar: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock("@/components/ui/tags", () => ({
  BaseTag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/pages/system/audit-log/audit-event-presenters", () => ({
  auditEventName: (_t: unknown, name: string) => name,
  auditSourceLabel: (_t: unknown, source: string) => source,
}));

vi.mock("@arclayer/ui/drawer", () => ({
  Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DrawerBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@arclayer/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div role="tablist">{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button" role="tab">
      {children}
    </button>
  ),
}));

vi.mock("@arclayer/ui/button", () => ({
  Button: ({
    asChild,
    children,
    onClick,
  }: {
    asChild?: boolean;
    children: React.ReactNode;
    onClick?: () => void;
  }) =>
    asChild ? (
      <>{children}</>
    ) : (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
}));

vi.mock("@arclayer/ui/separator", () => ({ Separator: () => <hr /> }));

vi.mock("@/pages/system/directory/hooks", () => ({
  useSystemDirectoryProjectDetail: () => ({
    detail: {
      projectId: "project-1",
      workspaceName: "Commerce",
      slug: "storefront",
      memberCount: 3,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-02T00:00:00Z",
      owner: { displayName: "Philip", email: "admin@123.com" },
      restrictions: [],
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/pages/system/directory/system-directory-table", () => ({
  useSystemDirectoryDateTimeFormatter: () => ({ localization: { timeZone: "UTC" } }),
}));

vi.mock("@/pages/system/directory/projects/project-operations-hooks", () => ({
  useSystemProjectOperations: () => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSystemProjectUsage: () => ({
    overview: { data: undefined, isLoading: false, error: null, refetch: vi.fn() },
    groups: { data: undefined, isLoading: false, error: null, refetch: vi.fn() },
    days: 30,
  }),
  useSystemProjectActivity: () => ({
    data: { items: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

const project = {
  projectId: "project-1",
  workspaceId: "workspace-1",
  workspaceName: "Commerce",
  name: "Storefront",
  isActive: true,
  restrictions: [],
} as unknown as SystemDirectoryProject;

function renderDrawer() {
  return render(
    <ProjectOperationsDrawer
      project={project}
      onOpenChange={mocks.onOpenChange}
      onEdit={mocks.onEdit}
      onChangeIcon={mocks.onChangeIcon}
      onToggleAccess={mocks.onToggleAccess}
      onDelete={mocks.onDelete}
    />,
  );
}

describe("ProjectOperationsDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("presents the six operational areas as accessible tabs", () => {
    renderDrawer();

    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(
      screen.getByRole("tab", { name: "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_OVERVIEW" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_TAB_RUNTIME" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_TAB_ACCESS" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_TAB_USAGE" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_ACTIVITY" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_TAB_ACTIONS" }),
    ).toBeInTheDocument();
  });

  it("hands each governed action back to the page after closing the drawer", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_EDIT_PROJECT",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_CHANGE_ICON" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_PROJECT",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_PROJECT",
      }),
    );

    expect(mocks.onOpenChange).toHaveBeenCalledTimes(4);
    expect(mocks.onEdit).toHaveBeenCalledWith(project);
    expect(mocks.onChangeIcon).toHaveBeenCalledWith(project);
    expect(mocks.onToggleAccess).toHaveBeenCalledWith(project);
    expect(mocks.onDelete).toHaveBeenCalledWith(project);
  });
});
