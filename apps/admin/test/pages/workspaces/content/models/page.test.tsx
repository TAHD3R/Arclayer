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

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          "content_library:MODELS_PAGE_TITLE": "Models",
          "content_library:MODELS_PAGE_DESC":
            "Define schema contracts, inspect downstream impact, and import starter examples only when useful.",
          "content_library:MODELS_CREATE_ACTION": "Create model from blank",
          "content_library:MODELS_IMPORT_ACTION": "Import starter example",
          "content_library:MODELS_COMPARE_ACTION": "Compare changes",
          "content_library:MODELS_HEALTH_ACTION": "Schema health",
          "content_library:MODELS_EMPTY_TITLE": "No content models yet",
          "content_library:MODELS_EMPTY_DESC":
            "Create a blank contract or import a starter example as a detached draft.",
          "content_library:MODELS_DIALOG_TITLE": "Create content model",
          "content_library:MODELS_DIALOG_DESC":
            "Blank-first schema workspace for fields, relations, routing, workflow, and presentation defaults.",
          "content_library:MODELS_DIALOG_SUBMIT": "Create model",
          "content_library:MODELS_FIELD_NAME_LABEL": "Name",
          "content_library:MODELS_FIELD_NAME_PLACEHOLDER": "Article",
          "content_library:MODELS_FIELD_KEY_LABEL": "Key",
          "content_library:MODELS_FIELD_KEY_PLACEHOLDER": "article",
          "content_library:MODELS_PANEL_LIST_TITLE": "Model catalog",
          "content_library:MODELS_PANEL_LIST_DESC":
            "Browse model contracts by category and operational usage.",
          "content_library:MODELS_PANEL_WORKSPACE_TITLE": "Schema workspace",
          "content_library:MODELS_PANEL_WORKSPACE_DESC":
            "Fields, relations, workflow, SEO, and presentation rules live here.",
          "content_library:MODELS_PANEL_INSPECTOR_TITLE": "Impact inspector",
          "content_library:MODELS_PANEL_INSPECTOR_DESC":
            "Breaking changes, downstream references, and publish blockers stay visible.",
          "content_library:MODELS_EMPTY_WORKSPACE_TITLE": "Start from a blank schema",
          "content_library:MODELS_EMPTY_WORKSPACE_DESC":
            "Model contracts are explicit. Starter examples are detached helpers, not runtime truth.",
          "content_library:MODELS_EMPTY_INSPECTOR_TITLE": "No unsaved impact yet",
          "content_library:MODELS_EMPTY_INSPECTOR_DESC":
            "Open a blank model or starter example to inspect fields, routes, and publish blockers.",
          "content_library:MODELS_SECTION_FIELDS": "Fields schema (JSON object)",
          "content_library:MODELS_SECTION_RELATIONS": "Relations schema (JSON object)",
          "content_library:MODELS_SECTION_CAPABILITIES": "Capabilities",
          "content_library:MODELS_SECTION_DEFAULTS": "Defaults",
          "content_library:MODELS_SECTION_WORKFLOW": "Workflow",
          "content_library:MODELS_JSON_PLACEHOLDER_FIELDS": "fields-json",
          "content_library:MODELS_JSON_PLACEHOLDER_RELATIONS": "relations-json",
          "content_library:MODELS_ROUTING_MODE_LABEL": "Routing mode",
          "content_library:MODELS_ROUTING_PATTERN_LABEL": "Routing pattern",
          "content_library:MODELS_VIEW_DEFAULT_EDITOR_LABEL": "Default editor",
          "content_library:MODELS_VIEW_DEFAULT_LABEL": "Default view",
          "content_library:MODELS_WORKFLOW_SCHEDULE_LABEL": "Enable schedule workflow",
          "content_library:MODELS_IMPACT_TITLE": "Impact inspector",
          "content_library:MODELS_IMPACT_DESC":
            "Review downstream model, route, and publish effects before saving.",
          "content_library:MODELS_IMPACT_FIELDS": "Fields",
          "content_library:MODELS_IMPACT_RELATIONS": "Relations",
          "content_library:MODELS_IMPACT_CAPABILITIES": "Capabilities",
          "content_library:MODELS_IMPACT_STATUS_TITLE": "Impact status",
          "content_library:MODELS_IMPACT_STATUS_CLEAN": "No breaking changes detected yet.",
          "content_library:MODELS_IMPACT_STATUS_WARN": "Review changes before saving.",
          "content_library:MODELS_IMPACT_USAGE_RECORDS": "Linked records",
          "content_library:MODELS_IMPACT_USAGE_ROUTES": "Linked routes",
          "content_library:MODELS_IMPACT_USAGE_PRESENTATIONS": "Studio presentations",
          "content_library:MODELS_IMPACT_USAGE_PUBLISH": "Publish blockers",
          "content_library:MODELS_IMPORT_DIALOG_TITLE": "Import starter example",
          "content_library:MODELS_IMPORT_DIALOG_DESC":
            "Use a detached starter to accelerate setup. Imported fields detach immediately.",
          "content_library:MODELS_IMPORT_DIALOG_CONFIRM": "Use starter example",
          "content_library:MODELS_IMPORT_SELECTED_PREFIX": "Starter loaded:",
          "content_library:MODELS_TEMPLATE_CUSTOM_TITLE": "Custom",
          "content_library:MODELS_TEMPLATE_CUSTOM_SUMMARY": "Blank model",
          "content_library:MODELS_TEMPLATE_PAGE_TITLE": "Landing page starter",
          "content_library:MODELS_TEMPLATE_PAGE_SUMMARY": "Visual schema with routing and slots",
          "content_library:MODELS_TEMPLATE_POST_TITLE": "Editorial article starter",
          "content_library:MODELS_TEMPLATE_POST_SUMMARY":
            "Rich text schema with publish workflow and SEO defaults",
          "content_library:MODELS_TEMPLATE_REUSABLE_BLOCK_TITLE": "Reusable block starter",
          "content_library:MODELS_TEMPLATE_REUSABLE_BLOCK_SUMMARY":
            "Composable visual block for shared layouts",
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
    extra?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <div>
      <h1>{props.title}</h1>
      <p>{props.description}</p>
      {props.action}
      {props.extra}
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

