import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { WorkspaceContentModelsPage } from "@/pages/workspaces/content/models/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const { listWorkspaceContentModels, createWorkspaceContentModel } = vi.hoisted(() => ({
  listWorkspaceContentModels: vi.fn(),
  createWorkspaceContentModel: vi.fn(),
}));

vi.mock("@/api/content-models", () => ({
  listWorkspaceContentModels,
  createWorkspaceContentModel,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          "content_library:MODELS_PAGE_TITLE": "Manage your content models",
          "content_library:MODELS_PAGE_DESC":
            "Review the models that define your site structure and content library.",
          "content_library:MODELS_CREATE_ACTION": "New model",
          "content_library:MODELS_EMPTY_TITLE": "No content models yet",
          "content_library:MODELS_EMPTY_DESC":
            "Create your first model to define reusable content structures for the workspace.",
          "content_library:MODELS_DIALOG_TITLE": "Create content model",
          "content_library:MODELS_DIALOG_DESC":
            "Define a reusable model for your site or content operations.",
          "content_library:MODELS_DIALOG_SUBMIT": "Create model",
          "content_library:MODELS_FIELD_TEMPLATE_LABEL": "Template",
          "content_library:MODELS_FIELD_TEMPLATE_DESC":
            "Start from a site-building or content-ops preset.",
          "content_library:MODELS_FIELD_NAME_LABEL": "Name",
          "content_library:MODELS_FIELD_NAME_DESC":
            "Choose the label people will see in the workspace.",
          "content_library:MODELS_FIELD_NAME_PLACEHOLDER": "Article",
          "content_library:MODELS_FIELD_KEY_LABEL": "Key",
          "content_library:MODELS_FIELD_KEY_DESC":
            "Use a stable machine key for API and content binding.",
          "content_library:MODELS_FIELD_KEY_PLACEHOLDER": "article",
          "content_library:MODELS_FIELD_KIND_LABEL": "Model kind",
          "content_library:MODELS_FIELD_KIND_DESC":
            "Choose the closest capability preset for this model.",
          "content_library:MODELS_KIND_CUSTOM": "Custom",
          "content_library:MODELS_KIND_POST": "Post",
          "content_library:MODELS_KIND_PAGE": "Page",
          "content_library:MODELS_KIND_COMPONENT": "Component",
          "content_library:MODELS_KIND_BLOCK": "Block",
          "content_library:MODELS_KIND_MENU": "Menu",
          "content_library:MODELS_KIND_TEMPLATE": "Template",
          "content_library:MODELS_KIND_VIEW": "View",
          "content_library:MODELS_PREVIEW_TITLE": "Model contract preview",
          "content_library:MODELS_PREVIEW_CAPABILITIES": "Capabilities",
          "content_library:MODELS_PREVIEW_CAPABILITIES_EMPTY":
            "Capabilities will follow the selected kind until you add a preset.",
          "content_library:MODELS_CATEGORY_SITE_BUILDER": "Site Builder",
          "content_library:MODELS_CATEGORY_CONTENT_LIBRARY": "Content Library",
          "content_library:MODELS_CATEGORY_SYSTEM": "System",
          "content_library:MODELS_CATEGORY_CUSTOM": "Custom",
          "content_library:MODELS_EDITOR_FORM": "Form editor",
          "content_library:MODELS_EDITOR_VISUAL": "Visual editor",
          "content_library:MODELS_EDITOR_RICH_TEXT": "Rich text editor",
          "content_library:MODELS_EDITOR_TABLE": "Table editor",
          "content_library:MODELS_CAPABILITY_VERSIONED": "Versioned",
          "content_library:MODELS_CAPABILITY_ROUTABLE": "Routable",
          "content_library:MODELS_CAPABILITY_TREEABLE": "Treeable",
          "content_library:MODELS_CAPABILITY_VISUAL_EDITABLE": "Visual editing",
          "content_library:MODELS_CAPABILITY_RICH_TEXT_EDITABLE": "Rich text editing",
          "content_library:MODELS_CAPABILITY_QUERYABLE": "Queryable",
          "content_library:MODELS_CAPABILITY_HAS_SLOTS": "Has slots",
          "content_library:MODELS_CAPABILITY_HAS_RELATIONS": "Has relations",
          "content_library:MODELS_CAPABILITY_LOCALIZABLE": "Localized",
          "content_library:MODELS_CAPABILITY_PUBLISHABLE": "Publishable",
          "content_library:MODELS_CAPABILITY_SCHEDULABLE": "Schedulable",
          "content_library:MODELS_CAPABILITY_SEO_MANAGED": "SEO managed",
          "content_library:MODELS_TEMPLATE_CUSTOM_TITLE": "Custom",
          "content_library:MODELS_TEMPLATE_CUSTOM_SUMMARY": "Start from an empty model contract.",
          "content_library:MODELS_TEMPLATE_CUSTOM_DESCRIPTION":
            "Use a custom model when you want to define the storage kind yourself.",
          "content_library:MODELS_TEMPLATE_PAGE_TITLE": "Page",
          "content_library:MODELS_TEMPLATE_PAGE_SUMMARY":
            "Visual, routed, treeable pages for the site builder.",
          "content_library:MODELS_TEMPLATE_PAGE_DESCRIPTION":
            "Routed visual pages with layout, slots, localization, and SEO support.",
          "content_library:MODELS_TEMPLATE_POST_TITLE": "Post",
          "content_library:MODELS_TEMPLATE_POST_SUMMARY":
            "Rich-text editorial entries for blogs and news.",
          "content_library:MODELS_TEMPLATE_POST_DESCRIPTION":
            "Editorial content with routing, SEO, publishing, and scheduling hooks.",
          "content_library:MODELS_TEMPLATE_AUTHOR_TITLE": "Author",
          "content_library:MODELS_TEMPLATE_AUTHOR_SUMMARY":
            "Profiles reused across posts, layouts, and testimonials.",
          "content_library:MODELS_TEMPLATE_AUTHOR_DESCRIPTION":
            "Profiles used across posts, layouts, and testimonials.",
          "content_library:MODELS_TEMPLATE_TESTIMONIAL_TITLE": "Testimonial",
          "content_library:MODELS_TEMPLATE_TESTIMONIAL_SUMMARY":
            "Structured social proof blocks for landing pages.",
          "content_library:MODELS_TEMPLATE_TESTIMONIAL_DESCRIPTION":
            "Reusable testimonial records with speaker metadata and publish control.",
          "content_library:MODELS_TEMPLATE_PRICING_TIER_TITLE": "Pricing Tier",
          "content_library:MODELS_TEMPLATE_PRICING_TIER_SUMMARY":
            "Structured plans for pricing pages and comparison tables.",
          "content_library:MODELS_TEMPLATE_PRICING_TIER_DESCRIPTION":
            "Pricing plans with feature lists, billing metadata, and publish workflows.",
          "content_library:MODELS_TEMPLATE_LEGAL_DOCUMENT_TITLE": "Legal Document",
          "content_library:MODELS_TEMPLATE_LEGAL_DOCUMENT_SUMMARY":
            "Long-form policies and legal pages with routing.",
          "content_library:MODELS_TEMPLATE_LEGAL_DOCUMENT_DESCRIPTION":
            "Legal documents with rich-text editing, routing, localization, and SEO.",
          "content_library:MODELS_TEMPLATE_REUSABLE_BLOCK_TITLE": "Reusable Block",
          "content_library:MODELS_TEMPLATE_REUSABLE_BLOCK_SUMMARY":
            "Visual blocks reused across pages, layouts, and slots.",
          "content_library:MODELS_TEMPLATE_REUSABLE_BLOCK_DESCRIPTION":
            "Reusable visual sections that stay publishable and slot-aware.",
          "content_library:MODELS_TOAST_CREATE_SUCCESS": "Model created",
          "common:CANCEL": "Cancel",
          "common:RETRY": "Retry",
        }) as Record<string, string>
      )[key] ?? key,
  }),
}));

