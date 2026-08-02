import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ProjectGuidanceView,
  WorkspaceGuidanceView,
} from "@/pages/workspaces/settings/workspace/knowledge/workspace-guidance-view";

const mocks = vi.hoisted(() => ({
  getLayer: vi.fn(),
  getEffective: vi.fn(),
  listHistory: vi.fn(),
  listBases: vi.fn(),
  listProjects: vi.fn(),
  saveDraft: vi.fn(),
  publish: vi.fn(),
  createRestorePreview: vi.fn(),
  createRemovePreview: vi.fn(),
  applyRestorePreview: vi.fn(),
  applyRemovePreview: vi.fn(),
  attachReference: vi.fn(),
  detachReference: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values?.revision ? `${key}:${values.revision}` : key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

vi.mock("@/api/workspace-guidance", () => ({
  WORKSPACE_GUIDANCE_QUERY_KEY: ["workspace", "guidance"],
  getGuidanceLayer: (...args: unknown[]) => mocks.getLayer(...args),
  getEffectiveGuidance: (...args: unknown[]) => mocks.getEffective(...args),
  listGuidanceHistory: (...args: unknown[]) => mocks.listHistory(...args),
  saveGuidanceDraft: (...args: unknown[]) => mocks.saveDraft(...args),
  publishGuidance: (...args: unknown[]) => mocks.publish(...args),
  createGuidanceRestorePreview: (...args: unknown[]) => mocks.createRestorePreview(...args),
  createGuidanceRemovePreview: (...args: unknown[]) => mocks.createRemovePreview(...args),
  applyGuidanceRestorePreview: (...args: unknown[]) => mocks.applyRestorePreview(...args),
  applyGuidanceRemovePreview: (...args: unknown[]) => mocks.applyRemovePreview(...args),
  attachGuidanceReference: (...args: unknown[]) => mocks.attachReference(...args),
  detachGuidanceReference: (...args: unknown[]) => mocks.detachReference(...args),
}));

vi.mock("@/api/workspace-knowledge", () => ({
  WORKSPACE_KNOWLEDGE_QUERY_KEY: ["workspace", "knowledge"],
  listKnowledgeBases: (...args: unknown[]) => mocks.listBases(...args),
}));

vi.mock("@/api/projects", () => ({
  listProjects: (...args: unknown[]) => mocks.listProjects(...args),
}));

vi.mock("@/stores/use-workspace-store", () => ({
  useWorkspaceStore: (selector: (state: { currentProjectId: string | null }) => unknown) =>
    selector({ currentProjectId: null }),
}));

vi.mock("@/lib/notifications", () => ({
  notifySuccessText: (...args: unknown[]) => mocks.notify(...args),
}));

const publishedRevision = {
  id: "revision-1",
  guidanceLayerId: "guidance-1",
  workspaceId: "workspace-1",
  revisionNumber: 1,
  content: "Use direct, factual product language.",
  contentHash: `sha256:${"a".repeat(64)}`,
  status: "published" as const,
  restoredFromRevisionId: null,
  publishedAt: "2026-08-01T00:00:00Z",
  publishedByUserId: "user-1",
  createdByUserId: "user-1",
  createdAt: "2026-08-01T00:00:00Z",
};

const layer = {
  id: "guidance-1",
  workspaceId: "workspace-1",
  scope: "workspace" as const,
  projectId: null,
  projectMode: null,
  metadataRevision: 3,
  draftRevisionId: null,
  publishedRevisionId: "revision-1",
  removedAt: null,
  removedByUserId: null,
  currentDraft: null,
  currentPublished: publishedRevision,
  references: [],
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
};

const projectLayer = {
  ...layer,
  id: "project-guidance-1",
  scope: "project" as const,
  projectId: "project-1",
  projectMode: "supplement" as const,
};

const restorePreview = {
  id: "restore-preview-1",
  kind: "restore" as const,
  guidanceLayerId: "guidance-1",
  expectedGuidanceRevision: 3,
  previewRevision: 1,
  sourceRevisionId: "revision-1",
  canApply: true,
  impact: {
    referenceCount: 0,
    sourceCount: 0,
    readySourceCount: 0,
    projectGuidanceCount: 0,
  },
  createdAt: "2026-08-01T00:00:00Z",
};

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceGuidanceView workspaceId="workspace-1" />
    </QueryClientProvider>,
  );
}

function renderProjectView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectGuidanceView workspaceId="workspace-1" projectId="project-1" />
    </QueryClientProvider>,
  );
}

