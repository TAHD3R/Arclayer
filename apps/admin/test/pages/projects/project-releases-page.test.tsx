import type { PropsWithChildren, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectReleasesPage } from "@/pages/projects/releases/page";

const listProjectReleasesMock = vi.fn();
const getProjectReleaseDryRunMock = vi.fn();
const publishProjectReleaseMock = vi.fn();
const rollbackProjectReleaseMock = vi.fn();
const notifyErrorMock = vi.fn();
const notifySuccessTextMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values?.count !== undefined ? `${key}:${values.count}` : key,
  }),
}));

vi.mock("@/api/project-releases", () => ({
  buildProjectReleasesQueryKey: (projectId: string) => ["project", "releases", projectId],
  getProjectReleaseDryRun: (...args: unknown[]) => getProjectReleaseDryRunMock(...args),
  listProjectReleases: (...args: unknown[]) => listProjectReleasesMock(...args),
  publishProjectRelease: (...args: unknown[]) => publishProjectReleaseMock(...args),
  rollbackProjectRelease: (...args: unknown[]) => rollbackProjectReleaseMock(...args),
}));

vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({
    formatDateTime: (value: string | null | undefined) => `formatted:${value ?? "-"}`,
  }),
}));

vi.mock("@/hooks/use-workspace-permission-access", () => ({
  useProjectPermissionAccess: () => ({
    authzQuery: { isFetched: true },
    hasAction: (code: string) =>
      code === "project:release:publish" || code === "project:release:rollback",
  }),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
  notifySuccessText: (...args: unknown[]) => notifySuccessTextMock(...args),
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
    children,
  }: PropsWithChildren<{ loading?: boolean; error?: unknown | null }>) => {
    if (loading) return <div data-testid="content-guard-loading" />;
    if (error) return <div data-testid="content-guard-error" />;
    return <>{children}</>;
  },
}));

vi.mock("@/components/common/access-notice-alert", () => ({
  AccessNoticeAlert: ({
    description,
    "data-testid": testId,
  }: {
    description: ReactNode;
    "data-testid"?: string;
  }) => <div data-testid={testId}>{description}</div>,
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

const ACTIVE_RELEASE = {
  activatedAt: "2026-07-05T10:10:00.000Z",
  createdAt: "2026-07-05T10:00:00.000Z",
  createdByUserId: null,
  id: "release-active",
  isActive: true,
  lineage: {
    parentReleaseId: "release-previous",
    parentReleaseNumber: 6,
  },
  releaseNumber: 7,
  scheduledAt: null,
  selectionCount: 4,
  siteId: "site-1",
  status: "active",
  updatedAt: "2026-07-05T10:10:00.000Z",
  workspaceId: "workspace-1",
};

const PREVIOUS_RELEASE = {
  ...ACTIVE_RELEASE,
  activatedAt: "2026-07-04T10:10:00.000Z",
  createdAt: "2026-07-04T10:00:00.000Z",
  id: "release-previous",
  isActive: false,
  lineage: {
    parentReleaseId: null,
    parentReleaseNumber: null,
  },
  releaseNumber: 6,
  status: "published",
};

const READY_DRY_RUN = {
  impact: {
    blockedItems: [],
    missingRoutes: ["/draft"],
    readinessSummary: {
      blockedItemCount: 0,
      blockerCodes: [],
      ready: true,
      selectedItemCount: 4,
    },
    unpublishedDependencies: [],
    unresolvedRelations: [],
  },
  readinessSummary: {
    blockedItemCount: 0,
    blockerCodes: [],
    ready: true,
    selectedItemCount: 4,
  },
};

describe("ProjectReleasesPage", () => {
  beforeEach(() => {
    listProjectReleasesMock.mockReset();
    getProjectReleaseDryRunMock.mockReset();
    publishProjectReleaseMock.mockReset();
    rollbackProjectReleaseMock.mockReset();
    notifyErrorMock.mockReset();
    notifySuccessTextMock.mockReset();

    listProjectReleasesMock.mockResolvedValue([ACTIVE_RELEASE, PREVIOUS_RELEASE]);
    getProjectReleaseDryRunMock.mockResolvedValue(READY_DRY_RUN);
    publishProjectReleaseMock.mockResolvedValue({
      graphNodes: 4,
      impact: READY_DRY_RUN.impact,
      job: null,
      release: { ...ACTIVE_RELEASE, id: "release-new", releaseNumber: 8 },
      selectionCount: 4,
    });
    rollbackProjectReleaseMock.mockResolvedValue({
      previousActiveReleaseId: ACTIVE_RELEASE.id,
      release: { ...PREVIOUS_RELEASE, isActive: true },
    });
  });

  it("shows release readiness and release history", async () => {
    renderWithQuery(<ProjectReleasesPage projectId="project-1" />);

    expect(
      await screen.findByText("SETTINGS_PROJECT_RELEASES_ACTIVE_RELEASE:7"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("SETTINGS_PROJECT_RELEASES_READY")).not.toHaveLength(0);
    expect(screen.getByTestId("project-release-readiness")).toHaveTextContent(
      "SETTINGS_PROJECT_RELEASES_SELECTION_COUNT",
    );
    expect(screen.getByTestId("project-release-readiness")).toHaveTextContent("4");
    expect(screen.getByText("SETTINGS_PROJECT_RELEASES_RELEASE_NUMBER:6")).toBeInTheDocument();
    expect(screen.getByText("SETTINGS_PROJECT_RELEASES_HISTORY_COUNT:2")).toBeInTheDocument();
    expect(screen.queryByTestId("project-releases-workflow-panel")).not.toBeInTheDocument();
    expect(
      screen.queryByText("SETTINGS_PROJECT_RELEASES_WORKFLOW_LINK_EDITOR"),
    ).not.toBeInTheDocument();
  });

  it("publishes a new website release", async () => {
    const user = userEvent.setup();
    renderWithQuery(<ProjectReleasesPage projectId="project-1" />);

    await user.click(await screen.findByTestId("project-release-publish"));
    expect(publishProjectReleaseMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("setting-dialog")).toHaveTextContent(
      "account:SETTINGS_PROJECT_RELEASES_PUBLISH_DIALOG_TITLE",
    );
    await user.click(screen.getByTestId("project-release-publish-confirm"));

    await waitFor(() => {
      expect(publishProjectReleaseMock).toHaveBeenCalledWith("project-1");
    });
    expect(notifySuccessTextMock).toHaveBeenCalledWith(
      "account:SETTINGS_PROJECT_RELEASES_PUBLISHED:8",
    );
  });

  it("rolls back to a previous website release", async () => {
    const user = userEvent.setup();
    renderWithQuery(<ProjectReleasesPage projectId="project-1" />);

    await user.click(await screen.findByTestId("project-release-rollback-release-previous"));
    expect(screen.getByTestId("setting-dialog")).toHaveTextContent(
      "account:SETTINGS_PROJECT_RELEASES_ROLLBACK_DIALOG_TITLE",
    );

    await user.click(screen.getByTestId("project-release-rollback-confirm"));

    await waitFor(() => {
      expect(rollbackProjectReleaseMock).toHaveBeenCalledWith("project-1", "release-previous");
    });
    expect(notifySuccessTextMock).toHaveBeenCalledWith(
      "account:SETTINGS_PROJECT_RELEASES_ROLLED_BACK:6",
    );
  });
});
