import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ContentBootstrapPage } from "@/pages/projects/content/bootstrap/page";

const mocked = vi.hoisted(() => ({
  useContentBootstrapController: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/pages/projects/content/bootstrap/hooks/use-content-bootstrap-controller", () => ({
  useContentBootstrapController: mocked.useContentBootstrapController,
}));

describe("ContentBootstrapPage", () => {
  test("renders a type-first create form with official content-type cards", () => {
    mocked.useContentBootstrapController.mockReturnValue({
      availableModels: [
        {
          id: "model-page",
          workspaceId: "ws-1",
          siteId: "site-1",
          singularKey: "page",
          pluralKey: "pages",
          name: "Page",
          description: "Legacy fallback name",
          category: "site_builder",
          capabilities: ["publishable", "routable", "seo_managed"],
          defaultRole: "page",
          defaultPosture: "page",
          defaultSurface: "canvas",
        },
        {
          id: "model-article",
          workspaceId: "ws-1",
          siteId: "site-1",
          singularKey: "article",
          pluralKey: "articles",
          name: "Article",
          description: "Long-form posts",
          category: "content_library",
          capabilities: ["publishable", "rich_text_editable"],
          defaultRole: "article",
          defaultPosture: "entry",
          defaultSurface: "writing",
        },
        {
          id: "model-section",
          workspaceId: "ws-1",
          siteId: "site-1",
          singularKey: "reusable-section",
          pluralKey: "reusable-sections",
          name: "Reusable Section",
          description: "Reusable layout building block",
          category: "site_builder",
          capabilities: ["visual_editable", "has_slots", "localizable"],
          defaultRole: "reusable-section",
          defaultPosture: "composition",
          defaultSurface: "canvas",
        },
        {
          id: "model-category",
          workspaceId: "ws-1",
          siteId: "site-1",
          singularKey: "category",
          pluralKey: "categories",
          name: "Category",
          description: "Relation-first taxonomy",
          category: "content_library",
          capabilities: ["queryable", "has_relations"],
          defaultRole: "taxonomy",
          defaultPosture: "structured",
          defaultSurface: "structured",
        },
      ],
      hasAvailableModels: true,
      modelsLoading: false,
      modelsError: null,
      selectedModel: null,
      title: "",
      summary: "",
      slug: "",
      visibility: "public",
      seo: { metaTitle: "", metaDescription: "" },
      selectedModelKey: null,
      busy: false,
      createPending: false,
      canCreate: false,
      setTitle: vi.fn(),
      setSummary: vi.fn(),
      setSlug: vi.fn(),
      setVisibility: vi.fn(),
      setSeoMetaTitle: vi.fn(),
      setSeoMetaDescription: vi.fn(),
      selectModel: vi.fn(),
      createDraft: vi.fn(),
      navigateToLibrary: vi.fn(),
      navigateToModels: vi.fn(),
    });

    render(<ContentBootstrapPage workspaceId="ws-1" />);

    expect(screen.getByText("CONTENT_BOOTSTRAP_CREATE_TITLE")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_BOOTSTRAP_CREATE_DESC")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_BOOTSTRAP_FIELD_MODEL_LABEL")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_TYPE_ARTICLE_NAME")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_TYPE_PAGE_NAME")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_TYPE_REUSABLE_SECTION_NAME")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_TYPE_CATEGORY_NAME")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_BOOTSTRAP_FIELD_TITLE_LABEL")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_BOOTSTRAP_FIELD_SUMMARY_LABEL")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_BOOTSTRAP_FIELD_TYPE_SETTINGS_LABEL")).toBeInTheDocument();
    expect(screen.getAllByText("CONTENT_BOOTSTRAP_FIELD_TYPE_SETTINGS_EMPTY")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "CONTENT_BOOTSTRAP_ACTION_SKIP" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_BOOTSTRAP_ACTION_CREATE_DRAFT" }),
    ).toBeDisabled();
    expect(screen.queryByText("CONTENT_BOOTSTRAP_START_WITH_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByText("CONTENT_BOOTSTRAP_PRESET_PAGE_NAME")).not.toBeInTheDocument();
  });

  test("reflects the selected content type without rendering template selection", () => {
    mocked.useContentBootstrapController.mockReturnValue({
      availableModels: [
        {
          id: "model-page",
          workspaceId: "ws-1",
          siteId: "site-1",
          singularKey: "page",
          pluralKey: "pages",
          name: "Page",
          description: "Legacy fallback name",
          category: "site_builder",
          capabilities: ["publishable", "routable", "seo_managed"],
          defaultRole: "page",
          defaultPosture: "page",
          defaultSurface: "canvas",
        },
      ],
      hasAvailableModels: true,
      modelsLoading: false,
      modelsError: null,
      selectedModel: {
        id: "model-page",
        workspaceId: "ws-1",
        siteId: "site-1",
        singularKey: "page",
        pluralKey: "pages",
        name: "Page",
        description: "Legacy fallback name",
        category: "site_builder",
        capabilities: ["publishable", "routable", "seo_managed"],
        defaultRole: "page",
        defaultPosture: "page",
        defaultSurface: "canvas",
      },
      title: "Homepage",
      summary: "Primary site entry",
      slug: "homepage",
      visibility: "public",
      seo: { metaTitle: "Homepage | Arclayer", metaDescription: "Welcome page" },
      selectedModelKey: "page",
      busy: false,
      createPending: false,
      canCreate: true,
      setTitle: vi.fn(),
      setSummary: vi.fn(),
      setSlug: vi.fn(),
      setVisibility: vi.fn(),
      setSeoMetaTitle: vi.fn(),
      setSeoMetaDescription: vi.fn(),
      selectModel: vi.fn(),
      createDraft: vi.fn(),
      navigateToLibrary: vi.fn(),
      navigateToModels: vi.fn(),
    });

    render(<ContentBootstrapPage workspaceId="ws-1" />);

    expect(screen.getByDisplayValue("Homepage")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Primary site entry")).toBeInTheDocument();
    expect(screen.getByDisplayValue("homepage")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Homepage | Arclayer")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Welcome page")).toBeInTheDocument();
    const selectedTypeLabel = screen.getByText("CONTENT_TYPE_PAGE_NAME");
    expect(selectedTypeLabel.closest("button")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("CONTENT_BOOTSTRAP_FIELD_PAGE_SETTINGS_LABEL")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_BOOTSTRAP_ACTION_CREATE_DRAFT" }),
    ).toBeEnabled();
    expect(screen.queryByText("CONTENT_BOOTSTRAP_START_FROM_DESC")).not.toBeInTheDocument();
  });

  test("shows a models handoff action instead of draft creation when no content models exist", () => {
    mocked.useContentBootstrapController.mockReturnValue({
      availableModels: [],
      hasAvailableModels: false,
      modelsLoading: false,
      modelsError: null,
      selectedModel: null,
      title: "",
      summary: "",
      slug: "",
      visibility: "public",
      seo: { metaTitle: "", metaDescription: "" },
      selectedModelKey: null,
      busy: false,
      createPending: false,
      canCreate: false,
      setTitle: vi.fn(),
      setSummary: vi.fn(),
      setSlug: vi.fn(),
      setVisibility: vi.fn(),
      setSeoMetaTitle: vi.fn(),
      setSeoMetaDescription: vi.fn(),
      selectModel: vi.fn(),
      createDraft: vi.fn(),
      navigateToLibrary: vi.fn(),
      navigateToModels: vi.fn(),
    });

    render(<ContentBootstrapPage workspaceId="ws-1" />);

    expect(screen.getByText("CONTENT_BOOTSTRAP_FIELD_MODEL_EMPTY")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_BOOTSTRAP_FIELD_MODEL_EMPTY_ACTION" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "CONTENT_BOOTSTRAP_ACTION_CREATE_DRAFT" }),
    ).not.toBeInTheDocument();
  });
});
