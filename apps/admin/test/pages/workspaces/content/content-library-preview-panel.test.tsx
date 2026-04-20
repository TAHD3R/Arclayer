import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ContentLibraryPreviewPanel } from "@/pages/projects/content/library/components/content-library-preview-panel";
import type { ContentLibraryTableRow } from "@/pages/projects/content/library/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/pages/projects/content/content-type-presentation", () => ({
  getContentTypeLabel: () => "Article",
  getContentTypeDescription: () => "Editorial content",
}));

vi.mock(
  "@/pages/projects/content/library/article-editor/components/content-library-article-editor-shell",
  () => ({
    ContentLibraryArticleEditorShell: () => <div data-testid="article-editor-shell" />,
  }),
);

vi.mock(
  "@/pages/projects/content/library/article-editor/hooks/use-content-library-article-editor",
  () => ({
    useContentLibraryArticleEditor: () => ({
      title: "Launch note",
      summary: "Summary",
      setTitle: vi.fn(),
      setSummary: vi.fn(),
      slug: "launch-note",
      setSlug: vi.fn(),
      status: "draft",
      visibility: "public",
      setVisibility: vi.fn(),
      coverAssetId: "",
      setCoverAssetId: vi.fn(),
      seo: null,
      setSeo: vi.fn(),
      bodyDocument: { type: "doc", content: [] },
      setBodyDocument: vi.fn(),
      isLoading: false,
      saveState: "hidden",
      saveError: null,
      isPublishing: false,
      draftVersionNumber: 3,
      publish: vi.fn(),
    }),
  }),
);

function buildRow(): ContentLibraryTableRow {
  return {
    id: "content-1",
    workspaceId: "ws-1",
    siteId: "site-1",
    modelId: "model-article",
    modelKey: "article",
    modelName: "Article",
    modelDescription: "Editorial content",
    modelCategory: "content",
    modelCapabilities: ["publishable"],
    slug: "launch-note",
    title: "Launch note",
    name: "Launch note",
    summary: "Launch summary",
    status: "draft",
    visibility: "public",
    locale: "en-US",
    bootstrapPresetState: "customized",
    capabilityPackIds: ["publishable"],
    derivedStatus: "changed",
    runtime: "text",
    context: "content_library",
    libraryGroup: "general-content",
    editWith: "structured",
    role: "article",
    shapeState: "blocked",
    draftVersion: 3,
    publishedVersion: 2,
    updatedAt: "2026-04-19T02:00:00Z",
  };
}

describe("content-library-preview-panel", () => {
  test("renders shared runtime badges and diagnostics for summary previews", () => {
    render(
      <ContentLibraryPreviewPanel
        workspaceId="ws-1"
        row={buildRow()}
        onClose={vi.fn()}
        onOpenPage={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("CONTENT_LIBRARY_PREVIEW_PANEL_TITLE")).toBeInTheDocument();
    expect(screen.getAllByText("CONTENT_LIBRARY_STATUS_CHANGED").length).toBeGreaterThan(0);
    expect(screen.getByText("CONTENT_LIBRARY_BADGE_HAS_DRAFT")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_BADGE_SHAPE_BLOCKED")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_BADGE_BOOTSTRAP_CUSTOMIZED")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_PREVIEW_DIAGNOSTICS_TITLE")).toBeInTheDocument();
    expect(screen.getAllByText("CONTENT_LIBRARY_DIAGNOSTIC_BLOCKED").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CONTENT_LIBRARY_DIAGNOSTIC_HAS_DRAFT").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("CONTENT_LIBRARY_DIAGNOSTIC_BOOTSTRAP_CUSTOMIZED").length,
    ).toBeGreaterThan(0);
    expect(screen.getByTestId("content-library-detail-summary-strip")).toBeInTheDocument();
  });
});
