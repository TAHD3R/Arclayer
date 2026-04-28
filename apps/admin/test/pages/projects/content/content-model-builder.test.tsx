import type { PropsWithChildren } from "react";
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContentModelsControlCenterPage } from "@/pages/projects/content/models/page";
import {
  getContentModelFieldCount,
  toContentModelsTableQuery,
} from "@/pages/projects/content/models/utils";
import type { AdminContentModel } from "@/types/api";

const createContentModelMock = vi.fn();
const listContentModelsMock = vi.fn();

vi.mock("@/api/content", () => ({
  buildContentModelsQueryKey: (...args: unknown[]) => ["content", "models", ...args],
  createContentModel: (...args: unknown[]) => createContentModelMock(...args),
  listContentModels: (...args: unknown[]) => listContentModelsMock(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
}));

vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({
    formatDateTime: (value: string | null | undefined) => value ?? "",
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
  AdminDataTableSection: ({ toolbar }: PropsWithChildren<{ toolbar?: React.ReactNode }>) => (
    <div>{toolbar}</div>
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

describe("content model builder", () => {
  beforeEach(() => {
    createContentModelMock.mockReset();
    listContentModelsMock.mockReset();
    listContentModelsMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      size: 50,
      pages: 0,
      next: null,
      prev: null,
    });
  });

  test("opens create content type dialog and creates with dual identifiers", async () => {
    createContentModelMock.mockResolvedValue(
      buildModel({
        id: "model-2",
        singularKey: "article",
        pluralKey: "articles",
        name: "Article",
      }),
    );

    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByRole("button", { name: "favorite" })).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "CONTENT_MODELS_CREATE_CONTENT_TYPE_ACTION" }),
    );

    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_LABEL"), {
      target: { value: "Article" },
    });

    expect(screen.getByLabelText("CONTENT_MODELS_CREATE_CONTENT_TYPE_SINGULAR_LABEL")).toHaveValue(
      "article",
    );
    expect(screen.getByLabelText("CONTENT_MODELS_CREATE_CONTENT_TYPE_PLURAL_LABEL")).toHaveValue(
      "articles",
    );

    fireEvent.change(
      screen.getByPlaceholderText("CONTENT_MODELS_CREATE_CONTENT_TYPE_DESCRIPTION_PLACEHOLDER"),
      {
        target: { value: "Editorial entries." },
      },
    );

    fireEvent.click(
      screen.getByRole("button", { name: "CONTENT_MODELS_CREATE_CONTENT_TYPE_SUBMIT" }),
    );

    await waitFor(() => {
      expect(createContentModelMock).toHaveBeenCalledWith("project-1", {
        name: "Article",
        singularKey: "article",
        pluralKey: "articles",
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
  });

  test("keeps manually edited identifiers stable when name changes", async () => {
    createContentModelMock.mockResolvedValue(buildModel());

    render(<ContentModelsControlCenterPage projectId="project-1" />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(
      screen.getByRole("button", { name: "CONTENT_MODELS_CREATE_CONTENT_TYPE_ACTION" }),
    );
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_LABEL"), {
      target: { value: "News item" },
    });
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_CREATE_CONTENT_TYPE_SINGULAR_LABEL"), {
      target: { value: "story" },
    });
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_LABEL"), {
      target: { value: "Press release" },
    });

    expect(screen.getByLabelText("CONTENT_MODELS_CREATE_CONTENT_TYPE_SINGULAR_LABEL")).toHaveValue(
      "story",
    );
    expect(screen.getByLabelText("CONTENT_MODELS_CREATE_CONTENT_TYPE_PLURAL_LABEL")).toHaveValue(
      "press-releases",
    );
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
});
