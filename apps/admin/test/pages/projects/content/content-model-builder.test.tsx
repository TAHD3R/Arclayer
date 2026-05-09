import type { MouseEvent as ReactMouseEvent, PropsWithChildren } from "react";
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContentModelsControlCenterPage } from "@/pages/projects/content/models/page";
import { ContentModelEditPage } from "@/pages/projects/content/models/edit-page";
import {
  buildDuplicateContentModelPayload,
  getContentModelFieldCount,
  toContentModelsTableQuery,
} from "@/pages/projects/content/models/utils";
import type { AdminContentModel } from "@arclayer/openapi/admin-types";
import { TooltipProvider } from "@arclayer/ui/tooltip";

const createContentModelMock = vi.fn();
const deleteContentModelMock = vi.fn();
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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    );
  };
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
  if (!input) throw new Error(`Missing create content type input: ${label}`);
  return input;
}

describe("content model builder", () => {
  beforeEach(() => {
    createContentModelMock.mockReset();
    deleteContentModelMock.mockReset();
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

  test("creates from the edit route dialog and stays on the new model editor", async () => {
    createContentModelMock.mockResolvedValue(
      buildModel({
        id: "model-2",
        singularKey: "blogPost",
        pluralKey: "blogPosts",
        name: "Blog Post",
      }),
    );

    render(<ContentModelEditPage projectId="project-1" createOpen />, {
      wrapper: createWrapper(),
    });

    fireEvent.change(await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_LABEL"), {
      target: { value: "Blog Post" },
    });

    expect(await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_SINGULAR_LABEL")).toHaveValue(
      "blogPost",
    );
    expect(await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_PLURAL_LABEL")).toHaveValue(
      "blogPosts",
    );

    fireEvent.change(
      await findCreateInput("CONTENT_MODELS_CREATE_CONTENT_TYPE_DESCRIPTION_LABEL"),
      {
        target: { value: "Editorial entries." },
      },
    );

    fireEvent.click(
      screen.getByRole("button", { name: "CONTENT_MODELS_CREATE_CONTENT_TYPE_SUBMIT" }),
    );

    await waitFor(() => {
      expect(createContentModelMock).toHaveBeenCalledWith("project-1", {
        name: "Blog Post",
        singularKey: "blogPost",
        pluralKey: "blogPosts",
        description: "Editorial entries.",
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
  });

  test("create flow renders localized fallback title and skips model list query", () => {
    render(<ContentModelEditPage projectId="project-1" createOpen />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("未命名内容模型")).toBeInTheDocument();
    expect(listAllContentModelsMock).not.toHaveBeenCalled();
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

  test("disables create entry points when project content model write access is missing", () => {
    permissionAccessMock.hasAction.mockReturnValue(false);

    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    expect(
      screen.getByRole("button", { name: "CONTENT_MODELS_CREATE_CONTENT_TYPE_ACTION" }),
    ).toBeDisabled();
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
