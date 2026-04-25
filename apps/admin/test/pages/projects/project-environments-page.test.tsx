import type { PropsWithChildren, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectEnvironmentsPage } from "@/pages/projects/settings/environments/page";

const listProjectEnvironmentsMock = vi.fn();
const patchProjectEnvironmentMock = vi.fn();
const listProjectDeploymentsMock = vi.fn();
const listProjectDomainsMock = vi.fn();
const getMyProjectAuthzMock = vi.fn();
const listProjectPermissionActionsMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/api/project-environments", () => ({
  buildProjectEnvironmentsQueryKey: (projectId: string) => ["project", "environments", projectId],
  listProjectEnvironments: (...args: unknown[]) => listProjectEnvironmentsMock(...args),
  patchProjectEnvironment: (...args: unknown[]) => patchProjectEnvironmentMock(...args),
}));

vi.mock("@/api/project-deployments", () => ({
  buildProjectDeploymentsQueryKey: (projectId: string) => ["project", "deployments", projectId],
  listProjectDeployments: (...args: unknown[]) => listProjectDeploymentsMock(...args),
}));

vi.mock("@/api/project-settings", () => ({
  listProjectDomains: (...args: unknown[]) => listProjectDomainsMock(...args),
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
    children,
  }: PropsWithChildren<{ title: string; description?: string }>) => (
    <div data-testid="default-page" data-title={title} data-description={description}>
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
    emptyDescription,
    children,
  }: PropsWithChildren<{
    loading: boolean;
    error?: unknown | null;
    empty?: boolean;
    emptyTitle?: ReactNode;
    emptyDescription?: ReactNode;
  }>) => {
    if (loading) return <div data-testid="guard-loading" />;
    if (error)
      return <div data-testid="guard-error">{String((error as Error).message || error)}</div>;
    if (empty) {
      return (
        <div data-testid="guard-empty">
          <div>{emptyTitle}</div>
          <div>{emptyDescription}</div>
        </div>
      );
    }
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

describe("ProjectEnvironmentsPage", () => {
  beforeEach(() => {
    listProjectEnvironmentsMock.mockReset();
    patchProjectEnvironmentMock.mockReset();
    listProjectDeploymentsMock.mockReset();
    listProjectDomainsMock.mockReset();
    getMyProjectAuthzMock.mockReset();
    listProjectPermissionActionsMock.mockReset();

    listProjectEnvironmentsMock.mockResolvedValue([
      {
        id: "env-dev",
        key: "development",
        name: "Development",
        isProduction: false,
        isDefaultPreview: true,
      },
      {
        id: "env-stage",
        key: "staging",
        name: "Staging",
        isProduction: false,
        isDefaultPreview: false,
      },
      {
        id: "env-prod",
        key: "production",
        name: "Production",
        isProduction: true,
        isDefaultPreview: false,
      },
    ]);
    listProjectDeploymentsMock.mockResolvedValue([
      {
        id: "dep-prod",
        environmentId: "env-prod",
        environmentKey: "production",
        environmentName: "Production",
        sourceType: "cms_runtime",
        artifactKey: "artifacts/prod-42",
        isActive: true,
      },
    ]);
    listProjectDomainsMock.mockResolvedValue([
      {
        domainId: "domain-1",
        hostname: "www.example.com",
        isActive: true,
        isVerified: true,
      },
    ]);
    getMyProjectAuthzMock.mockResolvedValue({
      projectId: "project-1",
      workspaceId: "workspace-1",
      isSuperuser: false,
      permissionCodes: ["project:settings:manage"],
    });
    listProjectPermissionActionsMock.mockResolvedValue([
      {
        code: "project:settings:manage",
        permissionCodes: ["project:settings:manage"],
      },
    ]);
  });

  it("renders compact environment rows with linked deployment and primary domain", async () => {
    renderWithQuery(<ProjectEnvironmentsPage projectId="project-1" />);

    expect(await screen.findByTestId("project-environment-row-development")).toBeInTheDocument();
    const productionRow = screen.getByTestId("project-environment-row-production");
    expect(productionRow).toBeInTheDocument();
    expect(within(productionRow).getByText(/artifacts\/prod-42/)).toBeInTheDocument();
    expect(screen.getByText("www.example.com")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "account:SETTINGS_PROJECT_ENVIRONMENTS_EDIT" }),
    ).toHaveLength(3);
  });

  it("shows read-only guidance when manage access is unavailable", async () => {
    getMyProjectAuthzMock.mockResolvedValueOnce({
      projectId: "project-1",
      workspaceId: "workspace-1",
      isSuperuser: false,
      permissionCodes: ["project:settings:read"],
    });
    listProjectPermissionActionsMock.mockResolvedValueOnce([
      {
        code: "project:settings:manage",
        permissionCodes: ["project:settings:manage"],
      },
    ]);

    renderWithQuery(<ProjectEnvironmentsPage projectId="project-1" />);

    expect(await screen.findByTestId("project-environments-read-only-notice")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "account:SETTINGS_PROJECT_ENVIRONMENTS_EDIT" }),
    ).not.toBeInTheDocument();
  });

  it("renders the empty state when the environment list is empty", async () => {
    listProjectEnvironmentsMock.mockResolvedValueOnce([]);

    renderWithQuery(<ProjectEnvironmentsPage projectId="project-1" />);

    expect(await screen.findByTestId("guard-empty")).toBeInTheDocument();
    expect(
      screen.getByText("account:SETTINGS_PROJECT_ENVIRONMENTS_EMPTY_TITLE"),
    ).toBeInTheDocument();
  });

  it("updates the selected environment through the real patch API", async () => {
    patchProjectEnvironmentMock.mockResolvedValue({
      id: "env-dev",
      key: "development",
      name: "Development Preview",
      isProduction: false,
      isDefaultPreview: true,
    });

    renderWithQuery(<ProjectEnvironmentsPage projectId="project-1" />);

    fireEvent.click(
      await screen
        .findAllByRole("button", { name: "account:SETTINGS_PROJECT_ENVIRONMENTS_EDIT" })
        .then((buttons) => buttons[0]),
    );
    fireEvent.change(
      screen.getByPlaceholderText("account:SETTINGS_PROJECT_ENVIRONMENTS_NAME_PLACEHOLDER"),
      {
        target: { value: "Development Preview" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "account:SETTINGS_PROJECT_ENVIRONMENTS_SAVE" }),
    );

    await waitFor(() => {
      expect(patchProjectEnvironmentMock).toHaveBeenCalledWith("project-1", "env-dev", {
        name: "Development Preview",
        isDefaultPreview: true,
      });
    });
  });
});
