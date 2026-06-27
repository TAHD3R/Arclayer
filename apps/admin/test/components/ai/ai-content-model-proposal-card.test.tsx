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
import { useAiChatStore } from "@/stores/use-ai-chat-store";

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
    t: (key: string, values?: Record<string, string>) => {
      const labels: Record<string, string> = {
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL": "Model proposal",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_INSTRUCTION": "Model proposal instruction",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_PLACEHOLDER":
          "Tell the modeler agent what schema change to draft",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_TARGET": "Current model",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_CREATE": "Draft schema",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_CREATING": "Drafting...",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_CREATED": "Approval checkpoint created",
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

  return render(
    <QueryClientProvider client={queryClient}>
      <AIContentModelProposalCard enabled projectId="project-1" modelId="model-1" />
    </QueryClientProvider>,
  );
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
          description: "Draft content model changes",
          mode: "agent",
          toolNames: [],
          readOnly: false,
          requiresApproval: true,
          enabled: true,
        },
      ],
    });
    vi.mocked(createAIAgentContentModelDraftProposal).mockResolvedValue({
      approval: { id: "approval-1", status: "pending", targetType: "content_model" },
      model: "gpt-4o-mini",
      usage: {},
      impactPreview: { previewToken: "signed-preview-token" },
    } as never);
  });

  it("creates a content model proposal for the current model", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.type(
      await screen.findByLabelText("Model proposal instruction"),
      "Add a summary field",
    );
    await user.click(screen.getByRole("button", { name: /Draft schema/ }));

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
    expect(await screen.findByText("Approval checkpoint created")).toBeInTheDocument();
  });

  it("explains why the modeler skill is disabled", async () => {
    vi.mocked(listAIProjectAgents).mockResolvedValue({
      agents: [],
      tools: [],
      skills: [
        {
          skillId: "content.modeler",
          name: "Content Modeler",
          description: "Draft content model changes",
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

    await waitFor(() => expect(listAIProjectAgents).toHaveBeenCalled());
    expect(screen.getByRole("region", { name: "Model proposal" })).toBeInTheDocument();
    expect(
      await screen.findByText("Current model · Write-capable tools are disabled"),
    ).toBeInTheDocument();
    expect(createAIAgentContentModelDraftProposal).not.toHaveBeenCalled();
  });

  it("surfaces proposal errors", async () => {
    const user = userEvent.setup();
    vi.mocked(createAIAgentContentModelDraftProposal).mockRejectedValue(
      new Error("proposal failed"),
    );

    renderCard();

    await user.type(await screen.findByLabelText("Model proposal instruction"), "Rename");
    await user.click(screen.getByRole("button", { name: /Draft schema/ }));

    expect(await screen.findByText("proposal failed")).toBeInTheDocument();
    expect(formatAIChatError).toHaveBeenCalled();
  });
});
