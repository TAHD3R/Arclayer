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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
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

describe("useContentBootstrapController", () => {
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

  test("creates a draft for the selected content type and hands off to the continuation target", async () => {
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
      shapeReasonCode: null,
      openIntent: {
        surface: "writing",
        route: "/w/ws-1/content/library/item-1",
        blocked: false,
        reasonCode: null,
        reasonMeta: null,
        recoveryActions: [],
      },
      continuationTarget: {
        surface: "writing",
        route: "/w/ws-1/content/library/item-1",
        blocked: false,
        reasonCode: null,
        reasonMeta: null,
        recoveryActions: [],
      },
      draftVersion: 1,
      updatedAt: "2026-03-19T00:00:00Z",
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
    });

    act(() => {
      result.current.createDraft();
    });

    await waitFor(() => {
      expect(createContentItemMock).toHaveBeenCalledWith("ws-1", {
        title: "Hello world",
        locale: "en-US",
        modelKey: "article",
      });
    });

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/w/ws-1/content/library",
      search: {
        view: "draft",
        focusItemId: "item-1",
      },
    });
  });

  test("only becomes creatable after both a title and a content type are selected", async () => {
    const { result } = renderHook(() => useContentBootstrapController("ws-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.availableModels).toHaveLength(1);
    });

    expect(result.current.canCreate).toBe(false);

    act(() => {
      result.current.setTitle("Hello world");
    });

    expect(result.current.canCreate).toBe(false);

    act(() => {
      result.current.selectModel("article");
    });

    expect(result.current.canCreate).toBe(true);
  });
});