vi.mock("@/components/common/default-page", () => ({
  DefaultPage: (props: {
    title?: React.ReactNode;
    description?: React.ReactNode;
    action?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <div>
      <h1>{props.title}</h1>
      <p>{props.description}</p>
      {props.action}
      <div>{props.children}</div>
    </div>
  ),
}));

vi.mock("@celestial/ui/setting-dialog", () => ({
  SettingDialog: (props: {
    open: boolean;
    title?: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    props.open ? (
      <div>
        <h2>{props.title}</h2>
        <p>{props.description}</p>
        <div>{props.children}</div>
        <div>{props.footer}</div>
      </div>
    ) : null,
}));

async function renderWithQuery() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceContentModelsPage />
      </QueryClientProvider>,
    );
  });
}

describe("WorkspaceContentModelsPage", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ currentWorkspaceId: "ws-1", lastWorkspaceId: "ws-1" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({ currentWorkspaceId: null, lastWorkspaceId: null });
  });

  test("renders empty state when no models exist", async () => {
    listWorkspaceContentModels.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      size: 20,
      pages: 0,
      next: null,
      prev: null,
    });

    await renderWithQuery();

    expect(await screen.findByText("Manage your content models")).toBeInTheDocument();
    expect(await screen.findByText("No content models yet")).toBeInTheDocument();
  });

  test("renders model cards when data is available", async () => {
    listWorkspaceContentModels.mockResolvedValue({
      items: [
        {
          id: "model-page",
          workspaceId: "ws-1",
          siteId: "site-1",
          key: "page",
          name: "Page",
          description: "Routed visual pages with layout and SEO support.",
          category: "site_builder",
          capabilities: ["versioned", "routable", "visual_editable"],
          defaultEditor: "visual",
        },
        {
          id: "model-article",
          workspaceId: "ws-1",
          siteId: "site-1",
          key: "article",
          name: "Article",
          description: "Editorial entries for content operations.",
          category: "content_library",
          capabilities: ["versioned", "routable", "rich_text_editable"],
          defaultEditor: "rich_text",
        },
      ],
      total: 2,
      page: 1,
      size: 20,
      pages: 1,
      next: null,
      prev: null,
    });

    await renderWithQuery();

    expect(await screen.findByText("Page")).toBeInTheDocument();
    expect(await screen.findByText("Article")).toBeInTheDocument();
    expect(screen.getByText("Site Builder")).toBeInTheDocument();
    expect(screen.getByText("Content Library")).toBeInTheDocument();
    expect(
      screen.getByText("Routed visual pages with layout and SEO support."),
    ).toBeInTheDocument();
  });

  test("creates a model and refreshes the list", async () => {
    const user = userEvent.setup();
    listWorkspaceContentModels
      .mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        size: 20,
        pages: 0,
        next: null,
        prev: null,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "model-article",
            workspaceId: "ws-1",
            siteId: "site-1",
            key: "article",
            name: "Article",
            category: "content_library",
            capabilities: ["versioned", "routable", "rich_text_editable"],
            defaultEditor: "rich_text",
          },
        ],
        total: 1,
        page: 1,
        size: 20,
        pages: 1,
        next: null,
        prev: null,
      });
    createWorkspaceContentModel.mockResolvedValue(undefined);

    await renderWithQuery();

    await user.click(await screen.findByRole("button", { name: "New model" }));
    await user.type(screen.getByPlaceholderText("Article"), "Article");
    await user.type(screen.getByPlaceholderText("article"), "article");
    await user.click(screen.getByRole("button", { name: "Create model" }));

    await waitFor(() => {
      expect(createWorkspaceContentModel).toHaveBeenCalledWith("ws-1", {
        key: "article",
        name: "Article",
        kind: "custom",
        fieldSchema: null,
        workflowPolicy: null,
      });
    });
    expect(await screen.findByText("Article")).toBeInTheDocument();
  });

  test("creates a model from a preset template with explicit contract metadata", async () => {
    const user = userEvent.setup();
    listWorkspaceContentModels
      .mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        size: 20,
        pages: 0,
        next: null,
        prev: null,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "model-author",
            workspaceId: "ws-1",
            siteId: "site-1",
            key: "author",
            name: "Author",
            description: "Profiles used across posts, layouts, and testimonials.",
            category: "content_library",
            capabilities: [
              "versioned",
              "routable",
              "has_relations",
              "localizable",
              "publishable",
              "seo_managed",
            ],
            defaultEditor: "form",
          },
        ],
        total: 1,
        page: 1,
        size: 20,
        pages: 1,
        next: null,
        prev: null,
      });
    createWorkspaceContentModel.mockResolvedValue(undefined);

    await renderWithQuery();

    await user.click(await screen.findByRole("button", { name: "New model" }));
    await user.click(screen.getByRole("button", { name: /Author/ }));
    await user.click(screen.getByRole("button", { name: "Create model" }));

    await waitFor(() => {
      expect(createWorkspaceContentModel).toHaveBeenCalledWith("ws-1", {
        key: "author",
        name: "Author",
        kind: "custom",
        category: "content_library",
        description: "Profiles used across posts, layouts, and testimonials.",
        capabilities: [
          "versioned",
          "routable",
          "has_relations",
          "localizable",
          "publishable",
          "seo_managed",
        ],
        defaultEditor: "form",
        fieldSchema: {
          version: 1,
          fields: [
            { key: "display_name", label: "Display name", type: "text" },
            { key: "bio", label: "Bio", type: "rich_text" },
            { key: "avatar", label: "Avatar", type: "asset" },
          ],
        },
        relationSchema: { posts: { target: "post", kind: "many" } },
        routingSchema: { mode: "slug_only", pattern: "/authors/:slug" },
        presentationSchema: { allowed: ["form_data", "seo"] },
        workflowPolicy: null,
        viewSchema: { defaultView: "table" },
        templateKey: "author",
      });
    });
    expect(
      await screen.findByText("Profiles used across posts, layouts, and testimonials."),
    ).toBeInTheDocument();
  });
});
