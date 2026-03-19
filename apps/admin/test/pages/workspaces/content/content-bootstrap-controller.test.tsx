import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { PropsWithChildren } from "react";

import { useContentBootstrapController } from "@/pages/workspaces/content/bootstrap/hooks/use-content-bootstrap-controller";

const navigateMock = vi.fn().mockResolvedValue(undefined);
const createContentItemMock = vi.fn();
const applyContentBootstrapShapeMock = vi.fn();

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

describe("useContentBootstrapController", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    createContentItemMock.mockReset();
    applyContentBootstrapShapeMock.mockReset();
  });

  test("continue creates a draft with the selected starter and returns to content library", async () => {
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
      draftVersion: 1,
      updatedAt: "2026-03-19T00:00:00Z",
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
      bootstrapPresetKey: "page",
      bootstrapPresetState: "selected",
      capabilityPackIds: ["routable", "publishable", "seo_managed", "layout_bound"],
      draftVersion: 1,
      updatedAt: "2026-03-19T00:00:00Z",
    });

    const { result } = renderHook(() => useContentBootstrapController("ws-1"), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.setTitle("Hello world");
      result.current.selectPreset("page");
    });

    act(() => {
      result.current.continueWithStarter();
    });

    await waitFor(() => {
      expect(createContentItemMock).toHaveBeenCalledWith("ws-1", {
        title: "Hello world",
        locale: "en-US",
      });
    });

    expect(applyContentBootstrapShapeMock).toHaveBeenCalledWith("ws-1", "item-1", {
      presetKey: "page",
      presetState: "selected",
      capabilityPackIds: ["routable", "publishable", "seo_managed", "layout_bound"],
    });
    expect(navigateMock).toHaveBeenCalledWith({ to: "/w/ws-1/content/library" });
  });

  test("continue can create a blank draft without a selected template", async () => {
    createContentItemMock.mockResolvedValue({
      id: "item-2",
      workspaceId: "ws-1",
      siteId: "site-1",
      slug: "blank-draft",
      title: "Blank draft",
      status: "draft",
      visibility: "private",
      locale: "en-US",
      bootstrapPresetState: "none",
      capabilityPackIds: [],
      draftVersion: 1,
      updatedAt: "2026-03-19T00:00:00Z",
    });

    const { result } = renderHook(() => useContentBootstrapController("ws-1"), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.setTitle("Blank draft");
    });

    act(() => {
      result.current.continueWithStarter();
    });

    await waitFor(() => {
      expect(createContentItemMock).toHaveBeenCalledWith("ws-1", {
        title: "Blank draft",
        locale: "en-US",
      });
    });

    expect(applyContentBootstrapShapeMock).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith({ to: "/w/ws-1/content/library" });
  });
});
