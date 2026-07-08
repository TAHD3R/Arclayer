import type { MouseEvent as ReactMouseEvent, PropsWithChildren } from "react";
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContentModelsControlCenterPage } from "@/pages/projects/content/models/page";
import { ContentModelEditPage } from "@/pages/projects/content/models/edit-page";
import {
  buildDuplicateContentModelPayload,
  buildReusableBlockContentModelPayload,
  buildSitePageContentModelPayload,
  getContentModelFieldCount,
  getContentModelPurposeLabelKey,
  toContentModelsTableQuery,
} from "@/pages/projects/content/models/utils";
import type { AdminContentModel } from "@arclayer/openapi/admin-types";
import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";
import { TooltipProvider } from "@arclayer/ui/tooltip";

const createContentModelMock = vi.fn();
const deleteContentModelMock = vi.fn();
const executeAIWorkspaceActionMock = vi.fn();
const listAIProjectAgentsMock = vi.fn();
const buildContentModelFieldTypesQueryKeyMock = vi.fn((projectId: string) => [
  "content",
  "field-types",
  projectId,
]);
const getContentModelFieldTypeRegistryMock = vi.fn();
const listAllContentModelsMock = vi.fn();
const listContentModelsMock = vi.fn();
const navigateMock = vi.fn();
const permissionAccessMock = {
  hasAction: vi.fn(() => true),
};

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/api/content", () => ({
  buildContentModelsQueryKey: (...args: unknown[]) => ["content", "models", ...args],
  buildContentModelFieldTypesQueryKey: (...args: [string]) =>
    buildContentModelFieldTypesQueryKeyMock(...args),
  createContentModel: (...args: unknown[]) => createContentModelMock(...args),
  deleteContentModel: (...args: unknown[]) => deleteContentModelMock(...args),
  getContentModelFieldTypeRegistry: (...args: unknown[]) =>
    getContentModelFieldTypeRegistryMock(...args),
  listAllContentModels: (...args: unknown[]) => listAllContentModelsMock(...args),
  listContentModels: (...args: unknown[]) => listContentModelsMock(...args),
}));

vi.mock("@/api/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/ai")>();
  return {
    ...actual,
    executeAIWorkspaceAction: (...args: unknown[]) => executeAIWorkspaceActionMock(...args),
    listAIProjectAgents: (...args: unknown[]) => listAIProjectAgentsMock(...args),
  };
});

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({
    formatDateTime: (value: string | null | undefined) => value ?? "",
  }),
}));

vi.mock("@/hooks/use-workspace-permission-access", () => ({
  useProjectPermissionAccess: () => permissionAccessMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "content:CONTENT_MODELS_CREATE_UNTITLED_NAME") return "未命名内容模型";
      return key;
    },
  }),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({
    title,
    action,
    showFavoriteToggle = true,
    children,
  }: PropsWithChildren<{
    title: string;
    action?: React.ReactNode;
    showFavoriteToggle?: boolean;
  }>) => (
    <div>
      <h1>{title}</h1>
      {showFavoriteToggle ? <button type="button" aria-label="favorite" /> : null}
      {action}
      {children}
    </div>
  ),
}));

