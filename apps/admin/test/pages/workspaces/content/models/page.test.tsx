import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
          "content_library:MODELS_PAGE_DESC": "Review your content model contracts.",
          "content_library:MODELS_CREATE_ACTION": "Create model from blank",
          "content_library:MODELS_EMPTY_TITLE": "No content models yet",
          "content_library:MODELS_EMPTY_DESC": "Create your first model.",
          "content_library:MODELS_DIALOG_TITLE": "Create content model",
          "content_library:MODELS_DIALOG_DESC": "Define a reusable model contract.",
          "content_library:MODELS_DIALOG_SUBMIT": "Create model",
          "content_library:MODELS_FIELD_NAME_LABEL": "Name",
          "content_library:MODELS_FIELD_NAME_PLACEHOLDER": "Article",
          "content_library:MODELS_FIELD_KEY_LABEL": "Key",
          "content_library:MODELS_FIELD_KEY_PLACEHOLDER": "article",
          "content_library:MODELS_FIELD_KIND_LABEL": "Model kind",
          "content_library:MODELS_FIELD_TEMPLATE_LABEL": "Template",
          "content_library:MODELS_TEMPLATE_OPTIONAL_DESC":
            "Optional examples. Blank-first remains primary.",
          "content_library:MODELS_SECTION_FIELDS": "Fields schema (JSON object)",
          "content_library:MODELS_SECTION_RELATIONS": "Relations schema (JSON object)",
          "content_library:MODELS_SECTION_CAPABILITIES": "Capabilities",
          "content_library:MODELS_JSON_PLACEHOLDER_FIELDS": "fields-json",
          "content_library:MODELS_JSON_PLACEHOLDER_RELATIONS": "relations-json",
          "content_library:MODELS_ROUTING_MODE_LABEL": "Routing mode",
          "content_library:MODELS_ROUTING_PATTERN_LABEL": "Routing pattern",
          "content_library:MODELS_VIEW_DEFAULT_EDITOR_LABEL": "Default editor",
          "content_library:MODELS_VIEW_DEFAULT_LABEL": "Default view",
          "content_library:MODELS_WORKFLOW_SCHEDULE_LABEL": "Enable schedule workflow",
          "content_library:MODELS_IMPACT_TITLE": "Model impact preview",
          "content_library:MODELS_IMPACT_DESC": "Review impact before save.",
          "content_library:MODELS_IMPACT_FIELDS": "Fields",
          "content_library:MODELS_IMPACT_RELATIONS": "Relations",
          "content_library:MODELS_IMPACT_CAPABILITIES": "Capabilities",
          "content_library:MODELS_KIND_CUSTOM": "Custom",
          "content_library:MODELS_KIND_PAGE": "Page",
          "content_library:MODELS_KIND_POST": "Post",
          "content_library:MODELS_KIND_COMPONENT": "Component",
          "content_library:MODELS_KIND_BLOCK": "Block",
          "content_library:MODELS_KIND_MENU": "Menu",
          "content_library:MODELS_KIND_TEMPLATE": "Template",
          "content_library:MODELS_KIND_VIEW": "View",
          "content_library:MODELS_TEMPLATE_CUSTOM_TITLE": "Custom",
          "content_library:MODELS_TEMPLATE_CUSTOM_SUMMARY": "Blank model",
          "content_library:MODELS_TOAST_CREATE_SUCCESS": "Model created",
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

const EMPTY_LIST = {
  items: [],
  total: 0,
  page: 1,
  size: 20,
  pages: 0,
  next: null,
  prev: null,
};

describe("WorkspaceContentModelsPage", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ currentWorkspaceId: "ws-1", lastWorkspaceId: "ws-1" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({ currentWorkspaceId: null, lastWorkspaceId: null });
  });

  test("renders blank-first CTA and empty state", async () => {
    listWorkspaceContentModels.mockResolvedValue(EMPTY_LIST);

    await renderWithQuery();

    expect(await screen.findByText("Manage your content models")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Create model from blank" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("No content models yet")).toBeInTheDocument();
  });

  test("creates a blank-first model", async () => {
    const user = userEvent.setup();
    listWorkspaceContentModels.mockResolvedValue(EMPTY_LIST);
    createWorkspaceContentModel.mockResolvedValue(undefined);

    await renderWithQuery();

    await user.click(await screen.findByRole("button", { name: "Create model from blank" }));
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
  });

  test("edits fields/relations/capabilities/routing/workflow/views in one place", async () => {
    const user = userEvent.setup();
    listWorkspaceContentModels.mockResolvedValue(EMPTY_LIST);
    createWorkspaceContentModel.mockResolvedValue(undefined);

    await renderWithQuery();

    await user.click(await screen.findByRole("button", { name: "Create model from blank" }));
    await user.type(screen.getByPlaceholderText("Article"), "Landing Page");
    await user.type(screen.getByPlaceholderText("article"), "landing_page");

    fireEvent.change(screen.getByPlaceholderText("fields-json"), {
      target: {
        value: '{"version":1,"fields":[{"key":"title","label":"Title","type":"text"}]}',
      },
    });
    fireEvent.change(screen.getByPlaceholderText("relations-json"), {
      target: { value: '{"author":{"target":"author","kind":"one"}}' },
    });
    const routingModeInput = screen.getByPlaceholderText("none | slug_only | static_or_dynamic");
    await user.clear(routingModeInput);
    await user.type(routingModeInput, "slug_only");
    await user.type(screen.getByPlaceholderText("/blog/:slug"), "/landing/:slug");
    await user.type(screen.getByPlaceholderText("form | visual | rich_text | table"), "form");
    await user.type(screen.getByPlaceholderText("table"), "board");

    await user.click(screen.getByRole("checkbox", { name: "Publishable" }));
    await user.click(screen.getByRole("checkbox", { name: "Enable schedule workflow" }));
    expect(screen.getByText("Model impact preview")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create model" }));

    await waitFor(() => {
      expect(createWorkspaceContentModel).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({
          key: "landing_page",
          name: "Landing Page",
          kind: "custom",
          capabilities: ["publishable"],
          fieldSchema: {
            version: 1,
            fields: [{ key: "title", label: "Title", type: "text" }],
          },
          relationSchema: { author: { target: "author", kind: "one" } },
          routingSchema: { mode: "slug_only", pattern: "/landing/:slug" },
          defaultEditor: "form",
          viewSchema: { defaultView: "board" },
          workflowPolicy: { supportsSchedule: true },
        }),
      );
    });
  });
});
