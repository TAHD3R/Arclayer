import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContentAutomationPage } from "@/pages/projects/content/automation/page";

const mocked = vi.hoisted(() => ({
  createProjectAutomationFlow: vi.fn(),
  deleteProjectAutomationFlow: vi.fn(),
  getMyProjectAuthz: vi.fn(),
  getProjectAutomationCatalog: vi.fn(),
  listProjectAutomationFlows: vi.fn(),
  listProjectAutomationRuns: vi.fn(),
  listProjectPermissionActions: vi.fn(),
  updateProjectAutomationFlow: vi.fn(),
}));

vi.mock("@/api/automation", () => ({
  buildAutomationCatalogQueryKey: (...args: unknown[]) => [
    "content",
    "automation",
    "catalog",
    ...args,
  ],
  buildAutomationFlowsQueryKey: (...args: unknown[]) => ["content", "automation", "flows", ...args],
  buildAutomationRunsQueryKey: (...args: unknown[]) => ["content", "automation", "runs", ...args],
  createProjectAutomationFlow: (...args: unknown[]) => mocked.createProjectAutomationFlow(...args),
  deleteProjectAutomationFlow: (...args: unknown[]) => mocked.deleteProjectAutomationFlow(...args),
  getProjectAutomationCatalog: (...args: unknown[]) => mocked.getProjectAutomationCatalog(...args),
  listProjectAutomationFlows: (...args: unknown[]) => mocked.listProjectAutomationFlows(...args),
  listProjectAutomationRuns: (...args: unknown[]) => mocked.listProjectAutomationRuns(...args),
  updateProjectAutomationFlow: (...args: unknown[]) => mocked.updateProjectAutomationFlow(...args),
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
    t: (key: string) => key,
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

function buildCatalog() {
  return {
    triggers: [
      {
        kind: "publish_completed",
        eventName: "project.release.published",
        label: "Release published",
        description: "Runs after a release is activated.",
      },
      {
        kind: "api_key_rotated",
        eventName: "project.api_key.rotated",
        label: "API key rotated",
        description: "Runs after a project API key is rotated.",
      },
    ],
    operations: [
      {
        kind: "webhook",
        label: "Webhook",
        description: "Send a JSON webhook request.",
        requiredFields: ["url"],
      },
      {
        kind: "notification",
        label: "Notification",
        description: "Create a workspace notification.",
        requiredFields: ["recipientUserId", "title"],
      },
    ],
  };
}

function buildFlow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "flow-1",
    workspaceId: "project-1",
    name: "Publish webhook",
    description: "Notify a downstream system.",
    status: "active",
    triggerKind: "publish_completed",
    triggerEvent: "project.release.published",
    retryLimit: 0,
    deadLetterEnabled: true,
    credentialBinding: null,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    operations: [
      {
        id: "operation-1",
        flowId: "flow-1",
        name: "Call webhook",
        kind: "webhook",
        config: { url: "https://example.com/hooks/publish" },
        sortOrder: 0,
        createdAt: "2026-04-19T10:00:00Z",
        updatedAt: "2026-04-19T10:00:00Z",
      },
    ],
    createdAt: "2026-04-19T10:00:00Z",
    updatedAt: "2026-04-19T10:00:00Z",
    ...overrides,
  };
}

function buildRun(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "run-1",
    workspaceId: "project-1",
    flowId: "flow-1",
    triggerEvent: "project.release.published",
    status: "succeeded",
    attempt: 1,
    maxAttempts: 1,
    eventPayload: { projectId: "project-1" },
    resultPayload: { ok: true },
    error: null,
    startedAt: "2026-04-19T10:01:00Z",
    completedAt: "2026-04-19T10:01:01Z",
    createdAt: "2026-04-19T10:01:00Z",
    updatedAt: "2026-04-19T10:01:01Z",
    logs: [
      {
        id: "log-1",
        runId: "run-1",
        operationId: "operation-1",
        level: "info",
        message: "Operation completed.",
        payload: null,
        createdAt: "2026-04-19T10:01:01Z",
      },
    ],
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ContentAutomationPage projectId="project-1" />
    </QueryClientProvider>,
  );
}

