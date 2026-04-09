import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useContentBootstrapController } from "@/pages/workspaces/content/bootstrap/hooks/use-content-bootstrap-controller";

const navigateMock = vi.fn().mockResolvedValue(undefined);
const createContentItemMock = vi.fn();
const listAllContentModelsMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/api/content", () => ({
  createContentItem: (...args: unknown[]) => createContentItemMock(...args),
  listAllContentModels: (...args: unknown[]) => listAllContentModelsMock(...args),
}));

vi.mock("@/hooks/use-workspace-localization", () => ({
  useWorkspaceLocalization: () => ({
    localization: { locale: "en-US" },
  }),
}));

vi.mock("@/stores/use-preference-store", () => ({
  usePreferencesStore: (selector: (state: { locale: "en-US" }) => unknown) =>
    selector({ locale: "en-US" }),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("content bootstrap continuation handoff", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    createContentItemMock.mockReset();
    listAllContentModelsMock.mockReset();
    listAllContentModelsMock.mockResolvedValue([
      {
        id: "model-article",
        workspaceId: "ws-1",
        siteId: "site-1",
        key: "article",
        name: "Article",
        description: "Long-form posts",
        category: "content_library",
        capabilities: ["publishable", "rich_text_editable"],
        defaultRole: "article",
        defaultPosture: "entry",
        defaultSurface: "writing",
      },
    ]);
  });

  test("uses the created item's continuation target after draft creation", async () => {
    createContentItemMock.mockResolvedValue({
      id: "item-1",
      workspaceId: "ws-1",
      siteId: "site-1",
      slug: "hello-world",
      title: "Hello world",
      status: "draft",
      visibility: "private",
      locale: "en-US",
      bootstrapPresetState: "none",
      capabilityPackIds: [],
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

    const { result } = renderHook(() => useContentBootstrapController("ws-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.availableModels).toHaveLength(1);
    });

    act(() => {
      result.current.setTitle("Hello world");
      result.current.selectModel("article");
      result.current.createDraft();
    });

    await waitFor(() => {
      expect(createContentItemMock).toHaveBeenCalledWith("ws-1", {
        title: "Hello world",
        locale: "en-US",
        modelKey: "article",
      });
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/w/ws-1/content/library",
        search: {
          view: "draft",
          focusItemId: "item-1",
        },
      });
    });
  });

  test("exposes a direct navigation path to models when no content types are available", async () => {
    listAllContentModelsMock.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useContentBootstrapController("ws-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.hasAvailableModels).toBe(false);
    });

    act(() => {
      result.current.navigateToModels();
    });

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/w/ws-1/content/models",
    });
  });
});
