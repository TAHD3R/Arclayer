import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import type { AIWorkspaceActionResponse } from "@/api/ai";
import { invalidateAIWorkspaceActionQueries } from "@/components/ai/ai-workspace-action-cache";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function completedWorkspaceAction(
  overrides: Partial<AIWorkspaceActionResponse>,
): AIWorkspaceActionResponse {
  return {
    kind: "tool_call",
    action: null,
    status: "completed",
    content: "Completed.",
    executionSteps: [],
    toolCalls: [],
    contentModels: [],
    projects: [],
    total: null,
    ...overrides,
  };
}

describe("invalidateAIWorkspaceActionQueries", () => {
  it("refreshes editor source after a combined homepage and source update", async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateAIWorkspaceActionQueries(
      queryClient,
      completedWorkspaceAction({
        action: "update_homepage",
        navigation: { label: "Open editor", path: "/projects/project-1/editor" },
        contentItem: {
          id: "item-home",
          workspaceId: "workspace-1",
          siteId: "site-1",
          modelKey: "page",
          slug: "home",
          locale: "en-US",
          status: "published",
        },
        sourceManifest: {
          files: [{ path: "src/App.tsx", role: "entry", language: "typescriptreact" }],
        },
        release: { release: { releaseNumber: 4 } },
      }),
    );

    const invalidatedKeys = invalidateSpy.mock.calls.map(([options]) => options?.queryKey);
    expect(invalidatedKeys).toContainEqual(["project", "source", "project-1"]);
    expect(invalidatedKeys).toContainEqual(["project", "releases", "project-1"]);
    expect(invalidatedKeys).toContainEqual([
      "content-library-runtime",
      "items",
      "all",
      "project-1",
    ]);
  });

  it("does not refresh editor source for read-only source inspection", async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateAIWorkspaceActionQueries(
      queryClient,
      completedWorkspaceAction({
        action: "read_project_source",
        navigation: { label: "Open editor", path: "/projects/project-1/editor" },
        sourceManifest: {
          files: [{ path: "src/App.tsx", role: "entry", language: "typescriptreact" }],
        },
      }),
      { fallbackProjectId: "project-1" },
    );

    const invalidatedKeys = invalidateSpy.mock.calls.map(([options]) => options?.queryKey);
    expect(invalidatedKeys).not.toContainEqual(["project", "source", "project-1"]);
  });
});