vi.mock("@/layouts/page-shell/admin-data-table-section", () => ({
  AdminDataTableSection: ({
    table,
    toolbar,
    onRowClick,
    rowClassName,
  }: PropsWithChildren<{
    table: {
      getRowModel: () => {
        rows: Array<{
          id: string;
          getIsSelected: () => boolean;
          original: unknown;
        }>;
      };
    };
    toolbar?: React.ReactNode;
    onRowClick?: (
      row: unknown,
      rowIndex: number,
      event: ReactMouseEvent<HTMLTableRowElement>,
    ) => void;
    rowClassName?: (row: unknown, rowIndex: number) => string | undefined;
  }>) => (
    <div>
      {toolbar}
      {table.getRowModel().rows.map((row, index) => (
        <div
          key={row.id}
          data-testid={`content-model-row-${row.id}`}
          data-row-class={rowClassName?.(row, index) ?? ""}
        >
          <span data-testid={`content-model-row-selected-${row.id}`}>
            {row.getIsSelected() ? "true" : "false"}
          </span>
          <button
            type="button"
            onClick={() =>
              onRowClick?.(row, index, {
                detail: 1,
                metaKey: false,
                ctrlKey: false,
                shiftKey: false,
                preventDefault: vi.fn(),
              } as unknown as ReactMouseEvent<HTMLTableRowElement>)
            }
          >
            {`row-click-${row.id}`}
          </button>
          <button
            type="button"
            onClick={() =>
              onRowClick?.(row, index, {
                detail: 2,
                metaKey: false,
                ctrlKey: false,
                shiftKey: false,
                preventDefault: vi.fn(),
              } as unknown as ReactMouseEvent<HTMLTableRowElement>)
            }
          >
            {`row-double-click-${row.id}`}
          </button>
        </div>
      ))}
    </div>
  ),
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient = createTestQueryClient()) {
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <ChromeTabsProvider
          labels={{
            scrollLeftAriaLabel: "Scroll tabs left",
            scrollRightAriaLabel: "Scroll tabs right",
          }}
        >
          <TooltipProvider>{children}</TooltipProvider>
        </ChromeTabsProvider>
      </QueryClientProvider>
    );
  }

  return Wrapper;
}

function buildModel(overrides: Partial<AdminContentModel> = {}): AdminContentModel {
  return {
    id: "model-1",
    workspaceId: "workspace-1",
    siteId: "site-1",
    singularKey: "article",
    pluralKey: "articles",
    name: "Article",
    description: "Article model",
    category: "custom",
    modelKind: "collection_type",
    capabilities: ["queryable"],
    defaultEditor: "form",
    draftContractRevision: 1,
    updatedAt: "2026-04-28T00:00:00Z",
    updatedByUserId: null,
    updatedBy: null,
    ...overrides,
  };
}

function queryCreateInput(label: string) {
  const input = screen
    .queryAllByLabelText(label)
    .find((element): element is HTMLInputElement | HTMLTextAreaElement =>
      element.matches("input, textarea"),
    );
  return input ?? null;
}

async function findCreateInput(label: string) {
  let input = queryCreateInput(label);
  await waitFor(() => {
    input = queryCreateInput(label);
    expect(input).not.toBeNull();
  });
  if (!input) throw new Error(`Missing create model input: ${label}`);
  return input;
}

async function openCreateDetailsView() {
  fireEvent.click(
    await screen.findByRole("button", { name: "CONTENT_MODELS_CREATE_CONTINUE_ACTION" }),
  );
}