vi.mock("@celestial/ui/complex-dialog", () => ({
  ComplexDialog: (props: {
    open: boolean;
    title?: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
    footer?: React.ReactNode;
    size?: string;
  }) =>
    props.open ? (
      <div data-testid="complex-dialog" data-size={props.size}>
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

  render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceContentModelsPage />
    </QueryClientProvider>,
  );
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
  beforeEach(async () => {
    await act(async () => {
      useWorkspaceStore.setState({ currentWorkspaceId: "ws-1", lastWorkspaceId: "ws-1" });
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await act(async () => {
      useWorkspaceStore.setState({ currentWorkspaceId: null, lastWorkspaceId: null });
    });
  });

  test("renders blank-first CTA and empty state", async () => {
    listWorkspaceContentModels.mockResolvedValue(EMPTY_LIST);

    await renderWithQuery();

    expect(await screen.findByText("Models")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Create model from blank" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Import starter example" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("No content models yet")).toBeInTheDocument();
    expect(await screen.findByText("Model catalog")).toBeInTheDocument();
    expect(await screen.findByText("Schema workspace")).toBeInTheDocument();
    expect(await screen.findByText("Impact inspector")).toBeInTheDocument();
  });

  test("creates a blank-first model without kind or template truth", async () => {
    const user = userEvent.setup();
    listWorkspaceContentModels.mockResolvedValue(EMPTY_LIST);
    createWorkspaceContentModel.mockResolvedValue(undefined);

    await renderWithQuery();

    await user.click(await screen.findByRole("button", { name: "Create model from blank" }));
    expect(screen.getByTestId("complex-dialog")).toHaveAttribute("data-size", "xl");
    await user.type(screen.getByPlaceholderText("Article"), "Article");
    await user.type(screen.getByPlaceholderText("article"), "article");
    expect(screen.queryByText("Model kind")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create model" }));

    await waitFor(() => {
      expect(createWorkspaceContentModel).toHaveBeenCalledWith("ws-1", {
        key: "article",
        name: "Article",
        fieldSchema: null,
        workflowPolicy: null,
      });
    });
  });

  test("edits fields/relations/capabilities/routing/workflow/views in one schema workspace", async () => {
    const user = userEvent.setup();
    listWorkspaceContentModels.mockResolvedValue(EMPTY_LIST);
    createWorkspaceContentModel.mockResolvedValue(undefined);

    await renderWithQuery();

    await user.click(await screen.findByRole("button", { name: "Create model from blank" }));
    expect(screen.getAllByText("Schema workspace").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Impact inspector").length).toBeGreaterThan(0);
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
    expect(screen.getAllByText("Impact inspector").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Create model" }));

    await waitFor(() => {
      expect(createWorkspaceContentModel).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({
          key: "landing_page",
          name: "Landing Page",
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

  test("imports starter examples from a secondary dialog and detaches them into the blank-first draft", async () => {
    const user = userEvent.setup();
    listWorkspaceContentModels.mockResolvedValue(EMPTY_LIST);
    createWorkspaceContentModel.mockResolvedValue(undefined);

    await renderWithQuery();

    await user.click(await screen.findByRole("button", { name: "Import starter example" }));
    expect(screen.getByTestId("complex-dialog")).toHaveAttribute("data-size", "xl");
    expect(
      await screen.findByRole("heading", { level: 2, name: "Import starter example" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Editorial article starter/ }));
    await user.click(screen.getByRole("button", { name: "Use starter example" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Editorial article starter")).toBeInTheDocument();
      expect(screen.getByDisplayValue("post")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Create model" }));

    await waitFor(() => {
      expect(createWorkspaceContentModel).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({
          key: "post",
          name: "Editorial article starter",
          category: "content_library",
          defaultEditor: "rich_text",
        }),
      );
    });

    const payload = createWorkspaceContentModel.mock.calls.at(-1)?.[1];
    expect(payload).not.toHaveProperty("kind");
    expect(payload).not.toHaveProperty("templateKey");
  });
});
