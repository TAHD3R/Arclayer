import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("katex/dist/katex.min.css", () => ({}));

vi.mock("@arclayer/ui/editor", () => ({
  DateNodeLocalizationProvider: (props: { children?: ReactNode }) => <>{props.children}</>,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

import { ContentLibraryArticleEditorPage } from "@/pages/workspaces/content/library/article-editor/page";
import { ContentLibraryArticleEditorShell } from "@/pages/workspaces/content/library/article-editor/components/content-library-article-editor-shell";
import { TooltipProvider } from "@arclayer/ui/tooltip";

const mocked = vi.hoisted(() => ({
  loadContentLibraryArticleEditorSnapshot: vi.fn(),
  getCoreSettings: vi.fn(),
  saveContentItemDraftVersion: vi.fn(),
  patchContentItemVersion: vi.fn(),
  publishContentItemVersion: vi.fn(),
}));

const renderStats = vi.hoisted(() => ({
  providerDocuments: [] as Array<Record<string, unknown> | undefined>,
  toolbarRenders: 0,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("platejs/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("platejs/react")>();
  return {
    ...actual,
    useEditorRef: () => ({
      api: {
        markdown: {
          serialize: () => "# Launch memo",
        },
      },
      undo: vi.fn(),
    }),
    useEditorScrollRef: () => ({ current: null }),
  };
});

vi.mock("@/components/layout/admin-route-container", () => ({
  AdminRouteContainer: (props: {
    children?: ReactNode;
    className?: string;
    innerClassName?: string;
  }) => (
    <div data-testid="admin-route-container" className={props.className}>
      <div data-testid="admin-route-container-inner" className={props.innerClassName}>
        {props.children}
      </div>
    </div>
  ),
}));

vi.mock("@/pages/workspaces/content/library/article-editor/hooks/api", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/pages/workspaces/content/library/article-editor/hooks/api")
    >();
  return {
    ...actual,
    loadContentLibraryArticleEditorSnapshot: (...args: unknown[]) =>
      mocked.loadContentLibraryArticleEditorSnapshot(...args),
  };
});

vi.mock("@/api/content", () => ({
  saveContentItemDraftVersion: (...args: unknown[]) => mocked.saveContentItemDraftVersion(...args),
  patchContentItemVersion: (...args: unknown[]) => mocked.patchContentItemVersion(...args),
  publishContentItemVersion: (...args: unknown[]) => mocked.publishContentItemVersion(...args),
}));

vi.mock("@/api/settings", () => ({
  getCoreSettings: (...args: unknown[]) => mocked.getCoreSettings(...args),
}));

vi.mock("@/pages/workspaces/assets/components/asset-picker-dialog", () => ({
  AssetPickerDialog: () => null,
}));

vi.mock(
  "@/pages/workspaces/content/library/article-editor/components/content-library-article-editor-document",
  () => ({
    ContentLibraryArticleEditorDocumentProvider: (props: {
      children?: ReactNode;
      document?: Record<string, unknown>;
      onChange?: (value: Record<string, unknown>) => void;
    }) => {
      renderStats.providerDocuments.push(props.document);
      return (
        <>
          <button
            type="button"
            data-testid="mock-body-change"
            onClick={() =>
              props.onChange?.({
                type: "doc",
                content: [{ type: "p", children: [{ text: "Updated body copy" }] }],
              })
            }
          >
            mock-body-change
          </button>
          {props.children}
        </>
      );
    },
    useContentLibraryArticleEditorDocumentState: () => ({
      isHydrated: true,
      scrollContainerRef: { current: null },
    }),
  }),
);

vi.mock(
  "@/pages/workspaces/content/library/article-editor/components/content-library-article-editor-body",
  () => ({
    ContentLibraryArticleEditorBody: () => (
      <div data-testid="content-library-article-editor-body" />
    ),
    getContentLibraryArticleEditorTextLaneClass: () => "mock-text-lane",
  }),
);

vi.mock(
  "@/pages/workspaces/content/library/article-editor/components/content-library-article-editor-page-toolbar",
  () => ({
    ContentLibraryArticleEditorPageToolbar: (props: {
      saveState?: "hidden" | "saving" | "saved" | "error";
      isPublishing?: boolean;
      hasPublishableVersion?: boolean;
      onPublish?: () => void;
      slug: string;
      onSlugChange: (value: string) => void;
      visibility: "public" | "private";
      onVisibilityChange: (value: "public" | "private") => void;
    }) => {
      renderStats.toolbarRenders += 1;
      return (
        <div data-testid="content-library-article-editor-page-toolbar">
          <button type="button" aria-label="CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU">
            CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU
          </button>
          <input
            aria-label="CONTENT_LIBRARY_EDITOR_MENU_SLUG"
            value={props.slug}
            onChange={(event) => props.onSlugChange(event.target.value)}
          />
          <label>
            <input
              type="radio"
              name="mock-visibility"
              aria-label="CONTENT_LIBRARY_VISIBILITY_PUBLIC"
              checked={props.visibility === "public"}
              onChange={() => props.onVisibilityChange("public")}
            />
          </label>
          <label>
            <input
              type="radio"
              name="mock-visibility"
              aria-label="CONTENT_LIBRARY_VISIBILITY_PRIVATE"
              checked={props.visibility === "private"}
              onChange={() => props.onVisibilityChange("private")}
            />
          </label>
          <button
            type="button"
            disabled={
              !props.hasPublishableVersion || props.isPublishing || props.saveState === "saving"
            }
            onClick={props.onPublish}
          >
            CONTENT_LIBRARY_ACTION_PUBLISH
          </button>
        </div>
      );
    },
  }),
);

vi.mock(
  "@/pages/workspaces/content/library/article-editor/components/content-library-article-editor-toc-sidebar",
  () => ({
    ContentLibraryArticleEditorTocSidebar: () => (
      <div data-testid="content-library-article-editor-toc-sidebar" />
    ),
  }),
);

function renderWithQuery(component: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{component}</TooltipProvider>
    </QueryClientProvider>,
  );
}

function buildSnapshot(options?: {
  draftVersionNumber?: number;
  draftState?: "draft" | "published";
  itemStatus?: "draft" | "published" | "archived";
  fieldsSnapshot?: Record<string, unknown>;
  seoPayload?: Record<string, unknown> | null;
}) {
  return {
    item: {
      id: "content-1",
      workspaceId: "ws-1",
      siteId: "site-1",
      modelId: "model-1",
      modelKey: "article",
      slug: "launch-memo",
      title: "Launch memo",
      status: options?.itemStatus ?? "draft",
      visibility: "public",
      locale: "en-US",
      bootstrapPresetKey: "post",
      bootstrapPresetState: "selected",
      capabilityPackIds: ["publishable", "rich_text_editable", "seo_managed"],
      draftVersion: options?.draftVersionNumber ?? 3,
      publishedVersion: 2,
      updatedAt: "2026-03-28T00:00:00Z",
    },
    draftVersion: {
      itemId: "content-1",
      versionNumber: options?.draftVersionNumber ?? 3,
      state: options?.draftState ?? "draft",
      createdAt: "2026-03-28T00:00:00Z",
      fieldsSnapshot: {
        title: "Launch memo",
        summary: "Loaded summary",
        slug: "launch-memo",
        visibility: "public",
        ...options?.fieldsSnapshot,
      },
      presentations: [
        { kind: "rich_text_document", payload: { type: "doc", content: [] } },
        ...(options?.seoPayload ? [{ kind: "seo", payload: options.seoPayload }] : []),
      ],
      changeSummary: null,
    },
    publishedVersion: null,
    bodyPresentation: { kind: "rich_text_document", payload: { type: "doc", content: [] } },
  };
}

describe("content-library-article-editor-page", () => {
  beforeEach(() => {
    mocked.loadContentLibraryArticleEditorSnapshot.mockReset();
    mocked.getCoreSettings.mockReset();
    mocked.saveContentItemDraftVersion.mockReset();
    mocked.patchContentItemVersion.mockReset();
    mocked.publishContentItemVersion.mockReset();
    renderStats.providerDocuments.length = 0;
    renderStats.toolbarRenders = 0;
    mocked.getCoreSettings.mockResolvedValue({
      namespace: "core",
      value: {
        content_strategy: {
          autosave: {
            enabled: true,
            interval_sec: 1,
            save_on_blur: true,
          },
          retention: {
            draft_max_revisions: 100,
          },
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the page mode shell inside the immersive route container", async () => {
    mocked.loadContentLibraryArticleEditorSnapshot.mockResolvedValueOnce(buildSnapshot());

    renderWithQuery(<ContentLibraryArticleEditorPage workspaceId="ws-1" itemId="content-1" />);

    expect(screen.getByTestId("admin-route-container")).toBeInTheDocument();
    expect(screen.getByTestId("admin-route-container-inner")).toBeInTheDocument();
    expect(screen.getByLabelText("CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("CONTENT_LIBRARY_ACTION_CLOSE_SIDEBAR_PREVIEW"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("CONTENT_LIBRARY_ACTION_OPEN_PAGE_EDITOR"),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("CONTENT_LIBRARY_EDITOR_TITLE_PLACEHOLDER"),
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("CONTENT_LIBRARY_EDITOR_SUMMARY_PLACEHOLDER"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("content-library-article-editor-body")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Launch memo")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Loaded summary")).toBeInTheDocument();
    });
  });

  it("autosaves changed draft fields and seo metadata through the patch endpoint", async () => {
    const user = userEvent.setup();
    mocked.loadContentLibraryArticleEditorSnapshot.mockResolvedValueOnce(
      buildSnapshot({
        seoPayload: {
          metaTitle: "Launch memo | Arclayer",
          metaDescription: "Loaded SEO summary",
          canonicalUrl: "/launch-memo",
        },
      }),
    );
    mocked.patchContentItemVersion.mockResolvedValueOnce({
      itemId: "content-1",
      versionNumber: 3,
      state: "draft",
      createdAt: "2026-03-28T00:00:00Z",
      fieldsSnapshot: {
        title: "Launch memo",
        summary: "Updated summary",
        slug: "launch-memo-v2",
        visibility: "private",
      },
      presentations: [
        { kind: "rich_text_document", payload: { type: "doc", content: [] } },
        {
          kind: "seo",
          payload: {
            metaTitle: "Launch memo updated | Arclayer",
            metaDescription: "Loaded SEO summary",
            canonicalUrl: "/launch-memo",
          },
        },
      ],
      changeSummary: null,
    });

    renderWithQuery(<ContentLibraryArticleEditorPage workspaceId="ws-1" itemId="content-1" />);

    const summary = await screen.findByDisplayValue("Loaded summary");
    await user.clear(summary);
    await user.type(summary, "Updated summary");

    await user.click(
      screen.getByRole("button", { name: "CONTENT_LIBRARY_EDITOR_OPEN_SEO_DIALOG" }),
    );
    const metaTitleInput = await screen.findByLabelText("CONTENT_LIBRARY_EDITOR_SEO_META_TITLE");
    await user.clear(metaTitleInput);
    await user.type(metaTitleInput, "Launch memo updated | Arclayer");
    await user.click(screen.getByRole("button", { name: "common:CONFIRM" }));
    await waitFor(() => {
      expect(
        screen.queryByLabelText("CONTENT_LIBRARY_EDITOR_SEO_META_TITLE"),
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU"));
    const slugInput = await screen.findByLabelText("CONTENT_LIBRARY_EDITOR_MENU_SLUG");
    await user.clear(slugInput);
    await user.type(slugInput, "launch-memo-v2");
    await user.click(screen.getByRole("radio", { name: "CONTENT_LIBRARY_VISIBILITY_PRIVATE" }));

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 1100));
    });

    await waitFor(() => {
      expect(mocked.patchContentItemVersion).toHaveBeenCalledWith("ws-1", "content-1", 3, {
        changeSummary: "Update article draft",
        fieldsSnapshot: {
          title: "Launch memo",
          summary: "Updated summary",
          slug: "launch-memo-v2",
          status: "draft",
          visibility: "private",
          coverAssetId: null,
        },
        presentations: [
          { kind: "rich_text_document", payload: { type: "doc", content: [] } },
          {
            kind: "seo",
            payload: {
              metaTitle: "Launch memo updated | Arclayer",
              metaDescription: "Loaded SEO summary",
              canonicalUrl: "/launch-memo",
            },
          },
        ],
      });
    });
  });

  it("creates a new draft version when the current active version is already published", async () => {
    const user = userEvent.setup();
    mocked.loadContentLibraryArticleEditorSnapshot.mockResolvedValueOnce(
      buildSnapshot({
        draftVersionNumber: 5,
        draftState: "published",
        itemStatus: "published",
      }),
    );
    mocked.saveContentItemDraftVersion.mockResolvedValueOnce({
      itemId: "content-1",
      versionNumber: 6,
      state: "draft",
      createdAt: "2026-03-28T00:00:00Z",
      fieldsSnapshot: {
        title: "Launch memo",
        summary: "Published base summary",
        slug: "launch-memo",
        status: "published",
        visibility: "public",
      },
      presentations: [{ kind: "rich_text_document", payload: { type: "doc", content: [] } }],
      changeSummary: null,
    });

    renderWithQuery(<ContentLibraryArticleEditorPage workspaceId="ws-1" itemId="content-1" />);

    const summary = await screen.findByDisplayValue("Loaded summary");
    await user.clear(summary);
    await user.type(summary, "Published base summary");

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 1100));
    });

    await waitFor(() => {
      expect(mocked.saveContentItemDraftVersion).toHaveBeenCalledWith("ws-1", "content-1", {
        expectedVersion: 5,
        changeSummary: "Update article draft",
        fieldsSnapshot: {
          title: "Launch memo",
          summary: "Published base summary",
          slug: "launch-memo",
          status: "published",
          visibility: "public",
          coverAssetId: null,
        },
        presentations: [{ kind: "rich_text_document", payload: { type: "doc", content: [] } }],
      });
    });
  });

  it("keeps the page toolbar stable during body document changes while autosave still persists the new body", async () => {
    const user = userEvent.setup();
    mocked.loadContentLibraryArticleEditorSnapshot.mockResolvedValueOnce(buildSnapshot());
    mocked.patchContentItemVersion.mockResolvedValueOnce({
      itemId: "content-1",
      versionNumber: 3,
      state: "draft",
      createdAt: "2026-03-28T00:00:00Z",
      fieldsSnapshot: {
        title: "Launch memo",
        summary: "Loaded summary",
        slug: "launch-memo",
        visibility: "public",
      },
      presentations: [
        {
          kind: "rich_text_document",
          payload: {
            type: "doc",
            content: [{ type: "p", children: [{ text: "Updated body copy" }] }],
          },
        },
      ],
      changeSummary: null,
    });

    renderWithQuery(<ContentLibraryArticleEditorPage workspaceId="ws-1" itemId="content-1" />);

    await screen.findByDisplayValue("Launch memo");
    const toolbarRendersBeforeBodyChange = renderStats.toolbarRenders;

    await user.click(screen.getByTestId("mock-body-change"));

    expect(renderStats.toolbarRenders).toBe(toolbarRendersBeforeBodyChange);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 1100));
    });

    await waitFor(() => {
      expect(mocked.patchContentItemVersion).toHaveBeenCalledWith("ws-1", "content-1", 3, {
        changeSummary: "Update article draft",
        fieldsSnapshot: {
          title: "Launch memo",
          summary: "Loaded summary",
          slug: "launch-memo",
          status: "draft",
          visibility: "public",
          coverAssetId: null,
        },
        presentations: [
          {
            kind: "rich_text_document",
            payload: {
              type: "doc",
              content: [{ type: "p", children: [{ text: "Updated body copy" }] }],
            },
          },
        ],
      });
    });
  });

  it("publishes the latest draft version from the editor toolbar", async () => {
    const user = userEvent.setup();
    mocked.loadContentLibraryArticleEditorSnapshot.mockResolvedValueOnce(buildSnapshot());
    mocked.patchContentItemVersion.mockResolvedValueOnce({
      itemId: "content-1",
      versionNumber: 3,
      state: "draft",
      createdAt: "2026-03-28T00:00:00Z",
      fieldsSnapshot: {
        title: "Launch memo revised",
        summary: "Loaded summary",
        slug: "launch-memo",
        status: "published",
        visibility: "public",
        coverAssetId: null,
      },
      presentations: [{ kind: "rich_text_document", payload: { type: "doc", content: [] } }],
      changeSummary: null,
    });
    mocked.publishContentItemVersion.mockResolvedValueOnce({
      itemId: "content-1",
      versionNumber: 3,
      state: "published",
      createdAt: "2026-03-28T00:00:00Z",
      fieldsSnapshot: {
        title: "Launch memo revised",
        summary: "Loaded summary",
        slug: "launch-memo",
        visibility: "public",
      },
      presentations: [{ kind: "rich_text_document", payload: { type: "doc", content: [] } }],
      changeSummary: null,
    });

    renderWithQuery(<ContentLibraryArticleEditorPage workspaceId="ws-1" itemId="content-1" />);

    const title = await screen.findByDisplayValue("Launch memo");
    await user.clear(title);
    await user.type(title, "Launch memo revised");

    await user.click(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_PUBLISH" }));

    await waitFor(() => {
      expect(mocked.patchContentItemVersion).toHaveBeenCalled();
      expect(mocked.publishContentItemVersion).toHaveBeenCalledWith("ws-1", "content-1", 3);
    });
  });

  it("renders split toolbar actions with tooltips and handlers", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onOpenPage = vi.fn();

    renderWithQuery(
      <ContentLibraryArticleEditorShell
        workspaceId="ws-1"
        itemId="content-1"
        mode="split"
        title="Test article"
        summary=""
        onTitleChange={vi.fn()}
        onSummaryChange={vi.fn()}
        slug="test-article"
        onSlugChange={vi.fn()}
        status="draft"
        visibility="public"
        onVisibilityChange={vi.fn()}
        coverAssetId=""
        onCoverAssetIdChange={vi.fn()}
        seo={{
          metaTitle: "",
          metaDescription: "",
          canonicalUrl: "",
          robotsDirective: "",
        }}
        onSeoChange={vi.fn()}
        saveState="hidden"
        isPublishing={false}
        hasPublishableVersion
        onPublish={vi.fn()}
        onClose={onClose}
        onOpenPage={onOpenPage}
      />,
    );

    const closeButton = screen.getByRole("button", {
      name: "CONTENT_LIBRARY_ACTION_CLOSE_SIDEBAR_PREVIEW",
    });
    const maximizeButton = screen.getByRole("button", {
      name: "CONTENT_LIBRARY_ACTION_OPEN_PAGE_EDITOR",
    });
    const publishButton = screen.getByRole("button", {
      name: "CONTENT_LIBRARY_ACTION_PUBLISH",
    });
    const documentMenuButton = screen.getByRole("button", {
      name: "CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU",
    });

    expect(
      publishButton.compareDocumentPosition(documentMenuButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.hover(closeButton);
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
        "CONTENT_LIBRARY_ACTION_CLOSE_SIDEBAR_PREVIEW",
      );
    });

    await user.unhover(closeButton);
    await user.hover(maximizeButton);
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
        "CONTENT_LIBRARY_ACTION_OPEN_PAGE_EDITOR",
      );
    });

    await user.click(closeButton);
    await user.click(maximizeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenPage).toHaveBeenCalledTimes(1);
  });
});