describe("content model builder", () => {
  beforeEach(() => {
    createContentModelMock.mockReset();
    deleteContentModelMock.mockReset();
    executeAIWorkspaceActionMock.mockReset();
    listAIProjectAgentsMock.mockReset();
    buildContentModelFieldTypesQueryKeyMock.mockClear();
    getContentModelFieldTypeRegistryMock.mockReset();
    listAllContentModelsMock.mockReset();
    listContentModelsMock.mockReset();
    navigateMock.mockReset();
    permissionAccessMock.hasAction.mockReturnValue(true);
    listContentModelsMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      size: 50,
      pages: 0,
      next: null,
      prev: null,
    });
    listAIProjectAgentsMock.mockResolvedValue({ agents: [], tools: [], skills: [] });
    listAllContentModelsMock.mockResolvedValue([]);
    getContentModelFieldTypeRegistryMock.mockResolvedValue({ fieldTypes: [] });
  });

  test("navigates to the edit route create flow", () => {
    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByRole("button", { name: "favorite" })).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "CONTENT_MODELS_CREATE_CONTENT_TYPE_ACTION" }),
    );

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/$projectId/content/models/edit",
      params: { projectId: "project-1" },
      search: { create: true },
    });
    expect(createContentModelMock).not.toHaveBeenCalled();
  });

  test("surfaces a website structure blueprint above model table operations", async () => {
    listContentModelsMock.mockResolvedValue({
      items: [
        buildModel({
          id: "model-page",
          singularKey: "page",
          pluralKey: "pages",
          name: "Page",
          category: "site_builder",
          capabilities: ["visual_editable", "routable", "publishable"],
          defaultEditor: "visual",
        }),
        buildModel({
          id: "model-author",
          singularKey: "author",
          pluralKey: "authors",
          name: "Author",
          category: "custom",
          capabilities: ["queryable", "publishable"],
          defaultEditor: "form",
        }),
        buildModel({
          id: "model-reusable-block",
          singularKey: "reusableBlock",
          pluralKey: "reusableBlocks",
          name: "Reusable Block",
          category: "site_builder",
          capabilities: ["visual_editable", "has_slots", "publishable", "localizable"],
          defaultEditor: "visual",
          defaultRole: "reusable-section",
          defaultPosture: "composition",
          defaultSurface: "canvas",
        }),
      ],
      total: 3,
      page: 1,
      size: 50,
      pages: 1,
      next: null,
      prev: null,
    });

    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    await screen.findByRole("button", { name: "row-click-model-page" });
    const summary = screen.getByTestId("content-models-blueprint-summary");
    expect(summary.className).toContain("bg-background");
    expect(summary.className).not.toContain("bg-card");
    expect(summary.className).not.toContain("shadow-sm");
    expect(summary.className).not.toContain("rounded-lg");

    expect(
      within(summary).getByRole("heading", {
        name: "content:CONTENT_MODELS_BLUEPRINT_TITLE",
      }),
    ).toBeInTheDocument();
    expect(
      within(summary).getByText("content:CONTENT_MODELS_BLUEPRINT_METRIC_PAGE_MODELS"),
    ).toBeInTheDocument();
    expect(
      within(summary).getByText("content:CONTENT_MODELS_BLUEPRINT_METRIC_SITE_BUILDER"),
    ).toBeInTheDocument();
    expect(
      within(summary).getByText("content:CONTENT_MODELS_BLUEPRINT_METRIC_REUSABLE_BLOCKS"),
    ).toBeInTheDocument();
    expect(
      within(summary).getByText("content:CONTENT_MODELS_BLUEPRINT_METRIC_PUBLISHABLE"),
    ).toBeInTheDocument();
    expect(
      within(summary).queryByRole("list", {
        name: "content:CONTENT_MODELS_WORKFLOW_LABEL",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(summary).queryByText("content:CONTENT_MODELS_BLUEPRINT_AI_CONTRACT_TITLE"),
    ).not.toBeInTheDocument();
    expect(within(summary).getAllByText("1")).toHaveLength(2);
    expect(within(summary).getByText("2")).toBeInTheDocument();
    expect(within(summary).getByText("3")).toBeInTheDocument();

    fireEvent.click(
      within(summary).getByRole("button", {
        name: "content:CONTENT_MODELS_BLUEPRINT_ACTION_OPEN_PAGE_MODEL",
      }),
    );

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/project-1/content/models/edit?modelId=model-page",
    });
  });

  test("creates the site page model from the website structure blueprint", async () => {
    const user = userEvent.setup();
    const createdModel = buildModel({
      id: "model-page",
      singularKey: "page",
      pluralKey: "pages",
      name: "Page",
      category: "site_builder",
      capabilities: [
        "versioned",
        "queryable",
        "routable",
        "treeable",
        "visual_editable",
        "has_slots",
        "publishable",
        "seo_managed",
      ],
      defaultEditor: "visual",
      defaultRole: "page",
      defaultPosture: "page",
      defaultSurface: "canvas",
    });
    createContentModelMock.mockResolvedValue(createdModel);

    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    const summary = await screen.findByTestId("content-models-blueprint-summary");
    await user.click(
      within(summary).getByRole("button", {
        name: "content:CONTENT_MODELS_BLUEPRINT_ACTION_CREATE_MODEL",
      }),
    );

    await waitFor(() => {
      expect(listAllContentModelsMock).toHaveBeenCalledWith("project-1");
      expect(createContentModelMock).toHaveBeenCalledWith(
        "project-1",
        buildSitePageContentModelPayload(),
      );
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/projects/project-1/content/models/edit?modelId=model-page",
      });
    });
  });

  test("creates the reusable block model from the website structure blueprint", async () => {
    const user = userEvent.setup();
    const createdModel = buildModel({
      id: "model-reusable-block",
      singularKey: "reusableBlock",
      pluralKey: "reusableBlocks",
      name: "Reusable Block",
      category: "site_builder",
      capabilities: ["visual_editable", "has_slots", "publishable", "localizable"],
      defaultEditor: "visual",
      defaultRole: "reusable-section",
      defaultPosture: "composition",
      defaultSurface: "canvas",
    });
    createContentModelMock.mockResolvedValue(createdModel);

    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    const summary = await screen.findByTestId("content-models-blueprint-summary");
    await user.click(
      within(summary).getByRole("button", {
        name: "content:CONTENT_MODELS_BLUEPRINT_ACTION_CREATE_REUSABLE_BLOCK_MODEL",
      }),
    );

    await waitFor(() => {
      expect(listAllContentModelsMock).toHaveBeenCalledWith("project-1");
      expect(createContentModelMock).toHaveBeenCalledWith(
        "project-1",
        buildReusableBlockContentModelPayload(),
      );
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/projects/project-1/content/models/edit?modelId=model-reusable-block",
      });
    });
  });

  test("opens an existing site page model instead of creating a duplicate blueprint model", async () => {
    const user = userEvent.setup();
    const existingPageModel = buildModel({
      id: "model-page",
      singularKey: "page",
      pluralKey: "pages",
      name: "Page",
      category: "site_builder",
      capabilities: ["routable", "visual_editable", "publishable"],
      defaultEditor: "visual",
    });
    listAllContentModelsMock.mockResolvedValue([existingPageModel]);

    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    const summary = await screen.findByTestId("content-models-blueprint-summary");
    await user.click(
      within(summary).getByRole("button", {
        name: "content:CONTENT_MODELS_BLUEPRINT_ACTION_CREATE_MODEL",
      }),
    );

    await waitFor(() => {
      expect(createContentModelMock).not.toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/projects/project-1/content/models/edit?modelId=model-page",
      });
    });
  });

  test("opens an existing reusable block model instead of creating a duplicate blueprint model", async () => {
    const user = userEvent.setup();
    const existingReusableBlockModel = buildModel({
      id: "model-reusable-block",
      singularKey: "reusableBlock",
      pluralKey: "reusableBlocks",
      name: "Reusable Block",
      category: "site_builder",
      capabilities: ["visual_editable", "has_slots", "publishable", "localizable"],
      defaultEditor: "visual",
      defaultRole: "reusable-section",
      defaultPosture: "composition",
      defaultSurface: "canvas",
    });
    listContentModelsMock.mockResolvedValue({
      items: [existingReusableBlockModel],
      total: 1,
      page: 1,
      size: 50,
      pages: 1,
      next: null,
      prev: null,
    });

    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    await screen.findByRole("button", { name: "row-click-model-reusable-block" });
    const summary = await screen.findByTestId("content-models-blueprint-summary");
    await user.click(
      within(summary).getByRole("button", {
        name: "content:CONTENT_MODELS_BLUEPRINT_ACTION_OPEN_REUSABLE_BLOCK_MODEL",
      }),
    );

    await waitFor(() => {
      expect(createContentModelMock).not.toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/projects/project-1/content/models/edit?modelId=model-reusable-block",
      });
    });
  });

  test("creates from the edit route dialog and stays on the new model editor", async () => {
    const queryClient = createTestQueryClient();
    const staleTableQueryKey = [
      "dataTable",
      "project-content-models:project-1",
      { page: 1, size: 50, ordering: "-updatedAt" },
    ] as const;
    queryClient.setQueryData(staleTableQueryKey, {
      items: [],
      total: 0,
      page: 1,
      size: 50,
      pages: 0,
      next: null,
      prev: null,
    });
    createContentModelMock.mockResolvedValue(
      buildModel({
        id: "model-2",
        singularKey: "blogPost",
        pluralKey: "blogPosts",
        name: "Blog Post",
      }),
    );

    render(<ContentModelEditPage projectId="project-1" createOpen />, {
      wrapper: createWrapper(queryClient),
    });

    expect(
      await screen.findByRole("tab", { name: "CONTENT_MODELS_CREATE_MANUAL_TAB" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("heading", { name: "CONTENT_MODELS_CREATE_CONTENT_TYPE_TITLE" }),
    ).toHaveClass("sr-only");
    expect(screen.getByText("CONTENT_MODELS_CREATE_STARTER_TEMPLATE_TITLE")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /CONTENT_MODELS_CREATE_TEMPLATE_BLANK_LABEL/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /CONTENT_MODELS_CREATE_TEMPLATE_PAGE_LABEL/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /CONTENT_MODELS_CREATE_TEMPLATE_REUSABLE_BLOCK_LABEL/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /CONTENT_MODELS_CREATE_TEMPLATE_LANDING_SECTION_LABEL/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /CONTENT_MODELS_KIND_COLLECTION_TYPE/ }),
    ).toBeInTheDocument();

    await openCreateDetailsView();

    fireEvent.change(await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_LABEL"), {
      target: { value: "Blog Post" },
    });

    expect(screen.getByText("9/128")).toBeInTheDocument();
    expect(await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_SINGULAR_LABEL")).toHaveValue(
      "blogPost",
    );
    expect(await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_PLURAL_LABEL")).toHaveValue(
      "blogPosts",
    );
    expect(screen.getAllByText("8/64").length).toBeGreaterThan(0);
    expect(screen.getByText("9/64")).toBeInTheDocument();

    fireEvent.change(
      await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_DESCRIPTION_LABEL"),
      {
        target: { value: "Editorial records." },
      },
    );

    expect(screen.getByText("18/256")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "CONTENT_MODELS_CREATE_CONTENT_TYPE_TITLE" }),
    ).not.toHaveClass("sr-only");
    expect(screen.queryByText("CONTENT_MODELS_CREATE_MODEL_TYPE_TITLE")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_CREATE_CONFIRM" }));

    await waitFor(() => {
      expect(createContentModelMock).toHaveBeenCalledWith("project-1", {
        name: "Blog Post",
        singularKey: "blogPost",
        pluralKey: "blogPosts",
        description: "Editorial records.",
        modelKind: "collection_type",
        fields: [],
        relations: [],
        capabilities: ["queryable"],
        routing: { mode: "none" },
        workflow: { states: ["draft"], initialState: "draft" },
        views: [],
      });
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/projects/project-1/content/models/edit?modelId=model-2",
      });
    });
    expect(queryClient.getQueryState(staleTableQueryKey)?.isInvalidated).toBe(true);
  });

  test("creates site-builder starter templates with visual publishing contracts", async () => {
    createContentModelMock.mockResolvedValue(
      buildModel({
        id: "model-page",
        singularKey: "page",
        pluralKey: "pages",
        name: "Page",
      }),
    );

    render(<ContentModelEditPage projectId="project-1" createOpen />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(
      await screen.findByRole("button", {
        name: /CONTENT_MODELS_CREATE_TEMPLATE_PAGE_LABEL/,
      }),
    );
    await openCreateDetailsView();

    expect(await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_LABEL")).toHaveValue(
      "Page",
    );
    expect(await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_SINGULAR_LABEL")).toHaveValue(
      "page",
    );
    expect(await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_PLURAL_LABEL")).toHaveValue(
      "pages",
    );

    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_CREATE_CONFIRM" }));

    await waitFor(() => {
      expect(createContentModelMock).toHaveBeenCalledWith("project-1", {
        ...buildSitePageContentModelPayload(),
        description: "Route-owned pages for preview, SEO, visual editing, and releases.",
      });
    });
  });

  test("creates site record templates for repeatable website data", async () => {
    createContentModelMock.mockResolvedValue(
      buildModel({
        id: "model-site-record",
        singularKey: "siteRecord",
        pluralKey: "siteRecords",
        name: "Site Records",
      }),
    );

    render(<ContentModelEditPage projectId="project-1" createOpen />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(
      await screen.findByRole("button", {
        name: /CONTENT_MODELS_CREATE_TEMPLATE_CONTENT_COLLECTION_LABEL/,
      }),
    );
    await openCreateDetailsView();

    expect(await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_LABEL")).toHaveValue(
      "Site Records",
    );
    expect(await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_SINGULAR_LABEL")).toHaveValue(
      "siteRecord",
    );
    expect(await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_PLURAL_LABEL")).toHaveValue(
      "siteRecords",
    );

    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_CREATE_CONFIRM" }));

    await waitFor(() => {
      expect(createContentModelMock).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({
          category: "content_library",
          defaultEditor: "form",
          defaultSurface: "structured",
          description: "Repeatable website records for case studies, resources, team, or listings.",
          modelKind: "collection_type",
          name: "Site Records",
          pluralKey: "siteRecords",
          routing: { mode: "single", slugField: "slug" },
          singularKey: "siteRecord",
        }),
      );
    });
  });

  test("create flow renders localized fallback title and skips model list query", () => {
    render(<ContentModelEditPage projectId="project-1" createOpen />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("未命名内容模型")).toBeInTheDocument();
    expect(listAllContentModelsMock).not.toHaveBeenCalled();
  });

  test("ai tab creates a content model through workspace actions", async () => {
    const user = userEvent.setup();
    executeAIWorkspaceActionMock.mockResolvedValue({
      kind: "tool_call",
      action: "create_content_model",
      status: "completed",
      content: "Created Customer Story model.",
      executionSteps: [],
      toolCalls: [],
      contentModel: {
        id: "model-ai",
        workspaceId: "workspace-1",
        siteId: "site-1",
        name: "Customer Story",
        singularKey: "customerStory",
        pluralKey: "customerStories",
        description: "Stories.",
        modelKind: "collection_type",
      },
      contentModels: [],
      projects: [],
      total: null,
      navigation: {
        label: "Open model",
        path: "/projects/project-1/content/models/model-ai",
      },
    });
    render(<ContentModelEditPage projectId="project-1" createOpen />, {
      wrapper: createWrapper(),
    });

    await user.click(await screen.findByRole("tab", { name: "CONTENT_MODELS_CREATE_AI_TAB" }));

    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("CONTENT_MODELS_CREATE_AI_CHAT_EMPTY")).toBeInTheDocument();
    });
    expect(
      screen.getByPlaceholderText("CONTENT_MODELS_CREATE_AI_CHAT_INPUT_PLACEHOLDER"),
    ).toBeInTheDocument();
    expect(screen.getByText("CONTENT_MODELS_CREATE_AI_PROMPT_LABEL")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "CONTENT_MODELS_CREATE_AI_PROMPT_PAGE_MODEL_LABEL",
      }),
    );
    expect(
      screen.getByPlaceholderText("CONTENT_MODELS_CREATE_AI_CHAT_INPUT_PLACEHOLDER"),
    ).toHaveValue("CONTENT_MODELS_CREATE_AI_PROMPT_PAGE_MODEL_TEXT");
    expect(
      screen.getByRole("button", {
        name: "CONTENT_MODELS_CREATE_AI_PROMPT_REUSABLE_BLOCK_LABEL",
      }),
    ).toBeInTheDocument();

    await user.clear(
      screen.getByPlaceholderText("CONTENT_MODELS_CREATE_AI_CHAT_INPUT_PLACEHOLDER"),
    );
    await user.type(
      screen.getByPlaceholderText("CONTENT_MODELS_CREATE_AI_CHAT_INPUT_PLACEHOLDER"),
      "Create a customer story record set with logo and CTA fields.",
    );
    await user.click(screen.getByRole("button", { name: "CONTENT_MODELS_CREATE_AI_CHAT_SEND" }));

    await waitFor(() => {
      expect(executeAIWorkspaceActionMock).toHaveBeenCalledWith(
        [
          "CONTENT_MODELS_CREATE_AI_ACTION_PREFIX",
          "",
          "Create a customer story record set with logo and CTA fields.",
        ].join("\n"),
        {
          mode: "build",
          projectId: "project-1",
          signal: expect.any(AbortSignal),
        },
      );
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/projects/project-1/content/models/edit?modelId=model-ai",
      });
    });
  });

  test("closes the edit route create dialog without saving and returns to models", async () => {
    render(<ContentModelEditPage projectId="project-1" createOpen />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(await screen.findByRole("button", { name: "CONTENT_MODELS_CANCEL_ACTION" }));

    expect(createContentModelMock).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/project-1/content/models",
    });
  });

  test("keeps manually edited identifiers stable when name changes", async () => {
    createContentModelMock.mockResolvedValue(buildModel());

    render(<ContentModelEditPage projectId="project-1" createOpen />, {
      wrapper: createWrapper(),
    });

    await openCreateDetailsView();

    fireEvent.change(await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_LABEL"), {
      target: { value: "News item" },
    });
    fireEvent.change(await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_SINGULAR_LABEL"), {
      target: { value: "storyBlock" },
    });
    fireEvent.change(await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_LABEL"), {
      target: { value: "Press release" },
    });

    expect(await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_SINGULAR_LABEL")).toHaveValue(
      "storyBlock",
    );
    expect(await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_PLURAL_LABEL")).toHaveValue(
      "pressReleases",
    );
  });

  test("disables create actions when project content model write access is missing", () => {
    permissionAccessMock.hasAction.mockReturnValue(false);

    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    expect(
      screen.getByRole("button", { name: "CONTENT_MODELS_CREATE_CONTENT_TYPE_ACTION" }),
    ).toBeDisabled();
    expect(
      within(screen.getByTestId("content-models-blueprint-summary")).getByRole("button", {
        name: "content:CONTENT_MODELS_BLUEPRINT_ACTION_CREATE_MODEL",
      }),
    ).toBeDisabled();
    expect(
      within(screen.getByTestId("content-models-blueprint-summary")).getByRole("button", {
        name: "content:CONTENT_MODELS_BLUEPRINT_ACTION_CREATE_REUSABLE_BLOCK_MODEL",
      }),
    ).toBeDisabled();
    expect(createContentModelMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("content-models-no-access")).toBeInTheDocument();
  });

  test("navigates to the dedicated content model edit route", async () => {
    listContentModelsMock.mockResolvedValue({
      items: [buildModel()],
      total: 1,
      page: 1,
      size: 50,
      pages: 1,
      next: null,
      prev: null,
    });

    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(await screen.findByRole("button", { name: "row-double-click-model-1" }));

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/projects/project-1/content/models/edit?modelId=model-1",
    });
  });

  test("single click selects a row and double click opens the model editor", async () => {
    listContentModelsMock.mockResolvedValue({
      items: [
        buildModel(),
        buildModel({
          id: "model-2",
          singularKey: "author",
          pluralKey: "authors",
          name: "Author",
        }),
      ],
      total: 2,
      page: 1,
      size: 50,
      pages: 1,
      next: null,
      prev: null,
    });

    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    expect(await screen.findByRole("button", { name: "row-click-model-1" })).toBeInTheDocument();
    expect(screen.getByTestId("content-model-row-selected-model-1")).toHaveTextContent("false");

    fireEvent.click(screen.getByRole("button", { name: "row-click-model-1" }));

    await waitFor(() => {
      expect(screen.getByTestId("content-model-row-selected-model-1")).toHaveTextContent("true");
    });

    fireEvent.click(screen.getByRole("button", { name: "row-double-click-model-1" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/projects/project-1/content/models/edit?modelId=model-1",
      });
    });
  });

  test("maps model table filters and field counts for read-only table queries", () => {
    expect(
      toContentModelsTableQuery({
        category: "custom",
        modelKind: "collection_type",
        systemManaged: "no",
      }),
    ).toEqual({
      category: "custom",
      model_kind: "collection_type",
      system_managed: false,
    });

    expect(
      getContentModelFieldCount(
        buildModel({
          contractRegistry: {
            boundaries: {
              customFields: [
                { key: "title", label: "Title", scalar: "text" },
                { key: "summary", label: "Summary", scalar: "text" },
              ],
              systemFields: [{ key: "id", label: "ID", scalar: "text" }],
            },
          },
        }),
      ),
    ).toBe(3);
  });

  test("maps model purposes to site-builder vocabulary", () => {
    expect(
      getContentModelPurposeLabelKey(
        buildModel({
          singularKey: "page",
          category: "site_builder",
          capabilities: ["routable", "visual_editable"],
          modelKind: "collection_type",
        }),
      ),
    ).toBe("content:CONTENT_MODELS_PURPOSE_PAGE_MODEL");

    expect(
      getContentModelPurposeLabelKey(
        buildModel({
          singularKey: "reusableBlock",
          category: "site_builder",
          defaultRole: "reusable-section",
          defaultPosture: "composition",
          modelKind: "collection_type",
        }),
      ),
    ).toBe("content:CONTENT_MODELS_PURPOSE_REUSABLE_BLOCK");

    expect(
      getContentModelPurposeLabelKey(
        buildModel({
          singularKey: "footer",
          category: "content_library",
          modelKind: "single_type",
        }),
      ),
    ).toBe("content:CONTENT_MODELS_PURPOSE_GLOBAL_DOCUMENT");

    expect(
      getContentModelPurposeLabelKey(
        buildModel({
          singularKey: "customerStory",
          category: "content_library",
          modelKind: "collection_type",
        }),
      ),
    ).toBe("content:CONTENT_MODELS_PURPOSE_CONTENT_COLLECTION");
  });

  test("builds a duplicate payload with localized name and unique identifiers", () => {
    const model = buildModel({
      singularKey: "article",
      pluralKey: "articles",
      fieldSchema: {
        title: {
          label: "Title",
          scalar: "text",
          required: true,
        },
      },
      relationSchema: {
        featuredAsset: {
          relation: "one_way",
          targetModelKey: "asset",
          required: false,
          config: { inverseEditable: false },
        },
        linkedFrom: {
          relation: "morph_one",
          targetModelKey: "category",
          required: false,
          config: { polymorphic: true, sourceDiscriminatorField: "sourceType" },
        },
      },
      viewSchema: {
        views: [
          {
            key: "default",
            label: "Default",
            type: "table",
            config: { columns: ["title"] },
          },
        ],
      },
      routingSchema: {
        mode: "single",
        slug_field: "slug",
      },
      workflowPolicy: {
        states: ["draft", "published"],
        initial_state: "draft",
      },
      presentationSchema: {
        kind: "article",
      },
      starterPackPolicy: {
        preset: "starter",
      },
      surfacePolicy: {
        primary: "structured",
      },
      contractRegistry: {
        deliveryPolicy: {
          seo: {
            metaTitleField: "title",
          },
        },
      },
    });

    const payload = buildDuplicateContentModelPayload({
      model,
      existingModels: [
        model,
        buildModel({
          id: "model-2",
          singularKey: "articleCopy",
          pluralKey: "articlesCopy",
        }),
      ],
      t: (key, options) => {
        if (key === "content:CONTENT_MODELS_DUPLICATE_NAME_SUFFIX") return "Copy";
        if (key === "content:CONTENT_MODELS_DUPLICATE_NAME_FORMAT") {
          return `${options?.name as string} (${options?.suffix as string})`;
        }
        return key;
      },
    });

    expect(payload).toEqual({
      singularKey: "articleCopy2",
      pluralKey: "articlesCopy2",
      name: "Article (Copy)",
      description: "Article model",
      category: "custom",
      modelKind: "collection_type",
      defaultEditor: "form",
      fields: [
        {
          key: "title",
          label: "Title",
          scalar: "text",
          required: true,
        },
      ],
      relations: [
        {
          key: "featuredAsset",
          relation: "one_way",
          targetModelKey: "asset",
          required: false,
          config: { inverseEditable: false },
        },
        {
          key: "linkedFrom",
          relation: "morph_one",
          targetModelKey: "category",
          required: false,
          config: { polymorphic: true, sourceDiscriminatorField: "sourceType" },
        },
      ],
      capabilities: ["queryable"],
      routing: {
        mode: "single",
        slugField: "slug",
      },
      workflow: {
        states: ["draft", "published"],
        initialState: "draft",
      },
      views: [
        {
          key: "default",
          label: "Default",
          type: "table",
          config: { columns: ["title"] },
        },
      ],
      presentation: {
        kind: "article",
      },
      seo: {
        metaTitleField: "title",
      },
      starterPackPolicy: {
        preset: "starter",
      },
      surfacePolicy: {
        primary: "structured",
      },
    });
  });
});
