import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  listWorkspaceSiteEntries,
  listWorkspaceSiteEntryTypes,
  listWorkspaceSitePagesTree,
  publishWorkspaceSiteEntry,
  unpublishWorkspaceSiteEntry,
} from "@/api/workspace-site";
import { ContentLibraryView } from "@/pages/workspaces/content/library/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options && "total" in options) {
        return `${key}:${String(options.total)}`;
      }
      return key;
    },
  }),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@/api/workspace-site", () => ({
  listWorkspaceSiteEntryTypes: vi.fn(),
  listWorkspaceSiteEntries: vi.fn(),
  listWorkspaceSitePagesTree: vi.fn(),
  publishWorkspaceSiteEntry: vi.fn(),
  unpublishWorkspaceSiteEntry: vi.fn(),
  createWorkspaceSiteEntry: vi.fn(),
  createWorkspaceSiteEntryType: vi.fn(),
  deleteWorkspaceSiteEntry: vi.fn(),
  deleteWorkspaceSiteEntryType: vi.fn(),
}));

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ContentLibraryView />
    </QueryClientProvider>,
  );
}

function buildPageData<T>(items: T[]) {
  return {
    items,
    total: items.length,
    page: 1,
    size: 50,
    pages: 1,
    next: null,
    prev: null,
  };
}

describe("ContentLibraryView", () => {
  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    class ResizeObserverMock {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  beforeEach(() => {
    vi.clearAllMocks();

    useWorkspaceStore.setState({
      currentWorkspaceId: "ws-1",
      lastWorkspaceId: "ws-1",
    });

    vi.mocked(listWorkspaceSiteEntryTypes).mockResolvedValue(
      buildPageData([
        {
          id: "type-1",
          siteId: "site-1",
          code: "post",
          name: "Post",
          fieldsSchema: null,
        },
      ]),
    );

    vi.mocked(listWorkspaceSitePagesTree).mockResolvedValue(buildPageData([]));
    vi.mocked(publishWorkspaceSiteEntry).mockResolvedValue({
      siteId: "site-1",
      entryId: "entry-1",
      entryTypeCode: "post",
      slug: "hello",
      revision: 1,
      publishedAtMs: Date.now(),
    });
    vi.mocked(unpublishWorkspaceSiteEntry).mockResolvedValue({
      siteId: "site-1",
      entryId: "entry-1",
      entryTypeCode: "post",
      slug: "hello",
      unpublishedAtMs: Date.now(),
    });
  });

  it("草稿条目可直接触发发布", async () => {
    vi.mocked(listWorkspaceSiteEntries).mockResolvedValue(
      buildPageData([
        {
          id: "entry-1",
          siteId: "site-1",
          entryTypeId: "type-1",
          entryTypeCode: "post",
          slug: "hello",
          draftRevision: 1,
          publishedRevision: null,
        },
      ]),
    );

    const user = userEvent.setup();
    renderView();

    const publishButton = await screen.findByRole("button", {
      name: "content_library:ENTRY_ACTION_PUBLISH",
    });

    await user.click(publishButton);

    await waitFor(() => {
      expect(publishWorkspaceSiteEntry).toHaveBeenCalledWith("ws-1", {
        entryTypeCode: "post",
        slug: "hello",
      });
    });
  });

  it("已发布条目可触发取消发布", async () => {
    vi.mocked(listWorkspaceSiteEntries).mockResolvedValue(
      buildPageData([
        {
          id: "entry-1",
          siteId: "site-1",
          entryTypeId: "type-1",
          entryTypeCode: "post",
          slug: "hello",
          draftRevision: 2,
          publishedRevision: 2,
        },
      ]),
    );

    const user = userEvent.setup();
    renderView();

    const unpublishButton = await screen.findByRole("button", {
      name: "content_library:ENTRY_ACTION_UNPUBLISH",
    });

    await user.click(unpublishButton);

    await waitFor(() => {
      expect(unpublishWorkspaceSiteEntry).toHaveBeenCalledWith("ws-1", {
        entryTypeCode: "post",
        slug: "hello",
      });
    });
  });
});
