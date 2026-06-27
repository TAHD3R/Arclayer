import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  approveAIAgentApproval,
  applyAIAgentApproval,
  formatAIChatError,
  listAIAgentActionableApprovals,
  modifyAIAgentApproval,
  rejectAIAgentApproval,
} from "@/api/ai";
import { AIApprovalQueue } from "@/components/ai/ai-approval-queue";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

vi.mock("@/api/ai", () => ({
  approveAIAgentApproval: vi.fn(),
  applyAIAgentApproval: vi.fn(),
  buildAIAgentApprovalsQueryKey: vi.fn((projectId: string | null | undefined) => [
    "ai",
    "agent-approvals",
    projectId ?? null,
    "actionable",
  ]),
  formatAIChatError: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error),
  ),
  listAIAgentActionableApprovals: vi.fn(),
  modifyAIAgentApproval: vi.fn(),
  rejectAIAgentApproval: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        "ai:AI_AGENT_APPROVAL_QUEUE": "Agent approvals",
        "ai:AI_AGENT_APPROVAL_LOADING": "Loading approvals...",
        "ai:AI_AGENT_APPROVAL_PENDING_COUNT": `${String(values?.count ?? 0)} needing action`,
        "ai:AI_AGENT_APPROVAL_PENDING_AND_READY_COUNT": `${String(
          values?.pending ?? 0,
        )} needing review, ${String(values?.ready ?? 0)} ready to apply`,
        "ai:AI_AGENT_APPROVAL_READY_TO_APPLY_COUNT": `${String(values?.count ?? 0)} ready to apply`,
        "ai:AI_AGENT_APPROVAL_STATUS_PENDING": "Pending review",
        "ai:AI_AGENT_APPROVAL_STATUS_READY_TO_APPLY": "Ready to apply",
        "ai:AI_AGENT_APPROVAL_REFRESH": "Refresh approvals",
        "ai:AI_AGENT_APPROVAL_REASON_APPROVED": "Approved from AI drawer",
        "ai:AI_AGENT_APPROVAL_REASON_REJECTED": "Rejected from AI drawer",
        "ai:AI_AGENT_APPROVAL_TARGET": "Content item",
        "ai:AI_AGENT_APPROVAL_MODEL_TARGET": "Content model",
        "ai:AI_AGENT_APPROVAL_DRAFT_VERSION": `Draft v${String(values?.version ?? 0)}`,
        "ai:AI_AGENT_APPROVAL_DRAFT_REVISION": `Draft rev ${String(values?.revision ?? 0)}`,
        "ai:AI_AGENT_APPROVAL_FIELD_COUNT": `${String(values?.count ?? 0)} fields`,
        "ai:AI_AGENT_APPROVAL_AFFECTED_ITEMS": `${String(values?.count ?? 0)} affected items`,
        "ai:AI_AGENT_APPROVAL_MODEL_SCHEMA": "Schema",
        "ai:AI_AGENT_APPROVAL_CHANGE_SUMMARY": "Summary",
        "ai:AI_AGENT_APPROVAL_APPROVE": "Approve",
        "ai:AI_AGENT_APPROVAL_REJECT": "Reject",
        "ai:AI_AGENT_APPROVAL_APPLY": "Apply",
        "ai:AI_AGENT_APPROVAL_EDIT": "Edit proposal",
        "ai:AI_AGENT_APPROVAL_EDIT_FIELDS": "Proposed fields JSON",
        "ai:AI_AGENT_APPROVAL_EDIT_MODEL_PATCH": "Model patch JSON",
        "ai:AI_AGENT_APPROVAL_EDIT_SUMMARY": "Proposal change summary",
        "ai:AI_AGENT_APPROVAL_EDIT_SAVE": "Save proposal edits",
        "ai:AI_AGENT_APPROVAL_EDIT_CANCEL": "Cancel proposal edits",
        "ai:AI_AGENT_APPROVAL_EDIT_INVALID_JSON": "Proposal patch must be a JSON object.",
        "ai:AI_AGENT_APPROVAL_SUCCESS_APPROVED": "Approval is ready to apply.",
        "ai:AI_AGENT_APPROVAL_SUCCESS_REJECTED": "Approval rejected.",
        "ai:AI_AGENT_APPROVAL_SUCCESS_MODIFIED": "Proposal edits saved.",
        "ai:AI_AGENT_APPROVAL_SUCCESS_APPLIED": "Approval applied.",
        "ai:AI_AGENT_APPROVAL_NO_FIELD_CHANGES": "No field changes",
        "ai:AI_AGENT_APPROVAL_NO_SCHEMA_CHANGES": "No schema summary",
        "ai:AI_AGENT_APPROVAL_MORE": `${String(values?.count ?? 0)} more approvals`,
      };
      return labels[key] ?? key;
    },
  }),
}));

