import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContentLibraryItemResolverPage } from "@/pages/projects/content/library/item-resolver/page";

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

vi.mock("@/pages/projects/content/library/article-editor/page", () => ({
  ContentLibraryArticleEditorPage: (props: { workspaceId: string; itemId: string }) => (
    <div data-testid="content-library-article-editor-page">
      {props.workspaceId}:{props.itemId}
    </div>
  ),
}));

vi.mock("@/pages/projects/content/site-builder/page", () => ({
  ContentSiteBuilderPage: (props: { workspaceId: string; item?: { id: string } | null }) => (
    <div data-testid="content-site-builder-page">
      {props.workspaceId}:{props.item?.id ?? "none"}
    </div>
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

describe("ContentLibraryItemResolverPage", () => {
  beforeEach(() => {
    getContentItemMock.mockReset();
  });

  test("renders the article editor when the continuation surface is writing", async () => {
    getContentItemMock.mockResolvedValue({
      id: "item-1",
      workspaceId: "ws-1",
      siteId: "site-1",
      slug: "hello-world",
      title: "Hello world",
      status: "draft",
      visibility: "private",
      locale: "en-US",
      bootstrapPresetState: "selected",
      capabilityPackIds: ["publishable", "rich_text_editable"],
      resolvedRole: "article",
      resolvedPosture: "entry",
      resolvedSurface: "writing",
      shapeState: "ready",
      draftVersion: 1,
      updatedAt: "2026-03-19T00:00:00Z",
      continuationTarget: {
        surface: "writing",
        route: "/w/ws-1/content/library/item-1",
        blocked: false,
        reasonCode: null,
        reasonMeta: null,
        recoveryActions: [],
      },
    });

    render(<ContentLibraryItemResolverPage workspaceId="ws-1" itemId="item-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("content-library-article-editor-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("content-item-continuation-state")).not.toBeInTheDocument();
  });

  test("renders recovery UI when continuation is blocked", async () => {
    getContentItemMock.mockResolvedValue({
      id: "item-2",
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
      updatedAt: "2026-03-19T00:00:00Z",
      continuationTarget: {
        surface: null,
        route: "/w/ws-1/content/library/item-2",
        blocked: true,
        reasonCode: "UNSHAPED_ITEM",
        reasonMeta: { source: "bootstrap" },
        recoveryActions: [{ kind: "reshape", label: "Reshape", route: "/w/ws-1/content/create" }],
      },
    });

    render(<ContentLibraryItemResolverPage workspaceId="ws-1" itemId="item-2" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("content-item-continuation-state")).toBeInTheDocument();
    });
    expect(screen.getByTestId("content-library-detail-summary-strip")).toBeInTheDocument();
    expect(screen.getByText("UNSHAPED_ITEM")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reshape" })).toHaveAttribute(
      "href",
      "/w/ws-1/content/create",
    );
    expect(screen.queryByTestId("content-library-article-editor-page")).not.toBeInTheDocument();
  });

  test("renders the site builder surface for canvas continuation surfaces", async () => {
    getContentItemMock.mockResolvedValue({
      id: "item-3",
      workspaceId: "ws-1",
      siteId: "site-1",
      slug: "landing-page",
      title: "Landing page",
      status: "draft",
      visibility: "private",
      locale: "en-US",
      bootstrapPresetState: "selected",
      capabilityPackIds: ["routable", "visual_editable"],
      resolvedRole: "page",
      resolvedPosture: "page",
      resolvedSurface: "canvas",
      shapeState: "ready",
      draftVersion: 1,
      updatedAt: "2026-03-19T00:00:00Z",
      continuationTarget: {
        surface: "canvas",
        route: "/w/ws-1/content/library/item-3",
        blocked: false,
        reasonCode: null,
        reasonMeta: null,
        recoveryActions: [],
      },
    });

    render(<ContentLibraryItemResolverPage workspaceId="ws-1" itemId="item-3" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("content-site-builder-page")).toBeInTheDocument();
    });
    expect(screen.getByTestId("content-site-builder-page")).toHaveTextContent("ws-1:item-3");
    expect(screen.queryByTestId("content-library-article-editor-page")).not.toBeInTheDocument();
    expect(screen.queryByTestId("content-item-continuation-state")).not.toBeInTheDocument();
  });
});
