import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContentAutomationPage } from "@/pages/workspaces/content/automation/page";

const mocked = vi.hoisted(() => ({
  createWorkspaceAutomationFlow: vi.fn(),
  deleteWorkspaceAutomationFlow: vi.fn(),
  getMyWorkspaceAuthz: vi.fn(),
  getWorkspaceAutomationCatalog: vi.fn(),
  listWorkspaceAutomationFlows: vi.fn(),
  listWorkspaceAutomationRuns: vi.fn(),
  listWorkspacePermissionActions: vi.fn(),
  updateWorkspaceAutomationFlow: vi.fn(),
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
  createWorkspaceAutomationFlow: (...args: unknown[]) =>
    mocked.createWorkspaceAutomationFlow(...args),
  deleteWorkspaceAutomationFlow: (...args: unknown[]) =>
    mocked.deleteWorkspaceAutomationFlow(...args),
  getWorkspaceAutomationCatalog: (...args: unknown[]) =>
    mocked.getWorkspaceAutomationCatalog(...args),
  listWorkspaceAutomationFlows: (...args: unknown[]) =>
    mocked.listWorkspaceAutomationFlows(...args),
  listWorkspaceAutomationRuns: (...args: unknown[]) => mocked.listWorkspaceAutomationRuns(...args),
  updateWorkspaceAutomationFlow: (...args: unknown[]) =>
    mocked.updateWorkspaceAutomationFlow(...args),
}));

vi.mock("@/api/workspaces", () => ({
  getMyWorkspaceAuthz: (...args: unknown[]) => mocked.getMyWorkspaceAuthz(...args),
}));

vi.mock("@/api/rbac", () => ({
  listWorkspacePermissionActions: (...args: unknown[]) =>
    mocked.listWorkspacePermissionActions(...args),
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
        eventName: "workspace.release.published",
        label: "Release published",
        description: "Runs after a release is activated.",
      },
      {
        kind: "api_key_rotated",
        eventName: "workspace.api_key.rotated",
        label: "API key rotated",
        description: "Runs after a workspace API key is rotated.",
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
    workspaceId: "ws-1",
    name: "Publish webhook",
    description: "Notify a downstream system.",
    status: "active",
    triggerKind: "publish_completed",
    triggerEvent: "workspace.release.published",
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
    workspaceId: "ws-1",
    flowId: "flow-1",
    triggerEvent: "workspace.release.published",
    status: "succeeded",
    attempt: 1,
    maxAttempts: 1,
    eventPayload: { workspaceId: "ws-1" },
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
      <ContentAutomationPage workspaceId="ws-1" />
    </QueryClientProvider>,
  );
}

describe("content-automation-page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getMyWorkspaceAuthz.mockResolvedValue({
      workspaceId: "ws-1",
      isSuperuser: false,
      permissionCodes: ["system:automation:manage"],
    });
    mocked.listWorkspacePermissionActions.mockResolvedValue([
      {
        code: "system:automation:manage",
        description: "Manage workspace automation flows.",
        subjectKinds: ["workspace_member"],
        permissionCodes: ["system:automation:manage"],
      },
    ]);
    mocked.getWorkspaceAutomationCatalog.mockResolvedValue(buildCatalog());
    mocked.listWorkspaceAutomationFlows.mockResolvedValue({ items: [buildFlow()] });
    mocked.listWorkspaceAutomationRuns.mockResolvedValue({ items: [buildRun()] });
    mocked.createWorkspaceAutomationFlow.mockResolvedValue(
      buildFlow({ id: "flow-2", name: "New flow" }),
    );
    mocked.updateWorkspaceAutomationFlow.mockResolvedValue(
      buildFlow({ name: "Publish webhook updated" }),
    );
    mocked.deleteWorkspaceAutomationFlow.mockResolvedValue(undefined);
  });

  test("renders flow inventory and run diagnostics", async () => {
    renderPage();

    expect(await screen.findByText("CONTENT_AUTOMATION_TITLE")).toBeInTheDocument();
    expect(await screen.findByText("Publish webhook")).toBeInTheDocument();
    expect(screen.getAllByText("workspace.release.published").length).toBeGreaterThan(0);
    expect(screen.getByText("CONTENT_AUTOMATION_RUNS_TITLE")).toBeInTheDocument();
    expect(await screen.findByText("Operation completed.")).toBeInTheDocument();
  });

  test("creates a flow from the editor", async () => {
    const user = userEvent.setup();
    mocked.listWorkspaceAutomationFlows.mockResolvedValue({ items: [] });
    renderPage();

    await user.type(await screen.findByLabelText("CONTENT_AUTOMATION_FIELD_NAME"), "New flow");
    await user.type(
      screen.getByLabelText("CONTENT_AUTOMATION_FIELD_OPERATION_NAME"),
      "Call webhook",
    );
    await user.type(
      screen.getByLabelText("CONTENT_AUTOMATION_FIELD_OPERATION_URL"),
      "https://example.com/hooks/new",
    );
    await user.click(screen.getByRole("button", { name: "CONTENT_AUTOMATION_ACTION_CREATE" }));

    await waitFor(() => {
      expect(mocked.createWorkspaceAutomationFlow).toHaveBeenCalledWith(
        "ws-1",
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
      expect(mocked.updateWorkspaceAutomationFlow).toHaveBeenCalledWith(
        "ws-1",
        "flow-1",
        expect.objectContaining({ name: "Publish webhook updated" }),
      );
    });

    await user.click(screen.getByRole("button", { name: "CONTENT_AUTOMATION_ACTION_DELETE" }));
    await waitFor(() => {
      expect(mocked.deleteWorkspaceAutomationFlow).toHaveBeenCalledWith("ws-1", "flow-1");
    });
  });
});
