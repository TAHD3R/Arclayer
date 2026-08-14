import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ProjectGuidanceView,
  WorkspaceGuidanceView,
} from "@/pages/workspaces/settings/workspace/knowledge/workspace-guidance-view";
import { WorkspaceKnowledgeHeaderActions } from "@/pages/workspaces/settings/workspace/knowledge/workspace-guidance-authoring";
import type { WorkspaceGuidanceController } from "@/pages/workspaces/settings/workspace/knowledge/use-workspace-guidance-controller";
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
  MarkdownPlatePreview: (props: { ariaLabel: string; value: string }) => (
    <div aria-label={props.ariaLabel}>{props.value}</div>
  ),
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

const supersededRevision = {
  ...publishedRevision,
  id: "revision-previous",
  revisionNumber: 2,
  status: "superseded" as const,
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
  currentPublished: { ...publishedRevision, id: "project-revision-current" },
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
      <WorkspaceViewHarness />
    </QueryClientProvider>,
  );
}

function WorkspaceViewHarness() {
  const [controller, setController] = useState<WorkspaceGuidanceController | null>(null);
  return (
    <>
      <header data-slot="page-header-actions">
        {controller ? <WorkspaceKnowledgeHeaderActions controller={controller} /> : null}
      </header>
      <WorkspaceGuidanceView workspaceId="workspace-1" onControllerChange={setController} />
    </>
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
    const saveAndPublishButton = screen.getByRole("button", { name: "SAVE_AND_PUBLISH" });
    expect(saveAndPublishButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "PUBLISH_OPTIONS" })).toBeDisabled();
    const historyButton = screen.getByRole("button", { name: "HISTORY_ACTION" });
    await waitFor(() => expect(historyButton).toBeEnabled());
    expect(saveAndPublishButton.closest('[data-slot="page-header-actions"]')).not.toBeNull();
    expect(screen.getByText("EDITOR_FAQ_TITLE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EDITOR_FAQ_BUSINESS_QUESTION" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("EDITOR_FAQ_BUSINESS_ANSWER")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "EDITOR_FAQ_ROLLBACK_QUESTION" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("EFFECTIVE_TITLE")).not.toBeInTheDocument();
    expect(screen.queryByText("HISTORY_TITLE")).not.toBeInTheDocument();
    expect(screen.queryByText("REFERENCES_TITLE")).not.toBeInTheDocument();
    expect(mocks.getEffective).not.toHaveBeenCalled();
    expect(mocks.listHistory).toHaveBeenCalled();
    expect(mocks.listBases).not.toHaveBeenCalled();
  });

  it("saves a real immutable draft with the current metadata revision", async () => {
    renderView();
    fireEvent.change(await screen.findByLabelText("EDITOR_FIELD_LABEL"), {
      target: { value: "Keep source claims traceable." },
    });
    const publishOptions = screen.getByRole("button", { name: "PUBLISH_OPTIONS" });
    fireEvent.keyDown(publishOptions, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "SAVE_DRAFT_ONLY" }));

    await waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalledWith(
        { workspaceId: "workspace-1" },
        { content: "Keep source claims traceable.", expectedRevision: 3 },
        "command-key",
      );
    });
    expect(screen.getByRole("button", { name: "SAVE_AND_PUBLISH" })).toBeEnabled();
    fireEvent.keyDown(publishOptions, { key: "ArrowDown" });
    expect(await screen.findByRole("menuitem", { name: "PUBLISH_WITHOUT_SAVING" })).toBeEnabled();
  });

  it("saves the draft before publishing from the primary action", async () => {
    renderView();
    fireEvent.change(await screen.findByLabelText("EDITOR_FIELD_LABEL"), {
      target: { value: "Keep source claims traceable." },
    });
    fireEvent.click(screen.getByRole("button", { name: "SAVE_AND_PUBLISH" }));

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
  });

  it("publishes the saved draft without overwriting newer editor changes", async () => {
    renderView();
    fireEvent.change(await screen.findByLabelText("EDITOR_FIELD_LABEL"), {
      target: { value: "Publish this saved draft." },
    });
    const publishOptions = screen.getByRole("button", { name: "PUBLISH_OPTIONS" });
    fireEvent.keyDown(publishOptions, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "SAVE_DRAFT_ONLY" }));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("EDITOR_FIELD_LABEL"), {
      target: { value: "Keep this newer edit in the editor." },
    });
    fireEvent.keyDown(publishOptions, { key: "ArrowDown" });
    const publishWithoutSaving = await screen.findByRole("menuitem", {
      name: "PUBLISH_WITHOUT_SAVING",
    });
    expect(publishWithoutSaving).toBeEnabled();
    fireEvent.click(publishWithoutSaving);

    await waitFor(() => {
      expect(mocks.publish).toHaveBeenCalledWith(
        { workspaceId: "workspace-1" },
        { expectedRevision: 4, revisionId: "revision-2" },
        "command-key",
      );
    });
    expect(mocks.saveDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("EDITOR_FIELD_LABEL")).toHaveValue(
      "Keep this newer edit in the editor.",
    );
  });

  it("keeps publish-without-saving available when the editor is empty", async () => {
    renderView();
    fireEvent.change(await screen.findByLabelText("EDITOR_FIELD_LABEL"), {
      target: { value: "Publish the saved draft." },
    });
    const publishOptions = screen.getByRole("button", { name: "PUBLISH_OPTIONS" });
    fireEvent.keyDown(publishOptions, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "SAVE_DRAFT_ONLY" }));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("EDITOR_FIELD_LABEL"), { target: { value: "" } });
    expect(publishOptions).toBeEnabled();
    fireEvent.keyDown(publishOptions, { key: "ArrowDown" });
    expect(await screen.findByRole("menuitem", { name: "PUBLISH_WITHOUT_SAVING" })).toBeEnabled();
  });

  it("publishes new editor content when no draft exists yet", async () => {
    renderView();
    fireEvent.change(await screen.findByLabelText("EDITOR_FIELD_LABEL"), {
      target: { value: "Publish this content directly." },
    });

    const publishOptions = screen.getByRole("button", { name: "PUBLISH_OPTIONS" });
    expect(publishOptions).toBeEnabled();
    fireEvent.keyDown(publishOptions, { key: "ArrowDown" });
    const publishWithoutSaving = await screen.findByRole("menuitem", {
      name: "PUBLISH_WITHOUT_SAVING",
    });
    expect(publishWithoutSaving).toBeEnabled();
    fireEvent.click(publishWithoutSaving);

    await waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalledWith(
        { workspaceId: "workspace-1" },
        { content: "Publish this content directly.", expectedRevision: 3 },
        "command-key",
      );
      expect(mocks.publish).toHaveBeenCalledWith(
        { workspaceId: "workspace-1" },
        { expectedRevision: 4, revisionId: "revision-2" },
        "command-key",
      );
    });
  });

  it("keeps operation failures in the global toast instead of rendering an alert", async () => {
    const error = new Error("save failed");
    mocks.saveDraft.mockRejectedValue(error);
    renderView();

    fireEvent.change(await screen.findByLabelText("EDITOR_FIELD_LABEL"), {
      target: { value: "Keep source claims traceable." },
    });
    const publishOptions = screen.getByRole("button", { name: "PUBLISH_OPTIONS" });
    fireEvent.keyDown(publishOptions, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "SAVE_DRAFT_ONLY" }));

    await waitFor(() => expect(mocks.notifyError).toHaveBeenCalledWith(error));
    expect(screen.queryByText("OPERATION_FAILED_TITLE")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SAVE_AND_PUBLISH" })).toBeEnabled();
  });

  it("requires a server-created restoration preview before applying history", async () => {
    mocks.getLayer.mockResolvedValue(projectLayer);
    renderProjectView();
    fireEvent.click(await screen.findByRole("button", { name: "HISTORY_SWITCH_ACTION" }));

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

  it("keeps current and historical revision actions independently available", async () => {
    mocks.listHistory.mockResolvedValue({
      items: [publishedRevision, supersededRevision],
      nextCursor: null,
    });
    renderView();

    const historyButton = await screen.findByRole("button", { name: "HISTORY_ACTION" });
    await waitFor(() => expect(historyButton).toBeEnabled());
    fireEvent.click(historyButton);

    const drawerTitle = await screen.findByRole("heading", { name: "HISTORY_DRAWER_TITLE" });
    expect(drawerTitle.parentElement).toContainElement(
      screen.getByRole("button", { name: "common:CLOSE" }),
    );

    const switchActions = await screen.findAllByRole("button", { name: "HISTORY_SWITCH_ACTION" });
    expect(switchActions[0]).toBeDisabled();
    expect(switchActions[1]).toBeEnabled();
    const currentOptions = screen.getByRole("button", { name: "HISTORY_VERSION_OPTIONS:1" });
    expect(currentOptions).toBeEnabled();
    expect(screen.getByRole("button", { name: "HISTORY_VERSION_OPTIONS:2" })).toBeEnabled();

    fireEvent.click(currentOptions);
    expect(screen.queryByText("HISTORY_VERSION_OPTIONS:1")).not.toBeInTheDocument();
    expect(await screen.findByRole("menuitem", { name: "ENABLE_ACTION" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: "HISTORY_REMOVE_CURRENT_ACTION" })).toBeEnabled();
    expect(currentOptions.closest("[aria-current='true']")).toHaveAttribute(
      "data-menu-open",
      "true",
    );
    expect(currentOptions).toBeVisible();
    const currentRow = screen.getByText("REVISION_CURRENT").closest("[aria-current='true']");
    expect(currentRow).toContainElement(screen.getByText("REVISION_DETAIL:1"));
    const currentBadge = screen.getByText("REVISION_CURRENT");
    expect(screen.getByText("REVISION_DETAIL:1").parentElement).toContainElement(currentBadge);
    expect(currentBadge.closest("[aria-current='true']")).toBe(currentRow);
    expect(currentRow).toHaveClass("bg-accent/60");
  });

  it("renders the Drawer load-more action as a full-width ghost button", async () => {
    mocks.listHistory.mockResolvedValue({
      items: [publishedRevision],
      nextCursor: "next-page",
    });
    renderView();

    const historyButton = await screen.findByRole("button", { name: "HISTORY_ACTION" });
    await waitFor(() => expect(historyButton).toBeEnabled());
    fireEvent.click(historyButton);

    const loadMoreButton = await screen.findByRole("button", { name: "HISTORY_LOAD_MORE" });
    expect(loadMoreButton).toHaveClass("w-full");
    expect(loadMoreButton).toHaveAttribute("data-variant", "ghost");
  });

  it("keeps history open when a restoration confirmation is canceled", async () => {
    mocks.listHistory.mockResolvedValue({
      items: [publishedRevision, supersededRevision],
      nextCursor: null,
    });
    renderView();

    const historyButton = await screen.findByRole("button", { name: "HISTORY_ACTION" });
    await waitFor(() => expect(historyButton).toBeEnabled());
    fireEvent.click(historyButton);
    const switchActions = await screen.findAllByRole("button", { name: "HISTORY_SWITCH_ACTION" });
    fireEvent.click(switchActions[1]);

    expect(await screen.findByRole("heading", { name: "RESTORE_PREVIEW_TITLE" })).toBeVisible();
    expect(screen.getByLabelText("HISTORY_PREVIEW_CONTENT_LABEL")).toHaveTextContent(
      supersededRevision.content,
    );
    expect(screen.queryByText("RESTORE_PREVIEW_EYEBROW")).not.toBeInTheDocument();
    expect(screen.queryByText("IMPACT_SECTION_TITLE")).not.toBeInTheDocument();
    const cancelButton = screen.getByRole("button", { name: "REMOVE_CANCEL" });
    fireEvent.pointerDown(cancelButton);
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "RESTORE_PREVIEW_TITLE" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "HISTORY_DRAWER_TITLE" })).toBeVisible();
  });

  it("opens a read-only revision detail from the history menu and keeps the drawer open", async () => {
    mocks.listHistory.mockResolvedValue({
      items: [publishedRevision, supersededRevision],
      nextCursor: null,
    });
    renderView();

    const historyButton = await screen.findByRole("button", { name: "HISTORY_ACTION" });
    await waitFor(() => expect(historyButton).toBeEnabled());
    fireEvent.click(historyButton);
    fireEvent.click(screen.getByRole("button", { name: "HISTORY_VERSION_OPTIONS:2" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "HISTORY_VIEW_ACTION" }));

    const detailHeading = await screen.findByRole("heading", { name: "REVISION_DETAIL:2" });
    await waitFor(() => expect(detailHeading).toBeVisible());
    expect(screen.getByLabelText("HISTORY_PREVIEW_CONTENT_LABEL")).toHaveTextContent(
      supersededRevision.content,
    );
    const detailDialog = screen
      .getByRole("heading", { name: "REVISION_DETAIL:2" })
      .closest("[data-slot='alert-dialog-content']");
    expect(detailDialog).not.toBeNull();
    const closeButton = within(detailDialog as HTMLElement).getByRole("button", {
      name: "Close",
    });
    fireEvent.pointerDown(closeButton);
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "REVISION_DETAIL:2" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "HISTORY_DRAWER_TITLE" })).toBeVisible();
  });

  it("keeps a historical revision active while its action menu is open", async () => {
    mocks.listHistory.mockResolvedValue({
      items: [publishedRevision, supersededRevision],
      nextCursor: null,
    });
    renderView();

    const historyButton = await screen.findByRole("button", { name: "HISTORY_ACTION" });
    await waitFor(() => expect(historyButton).toBeEnabled());
    fireEvent.click(historyButton);

    const historicalOptions = screen.getByRole("button", { name: "HISTORY_VERSION_OPTIONS:2" });
    fireEvent.click(historicalOptions);
    expect(await screen.findByRole("menuitem", { name: "ENABLE_ACTION" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "HISTORY_DELETE_UNAVAILABLE" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(historicalOptions.closest("[data-menu-open='true']")).toHaveClass("bg-accent/60");
  });

  it("confirms deactivation without unrelated impact details and keeps history open on cancel", async () => {
    mocks.createRemovePreview.mockResolvedValueOnce({
      ...restorePreview,
      id: "remove-preview-with-impact",
      kind: "remove",
      impact: {
        referenceCount: 2,
        sourceCount: 5,
        readySourceCount: 3,
        projectGuidanceCount: 12,
      },
    });
    renderView();
    const historyButton = await screen.findByRole("button", { name: "HISTORY_ACTION" });
    await waitFor(() => expect(historyButton).toBeEnabled());
    fireEvent.click(historyButton);
    fireEvent.click(await screen.findByRole("button", { name: "HISTORY_VERSION_OPTIONS:1" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "HISTORY_REMOVE_CURRENT_ACTION" }));

    expect(await screen.findByRole("heading", { name: "REMOVE_PREVIEW_TITLE" })).toBeVisible();
    const removeDialog = screen
      .getByRole("heading", { name: "REMOVE_PREVIEW_TITLE" })
      .closest("[data-slot='alert-dialog-content']");
    expect(removeDialog).not.toBeNull();
    expect(removeDialog?.querySelector("[data-slot='alert-dialog-header']")).not.toHaveClass(
      "border-b",
    );
    expect(removeDialog?.querySelector("[data-slot='alert-dialog-footer']")).not.toHaveClass(
      "border-t",
    );
    expect(screen.queryByText("REMOVE_PREVIEW_EYEBROW")).not.toBeInTheDocument();
    expect(screen.queryByText("REMOVE_SCOPE_CHANGE_TITLE")).not.toBeInTheDocument();
    expect(screen.queryByText("REMOVE_CONNECTED_CONTEXT_TITLE")).not.toBeInTheDocument();
    expect(screen.queryByText("REMOVE_RETAINED_TITLE")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "REMOVE_APPLY" })).toBeEnabled();

    const cancelButton = screen.getByRole("button", { name: "REMOVE_CANCEL" });
    fireEvent.pointerDown(cancelButton);
    fireEvent.click(cancelButton);
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "REMOVE_PREVIEW_TITLE" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "HISTORY_DRAWER_TITLE" })).toBeVisible();
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
