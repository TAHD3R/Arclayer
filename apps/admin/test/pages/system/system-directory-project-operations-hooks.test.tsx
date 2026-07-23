import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  useSystemProjectActivity,
  useSystemProjectOperations,
  useSystemProjectUsage,
} from "@/pages/system/directory/projects/project-operations-hooks";

const mocks = vi.hoisted(() => ({
  getOperations: vi.fn(),
  getOverview: vi.fn(),
  listAIUsageGroups: vi.fn(),
  listActivity: vi.fn(),
}));

vi.mock("@/api/system-directory", () => ({
  getSystemDirectoryProjectOperations: mocks.getOperations,
}));

vi.mock("@/api/platform-observability", () => ({
  getSystemObservabilityOverview: mocks.getOverview,
  listSystemAIUsageGroups: mocks.listAIUsageGroups,
}));

vi.mock("@/api/activity", () => ({
  listSystemActivity: mocks.listActivity,
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("system project operations hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the system-only operational projection with a bounded preview", async () => {
    const operations = { runtimeState: "ready", health: "healthy" };
    mocks.getOperations.mockResolvedValue(operations);

    const { result } = renderHook(() => useSystemProjectOperations("project-1", true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual(operations));
    expect(mocks.getOperations).toHaveBeenCalledWith("project-1", 6, expect.any(AbortSignal));
  });

  it("attributes both observability summaries and AI groups to the selected project", async () => {
    mocks.getOverview.mockResolvedValue({
      period: { startDate: "2026-06-01", endDate: "2026-07-01" },
    });
    mocks.listAIUsageGroups.mockResolvedValue({ items: [], total: 0, page: 1, size: 6, pages: 0 });

    const { result } = renderHook(() => useSystemProjectUsage("project-1", true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.overview.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.groups.isSuccess).toBe(true));
    expect(mocks.getOverview).toHaveBeenCalledWith(30, { projectId: "project-1" });
    expect(mocks.listAIUsageGroups).toHaveBeenCalledWith(
      { days: 30, page: 1, size: 6, projectId: "project-1" },
      expect.any(AbortSignal),
    );
  });

  it("requests recent activity using the project scope and newest-first ordering", async () => {
    mocks.listActivity.mockResolvedValue({ items: [], total: 0, page: 1, size: 6, pages: 0 });

    const { result } = renderHook(() => useSystemProjectActivity("project-1", true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.listActivity).toHaveBeenCalledWith({
      page: 1,
      size: 6,
      projectId: "project-1",
      ordering: "-occurred_at",
    });
  });
});