describe("content-automation-page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getMyProjectAuthz.mockResolvedValue({
      projectId: "project-1",
      workspaceId: "ws-1",
      isSuperuser: false,
      permissionCodes: ["system:automation:manage"],
    });
    mocked.listProjectPermissionActions.mockResolvedValue([
      {
        code: "project:automation:manage",
        description: "Allow managing automation flows and operations.",
        subjectKinds: ["project_member"],
        permissionCodes: ["system:automation:manage"],
      },
    ]);
    mocked.getProjectAutomationCatalog.mockResolvedValue(buildCatalog());
    mocked.listProjectAutomationFlows.mockResolvedValue({ items: [buildFlow()] });
    mocked.listProjectAutomationRuns.mockResolvedValue({ items: [buildRun()] });
    mocked.createProjectAutomationFlow.mockResolvedValue(
      buildFlow({ id: "flow-2", name: "New flow" }),
    );
    mocked.updateProjectAutomationFlow.mockResolvedValue(
      buildFlow({ name: "Publish webhook updated" }),
    );
    mocked.deleteProjectAutomationFlow.mockResolvedValue(undefined);
  });

  test("renders flow inventory and run diagnostics", async () => {
    renderPage();

    expect(await screen.findByText("CONTENT_AUTOMATION_TITLE")).toBeInTheDocument();
    expect(await screen.findByText("Publish webhook")).toBeInTheDocument();
    expect(screen.getAllByText("project.release.published").length).toBeGreaterThan(0);
    expect(screen.getByText("CONTENT_AUTOMATION_RUNS_TITLE")).toBeInTheDocument();
    expect(await screen.findByText("Operation completed.")).toBeInTheDocument();
  });

  test("creates a flow from the editor", async () => {
    const user = userEvent.setup();
    mocked.listProjectAutomationFlows.mockResolvedValue({ items: [] });
    renderPage();

    const nameInput = await screen.findByLabelText("CONTENT_AUTOMATION_FIELD_NAME");
    await waitFor(() => {
      expect(nameInput).toBeEnabled();
    });
    await user.type(nameInput, "New flow");
    await user.type(
      screen.getByLabelText("CONTENT_AUTOMATION_FIELD_OPERATION_NAME"),
      "Call webhook",
    );
    await user.type(
      screen.getByLabelText("CONTENT_AUTOMATION_FIELD_OPERATION_URL"),
      "https://example.com/hooks/new",
    );
    const createButton = screen.getByRole("button", { name: "CONTENT_AUTOMATION_ACTION_CREATE" });
    await user.click(createButton);

    await waitFor(() => {
      expect(mocked.createProjectAutomationFlow).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({
          name: "New flow",
          operations: [
            expect.objectContaining({
              config: { url: "https://example.com/hooks/new" },
              kind: "webhook",
              name: "Call webhook",
            }),
          ],
          triggerKind: "publish_completed",
        }),
      );
    });
  });

  test("updates and deletes the selected flow", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText("Publish webhook"));
    const nameInput = screen.getByLabelText("CONTENT_AUTOMATION_FIELD_NAME");
    await user.clear(nameInput);
    await user.type(nameInput, "Publish webhook updated");
    await user.click(screen.getByRole("button", { name: "CONTENT_AUTOMATION_ACTION_SAVE" }));

    await waitFor(() => {
      expect(mocked.updateProjectAutomationFlow).toHaveBeenCalledWith(
        "project-1",
        "flow-1",
        expect.objectContaining({ name: "Publish webhook updated" }),
      );
    });

    await user.click(screen.getByRole("button", { name: "CONTENT_AUTOMATION_ACTION_DELETE" }));
    await waitFor(() => {
      expect(mocked.deleteProjectAutomationFlow).toHaveBeenCalledWith("project-1", "flow-1");
    });
  });

  test("keeps automation write controls closed while permissions warm up", async () => {
    mocked.getMyProjectAuthz.mockImplementationOnce(() => new Promise(() => {}));
    renderPage();

    const createButton = await screen.findByRole("button", {
      name: "CONTENT_AUTOMATION_ACTION_CREATE",
    });
    const newButtons = screen.getAllByRole("button", { name: "CONTENT_AUTOMATION_ACTION_NEW" });

    expect(createButton).toBeDisabled();
    expect(newButtons.length).toBeGreaterThan(0);
    newButtons.forEach((button) => expect(button).toBeDisabled());
    expect(screen.queryByText("CONTENT_AUTOMATION_NO_ACCESS_DESC")).not.toBeInTheDocument();
  });
});
