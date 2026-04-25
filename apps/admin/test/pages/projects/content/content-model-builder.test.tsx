import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContentModelsControlCenterPage } from "@/pages/projects/content/models/page";

const listAllContentModelsMock = vi.fn();
const createContentModelMock = vi.fn();
const getContentModelJsonPreviewMock = vi.fn();
const addContentModelFieldMock = vi.fn();
const updateContentModelFieldMock = vi.fn();
const reorderContentModelFieldsMock = vi.fn();
const deleteContentModelFieldMock = vi.fn();
const getMyProjectAuthzMock = vi.fn();
const listProjectPermissionActionsMock = vi.fn();

vi.mock("@/api/content", () => ({
  buildContentModelsQueryKey: (...args: unknown[]) => ["content", "models", ...args],
  listAllContentModels: (...args: unknown[]) => listAllContentModelsMock(...args),
  createContentModel: (...args: unknown[]) => createContentModelMock(...args),
  getContentModelJsonPreview: (...args: unknown[]) => getContentModelJsonPreviewMock(...args),
  addContentModelField: (...args: unknown[]) => addContentModelFieldMock(...args),
  updateContentModelField: (...args: unknown[]) => updateContentModelFieldMock(...args),
  reorderContentModelFields: (...args: unknown[]) => reorderContentModelFieldsMock(...args),
  deleteContentModelField: (...args: unknown[]) => deleteContentModelFieldMock(...args),
}));

vi.mock("@/api/workspaces", () => ({
  getMyProjectAuthz: (...args: unknown[]) => getMyProjectAuthzMock(...args),
}));

