import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAIAgentContentModelDraftProposal,
  formatAIChatError,
  listAIProjectAgents,
} from "@/api/ai";
import { AIContentModelProposalCard } from "@/components/ai/ai-content-model-proposal-card";
import { AUTO_AI_CHAT_MODEL, useAiChatStore } from "@/stores/use-ai-chat-store";

vi.mock("@/api/ai", () => ({
  buildAIAgentApprovalsQueryKey: vi.fn((projectId: string | null | undefined) => [
    "ai",
    "agent-approvals",
    projectId ?? null,
    "actionable",
  ]),
  createAIAgentContentModelDraftProposal: vi.fn(),
  formatAIChatError: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error),
  ),
  listAIProjectAgents: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const labels: Record<string, string> = {
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL": "Model proposal",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_INSTRUCTION": "Model proposal instruction",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_PLACEHOLDER": "Ask AI to revise this model",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_TARGET": "Current model",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_CREATE": "Create proposal",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_CREATING": "Creating...",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_CREATED": "Proposal awaiting approval",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_APPROVAL_ID": `Approval ${values?.approvalId ?? ""}`,
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_AFFECTED": `${values?.count ?? 0} affected items`,
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_RECOVERY": `${values?.count ?? 0} need recovery`,
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_RESHAPE": `${values?.count ?? 0} need reshaping`,
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_BLOCKED": "Blocking changes detected",
        "ai:AI_CONTEXT_RECOMMENDATION_CATALOG_LOADING": `${values?.description ?? ""} · Checking current agent settings`,
        "ai:AI_CONTEXT_RECOMMENDATION_WRITE_TOOLS_DISABLED": `${values?.description ?? ""} · Write-capable tools are disabled`,
        "ai:AI_CONTEXT_RECOMMENDATION_UNAVAILABLE": `${values?.description ?? ""} · Unavailable in current agent settings`,
      };
      return labels[key] ?? key;
    },
  }),
}));

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <AIContentModelProposalCard enabled projectId="project-1" modelId="model-1" />
      </QueryClientProvider>,
    ),
    invalidateQueries,
  };
}

describe("AIContentModelProposalCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAiChatStore.setState({
      selectedModel: "gpt-4o-mini",
      selectedReasoningEffort: "high",
    });
    vi.mocked(listAIProjectAgents).mockResolvedValue({
      agents: [],
      tools: [],
      skills: [
        {
          skillId: "content.modeler",
          name: "Content Modeler",
          description: "Propose schema changes",
          mode: "agent",
          toolNames: [],
          readOnly: false,
          requiresApproval: true,
          enabled: true,
        },
      ],
    });
    vi.mocked(createAIAgentContentModelDraftProposal).mockResolvedValue({
      approval: { id: "approval-model-1", status: "pending" },
      model: "gpt-4o-mini",
      usage: {},
      impactPreview: {
        affectedItemsCount: 12,
        recoveryItemsCount: 2,
        reshapeItemsCount: 5,
        hasBlockingChanges: true,
      },
    } as never);
  });

  it("creates an approval-backed proposal and exposes its impact preview", async () => {
    const user = userEvent.setup();
    const { invalidateQueries } = renderCard();

    await user.type(
      await screen.findByLabelText("Model proposal instruction"),
      "Add a summary field",
    );
    await user.click(screen.getByRole("button", { name: /Create proposal/ }));

    await waitFor(() => {
      expect(createAIAgentContentModelDraftProposal).toHaveBeenCalledWith({
        projectId: "project-1",
        payload: {
          targetId: "model-1",
          instruction: "Add a summary field",
          model: "gpt-4o-mini",
          reasoningEffort: "high",
        },
      });
    });
    expect(await screen.findByText("Proposal awaiting approval")).toBeInTheDocument();
    expect(screen.getByText("Approval approval-model-1")).toBeInTheDocument();
    expect(screen.getByText("12 affected items")).toBeInTheDocument();
    expect(screen.getByText("2 need recovery")).toBeInTheDocument();
    expect(screen.getByText("5 need reshaping")).toBeInTheDocument();
    expect(screen.getByText("Blocking changes detected")).toBeInTheDocument();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["ai", "agent-approvals", "project-1", "actionable"],
    });
  });

  it("explains when the content modeler skill cannot create proposals", async () => {
    vi.mocked(listAIProjectAgents).mockResolvedValue({
      agents: [],
      tools: [],
      skills: [
        {
          skillId: "content.modeler",
          name: "Content Modeler",
          description: "Propose schema changes",
          mode: "agent",
          toolNames: [],
          readOnly: false,
          requiresApproval: true,
          enabled: false,
          disabledReason: "write_tools_disabled",
        },
      ],
    });

    renderCard();

    expect(
      await screen.findByText("Current model · Write-capable tools are disabled"),
    ).toBeInTheDocument();
    expect(createAIAgentContentModelDraftProposal).not.toHaveBeenCalled();
  });

  it("omits the model when automatic selection is enabled", async () => {
    const user = userEvent.setup();
    useAiChatStore.setState({ selectedModel: AUTO_AI_CHAT_MODEL });
    renderCard();

    await user.type(await screen.findByLabelText("Model proposal instruction"), "Rename");
    await user.click(screen.getByRole("button", { name: /Create proposal/ }));

    await waitFor(() => {
      expect(createAIAgentContentModelDraftProposal).toHaveBeenCalledWith({
        projectId: "project-1",
        payload: {
          targetId: "model-1",
          instruction: "Rename",
          model: undefined,
          reasoningEffort: "high",
        },
      });
    });
  });

  it("surfaces proposal endpoint errors", async () => {
    const user = userEvent.setup();
    vi.mocked(createAIAgentContentModelDraftProposal).mockRejectedValue(
      new Error("proposal failed"),
    );

    renderCard();

    await user.type(await screen.findByLabelText("Model proposal instruction"), "Rename");
    await user.click(screen.getByRole("button", { name: /Create proposal/ }));

    expect(await screen.findByText("proposal failed")).toBeInTheDocument();
    expect(formatAIChatError).toHaveBeenCalled();
  });
});
