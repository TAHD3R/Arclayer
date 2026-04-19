import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContentModelsControlCenterPage } from "@/pages/workspaces/content/models/page";

const listAllContentModelsMock = vi.fn();
const getContentModelImpactPreviewMock = vi.fn();
const patchContentModelMock = vi.fn();
const getMyWorkspaceAuthzMock = vi.fn();
const listWorkspacePermissionActionsMock = vi.fn();

vi.mock("@/api/content", () => ({
  buildContentModelsGovernanceQueryKey: (...args: unknown[]) => [
    "content",
    "models",
    "governance",
    ...args,
  ],
  listAllContentModels: (...args: unknown[]) => listAllContentModelsMock(...args),
  getContentModelImpactPreview: (...args: unknown[]) => getContentModelImpactPreviewMock(...args),
  patchContentModel: (...args: unknown[]) => patchContentModelMock(...args),
}));

vi.mock("@/api/workspaces", () => ({
  getMyWorkspaceAuthz: (...args: unknown[]) => getMyWorkspaceAuthzMock(...args),
}));

vi.mock("@/api/rbac", () => ({
  listWorkspacePermissionActions: (...args: unknown[]) =>
    listWorkspacePermissionActionsMock(...args),
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
    contractRegistry: {
      protocolKey: "article",
      protocolVersion: 1,
      category: "content_library",
      systemManaged: true,
      boundaries: {
        systemFields: [
          {
            key: "title",
            label: "Title",
            scalar: "text",
            required: true,
            config: null,
          },
        ],
        customFields: [
          {
            key: "hero_theme",
            label: "Hero theme",
            scalar: "text",
            required: false,
            config: null,
          },
        ],
        lockedFieldKeys: ["title", "slug", "summary", "content", "published_at"],
        customFieldCount: 1,
      },
      capabilities: {
        workflow: ["versioned", "publishable"],
        delivery: ["publishable", "seo_managed"],
        graphql: ["has_relations"],
      },
      workflowPolicy: {
        states: ["draft", "published"],
        initialState: "draft",
      },
      deliveryPolicy: {
        routing: { mode: "none" },
        presentation: { allowedKinds: ["form_data", "rich_text_document", "seo"] },
        seo: { titleField: "title", descriptionField: "summary" },
        surface: { allowedSurfaces: ["writing", "structured"] },
      },
      graphqlPolicy: {
        enabled: false,
        relationSchema: {},
        viewSchema: {},
      },
    },
    ...overrides,
  };
}

function buildPreview(overrides: Partial<Record<string, unknown>> = {}) {
  return {
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
    changePlan: {
      revisions: {
        currentDraftRevision: 1,
        publishedRevision: 1,
        nextDraftRevision: 2,
      },
      currentSnapshot: {
        stage: "current_draft",
        revision: 1,
        fieldCount: 5,
        relationCount: 0,
        viewCount: 0,
        payload: { key: "article" },
      },
      nextSnapshot: {
        stage: "next_draft",
        revision: 2,
        fieldCount: 6,
        relationCount: 0,
        viewCount: 0,
        payload: { key: "article" },
      },
      publishedSnapshot: {
        stage: "published",
        revision: 1,
        fieldCount: 5,
        relationCount: 0,
        viewCount: 0,
        payload: { key: "article" },
      },
      diff: {
        hasChanges: true,
        hasBreakingChanges: false,
        breakingChangeCount: 0,
        entries: [
          {
            kind: "default",
            operation: "changed",
            target: "defaults.default_surface",
            summary: "Default surface will change for newly created entries.",
            breaking: false,
            before: "structured",
            after: "writing",
          },
        ],
      },
      applyGates: [
        {
          code: "impact_scope",
          status: "review",
          title: "Impact scope",
          detail: "2 items will need lifecycle review.",
        },
        {
          code: "continuation_recovery",
          status: "ready",
          title: "Continuation recovery",
          detail: "2 items stay ready and require reshape.",
        },
      ],
      applyReady: true,
    },
    ...overrides,
  };
}

describe("ContentModelsControlCenterPage", () => {
  beforeEach(() => {
    listAllContentModelsMock.mockReset();
    getContentModelImpactPreviewMock.mockReset();
    patchContentModelMock.mockReset();
    getMyWorkspaceAuthzMock.mockReset();
    listWorkspacePermissionActionsMock.mockReset();
    getMyWorkspaceAuthzMock.mockResolvedValue({
      userId: "user-1",
      roleCodes: ["admin"],
      permissionCodes: ["system:content:manage"],
      isSuperuser: false,
    });
    listWorkspacePermissionActionsMock.mockResolvedValue([
      {
        code: "content:models:write",
        permissionCodes: ["system:content:manage"],
        subjectKinds: ["workspace_member"],
        description: "Allow mutating content models via management APIs.",
      },
    ]);
  });

  test("requires a fresh impact preview before save", async () => {
    listAllContentModelsMock.mockResolvedValue([buildModel()]);
    getContentModelImpactPreviewMock.mockResolvedValueOnce(buildPreview()).mockResolvedValueOnce(
      buildPreview({
        affectedItemsCount: 3,
        reshapeItemsCount: 3,
        previewToken: "preview-2",
        changePlan: {
          revisions: {
            currentDraftRevision: 1,
            publishedRevision: 1,
            nextDraftRevision: 2,
          },
          currentSnapshot: {
            stage: "current_draft",
            revision: 1,
            fieldCount: 5,
            relationCount: 0,
            viewCount: 0,
            payload: { key: "article" },
          },
          nextSnapshot: {
            stage: "next_draft",
            revision: 2,
            fieldCount: 5,
            relationCount: 0,
            viewCount: 0,
            payload: { key: "article" },
          },
          publishedSnapshot: {
            stage: "published",
            revision: 1,
            fieldCount: 5,
            relationCount: 0,
            viewCount: 0,
            payload: { key: "article" },
          },
          diff: {
            hasChanges: true,
            hasBreakingChanges: false,
            breakingChangeCount: 0,
            entries: [
              {
                kind: "default",
                operation: "changed",
                target: "defaults.default_posture",
                summary: "Default posture will change for newly created entries.",
                breaking: false,
                before: "structured",
                after: "entry",
              },
              {
                kind: "default",
                operation: "changed",
                target: "defaults.default_surface",
                summary: "Default surface will change for newly created entries.",
                breaking: false,
                before: "structured",
                after: "writing",
              },
            ],
          },
          applyGates: [
            {
              code: "impact_scope",
              status: "review",
              title: "Impact scope",
              detail: "3 items will need lifecycle review.",
            },
          ],
          applyReady: true,
        },
      }),
    );
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
      expect(screen.getAllByText("CONTENT_TYPE_ARTICLE_NAME").length).toBeGreaterThan(0);
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
      expect(screen.getByText("CONTENT_MODELS_APPLY_CONFIRM_TITLE")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_APPLY_CONFIRM_OK" }));

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
    getContentModelImpactPreviewMock.mockResolvedValue(
      buildPreview({
        affectedItemsCount: 1,
        recoveryItemsCount: 1,
        reshapeItemsCount: 0,
        hasBlockingChanges: true,
        previewToken: "preview-blocking",
        changePlan: {
          revisions: {
            currentDraftRevision: 1,
            publishedRevision: 1,
            nextDraftRevision: 2,
          },
          currentSnapshot: {
            stage: "current_draft",
            revision: 1,
            fieldCount: 5,
            relationCount: 0,
            viewCount: 0,
            payload: { key: "article" },
          },
          nextSnapshot: {
            stage: "next_draft",
            revision: 2,
            fieldCount: 5,
            relationCount: 0,
            viewCount: 0,
            payload: { key: "article" },
          },
          publishedSnapshot: {
            stage: "published",
            revision: 1,
            fieldCount: 5,
            relationCount: 0,
            viewCount: 0,
            payload: { key: "article" },
          },
          diff: {
            hasChanges: true,
            hasBreakingChanges: false,
            breakingChangeCount: 0,
            entries: [
              {
                kind: "default",
                operation: "removed",
                target: "defaults.default_surface",
                summary: "Default surface will change for newly created entries.",
                breaking: false,
                before: "structured",
                after: null,
              },
            ],
          },
          applyGates: [
            {
              code: "continuation_recovery",
              status: "blocked",
              title: "Continuation recovery",
              detail: "1 items would move into recovery and block apply.",
            },
          ],
          applyReady: false,
        },
      }),
    );

    render(<ContentModelsControlCenterPage workspaceId="ws-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getAllByText("CONTENT_TYPE_ARTICLE_NAME").length).toBeGreaterThan(0);
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
    expect(screen.getByText("CONTENT_MODELS_CHANGE_PLAN_GATE_TITLE")).toBeInTheDocument();
    expect(screen.getByText("Continuation recovery")).toBeInTheDocument();
  });

  test("renders schema change plan revisions and diff entries inside the inspector", async () => {
    listAllContentModelsMock.mockResolvedValue([buildModel()]);
    getContentModelImpactPreviewMock.mockResolvedValue(buildPreview());

    render(<ContentModelsControlCenterPage workspaceId="ws-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getAllByText("CONTENT_TYPE_ARTICLE_NAME").length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_SURFACE"), {
      target: { value: "writing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_PREVIEW_ACTION" }));

    await waitFor(() => {
      expect(screen.getByText("CONTENT_MODELS_CHANGE_PLAN_REVISION_TITLE")).toBeInTheDocument();
    });

    expect(screen.getByText("CONTENT_MODELS_CHANGE_PLAN_DIFF_TITLE")).toBeInTheDocument();
    expect(
      screen.getByText("Default surface will change for newly created entries."),
    ).toBeInTheDocument();
    expect(screen.getByText("defaults.default_surface")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_MODELS_CHANGE_PLAN_CURRENT_REVISION")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_MODELS_CHANGE_PLAN_NEXT_REVISION")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_MODELS_CHANGE_PLAN_COMPARE_CURRENT" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_MODELS_CHANGE_PLAN_COMPARE_PUBLISHED" }),
    ).toBeInTheDocument();
  });

  test("shows stale preview warning after the draft changes again", async () => {
    listAllContentModelsMock.mockResolvedValue([buildModel()]);
    getContentModelImpactPreviewMock.mockResolvedValue(buildPreview());

    render(<ContentModelsControlCenterPage workspaceId="ws-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getAllByText("CONTENT_TYPE_ARTICLE_NAME").length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_SURFACE"), {
      target: { value: "writing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_PREVIEW_ACTION" }));

    await waitFor(() => {
      expect(screen.getByText("CONTENT_MODELS_CHANGE_PLAN_REVISION_TITLE")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_POSTURE"), {
      target: { value: "entry" },
    });

    expect(screen.getByText("CONTENT_MODELS_PREVIEW_STALE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CONTENT_MODELS_SAVE_ACTION" })).toBeDisabled();
  });

  test("guards protocol switching while unsaved changes exist and allows discard", async () => {
    listAllContentModelsMock.mockResolvedValue([
      buildModel(),
      buildModel({ id: "model-2", key: "page", name: "Page" }),
    ]);

    render(<ContentModelsControlCenterPage workspaceId="ws-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getAllByText("CONTENT_TYPE_ARTICLE_NAME").length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_SURFACE"), {
      target: { value: "writing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTENT_TYPE_PAGE_NAME" }));

    expect(screen.getByText("CONTENT_MODELS_UNSAVED_CHANGES")).toBeInTheDocument();
    expect(screen.getAllByText("CONTENT_TYPE_ARTICLE_NAME").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_DISCARD_ACTION" }));

    await waitFor(() => {
      expect(screen.getAllByText("CONTENT_TYPE_PAGE_NAME").length).toBeGreaterThan(0);
    });
  });

  test("opens apply confirmation before saving the next draft revision", async () => {
    listAllContentModelsMock.mockResolvedValue([buildModel()]);
    getContentModelImpactPreviewMock.mockResolvedValue(buildPreview());
    patchContentModelMock.mockResolvedValue(
      buildModel({
        defaultSurface: "writing",
      }),
    );

    render(<ContentModelsControlCenterPage workspaceId="ws-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getAllByText("CONTENT_TYPE_ARTICLE_NAME").length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_SURFACE"), {
      target: { value: "writing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_PREVIEW_ACTION" }));

    await waitFor(() => {
      expect(screen.getByText("CONTENT_MODELS_CHANGE_PLAN_REVISION_TITLE")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_SAVE_ACTION" }));

    expect(screen.getByText("CONTENT_MODELS_APPLY_CONFIRM_TITLE")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_MODELS_APPLY_CONFIRM_DESC")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_APPLY_CONFIRM_OK" }));

    await waitFor(() => {
      expect(patchContentModelMock).toHaveBeenCalledWith("ws-1", "model-1", {
        defaultSurface: "writing",
        impactPreviewToken: "preview-1",
      });
    });
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
      expect(screen.getAllByText("CONTENT_TYPE_ARTICLE_NAME").length).toBeGreaterThan(0);
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

  test("renders governance sections for system boundary, custom boundary, workflow, delivery, and graphql", async () => {
    listAllContentModelsMock.mockResolvedValue([buildModel()]);

    render(<ContentModelsControlCenterPage workspaceId="ws-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getAllByText("CONTENT_TYPE_ARTICLE_NAME").length).toBeGreaterThan(0);
    });

    expect(screen.getByText("CONTENT_MODELS_GOVERNANCE_SYSTEM_TITLE")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_MODELS_GOVERNANCE_CUSTOM_TITLE")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_MODELS_GOVERNANCE_WORKFLOW_TITLE")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_MODELS_GOVERNANCE_DELIVERY_TITLE")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_MODELS_GOVERNANCE_GRAPHQL_TITLE")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_MODELS_FIELD_BOUNDARY_SYSTEM")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_MODELS_FIELD_BOUNDARY_CUSTOM")).toBeInTheDocument();
    expect(screen.getByText("hero_theme")).toBeInTheDocument();
  });

  test("disables model default editing when workspace action access is missing", async () => {
    getMyWorkspaceAuthzMock.mockResolvedValue({
      userId: "user-1",
      roleCodes: ["viewer"],
      permissionCodes: ["system:content:read"],
      isSuperuser: false,
    });
    listAllContentModelsMock.mockResolvedValue([buildModel()]);

    render(<ContentModelsControlCenterPage workspaceId="ws-1" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getAllByText("CONTENT_TYPE_ARTICLE_NAME").length).toBeGreaterThan(0);
    });

    expect(screen.getByText("CONTENT_MODELS_NO_ACCESS_DESC")).toBeInTheDocument();
    expect(screen.getByLabelText("CONTENT_MODELS_FIELD_SURFACE")).toBeDisabled();
    expect(screen.getByRole("button", { name: "CONTENT_MODELS_PREVIEW_ACTION" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "CONTENT_MODELS_SAVE_ACTION" })).toBeDisabled();
    expect(getContentModelImpactPreviewMock).not.toHaveBeenCalled();
    expect(patchContentModelMock).not.toHaveBeenCalled();
  });
});
