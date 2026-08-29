import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ProjectGuidanceView,
  WorkspaceGuidanceView,
} from "@/pages/workspaces/settings/workspace/knowledge/workspace-guidance-view";
import { makeQueryClient } from "@/lib/query/query-client";

const mocks = vi.hoisted(() => ({
  getLayer: vi.fn(),
  getEffective: vi.fn(),
  listBases: vi.fn(),
  saveDraft: vi.fn(),
  publish: vi.fn(),
  createRemovePreview: vi.fn(),
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

vi.mock("@/components/editor/markdown-plate-editor", () => ({
  MarkdownPlateEditor: (props: {
    ariaLabel: string;
    disabled?: boolean;
    onChange: (value: string) => void;
    placeholder: string;
    value: string;
  }) => (
    <textarea
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      placeholder={props.placeholder}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  ),
}));

vi.mock("@/api/workspace-guidance", () => ({
  WORKSPACE_GUIDANCE_QUERY_KEY: ["workspace", "guidance"],
  getGuidanceLayer: (...args: unknown[]) => mocks.getLayer(...args),
  getEffectiveGuidance: (...args: unknown[]) => mocks.getEffective(...args),
  saveGuidanceDraft: (...args: unknown[]) => mocks.saveDraft(...args),
  publishGuidance: (...args: unknown[]) => mocks.publish(...args),
  createGuidanceRemovePreview: (...args: unknown[]) => mocks.createRemovePreview(...args),
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

const projectLayer = {
  ...layer,
  id: "project-guidance-1",
  scope: "project" as const,
  projectId: "project-1",
  projectMode: "supplement" as const,
  currentPublished: { ...publishedRevision, id: "project-revision-current" },
};

const removePreview = {
  id: "remove-preview-1",
  kind: "remove" as const,
  guidanceLayerId: "guidance-1",
  expectedGuidanceRevision: 3,
  previewRevision: 1,
  sourceRevisionId: null,
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
    mocks.listBases.mockResolvedValue({ items: [], nextCursor: null });
    mocks.saveDraft.mockImplementation(async (_scope: unknown, input: { content: string }) => ({
      ...layer,
      metadataRevision: 4,
      draftRevisionId: savedDraftRevision.id,
      currentDraft: { ...savedDraftRevision, content: input.content },
    }));
    mocks.publish.mockImplementation(async () => ({
      ...layer,
      metadataRevision: 5,
      draftRevisionId: null,
      publishedRevisionId: savedDraftRevision.id,
      currentDraft: null,
      currentPublished: { ...savedDraftRevision, status: "published" as const },
    }));
    mocks.createRemovePreview.mockResolvedValue(removePreview);
    mocks.applyRemovePreview.mockResolvedValue(layer);
    mocks.attachReference.mockResolvedValue(layer);
    mocks.detachReference.mockResolvedValue(layer);
  });

  it("uses a focused workspace knowledge editor without history or draft surfaces", async () => {
    renderView();

    expect(await screen.findByRole("heading", { name: "EDITOR_TITLE" })).toBeInTheDocument();
    expect(screen.getByLabelText("EDITOR_FIELD_LABEL")).toHaveValue(publishedRevision.content);
    const saveButton = screen.getByRole("button", { name: "SAVE_ACTION" });
    expect(saveButton).toBeDisabled();
    const titleRow = screen.getByRole("heading", { name: "EDITOR_TITLE" }).closest("div.flex");
    expect(titleRow).toContainElement(saveButton);
    expect(screen.queryByRole("button", { name: "HISTORY_ACTION" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PUBLISH_OPTIONS" })).not.toBeInTheDocument();
    expect(screen.getByText("EDITOR_FAQ_TITLE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EDITOR_FAQ_BUSINESS_QUESTION" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("EDITOR_FAQ_BUSINESS_ANSWER")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EDITOR_FAQ_SAVE_QUESTION" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "EDITOR_FAQ_ROLLBACK_QUESTION" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "EDITOR_FAQ_PUBLISH_QUESTION" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("EFFECTIVE_TITLE")).not.toBeInTheDocument();
    expect(screen.queryByText("HISTORY_TITLE")).not.toBeInTheDocument();
    expect(screen.queryByText("REFERENCES_TITLE")).not.toBeInTheDocument();
    expect(mocks.getEffective).not.toHaveBeenCalled();
    expect(mocks.listBases).not.toHaveBeenCalled();
  });

  it("activates edited knowledge with a single save action", async () => {
    renderView();
    fireEvent.change(await screen.findByLabelText("EDITOR_FIELD_LABEL"), {
      target: { value: "Keep source claims traceable." },
    });
    fireEvent.click(screen.getByRole("button", { name: "SAVE_ACTION" }));

    await waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalledWith(
        { workspaceId: "workspace-1" },
        { content: "Keep source claims traceable.", expectedRevision: 3 },
        "command-key",
      );
    });
    await waitFor(() => {
      expect(mocks.publish).toHaveBeenCalledWith(
        { workspaceId: "workspace-1" },
        { expectedRevision: 4, revisionId: "revision-2" },
        "command-key",
      );
    });
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith("SAVED"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "SAVE_ACTION" })).toBeDisabled();
    });
  });

  it("keeps save failures in the global toast and the editor unchanged", async () => {
    const error = new Error("save failed");
    mocks.saveDraft.mockRejectedValue(error);
    renderView();

    fireEvent.change(await screen.findByLabelText("EDITOR_FIELD_LABEL"), {
      target: { value: "Keep source claims traceable." },
    });
    fireEvent.click(screen.getByRole("button", { name: "SAVE_ACTION" }));

    await waitFor(() => expect(mocks.notifyError).toHaveBeenCalledWith(error));
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(screen.getByLabelText("EDITOR_FIELD_LABEL")).toHaveValue(
      "Keep source claims traceable.",
    );
    expect(screen.getByRole("button", { name: "SAVE_ACTION" })).toBeEnabled();
  });

  it("requires a server-created removal preview before deactivating guidance", async () => {
    mocks.getLayer.mockResolvedValue(projectLayer);
    renderProjectView();
    fireEvent.click(await screen.findByRole("button", { name: "REMOVE_ACTION" }));

    await waitFor(() => {
      expect(mocks.createRemovePreview).toHaveBeenCalledWith(
        { workspaceId: "workspace-1", projectId: "project-1" },
        { expectedRevision: 3 },
        "command-key",
      );
    });
    expect(
      await screen.findByRole("heading", { name: "PROJECT_REMOVE_PREVIEW_TITLE" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "PROJECT_REMOVE_APPLY" }));
    await waitFor(() => {
      expect(mocks.applyRemovePreview).toHaveBeenCalledWith(
        { workspaceId: "workspace-1", projectId: "project-1" },
        "remove-preview-1",
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
    expect(screen.queryByRole("button", { name: "REVISION_DETAIL:1" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("EDITOR_FIELD_LABEL"), {
      target: { value: "Project-only sourcing rule." },
    });
    fireEvent.click(screen.getByLabelText("PROJECT_MODE_LABEL"));
    fireEvent.click(await screen.findByRole("option", { name: "PROJECT_MODE_OVERRIDE" }));
    fireEvent.click(screen.getByRole("button", { name: "SAVE_ACTION" }));

    await waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalledWith(
        { workspaceId: "workspace-1", projectId: "project-1" },
        {
          content: "Project-only sourcing rule.",
          expectedRevision: 3,
          projectMode: "override",
        },
        "command-key",
      );
    });
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith("PROJECT_SAVED"));
  });
});
