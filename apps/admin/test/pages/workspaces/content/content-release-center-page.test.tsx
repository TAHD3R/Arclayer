import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContentReleaseCenterPage } from "@/pages/projects/content/releases/page";

const mocked = vi.hoisted(() => ({
  getProjectReleaseDryRun: vi.fn(),
  listProjectReleases: vi.fn(),
  publishProjectRelease: vi.fn(),
  rollbackProjectRelease: vi.fn(),
  getMyProjectAuthz: vi.fn(),
  listProjectPermissionActions: vi.fn(),
}));

vi.mock("@/api/content", () => ({
  getProjectReleaseDryRun: (...args: unknown[]) => mocked.getProjectReleaseDryRun(...args),
  listProjectReleases: (...args: unknown[]) => mocked.listProjectReleases(...args),
  publishProjectRelease: (...args: unknown[]) => mocked.publishProjectRelease(...args),
  rollbackProjectRelease: (...args: unknown[]) => mocked.rollbackProjectRelease(...args),
}));

vi.mock("@/api/workspaces", () => ({
  getMyProjectAuthz: (...args: unknown[]) => mocked.getMyProjectAuthz(...args),
}));

vi.mock("@/api/rbac", () => ({
  listProjectPermissionActions: (...args: unknown[]) =>
    mocked.listProjectPermissionActions(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params?.releaseNumber ? `${key}:${params.releaseNumber}` : key,
  }),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({
    title,
    description,
    action,
    children,
  }: PropsWithChildren<{ title: string; description: string; action?: React.ReactNode }>) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      <div>{action}</div>
      {children}
    </div>
  ),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ContentReleaseCenterPage projectId="project-1" />
    </QueryClientProvider>,
  );
}

describe("content-release-center-page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getMyProjectAuthz.mockResolvedValue({
      projectId: "project-1",
      workspaceId: "ws-1",
      isSuperuser: false,
      permissionCodes: ["system:content:publish"],
    });
    mocked.listProjectPermissionActions.mockResolvedValue([
      {
        code: "project:release:publish",
        description: "Publish content entries through the shared lifecycle workflow.",
        subjectKinds: ["project_member"],
        permissionCodes: ["system:content:publish"],
      },
    ]);
    mocked.getProjectReleaseDryRun.mockResolvedValue({
      readinessSummary: {
        ready: false,
        selectedItemCount: 12,
        blockedItemCount: 1,
        blockerCodes: ["WORKFLOW_STAGE_NOT_APPROVED"],
      },
      impact: {
        blockedItems: [
          {
            itemId: "content-1",
            reasonCode: "WORKFLOW_STAGE_NOT_APPROVED",
            workflowStage: "in_review",
            shapeState: "ready",
          },
        ],
        missingRoutes: ["content-2"],
        unresolvedRelations: ["content-3"],
        unpublishedDependencies: ["content-4"],
        readinessSummary: {
          ready: false,
          selectedItemCount: 12,
          blockedItemCount: 1,
          blockerCodes: ["WORKFLOW_STAGE_NOT_APPROVED"],
        },
      },
    });
    mocked.listProjectReleases.mockResolvedValue({
      items: [
        {
          id: "release-2",
          workspaceId: "project-1",
          siteId: "site-1",
          releaseNumber: 2,
          isActive: true,
          activatedAt: "2026-04-19T10:00:00Z",
          createdAt: "2026-04-19T10:00:00Z",
          updatedAt: "2026-04-19T10:00:00Z",
          createdByUserId: "user-1",
          selectionCount: 12,
          lineage: { parentReleaseId: "release-1", parentReleaseNumber: 1 },
        },
        {
          id: "release-1",
          workspaceId: "project-1",
          siteId: "site-1",
          releaseNumber: 1,
          isActive: false,
          activatedAt: "2026-04-18T09:00:00Z",
          createdAt: "2026-04-18T09:00:00Z",
          updatedAt: "2026-04-18T09:00:00Z",
          createdByUserId: "user-1",
          selectionCount: 10,
          lineage: { parentReleaseId: null, parentReleaseNumber: null },
        },
      ],
    });
    mocked.publishProjectRelease.mockResolvedValue({});
    mocked.rollbackProjectRelease.mockResolvedValue({});
  });

  test("renders readiness summary, blockers, and release history", async () => {
    renderPage();

    expect(await screen.findByText("CONTENT_RELEASE_TITLE")).toBeInTheDocument();
    expect((await screen.findAllByText("WORKFLOW_STAGE_NOT_APPROVED")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("CONTENT_RELEASE_SELECTED_ITEMS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CONTENT_RELEASE_BLOCKERS_TITLE").length).toBeGreaterThan(0);
    expect(screen.getByText("content-2")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
  });

  test("publishes and rolls back through the release APIs", async () => {
    const user = userEvent.setup();
    mocked.getProjectReleaseDryRun.mockResolvedValueOnce({
      readinessSummary: {
        ready: true,
        selectedItemCount: 12,
        blockedItemCount: 0,
        blockerCodes: [],
      },
      impact: {
        blockedItems: [],
        missingRoutes: [],
        unresolvedRelations: [],
        unpublishedDependencies: [],
        readinessSummary: {
          ready: true,
          selectedItemCount: 12,
          blockedItemCount: 0,
          blockerCodes: [],
        },
      },
    });
    renderPage();

    const publishButton = await screen.findByRole("button", {
      name: "CONTENT_RELEASE_ACTION_PUBLISH",
    });
    await waitFor(() => {
      expect(publishButton).toBeEnabled();
    });

    await user.click(publishButton);
    await waitFor(() => {
      expect(mocked.publishProjectRelease).toHaveBeenCalledWith("project-1");
    });

    await user.click(
      await screen.findByRole("button", { name: "CONTENT_RELEASE_ACTION_ROLLBACK" }),
    );
    await waitFor(() => {
      expect(mocked.rollbackProjectRelease).toHaveBeenCalledWith("project-1", "release-1");
    });
  });

  test("keeps publish closed while permissions warm up", async () => {
    mocked.getMyProjectAuthz.mockImplementationOnce(() => new Promise(() => {}));
    mocked.getProjectReleaseDryRun.mockResolvedValueOnce({
      readinessSummary: {
        ready: true,
        selectedItemCount: 12,
        blockedItemCount: 0,
        blockerCodes: [],
      },
      impact: {
        blockedItems: [],
        missingRoutes: [],
        unresolvedRelations: [],
        unpublishedDependencies: [],
        readinessSummary: {
          ready: true,
          selectedItemCount: 12,
          blockedItemCount: 0,
          blockerCodes: [],
        },
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "CONTENT_RELEASE_ACTION_PUBLISH" })).toBeDisabled();
    });
  });
});
