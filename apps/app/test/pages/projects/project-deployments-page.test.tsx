import type { PropsWithChildren, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectDeploymentsPage } from "@/pages/projects/deployments/page";

const listProjectDeploymentsMock = vi.fn();
const promoteProjectDeploymentMock = vi.fn();
const rollbackProjectDeploymentMock = vi.fn();
const cancelProjectDeploymentMock = vi.fn();
const listProjectEnvironmentsMock = vi.fn();
const getMyProjectAuthzMock = vi.fn();
const listProjectPermissionActionsMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/api/project-deployments", () => ({
  buildProjectDeploymentsQueryKey: (projectId: string) => ["project", "deployments", projectId],
  listProjectDeployments: (...args: unknown[]) => listProjectDeploymentsMock(...args),
  promoteProjectDeployment: (...args: unknown[]) => promoteProjectDeploymentMock(...args),
  rollbackProjectDeployment: (...args: unknown[]) => rollbackProjectDeploymentMock(...args),
  cancelProjectDeployment: (...args: unknown[]) => cancelProjectDeploymentMock(...args),
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

vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({
    formatDateTime: (value: string | null | undefined) => `formatted:${value ?? "-"}`,
  }),
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

describe("ProjectDeploymentsPage", () => {
  beforeEach(() => {
    listProjectDeploymentsMock.mockReset();
    promoteProjectDeploymentMock.mockReset();
    rollbackProjectDeploymentMock.mockReset();
    cancelProjectDeploymentMock.mockReset();
    listProjectEnvironmentsMock.mockReset();
    getMyProjectAuthzMock.mockReset();
    listProjectPermissionActionsMock.mockReset();

    listProjectEnvironmentsMock.mockResolvedValue([
      { id: "env-stage", name: "Staging" },
      { id: "env-prod", name: "Production" },
    ]);
    listProjectDeploymentsMock.mockImplementation(
      async (
        _projectId: string,
        params?: { environmentId?: string | null; status?: string | null },
      ) => {
        const rows = [
          {
            id: "dep-ready",
            environmentId: "env-stage",
            environmentKey: "staging",
            environmentName: "Staging",
            sourceType: "cms_runtime",
            sourceRef: "release-41",
            status: "ready",
            runtimeKind: "static",
            artifactKey: "artifacts/stage-41",
            buildLogKey: "https://logs.example.com/stage-41",
            isActive: false,
            createdAt: "2026-04-25T10:00:00Z",
          },
          {
            id: "dep-failed",
            environmentId: "env-prod",
            environmentKey: "production",
            environmentName: "Production",
            sourceType: "cms_runtime",
            sourceRef: "release-40",
            status: "failed",
            runtimeKind: "static",
            artifactKey: "artifacts/prod-40",
            buildLogKey: null,
            isActive: false,
            createdAt: "2026-04-25T09:00:00Z",
            errorReason: "worker failed to download artifact",
          },
          {
            id: "dep-building",
            environmentId: "env-stage",
            environmentKey: "staging",
            environmentName: "Staging",
            sourceType: "git",
            sourceRef: "refs/heads/main",
            status: "building",
            runtimeKind: "ssr",
            artifactKey: "artifacts/stage-building",
            buildLogKey: null,
            isActive: false,
            createdAt: "2026-04-25T11:00:00Z",
          },
        ];

        return rows.filter((row) => {
          const environmentMatch =
            !params?.environmentId || row.environmentId === params.environmentId;
          const statusMatch = !params?.status || row.status === params.status;
          return environmentMatch && statusMatch;
        });
      },
    );
    getMyProjectAuthzMock.mockResolvedValue({
      projectId: "project-1",
      workspaceId: "workspace-1",
      isSuperuser: false,
      permissionCodes: [
        "project:deployments:read",
        "project:deployments:promote",
        "project:deployments:rollback",
        "project:deployments:manage",
      ],
    });
    listProjectPermissionActionsMock.mockResolvedValue([
      { code: "project:deployments:promote", permissionCodes: ["project:deployments:promote"] },
      { code: "project:deployments:rollback", permissionCodes: ["project:deployments:rollback"] },
      { code: "project:deployments:manage", permissionCodes: ["project:deployments:manage"] },
    ]);
  });

  it("filters deployments by environment and keeps failure context visible", async () => {
    renderWithQuery(<ProjectDeploymentsPage projectId="project-1" />);

    expect(await screen.findByTestId("project-deployment-row-dep-ready")).toBeInTheDocument();
    expect(screen.getByText("worker failed to download artifact")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("account:SETTINGS_PROJECT_DEPLOYMENTS_FILTER_ENV"), {
      target: { value: "env-prod" },
    });

    await waitFor(() => {
      expect(listProjectDeploymentsMock).toHaveBeenLastCalledWith("project-1", {
        environmentId: "env-prod",
        status: null,
      });
    });
  });

  it("executes promote, rollback, and cancel actions through the backend APIs", async () => {
    promoteProjectDeploymentMock.mockResolvedValue({});
    rollbackProjectDeploymentMock.mockResolvedValue({});
    cancelProjectDeploymentMock.mockResolvedValue({});

    renderWithQuery(<ProjectDeploymentsPage projectId="project-1" />);

    fireEvent.click(
      await screen
        .findAllByRole("button", { name: "account:SETTINGS_PROJECT_DEPLOYMENTS_PROMOTE" })
        .then((buttons) => buttons[0]),
    );
    fireEvent.change(
      screen.getByLabelText("account:SETTINGS_PROJECT_DEPLOYMENTS_TARGET_ENVIRONMENT"),
      {
        target: { value: "env-prod" },
      },
    );
    fireEvent.click(
      within(screen.getByTestId("setting-dialog")).getByRole("button", {
        name: "account:SETTINGS_PROJECT_DEPLOYMENTS_PROMOTE",
      }),
    );

    await waitFor(() => {
      expect(promoteProjectDeploymentMock).toHaveBeenCalledWith("project-1", "dep-ready", {
        environmentId: "env-prod",
      });
    });

    fireEvent.click(
      await screen
        .findAllByRole("button", { name: "account:SETTINGS_PROJECT_DEPLOYMENTS_ROLLBACK" })
        .then((buttons) => buttons[0]),
    );
    fireEvent.change(
      screen.getByLabelText("account:SETTINGS_PROJECT_DEPLOYMENTS_TARGET_ENVIRONMENT"),
      {
        target: { value: "env-stage" },
      },
    );
    fireEvent.click(
      within(screen.getByTestId("setting-dialog")).getByRole("button", {
        name: "account:SETTINGS_PROJECT_DEPLOYMENTS_ROLLBACK",
      }),
    );

    await waitFor(() => {
      expect(rollbackProjectDeploymentMock).toHaveBeenCalledWith("project-1", "dep-ready", {
        environmentId: "env-stage",
      });
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "account:SETTINGS_PROJECT_DEPLOYMENTS_CANCEL" }),
    );

    await waitFor(() => {
      expect(cancelProjectDeploymentMock).toHaveBeenCalledWith("project-1", "dep-building");
    });
  });

  it("shows read-only guidance when deployment actions are unavailable", async () => {
    getMyProjectAuthzMock.mockResolvedValueOnce({
      projectId: "project-1",
      workspaceId: "workspace-1",
      isSuperuser: false,
      permissionCodes: ["project:deployments:read"],
    });
    listProjectPermissionActionsMock.mockResolvedValueOnce([
      { code: "project:deployments:promote", permissionCodes: ["project:deployments:promote"] },
      { code: "project:deployments:rollback", permissionCodes: ["project:deployments:rollback"] },
      { code: "project:deployments:manage", permissionCodes: ["project:deployments:manage"] },
    ]);

    renderWithQuery(<ProjectDeploymentsPage projectId="project-1" />);

    expect(await screen.findByTestId("project-deployments-read-only-notice")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "account:SETTINGS_PROJECT_DEPLOYMENTS_PROMOTE" }),
    ).not.toBeInTheDocument();
  });
});
