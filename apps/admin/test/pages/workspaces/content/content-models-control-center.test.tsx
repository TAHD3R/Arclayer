import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContentModelsControlCenterPage } from "@/pages/workspaces/content/models/page";

const listAllContentModelsMock = vi.fn();
const getContentModelImpactPreviewMock = vi.fn();
const patchContentModelMock = vi.fn();

vi.mock("@/api/content", () => ({
  listAllContentModels: (...args: unknown[]) => listAllContentModelsMock(...args),
  getContentModelImpactPreview: (...args: unknown[]) => getContentModelImpactPreviewMock(...args),
  patchContentModel: (...args: unknown[]) => patchContentModelMock(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({
    title,
    description,
    children,
  }: PropsWithChildren<{ title: string; description: string }>) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
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

function buildModel(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "model-1",
    workspaceId: "ws-1",
    siteId: "site-1",
    key: "article",
    name: "Article",
    description: "Article model",
    category: "content_library",
    capabilities: ["publishable", "rich_text_editable"],
    defaultEditor: "rich_text",
    defaultRole: "article",
    defaultPosture: "structured",
    defaultSurface: "structured",
    starterPackPolicy: null,
    surfacePolicy: null,
    ...overrides,
  };
}

describe("ContentModelsControlCenterPage", () => {
  beforeEach(() => {
    listAllContentModelsMock.mockReset();
    getContentModelImpactPreviewMock.mockReset();
    patchContentModelMock.mockReset();
  });

  test("requires a fresh impact preview before save", async () => {
    listAllContentModelsMock.mockResolvedValue([buildModel()]);
    getContentModelImpactPreviewMock
      .mockResolvedValueOnce({
        affectedItemsCount: 2,
        recoveryItemsCount: 0,
        reshapeItemsCount: 2,
        hasBlockingChanges: false,
        previewToken: "preview-1",
        impact: {
          hasBreakingChanges: false,
          breakingChanges: [],
          warnings: [],
        },
      })
      .mockResolvedValueOnce({
        affectedItemsCount: 3,
        recoveryItemsCount: 0,
        reshapeItemsCount: 3,
        hasBlockingChanges: false,
        previewToken: "preview-2",
        impact: {
          hasBreakingChanges: false,
          breakingChanges: [],
          warnings: [],
        },
      });
    patchContentModelMock.mockResolvedValue(
      buildModel({
        defaultPosture: "entry",
        defaultSurface: "writing",
      }),
    );

    render(<ContentModelsControlCenterPage workspaceId="ws-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText("CONTENT_TYPE_ARTICLE_NAME")).toBeInTheDocument();
    });

    const saveButton = screen.getByRole("button", {
      name: "CONTENT_MODELS_SAVE_ACTION",
    });
    const previewButton = screen.getByRole("button", {
      name: "CONTENT_MODELS_PREVIEW_ACTION",
    });
    const surfaceSelect = screen.getByLabelText("CONTENT_MODELS_FIELD_SURFACE");
    const postureSelect = screen.getByLabelText("CONTENT_MODELS_FIELD_POSTURE");

    expect(saveButton).toBeDisabled();

    fireEvent.change(surfaceSelect, { target: { value: "writing" } });
    expect(saveButton).toBeDisabled();

    fireEvent.click(previewButton);
    await waitFor(() => {
      expect(getContentModelImpactPreviewMock).toHaveBeenCalledWith("ws-1", "model-1", {
        defaultSurface: "writing",
      });
    });
    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });

    fireEvent.change(postureSelect, { target: { value: "entry" } });
    expect(saveButton).toBeDisabled();

    fireEvent.click(previewButton);
    await waitFor(() => {
      expect(getContentModelImpactPreviewMock).toHaveBeenLastCalledWith("ws-1", "model-1", {
        defaultPosture: "entry",
        defaultSurface: "writing",
      });
    });
    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });

    fireEvent.click(saveButton);
    await waitFor(() => {
      expect(patchContentModelMock).toHaveBeenCalledWith("ws-1", "model-1", {
        defaultPosture: "entry",
        defaultSurface: "writing",
        impactPreviewToken: "preview-2",
      });
    });
  });

  test("blocks commit when the preview reports recovery impact", async () => {
    listAllContentModelsMock.mockResolvedValue([buildModel()]);
    getContentModelImpactPreviewMock.mockResolvedValue({
      affectedItemsCount: 1,
      recoveryItemsCount: 1,
      reshapeItemsCount: 0,
      hasBlockingChanges: true,
      previewToken: "preview-blocking",
      impact: {
        hasBreakingChanges: false,
        breakingChanges: [],
        warnings: [],
      },
    });

    render(<ContentModelsControlCenterPage workspaceId="ws-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText("CONTENT_TYPE_ARTICLE_NAME")).toBeInTheDocument();
    });

    const surfaceSelect = screen.getByLabelText("CONTENT_MODELS_FIELD_SURFACE");
    const previewButton = screen.getByRole("button", {
      name: "CONTENT_MODELS_PREVIEW_ACTION",
    });
    const saveButton = screen.getByRole("button", {
      name: "CONTENT_MODELS_SAVE_ACTION",
    });

    fireEvent.change(surfaceSelect, { target: { value: "" } });
    fireEvent.click(previewButton);

    await waitFor(() => {
      expect(getContentModelImpactPreviewMock).toHaveBeenCalledWith("ws-1", "model-1", {
        defaultSurface: null,
      });
    });
    expect(screen.getByText("CONTENT_MODELS_PREVIEW_BLOCKING")).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    expect(patchContentModelMock).not.toHaveBeenCalled();
  });

  test("surfaces capabilities and user-facing option labels instead of raw continuation jargon", async () => {
    listAllContentModelsMock.mockResolvedValue([
      buildModel({
        capabilities: ["publishable", "rich_text_editable", "seo_managed"],
        defaultEditor: "rich_text",
      }),
    ]);

    render(<ContentModelsControlCenterPage workspaceId="ws-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText("CONTENT_TYPE_ARTICLE_NAME")).toBeInTheDocument();
    });

    expect(screen.getByText("CONTENT_MODELS_SECTION_CAPABILITIES_TITLE")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_MODELS_CAPABILITY_PUBLISHABLE_LABEL")).toBeInTheDocument();
    expect(
      screen.getByText("CONTENT_MODELS_CAPABILITY_RICH_TEXT_EDITABLE_LABEL"),
    ).toBeInTheDocument();
    expect(screen.getByText("CONTENT_MODELS_CAPABILITY_SEO_MANAGED_LABEL")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_MODELS_EDITOR_RICH_TEXT_LABEL")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "CONTENT_MODELS_SURFACE_WRITING_LABEL" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "CONTENT_MODELS_POSTURE_ENTRY_LABEL" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "writing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "entry" })).not.toBeInTheDocument();
  });
});
