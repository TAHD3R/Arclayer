import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContentLibraryItemResolverPage } from "@/pages/workspaces/content/library/item-resolver/page";

const getContentItemMock = vi.fn();

vi.mock("@/api/content", () => ({
  getContentItem: (...args: unknown[]) => getContentItemMock(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.surface ? `${key}:${String(options.surface)}` : key,
  }),
}));

vi.mock("@/pages/workspaces/content/library/article-editor/page", () => ({
  ContentLibraryArticleEditorPage: (props: { workspaceId: string; itemId: string }) => (
    <div data-testid="content-library-article-editor-page">
      {props.workspaceId}:{props.itemId}
    </div>
  ),
}));

vi.mock("@/pages/workspaces/content/structured/page", () => ({
  ContentStructuredSurfacePage: (props: { item: { id: string } }) => (
    <div data-testid="content-structured-surface">structured:{props.item.id}</div>
  ),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("content surface routing", () => {
  beforeEach(() => {
    getContentItemMock.mockReset();
  });

  test("routes structured items into the structured surface", async () => {
    getContentItemMock.mockResolvedValue({
      id: "item-structured",
      workspaceId: "ws-1",
      siteId: "site-1",
      slug: "faq-entry",
      title: "FAQ entry",
      status: "draft",
      visibility: "private",
      locale: "en-US",
      bootstrapPresetState: "selected",
      capabilityPackIds: ["queryable"],
      resolvedRole: "data",
      resolvedPosture: "structured",
      resolvedSurface: "structured",
      shapeState: "ready",
      draftVersion: 1,
      updatedAt: "2026-04-04T00:00:00Z",
      continuationTarget: {
        surface: "structured",
        route: "/w/ws-1/content/library/item-structured",
        blocked: false,
        reasonCode: null,
        reasonMeta: null,
        recoveryActions: [],
      },
    });

    render(<ContentLibraryItemResolverPage workspaceId="ws-1" itemId="item-structured" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("content-structured-surface")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("content-item-continuation-state")).not.toBeInTheDocument();
  });

  test("routes canvas items into the library handoff surface", async () => {
    getContentItemMock.mockResolvedValue({
      id: "item-canvas",
      workspaceId: "ws-1",
      siteId: "site-1",
      slug: "landing-page",
      title: "Landing page",
      status: "draft",
      visibility: "private",
      locale: "en-US",
      bootstrapPresetState: "selected",
      capabilityPackIds: ["visual_editable"],
      resolvedRole: "page",
      resolvedPosture: "page",
      resolvedSurface: "canvas",
      shapeState: "ready",
      draftVersion: 1,
      updatedAt: "2026-04-04T00:00:00Z",
      continuationTarget: {
        surface: "canvas",
        route: "/w/ws-1/content/library/item-canvas",
        blocked: false,
        reasonCode: null,
        reasonMeta: null,
        recoveryActions: [],
      },
    });

    render(<ContentLibraryItemResolverPage workspaceId="ws-1" itemId="item-canvas" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("content-page-handoff-state")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("link", { name: "CONTENT_PAGE_HANDOFF_ACTION_OPEN_IN_LIBRARY" }),
    ).toHaveAttribute("href", "/w/ws-1/content/library?view=draft&focusItemId=item-canvas");
    expect(screen.queryByTestId("content-item-continuation-state")).not.toBeInTheDocument();
  });

  test("keeps blocked items on the recovery surface", async () => {
    getContentItemMock.mockResolvedValue({
      id: "item-blocked",
      workspaceId: "ws-1",
      siteId: "site-1",
      slug: "blocked-item",
      title: "Blocked item",
      status: "draft",
      visibility: "private",
      locale: "en-US",
      bootstrapPresetState: "none",
      capabilityPackIds: [],
      shapeState: "unshaped",
      shapeReasonCode: "UNSHAPED_ITEM",
      draftVersion: 1,
      updatedAt: "2026-04-04T00:00:00Z",
      continuationTarget: {
        surface: "structured",
        route: "/w/ws-1/content/library/item-blocked",
        blocked: true,
        reasonCode: "UNSHAPED_ITEM",
        reasonMeta: { source: "bootstrap" },
        recoveryActions: [{ kind: "reshape", label: "Reshape", route: "/w/ws-1/content/create" }],
      },
    });

    render(<ContentLibraryItemResolverPage workspaceId="ws-1" itemId="item-blocked" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("content-item-continuation-state")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("content-structured-surface")).not.toBeInTheDocument();
    expect(screen.queryByTestId("content-page-handoff-state")).not.toBeInTheDocument();
  });
});
