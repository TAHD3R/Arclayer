import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listSystemActivity } from "@/api/activity";
import {
  listSystemHTTPRequestGroups,
  listSystemHTTPRequestRecords,
} from "@/api/platform-observability";
import { AuditEventsTable } from "@/pages/system/audit-log/audit-events-table";
import { RequestGroupsTable } from "@/pages/system/audit-log/request-groups-table";
import { RequestRecordsTable } from "@/pages/system/audit-log/request-records-table";

vi.mock("@/api/activity", () => ({ listSystemActivity: vi.fn() }));
vi.mock("@/api/platform-observability", () => ({
  listSystemHTTPRequestGroups: vi.fn(),
  listSystemHTTPRequestRecords: vi.fn(),
}));
vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({ formatDateTime: (value: string) => `date:${value}` }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

function renderWithQueryClient(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

describe("system audit data tables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listSystemHTTPRequestGroups).mockResolvedValue({
      items: [
        {
          routeTemplate: "/api/v1/projects/{project_id}/content/items",
          method: "GET",
          statusClass: 2,
          requests: 120,
          errorRequests: 3,
          errorRate: 0.025,
          avgLatencyMs: 42,
          p95LatencyMs: 120,
          p99LatencyMs: 170,
          maxLatencyMs: 180,
          lastSeenAt: "2026-07-13T02:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      size: 10,
      pages: 1,
      next: null,
      prev: null,
    });
    vi.mocked(listSystemActivity).mockResolvedValue({
      items: [
        {
          id: "event-1",
          eventName: "deployment.promoted",
          source: "deployment",
          occurredAt: "2026-07-13T01:00:00Z",
          workspaceId: "workspace-1",
          projectId: "project-1",
          actorUserId: "user-1",
          actor: { id: "user-1", displayName: "Alex", username: "alex", avatarUrl: null },
          entityType: "deployment",
          entityId: "deployment-1",
          traceId: "trace-1",
          properties: {},
        },
      ],
      total: 1,
      page: 1,
      size: 10,
      pages: 1,
      next: null,
      prev: null,
    } as never);
    vi.mocked(listSystemHTTPRequestRecords).mockResolvedValue({
      items: [
        {
          id: "record-1",
          occurredAt: "2026-07-13T03:00:00Z",
          traceId: "trace-1",
          actorUserId: "user-1",
          actor: { id: "user-1", displayName: "Alex", username: "alex", avatarUrl: null },
          workspaceId: "workspace-1",
          projectId: "project-1",
          routeTemplate: "/api/v1/projects/{project_id}/content/items",
          method: "PATCH",
          statusCode: 503,
          durationMs: 88,
        },
      ],
      total: 1,
      page: 1,
      size: 10,
      pages: 1,
      next: null,
      prev: null,
    });
  });

  it("renders request aggregates through DataTable and forwards route/method/status filters", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<RequestGroupsTable days={30} />);

    expect(await screen.findByText("/api/v1/projects/{project_id}/content/items")).toBeVisible();
    expect(screen.getByText("GET")).toBeVisible();
    expect(screen.getByText("2xx")).toBeVisible();
    expect(screen.getByText("120")).toHaveClass("tabular-nums");

    await user.type(
      screen.getByRole("textbox", { name: "platform:AUDIT_REQUEST_SEARCH_PLACEHOLDER" }),
      "content/items",
    );
    await waitFor(() => {
      expect(listSystemHTTPRequestGroups).toHaveBeenCalledWith(
        expect.objectContaining({ q: "content/items" }),
      );
    });

    await user.click(screen.getByRole("button", { name: "platform:AUDIT_FILTER_TITLE" }));
    await user.hover(screen.getByRole("option", { name: "platform:AUDIT_REQUEST_METHOD" }));
    const getOption = await screen.findByRole("option", { name: "GET" });
    act(() => getOption.focus());
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(listSystemHTTPRequestGroups).toHaveBeenCalledWith(
        expect.objectContaining({
          q: "content/items",
          method: "GET",
        }),
      );
    });

    await user.click(screen.getByRole("button", { name: "platform:AUDIT_FILTER_TITLE" }));
    await user.hover(screen.getByRole("option", { name: "platform:AUDIT_REQUEST_STATUS" }));
    const successOption = await screen.findByRole("option", { name: "2xx" });
    act(() => successOption.focus());
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(listSystemHTTPRequestGroups).toHaveBeenLastCalledWith(
        expect.objectContaining({
          days: 30,
          q: "content/items",
          method: "GET",
          statusClass: 2,
        }),
      );
    });
  });

  it("renders canonical events through DataTable with truncated operational identifiers", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(<AuditEventsTable onSelect={onSelect} />);

    expect(await screen.findByText("deployment.promoted")).toHaveClass("truncate");
    expect(screen.getByText("deployment", { selector: "span" })).toBeVisible();
    expect(screen.getByText("platform:AUDIT_ENTITY_DEPLOYMENT")).toBeVisible();
    expect(screen.queryByText("trace-1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alex" })).toBeVisible();
    await user.click(screen.getByText("deployment.promoted"));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "event-1" }));
  });

  it("renders raw request evidence and opens the selected record", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderWithQueryClient(
      <RequestRecordsTable
        days={30}
        workspaceLabelById={{ "workspace-1": "Production" }}
        projectLabelById={{ "project-1": "Website" }}
        onSelect={onSelect}
      />,
    );

    expect(await screen.findByText("/api/v1/projects/{project_id}/content/items")).toBeVisible();
    expect(screen.getByText("503")).toBeVisible();
    expect(screen.getByText("Website")).toBeVisible();
    expect(screen.queryByText("trace-1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alex" })).toBeVisible();
    await user.click(screen.getByText("/api/v1/projects/{project_id}/content/items"));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "record-1" }));
  });
});
