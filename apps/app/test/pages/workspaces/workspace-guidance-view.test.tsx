import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ProjectGuidanceView,
  WorkspaceGuidanceView,
} from "@/pages/workspaces/settings/workspace/knowledge/workspace-guidance-view";
import { makeQueryClient } from "@/lib/query/query-client";

const mocks = vi.hoisted(() => ({
  getLayer: vi.fn(),
  getEffective: vi.fn(),
  listHistory: vi.fn(),
  listBases: vi.fn(),
  saveDraft: vi.fn(),
  publish: vi.fn(),
  createRestorePreview: vi.fn(),
  createRemovePreview: vi.fn(),
  applyRestorePreview: vi.fn(),
  applyRemovePreview: vi.fn(),
  attachReference: vi.fn(),
  detachReference: vi.fn(),
  notify: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
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

vi.mock("@/lib/notifications", () => ({
  notifySuccessText: (...args: unknown[]) => mocks.notify(...args),
  notifyError: (...args: unknown[]) => mocks.notifyError(...args),
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

const savedDraftRevision = {
  ...publishedRevision,
  id: "revision-2",
  revisionNumber: 2,
  status: "draft" as const,
  publishedAt: null,
  publishedByUserId: null,
};

const savedLayer = {
  ...layer,
  metadataRevision: 4,
  draftRevisionId: savedDraftRevision.id,
  currentDraft: savedDraftRevision,
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
  const queryClient = makeQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceGuidanceView workspaceId="workspace-1" />
    </QueryClientProvider>,
  );
}

function renderProjectView() {
  const queryClient = makeQueryClient();
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
    mocks.saveDraft.mockImplementation(async (_scope: unknown, input: { content: string }) => ({
      ...savedLayer,
      currentDraft: { ...savedDraftRevision, content: input.content.trim() },
    }));
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

  it("uses a focused workspace knowledge editor without secondary management surfaces", async () => {
    renderView();

    expect(await screen.findByRole("heading", { name: "EDITOR_TITLE" })).toBeInTheDocument();
    expect(screen.getByLabelText("EDITOR_FIELD_LABEL")).toHaveValue(publishedRevision.content);
    expect(screen.queryByRole("button", { name: "SAVE_DRAFT" })).not.toBeInTheDocument();
    const publishButton = screen.getByRole("button", { name: "PUBLISH_ACTION" });
    expect(publishButton).toBeDisabled();
    expect(publishButton.querySelector("svg")).toBeNull();
    expect(screen.getByText("EDITOR_FAQ_TITLE")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "EDITOR_FAQ_BUSINESS_QUESTION" }));
    expect(await screen.findByText("EDITOR_FAQ_BUSINESS_ANSWER")).toBeInTheDocument();
    expect(screen.queryByText("EFFECTIVE_TITLE")).not.toBeInTheDocument();
    expect(screen.queryByText("HISTORY_TITLE")).not.toBeInTheDocument();
    expect(screen.queryByText("REFERENCES_TITLE")).not.toBeInTheDocument();
    expect(mocks.getEffective).not.toHaveBeenCalled();
    expect(mocks.listHistory).not.toHaveBeenCalled();
    expect(mocks.listBases).not.toHaveBeenCalled();
  });

  it("saves a real immutable draft with the current metadata revision", async () => {
    renderView();
    fireEvent.change(await screen.findByLabelText("EDITOR_FIELD_LABEL"), {
      target: { value: "Keep source claims traceable." },
    });
    expect(screen.getByRole("button", { name: "SAVE_DRAFT" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "SAVE_DRAFT" }));

    await waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalledWith(
        { workspaceId: "workspace-1" },
        { content: "Keep source claims traceable.", expectedRevision: 3 },
        "command-key",
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "SAVE_DRAFT" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "PUBLISH_ACTION" })).toBeEnabled();
  });

  it("keeps operation failures in the global toast instead of rendering an alert", async () => {
    const error = new Error("save failed");
    mocks.saveDraft.mockRejectedValue(error);
    renderView();

    fireEvent.change(await screen.findByLabelText("EDITOR_FIELD_LABEL"), {
      target: { value: "Keep source claims traceable." },
    });
    fireEvent.click(screen.getByRole("button", { name: "SAVE_DRAFT" }));

    await waitFor(() => expect(mocks.notifyError).toHaveBeenCalledWith(error));
    expect(screen.queryByText("OPERATION_FAILED_TITLE")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SAVE_DRAFT" })).toBeInTheDocument();
  });

  it("requires a server-created restoration preview before applying history", async () => {
    mocks.getLayer.mockResolvedValue(projectLayer);
    renderProjectView();
    fireEvent.click(await screen.findByRole("button", { name: "RESTORE_ACTION" }));

    await waitFor(() => {
      expect(mocks.createRestorePreview).toHaveBeenCalledWith(
        { workspaceId: "workspace-1", projectId: "project-1" },
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
        { workspaceId: "workspace-1", projectId: "project-1" },
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
    expect(screen.getByText("EFFECTIVE_CURRENT_PROJECT")).toBeInTheDocument();

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
  });
});