function renderQueue() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const view = render(
    <QueryClientProvider client={queryClient}>
      <AIApprovalQueue enabled />
    </QueryClientProvider>,
  );
  return { queryClient, ...view };
}

describe("AIApprovalQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      lastWorkspaceId: "workspace-1",
      currentProjectId: "project-1",
      lastProjectId: "project-1",
    });
    vi.mocked(listAIAgentActionableApprovals).mockResolvedValue({
      approvals: [
        {
          id: "approval-1",
          requesterUserId: "user-1",
          skillId: "content.writer",
          action: "content_item.update_draft",
          targetType: "content_item",
          targetId: "item-1",
          expectedDraftVersion: 2,
          targetSnapshot: {
            title: "Launch note",
            modelKey: "article",
            draftVersion: 2,
          },
          proposedPatch: { fieldsSnapshot: { title: "New" } },
          dryRun: {
            willApply: false,
            requiresApproval: true,
            expectedDraftVersion: 2,
            fieldChanges: [{ field: "title", before: "Old", after: "New" }],
          },
          status: "pending",
          expiresAt: "2026-06-27T00:00:00.000Z",
          createdAt: "2026-06-26T00:00:00.000Z",
          updatedAt: "2026-06-26T00:00:00.000Z",
        },
        {
          id: "approval-2",
          requesterUserId: "user-1",
          approverUserId: "user-2",
          skillId: "content.writer",
          action: "content_item.update_draft",
          targetType: "content_item",
          targetId: "item-2",
          expectedDraftVersion: 4,
          targetSnapshot: {
            title: "Approved draft",
            modelKey: "article",
            draftVersion: 4,
          },
          proposedPatch: {
            fieldsSnapshot: { title: "Ready" },
            presentations: [],
          },
          dryRun: {
            willApply: false,
            requiresApproval: true,
            expectedDraftVersion: 4,
            fieldChanges: [{ field: "title", before: "Draft", after: "Ready" }],
          },
          status: "approved",
          expiresAt: "2026-06-27T00:00:00.000Z",
          approvedAt: "2026-06-26T00:10:00.000Z",
          createdAt: "2026-06-26T00:00:00.000Z",
          updatedAt: "2026-06-26T00:10:00.000Z",
        },
        {
          id: "approval-3",
          requesterUserId: "user-1",
          skillId: "content.modeler",
          action: "content_model.update_schema",
          targetType: "content_model",
          targetId: "model-1",
          expectedDraftVersion: 4,
          targetSnapshot: {
            draftRevision: 4,
            currentSnapshot: {
              payload: {
                name: "Article",
                singularKey: "article",
              },
            },
          },
          proposedPatch: {
            changeSummary: "Add summary field",
            modelPatch: { name: "Article" },
          },
          dryRun: {
            willApply: false,
            requiresApproval: true,
            expectedDraftRevision: 4,
            affectedItemsCount: 2,
            hasBlockingChanges: false,
          },
          status: "pending",
          expiresAt: "2026-06-27T00:00:00.000Z",
          createdAt: "2026-06-26T00:00:00.000Z",
          updatedAt: "2026-06-26T00:00:00.000Z",
        },
      ],
    });
    vi.mocked(approveAIAgentApproval).mockResolvedValue({
      id: "approval-1",
      status: "approved",
    } as never);
    vi.mocked(rejectAIAgentApproval).mockResolvedValue({
      id: "approval-1",
      status: "rejected",
    } as never);
    vi.mocked(modifyAIAgentApproval).mockResolvedValue({
      id: "approval-1",
      status: "pending",
    } as never);
    vi.mocked(applyAIAgentApproval).mockResolvedValue({
      approval: { id: "approval-2", status: "applied" },
      version: { itemId: "item-2", versionNumber: 5, state: "draft" },
    } as never);
  });

  it("renders pending approvals with deterministic dry-run details", async () => {
    renderQueue();

    expect(await screen.findByText("Launch note")).toBeInTheDocument();
    expect(screen.getByText("2 needing review, 1 ready to apply")).toBeInTheDocument();
    expect(screen.getAllByText("Pending review")).toHaveLength(2);
    expect(screen.getByText("Ready to apply")).toBeInTheDocument();
    expect(screen.getByText("Draft v2")).toBeInTheDocument();
    expect(screen.getAllByText("1 fields")).toHaveLength(2);
    expect(screen.getByText("Old")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(listAIAgentActionableApprovals).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1" }),
    );
  });

  it("renders content model approvals with schema impact details", async () => {
    renderQueue();

    expect(await screen.findByText("Article")).toBeInTheDocument();
    expect(screen.getByText("Draft rev 4")).toBeInTheDocument();
    expect(screen.getByText("2 affected items")).toBeInTheDocument();
    expect(screen.getByText("Schema")).toBeInTheDocument();
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Add summary field")).toBeInTheDocument();
  });

  it("omits terminal approvals after backend status normalization", async () => {
    vi.mocked(listAIAgentActionableApprovals).mockResolvedValue({
      approvals: [
        {
          id: "approval-expired",
          requesterUserId: "user-1",
          skillId: "content.writer",
          action: "content_item.update_draft",
          targetType: "content_item",
          targetId: "item-expired",
          expectedDraftVersion: 2,
          targetSnapshot: {
            title: "Expired draft",
            modelKey: "article",
            draftVersion: 2,
          },
          proposedPatch: { fieldsSnapshot: { title: "Expired" } },
          dryRun: {
            willApply: false,
            requiresApproval: true,
            expectedDraftVersion: 2,
            fieldChanges: [{ field: "title", before: "Old", after: "Expired" }],
          },
          status: "expired",
          expiresAt: "2026-06-26T00:00:00.000Z",
          expiredAt: "2026-06-27T00:00:00.000Z",
          createdAt: "2026-06-26T00:00:00.000Z",
          updatedAt: "2026-06-27T00:00:00.000Z",
        },
        {
          id: "approval-rejected",
          requesterUserId: "user-1",
          skillId: "content.writer",
          action: "content_item.update_draft",
          targetType: "content_item",
          targetId: "item-rejected",
          targetSnapshot: { title: "Rejected draft" },
          proposedPatch: {},
          dryRun: {},
          status: "rejected",
          expiresAt: "2026-06-27T00:00:00.000Z",
          rejectedAt: "2026-06-26T00:10:00.000Z",
          createdAt: "2026-06-26T00:00:00.000Z",
          updatedAt: "2026-06-26T00:10:00.000Z",
        },
        {
          id: "approval-applied",
          requesterUserId: "user-1",
          approverUserId: "user-2",
          skillId: "content.writer",
          action: "content_item.update_draft",
          targetType: "content_item",
          targetId: "item-applied",
          targetSnapshot: { title: "Applied draft" },
          proposedPatch: {},
          dryRun: {},
          status: "applied",
          expiresAt: "2026-06-27T00:00:00.000Z",
          approvedAt: "2026-06-26T00:10:00.000Z",
          appliedAt: "2026-06-26T00:20:00.000Z",
          createdAt: "2026-06-26T00:00:00.000Z",
          updatedAt: "2026-06-26T00:20:00.000Z",
        },
      ],
    });

    renderQueue();

    await waitFor(() => expect(listAIAgentActionableApprovals).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText("Agent approvals")).not.toBeInTheDocument());
    expect(screen.queryByText("Expired draft")).not.toBeInTheDocument();
    expect(screen.queryByText("Rejected draft")).not.toBeInTheDocument();
    expect(screen.queryByText("Applied draft")).not.toBeInTheDocument();
  });

  it("submits approve and reject decisions", async () => {
    const user = userEvent.setup();
    renderQueue();

    await waitFor(() => expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(2));
    await user.click(screen.getAllByRole("button", { name: "Approve" })[0]);
    await waitFor(() => {
      expect(approveAIAgentApproval).toHaveBeenCalledWith({
        projectId: "project-1",
        approvalId: "approval-1",
        reason: "Approved from AI drawer",
      });
    });
    expect(await screen.findByText("Approval is ready to apply.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Reject" })[0]);
    await waitFor(() => {
      expect(rejectAIAgentApproval).toHaveBeenCalledWith({
        projectId: "project-1",
        approvalId: "approval-1",
        reason: "Rejected from AI drawer",
      });
    });
    expect(await screen.findByText("Approval rejected.")).toBeInTheDocument();
    expect(screen.queryByText("Approval is ready to apply.")).not.toBeInTheDocument();
  });

  it("clears stale action errors before submitting another approval action", async () => {
    const user = userEvent.setup();
    vi.mocked(approveAIAgentApproval).mockRejectedValueOnce(new Error("approval failed"));
    renderQueue();

    await user.click((await screen.findAllByRole("button", { name: "Approve" }))[0]!);
    expect(await screen.findByText("approval failed")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Reject" })[0]!);

    await waitFor(() => {
      expect(rejectAIAgentApproval).toHaveBeenCalledWith({
        projectId: "project-1",
        approvalId: "approval-1",
        reason: "Rejected from AI drawer",
      });
    });
    await waitFor(() => {
      expect(screen.queryByText("approval failed")).not.toBeInTheDocument();
    });
  });

  it("modifies pending content approval fields", async () => {
    const user = userEvent.setup();
    renderQueue();

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Edit proposal" })).toHaveLength(2),
    );
    await user.click(screen.getAllByRole("button", { name: "Edit proposal" })[0]);
    const fieldsInput = screen.getByRole("textbox", { name: "Proposed fields JSON" });
    await user.clear(fieldsInput);
    await user.click(fieldsInput);
    await user.paste(JSON.stringify({ title: "Reviewer title" }));
    const summaryInput = screen.getByRole("textbox", { name: "Proposal change summary" });
    await user.type(summaryInput, "Reviewer adjusted title");
    await user.click(screen.getByRole("button", { name: "Save proposal edits" }));

    await waitFor(() => {
      expect(modifyAIAgentApproval).toHaveBeenCalledWith({
        projectId: "project-1",
        approvalId: "approval-1",
        payload: {
          fieldsSnapshot: { title: "Reviewer title" },
          changeSummary: "Reviewer adjusted title",
        },
      });
    });
    expect(await screen.findByText("Proposal edits saved.")).toBeInTheDocument();
  });

  it("modifies pending content model approval patches", async () => {
    const user = userEvent.setup();
    renderQueue();

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Edit proposal" })).toHaveLength(2),
    );
    await user.click(screen.getAllByRole("button", { name: "Edit proposal" })[1]);
    const modelPatchInput = screen.getByRole("textbox", { name: "Model patch JSON" });
    await user.clear(modelPatchInput);
    await user.click(modelPatchInput);
    await user.paste(JSON.stringify({ name: "Article Reviewed" }));
    const summaryInput = screen.getByRole("textbox", { name: "Proposal change summary" });
    await user.clear(summaryInput);
    await user.type(summaryInput, "Reviewer adjusted schema");
    await user.click(screen.getByRole("button", { name: "Save proposal edits" }));

    await waitFor(() => {
      expect(modifyAIAgentApproval).toHaveBeenCalledWith({
        projectId: "project-1",
        approvalId: "approval-3",
        payload: {
          modelPatch: { name: "Article Reviewed" },
          changeSummary: "Reviewer adjusted schema",
        },
      });
    });
    expect(await screen.findByText("Proposal edits saved.")).toBeInTheDocument();
  });

  it("surfaces invalid approval edit JSON", async () => {
    const user = userEvent.setup();
    renderQueue();

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Edit proposal" })).toHaveLength(2),
    );
    await user.click(screen.getAllByRole("button", { name: "Edit proposal" })[0]);
    const fieldsInput = screen.getByRole("textbox", { name: "Proposed fields JSON" });
    await user.clear(fieldsInput);
    await user.click(fieldsInput);
    await user.paste("[]");
    await user.click(screen.getByRole("button", { name: "Save proposal edits" }));

    expect(await screen.findByText("Proposal patch must be a JSON object.")).toBeInTheDocument();
    expect(modifyAIAgentApproval).not.toHaveBeenCalled();
  });

  it("resets approval edit drafts when a refreshed approval version arrives", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderQueue();

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Edit proposal" })).toHaveLength(2),
    );
    await user.click(screen.getAllByRole("button", { name: "Edit proposal" })[0]);
    const fieldsInput = screen.getByRole("textbox", { name: "Proposed fields JSON" });
    await user.clear(fieldsInput);
    await user.click(fieldsInput);
    await user.paste(JSON.stringify({ title: "Unsaved stale title" }));

    act(() => {
      queryClient.setQueryData(["ai", "agent-approvals", "project-1", "actionable"], {
        approvals: [
          {
            id: "approval-1",
            requesterUserId: "user-1",
            skillId: "content.writer",
            action: "content_item.update_draft",
            targetType: "content_item",
            targetId: "item-1",
            expectedDraftVersion: 2,
            targetSnapshot: {
              title: "Launch note",
              modelKey: "article",
              draftVersion: 2,
            },
            proposedPatch: {
              fieldsSnapshot: { title: "Backend refreshed title" },
              changeSummary: "Backend refreshed summary",
            },
            dryRun: {
              willApply: false,
              requiresApproval: true,
              expectedDraftVersion: 2,
              fieldChanges: [{ field: "title", before: "Old", after: "Backend refreshed title" }],
            },
            status: "pending",
            expiresAt: "2026-06-27T00:00:00.000Z",
            createdAt: "2026-06-26T00:00:00.000Z",
            updatedAt: "2026-06-26T00:20:00.000Z",
          },
        ],
      });
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: "Proposed fields JSON" }),
      ).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Edit proposal" }));

    expect(screen.getByRole("textbox", { name: "Proposed fields JSON" })).toHaveValue(
      JSON.stringify({ title: "Backend refreshed title" }, null, 2),
    );
    expect(screen.getByRole("textbox", { name: "Proposal change summary" })).toHaveValue(
      "Backend refreshed summary",
    );
  });

  it("applies approved approvals", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderQueue();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(applyAIAgentApproval).toHaveBeenCalledWith({
        projectId: "project-1",
        approvalId: "approval-2",
      });
    });
    expect(await screen.findByText("Approval applied.")).toBeInTheDocument();
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["content-library-runtime", "items", "all", "project-1"],
      });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["content-library-runtime", "item", "project-1", "item-2"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["content-library-runtime", "item", "project-1", "item-2", "versions"],
    });
  });

  it("refreshes content model runtime caches after applying approved model changes", async () => {
    const user = userEvent.setup();
    vi.mocked(listAIAgentActionableApprovals).mockResolvedValue({
      approvals: [
        {
          id: "approval-model-1",
          requesterUserId: "user-1",
          approverUserId: "user-2",
          skillId: "content.modeler",
          action: "content_model.update_schema",
          targetType: "content_model",
          targetId: "model-1",
          expectedDraftVersion: 4,
          targetSnapshot: {
            draftRevision: 4,
            currentSnapshot: {
              payload: {
                name: "Article",
                singularKey: "article",
              },
            },
          },
          proposedPatch: {
            changeSummary: "Add summary field",
            modelPatch: { name: "Article" },
          },
          dryRun: {
            willApply: false,
            requiresApproval: true,
            expectedDraftRevision: 4,
            affectedItemsCount: 2,
            hasBlockingChanges: false,
          },
          status: "approved",
          expiresAt: "2026-06-27T00:00:00.000Z",
          approvedAt: "2026-06-26T00:10:00.000Z",
          createdAt: "2026-06-26T00:00:00.000Z",
          updatedAt: "2026-06-26T00:10:00.000Z",
        },
      ],
    });
    vi.mocked(applyAIAgentApproval).mockResolvedValue({
      approval: {
        id: "approval-model-1",
        status: "applied",
        targetType: "content_model",
        targetId: "model-1",
      },
      model: { id: "model-1" },
    } as never);
    const { queryClient } = renderQueue();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(await screen.findByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(applyAIAgentApproval).toHaveBeenCalledWith({
        projectId: "project-1",
        approvalId: "approval-model-1",
      });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["content", "models", "project-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["content-library-runtime", "models", "all", "project-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["content-library-runtime", "items", "all", "project-1"],
    });
  });

  it("surfaces approval load errors", async () => {
    vi.mocked(listAIAgentActionableApprovals).mockRejectedValue(new Error("approval API down"));

    renderQueue();

    expect(await screen.findByText("approval API down")).toBeInTheDocument();
    expect(formatAIChatError).toHaveBeenCalled();
  });
});
