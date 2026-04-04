import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useContentBootstrapController } from "@/pages/workspaces/content/bootstrap/hooks/use-content-bootstrap-controller";

const navigateMock = vi.fn().mockResolvedValue(undefined);
const createContentItemMock = vi.fn();
const applyContentBootstrapShapeMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/api/content", () => ({
  createContentItem: (...args: unknown[]) => createContentItemMock(...args),
  applyContentBootstrapShape: (...args: unknown[]) => applyContentBootstrapShapeMock(...args),
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
    applyContentBootstrapShapeMock.mockReset();
  });

  test("uses the shaped item continuation target when a starter preset is selected", async () => {
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
      shapeState: "unshaped",
      draftVersion: 1,
      updatedAt: "2026-03-19T00:00:00Z",
      continuationTarget: {
        surface: null,
        route: "/w/ws-1/content/library/item-1",
        blocked: true,
        reasonCode: "UNSHAPED_ITEM",
        reasonMeta: null,
        recoveryActions: [],
      },
    });
    applyContentBootstrapShapeMock.mockResolvedValue({
      id: "item-1",
      workspaceId: "ws-1",
      siteId: "site-1",
      slug: "hello-world",
      title: "Hello world",
      status: "draft",
      visibility: "private",
      locale: "en-US",
      bootstrapPresetKey: "post",
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

    const { result } = renderHook(() => useContentBootstrapController("ws-1"), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.setTitle("Hello world");
      result.current.selectPreset("post");
      result.current.continueWithStarter();
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/w/ws-1/content/library/item-1",
      });
    });
  });
});
