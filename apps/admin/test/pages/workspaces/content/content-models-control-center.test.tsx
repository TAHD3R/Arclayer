import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
        required: true,
      },
    },
    draftContractRevision: 1,
    ...overrides,
  };
}

describe("ContentModelsControlCenterPage", () => {
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

  test("renders one builder list for collection types, single types, and components", async () => {
    listAllContentModelsMock.mockResolvedValue([
      buildModel(),
      buildModel({
        id: "model-2",
        key: "homepage",
        name: "Homepage",
        modelKind: "single_type",
      }),
      buildModel({
        id: "model-3",
        key: "seo_card",
        name: "SEO Card",
        modelKind: "component",
        fieldSchema: {},
      }),
    ]);

    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("content-model-builder-surface")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("content-models-governance-surface")).toBeNull();
    expect(screen.getByRole("button", { name: "CONTENT_TYPE_ARTICLE_NAME" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Homepage" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SEO Card" })).toBeInTheDocument();
    expect(screen.getAllByText("CONTENT_MODELS_KIND_COLLECTION_TYPE").length).toBeGreaterThan(0);
    expect(screen.getByText("CONTENT_MODELS_KIND_SINGLE_TYPE")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_MODELS_KIND_COMPONENT")).toBeInTheDocument();
  });

  test("component models expose the component builder tab set", async () => {
    listAllContentModelsMock.mockResolvedValue([
      buildModel({
        key: "seo_card",
        name: "SEO Card",
        modelKind: "component",
        fieldSchema: {},
      }),
    ]);

    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "CONTENT_MODELS_TAB_FIELDS" })).toBeInTheDocument();
    });

    expect(screen.getByRole("tab", { name: "CONTENT_MODELS_TAB_DETAILS" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "CONTENT_MODELS_TAB_JSON" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "CONTENT_MODELS_TAB_SIDEBAR" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "CONTENT_MODELS_TAB_EDITORS" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "CONTENT_MODELS_TAB_TAXONOMY" })).toBeNull();
  });

  test("disables builder mutations when project action access is missing", async () => {
    getMyProjectAuthzMock.mockResolvedValue({
      projectId: "project-1",
      permissionCodes: ["system:content:read"],
      isSuperuser: false,
    });
    listAllContentModelsMock.mockResolvedValue([buildModel()]);

    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText("CONTENT_MODELS_NO_ACCESS_DESC")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "CONTENT_MODELS_CREATE_ACTION" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_ADD" })).toBeDisabled();
    expect(addContentModelFieldMock).not.toHaveBeenCalled();
  });
});