vi.mock("@/api/rbac", () => ({
  listProjectPermissionActions: (...args: unknown[]) => listProjectPermissionActionsMock(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({ title, children }: PropsWithChildren<{ title: string }>) => (
    <div>
      <h1>{title}</h1>
      {children}
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
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function buildModel(overrides: Record<string, unknown> = {}) {
  return {
    id: "model-1",
    workspaceId: "workspace-1",
    siteId: "site-1",
    key: "article",
    name: "Article",
    description: "Article model",
    category: "custom",
    modelKind: "collection_type",
    capabilities: ["queryable"],
    defaultEditor: "form",
    fieldSchema: {
      title: {
        key: "title",
        label: "Title",
        scalar: "text",
        required: false,
      },
    },
    draftContractRevision: 1,
    ...overrides,
  };
}

describe("content model builder", () => {
  beforeEach(() => {
    listAllContentModelsMock.mockReset();
    createContentModelMock.mockReset();
    getContentModelJsonPreviewMock.mockReset();
    addContentModelFieldMock.mockReset();
    updateContentModelFieldMock.mockReset();
    reorderContentModelFieldsMock.mockReset();
    deleteContentModelFieldMock.mockReset();
    getMyProjectAuthzMock.mockReset();
    listProjectPermissionActionsMock.mockReset();
    getMyProjectAuthzMock.mockResolvedValue({
      projectId: "project-1",
      permissionCodes: ["system:content:manage"],
      isSuperuser: false,
    });
    listProjectPermissionActionsMock.mockResolvedValue([
      {
        code: "project:content:models:write",
        permissionCodes: ["system:content:manage"],
        subjectKinds: ["project_member"],
        description: "Allow mutating content models via management APIs.",
      },
    ]);
  });

  test("creates models manually and keeps AI generation explicitly unavailable", async () => {
    listAllContentModelsMock.mockResolvedValue([]);
    createContentModelMock.mockResolvedValue(
      buildModel({
        id: "model-2",
        key: "product",
        name: "Product",
        modelKind: "single_type",
      }),
    );

    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "CONTENT_MODELS_CREATE_ACTION" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_CREATE_ACTION" }));
    expect(screen.getByTestId("content-model-create-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "CONTENT_MODELS_CREATE_AI_TAB" }));
    expect(screen.getByText("CONTENT_MODELS_CREATE_AI_UNAVAILABLE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CONTENT_MODELS_CREATE_CONFIRM" })).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "CONTENT_MODELS_CREATE_MANUAL_TAB" }));
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_KEY"), {
      target: { value: "product" },
    });
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_NAME"), {
      target: { value: "Product" },
    });
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_MODEL_KIND"), {
      target: { value: "single_type" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_CREATE_CONFIRM" }));

    await waitFor(() => {
      expect(createContentModelMock).toHaveBeenCalledWith("project-1", {
        key: "product",
        name: "Product",
        description: null,
        modelKind: "single_type",
        fields: [{ key: "title", label: "Title", scalar: "text", required: true }],
        relations: [],
        capabilities: ["queryable"],
        routing: { mode: "none" },
        workflow: { states: ["draft"], initialState: "draft" },
        views: [],
      });
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Product" })).toBeInTheDocument();
    });
  });

  test("runs field lifecycle operations through project model endpoints", async () => {
    listAllContentModelsMock.mockResolvedValue([buildModel()]);
    addContentModelFieldMock.mockResolvedValue(
      buildModel({
        fieldSchema: {
          title: { key: "title", label: "Title", scalar: "text", required: false },
          gallery: {
            key: "gallery",
            label: "Gallery",
            scalar: "json",
            required: false,
            config: {
              kind: "media",
              assetScope: "project",
              assetIdStorage: "internal_project_asset_id",
              repeatable: true,
            },
          },
        },
      }),
    );
    updateContentModelFieldMock.mockResolvedValue(
      buildModel({
        fieldSchema: { title: { key: "title", label: "Title", scalar: "text", required: true } },
      }),
    );
    reorderContentModelFieldsMock.mockResolvedValue(buildModel());
    deleteContentModelFieldMock.mockResolvedValue(buildModel({ fieldSchema: {} }));

    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText("Title")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_KEY"), {
      target: { value: "gallery" },
    });
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_LABEL"), {
      target: { value: "Gallery" },
    });
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_SCALAR"), {
      target: { value: "json" },
    });
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_KIND"), {
      target: { value: "media" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_ADD" }));

    await waitFor(() => {
      expect(addContentModelFieldMock).toHaveBeenCalledWith("project-1", "model-1", {
        key: "gallery",
        label: "Gallery",
        scalar: "json",
        required: false,
        config: {
          kind: "media",
          assetScope: "project",
          assetIdStorage: "internal_project_asset_id",
          repeatable: true,
        },
      });
    });

    fireEvent.click(
      screen.getAllByRole("button", { name: "CONTENT_MODELS_FIELD_MARK_REQUIRED" })[0],
    );
    await waitFor(() => {
      expect(updateContentModelFieldMock).toHaveBeenCalledWith("project-1", "model-1", "title", {
        required: true,
      });
    });

    fireEvent.click(screen.getAllByRole("button", { name: "CONTENT_MODELS_FIELD_MOVE_UP" })[0]);
    await waitFor(() => {
      expect(reorderContentModelFieldsMock).toHaveBeenCalledTimes(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: "CONTENT_MODELS_FIELD_DELETE" })[0]);
    await waitFor(() => {
      expect(deleteContentModelFieldMock).toHaveBeenCalledWith("project-1", "model-1", "title");
    });
  });

  test("loads JSON preview from the current draft schema", async () => {
    listAllContentModelsMock.mockResolvedValue([buildModel()]);
    getContentModelJsonPreviewMock.mockResolvedValue({
      stage: "current_draft",
      revision: 1,
      fieldCount: 1,
      relationCount: 0,
      viewCount: 0,
      payload: { key: "article", model_kind: "collection_type" },
    });

    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "CONTENT_MODELS_TAB_JSON" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "CONTENT_MODELS_TAB_JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_JSON_REFRESH" }));

    await waitFor(() => {
      expect(getContentModelJsonPreviewMock).toHaveBeenCalledWith("project-1", "model-1");
    });
    expect(screen.getByText(/collection_type/)).toBeInTheDocument();
  });
});