describe("WorkspaceGuidanceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: () => "command-key" });
    mocks.getLayer.mockResolvedValue(layer);
    mocks.getEffective.mockResolvedValue({
      workspace: layer,
      project: null,
      precedence: ["workspace"],
      effectiveContent: publishedRevision.content,
      conflicts: [],
      unavailable: [],
    });
    mocks.listHistory.mockResolvedValue({ items: [publishedRevision], nextCursor: null });
    mocks.listBases.mockResolvedValue({ items: [], nextCursor: null });
    mocks.listProjects.mockResolvedValue({ items: [] });
    mocks.saveDraft.mockResolvedValue(layer);
    mocks.publish.mockResolvedValue(layer);
    mocks.createRestorePreview.mockResolvedValue(restorePreview);
    mocks.createRemovePreview.mockResolvedValue({
      ...restorePreview,
      id: "remove-preview-1",
      kind: "remove",
    });
    mocks.applyRestorePreview.mockResolvedValue(layer);
    mocks.applyRemovePreview.mockResolvedValue(layer);
    mocks.attachReference.mockResolvedValue(layer);
    mocks.detachReference.mockResolvedValue(layer);
  });

  it("uses shared guidance as the primary surface instead of a Knowledge Base container", async () => {
    renderView();

    expect(await screen.findByRole("heading", { name: "EDITOR_TITLE" })).toBeInTheDocument();
    expect(screen.getByLabelText("EDITOR_FIELD_LABEL")).toHaveValue(publishedRevision.content);
    expect(await screen.findByText("EFFECTIVE_PRECEDENCE_LABEL")).toBeInTheDocument();
    expect(screen.getByText("HISTORY_TITLE")).toBeInTheDocument();
    expect(
      screen.queryByText("SETTINGS_WORKSPACE_KNOWLEDGE_CREATE_ACTION"),
    ).not.toBeInTheDocument();
  });

  it("saves a real immutable draft with the current metadata revision", async () => {
    renderView();
    fireEvent.change(await screen.findByLabelText("EDITOR_FIELD_LABEL"), {
      target: { value: "Keep source claims traceable." },
    });
    fireEvent.click(screen.getByRole("button", { name: "SAVE_DRAFT" }));

    await waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalledWith(
        { workspaceId: "workspace-1" },
        { content: "Keep source claims traceable.", expectedRevision: 3 },
        "command-key",
      );
    });
  });

  it("requires a server-created restoration preview before applying history", async () => {
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "RESTORE_ACTION" }));

    await waitFor(() => {
      expect(mocks.createRestorePreview).toHaveBeenCalledWith(
        { workspaceId: "workspace-1" },
        { expectedRevision: 3, sourceRevisionId: "revision-1" },
        "command-key",
      );
    });
    expect(
      await screen.findByRole("heading", { name: "RESTORE_PREVIEW_TITLE" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "RESTORE_APPLY" }));
    await waitFor(() => {
      expect(mocks.applyRestorePreview).toHaveBeenCalledWith(
        { workspaceId: "workspace-1" },
        "restore-preview-1",
        { expectedGuidanceRevision: 3, expectedPreviewRevision: 1 },
        "command-key",
      );
    });
  });

  it("edits project guidance in its own scope with an explicit precedence mode", async () => {
    mocks.getLayer.mockResolvedValue(projectLayer);
    mocks.getEffective.mockResolvedValue({
      workspace: layer,
      project: projectLayer,
      precedence: ["workspace", "project"],
      effectiveContent: publishedRevision.content,
      conflicts: [],
      unavailable: [],
    });
    renderProjectView();

    expect(
      await screen.findByRole("heading", { name: "PROJECT_EDITOR_TITLE" }),
    ).toBeInTheDocument();
    expect(screen.getByText("PROJECT_MODE_LABEL")).toBeInTheDocument();
    expect(screen.queryByLabelText("EFFECTIVE_PROJECT_LABEL")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("PROJECT_MODE_LABEL"));
    fireEvent.click(await screen.findByRole("option", { name: "PROJECT_MODE_OVERRIDE" }));

    fireEvent.click(screen.getByRole("button", { name: "SAVE_DRAFT" }));

    await waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalledWith(
        { workspaceId: "workspace-1", projectId: "project-1" },
        {
          content: publishedRevision.content,
          expectedRevision: 3,
          projectMode: "override",
        },
        "command-key",
      );
    });
    expect(mocks.listProjects).not.toHaveBeenCalled();
  });
});
