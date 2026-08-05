import type { PropsWithChildren, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectDatabasesPage } from "@/pages/projects/settings/databases/page";

const listProjectDatabasesMock = vi.fn();
const createProjectDatabaseMock = vi.fn();
const rotateProjectDatabaseCredentialMock = vi.fn();
const listProjectEnvironmentsMock = vi.fn();
const getMyProjectAuthzMock = vi.fn();
const listProjectPermissionActionsMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/api/project-databases", () => ({
  buildProjectDatabasesQueryKey: (projectId: string) => ["project", "databases", projectId],
  listProjectDatabases: (...args: unknown[]) => listProjectDatabasesMock(...args),
  createProjectDatabase: (...args: unknown[]) => createProjectDatabaseMock(...args),
  rotateProjectDatabaseCredential: (...args: unknown[]) =>
    rotateProjectDatabaseCredentialMock(...args),
}));

vi.mock("@/api/project-environments", () => ({
  buildProjectEnvironmentsQueryKey: (projectId: string) => ["project", "environments", projectId],
  listProjectEnvironments: (...args: unknown[]) => listProjectEnvironmentsMock(...args),
}));

vi.mock("@/api/workspaces", () => ({
  getMyProjectAuthz: (...args: unknown[]) => getMyProjectAuthzMock(...args),
}));

vi.mock("@/api/rbac", () => ({
  listProjectPermissionActions: (...args: unknown[]) => listProjectPermissionActionsMock(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({
    title,
    description,
    action,
    children,
  }: PropsWithChildren<{ title: string; description?: string; action?: ReactNode }>) => (
    <div data-testid="default-page" data-title={title} data-description={description}>
      {action}
      {children}
    </div>
  ),
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({
    loading,
    error,
    empty,
    emptyTitle,
    children,
  }: PropsWithChildren<{
    loading: boolean;
    error?: unknown | null;
    empty?: boolean;
    emptyTitle?: ReactNode;
  }>) => {
    if (loading) return <div data-testid="guard-loading" />;
    if (error)
      return <div data-testid="guard-error">{String((error as Error).message || error)}</div>;
    if (empty) return <div data-testid="guard-empty">{emptyTitle}</div>;
    return <>{children}</>;
  },
}));

vi.mock("@arclayer/ui/setting-dialog", () => ({
  SettingDialog: ({
    open,
    title,
    description,
    footer,
    children,
  }: PropsWithChildren<{
    open: boolean;
    title: string;
    description: string;
    footer?: ReactNode;
  }>) =>
    open ? (
      <div data-testid="setting-dialog">
        <div>{title}</div>
        <div>{description}</div>
        {children}
        {footer}
      </div>
    ) : null,
}));

function renderWithQuery(node: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

describe("ProjectDatabasesPage", () => {
  beforeEach(() => {
    listProjectDatabasesMock.mockReset();
    createProjectDatabaseMock.mockReset();
    rotateProjectDatabaseCredentialMock.mockReset();
    listProjectEnvironmentsMock.mockReset();
    getMyProjectAuthzMock.mockReset();
    listProjectPermissionActionsMock.mockReset();

    listProjectEnvironmentsMock.mockResolvedValue([
      { id: "env-dev", name: "Development" },
      { id: "env-prod", name: "Production" },
    ]);
    listProjectDatabasesMock.mockResolvedValue([
      {
        id: "db-prod",
        environmentId: "env-prod",
        environmentName: "Production",
        engine: "postgres",
        isolationMode: "database",
        host: "db.prod.internal",
        port: 5432,
        databaseName: "project_prod",
        schemaName: "public",
        status: "ready",
        credentials: [
          {
            role: "app",
            username: "project_app",
            secretSet: true,
          },
        ],
      },
    ]);
    getMyProjectAuthzMock.mockResolvedValue({
      projectId: "project-1",
      workspaceId: "workspace-1",
      isSuperuser: false,
      permissionCodes: ["project:settings:manage"],
    });
    listProjectPermissionActionsMock.mockResolvedValue([
      { code: "project:settings:manage", permissionCodes: ["project:settings:manage"] },
    ]);
  });

  it("renders masked connection information and credential state", async () => {
    renderWithQuery(<ProjectDatabasesPage projectId="project-1" />);

    expect(await screen.findByTestId("project-database-row-db-prod")).toBeInTheDocument();
    expect(
      screen.getByText("postgresql://project_app:********@db.prod.internal:5432/project_prod"),
    ).toBeInTheDocument();
    expect(screen.getByText("account:SETTINGS_PROJECT_DATABASES_SECRET_SET")).toBeInTheDocument();
  });

  it("creates a database for the selected environment through the backend API", async () => {
    createProjectDatabaseMock.mockResolvedValue({});

    renderWithQuery(<ProjectDatabasesPage projectId="project-1" />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "account:SETTINGS_PROJECT_DATABASES_CREATE_ACTION",
      }),
    );
    fireEvent.change(
      screen.getByLabelText("account:SETTINGS_PROJECT_DATABASES_TARGET_ENVIRONMENT"),
      {
        target: { value: "env-dev" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "account:SETTINGS_PROJECT_DATABASES_CREATE_SUBMIT" }),
    );

    await waitFor(() => {
      expect(createProjectDatabaseMock).toHaveBeenCalledWith("project-1", {
        environmentId: "env-dev",
        engine: "postgres",
        isolationMode: "database",
      });
    });
  });

  it("rotates credentials through the real rotate API", async () => {
    rotateProjectDatabaseCredentialMock.mockResolvedValue({});

    renderWithQuery(<ProjectDatabasesPage projectId="project-1" />);

    fireEvent.click(
      await screen.findByRole("button", { name: "account:SETTINGS_PROJECT_DATABASES_ROTATE" }),
    );

    await waitFor(() => {
      expect(rotateProjectDatabaseCredentialMock).toHaveBeenCalledWith("project-1", "db-prod", {
        role: "app",
      });
    });
  });

  it("shows the read-only state when database management is unavailable", async () => {
    getMyProjectAuthzMock.mockResolvedValueOnce({
      projectId: "project-1",
      workspaceId: "workspace-1",
      isSuperuser: false,
      permissionCodes: ["project:settings:read"],
    });
    listProjectPermissionActionsMock.mockResolvedValueOnce([
      { code: "project:settings:manage", permissionCodes: ["project:settings:manage"] },
    ]);

    renderWithQuery(<ProjectDatabasesPage projectId="project-1" />);

    expect(await screen.findByTestId("project-databases-read-only-notice")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "account:SETTINGS_PROJECT_DATABASES_CREATE_ACTION" }),
    ).not.toBeInTheDocument();
  });
});
