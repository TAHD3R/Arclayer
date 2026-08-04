import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAIAgentContentDraftProposal,
  formatAIChatError,
  listAIProjectAgents,
} from "@/api/ai";
import { AIContentProposalCard } from "@/components/ai/ai-content-proposal-card";
import { AUTO_AI_CHAT_MODEL, useAiChatStore } from "@/stores/use-ai-chat-store";

vi.mock("@/api/ai", () => ({
  buildAIAgentApprovalsQueryKey: vi.fn((projectId: string | null | undefined) => [
    "ai",
    "agent-approvals",
    projectId ?? null,
    "actionable",
  ]),
  createAIAgentContentDraftProposal: vi.fn(),
  formatAIChatError: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error),
  ),
  listAIProjectAgents: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const labels: Record<string, string> = {
        "ai:AI_AGENT_CONTENT_PROPOSAL": "Content proposal",
        "ai:AI_AGENT_CONTENT_PROPOSAL_INSTRUCTION": "Content proposal instruction",
        "ai:AI_AGENT_CONTENT_PROPOSAL_PLACEHOLDER": "Tell the writer agent what to change",
        "ai:AI_AGENT_CONTENT_PROPOSAL_TARGET": "Current entry",
        "ai:AI_AGENT_CONTENT_PROPOSAL_CREATE": "Create proposal",
        "ai:AI_AGENT_CONTENT_PROPOSAL_CREATING": "Creating...",
        "ai:AI_AGENT_CONTENT_PROPOSAL_CREATED": "Proposal awaiting approval",
        "ai:AI_AGENT_CONTENT_PROPOSAL_APPROVAL_ID": `Approval ${values?.approvalId ?? ""}`,
        "ai:AI_CONTEXT_RECOMMENDATION_CATALOG_LOADING": `${values?.description ?? ""} · Checking current agent settings`,
        "ai:AI_CONTEXT_RECOMMENDATION_WRITE_TOOLS_DISABLED": `${values?.description ?? ""} · Write-capable tools are disabled`,
        "ai:AI_CONTEXT_RECOMMENDATION_UNAVAILABLE": `${values?.description ?? ""} · Unavailable in current agent settings`,
      };
      return labels[key] ?? key;
    },
  }),
}));

function renderCard(props: { enabled?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AIContentProposalCard
        enabled={props.enabled ?? true}
        projectId="project-1"
        itemId="item-1"
      />
    </QueryClientProvider>,
  );
}

describe("AIContentProposalCard", () => {
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
          skillId: "content.writer",
          name: "Content Writer",
          description: "Draft content changes",
          mode: "agent",
          toolNames: [],
          readOnly: false,
          requiresApproval: true,
          enabled: true,
        },
      ],
    });
    vi.mocked(createAIAgentContentDraftProposal).mockResolvedValue({
      approval: { id: "approval-1", status: "pending" },
      model: "gpt-4o-mini",
      usage: {},
    } as never);
  });

  it("creates a content writer proposal for the explicit editor target", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.type(
      await screen.findByLabelText("Content proposal instruction"),
      "Tighten the intro",
    );
    await user.click(screen.getByRole("button", { name: /Create proposal/ }));

    await waitFor(() => {
      expect(createAIAgentContentDraftProposal).toHaveBeenCalledWith({
        projectId: "project-1",
        payload: {
          targetId: "item-1",
          instruction: "Tighten the intro",
          model: "gpt-4o-mini",
          reasoningEffort: "high",
        },
      });
    });
    expect(await screen.findByText("Proposal awaiting approval")).toBeInTheDocument();
    expect(screen.getByText("Approval approval-1")).toBeInTheDocument();
  });

  it("does not load Agent capabilities while disabled", () => {
    renderCard({ enabled: false });

    expect(screen.queryByText("Content proposal")).not.toBeInTheDocument();
    expect(listAIProjectAgents).not.toHaveBeenCalled();
  });

  it("omits the model when automatic selection is enabled", async () => {
    const user = userEvent.setup();
    useAiChatStore.setState({ selectedModel: AUTO_AI_CHAT_MODEL });
    renderCard();

    await user.type(await screen.findByLabelText("Content proposal instruction"), "Rewrite");
    await user.click(screen.getByRole("button", { name: /Create proposal/ }));

    await waitFor(() => {
      expect(createAIAgentContentDraftProposal).toHaveBeenCalledWith({
        projectId: "project-1",
        payload: {
          targetId: "item-1",
          instruction: "Rewrite",
          model: undefined,
          reasoningEffort: "high",
        },
      });
    });
  });

  it("explains why the writer skill is disabled", async () => {
    vi.mocked(listAIProjectAgents).mockResolvedValue({
      agents: [],
      tools: [],
      skills: [
        {
          skillId: "content.writer",
          name: "Content Writer",
          description: "Draft content changes",
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
      await screen.findByText("Current entry · Write-capable tools are disabled"),
    ).toBeInTheDocument();
    expect(createAIAgentContentDraftProposal).not.toHaveBeenCalled();
  });

  it("surfaces proposal errors", async () => {
    const user = userEvent.setup();
    vi.mocked(createAIAgentContentDraftProposal).mockRejectedValue(new Error("proposal failed"));

    renderCard();

    await user.type(await screen.findByLabelText("Content proposal instruction"), "Rewrite");
    await user.click(screen.getByRole("button", { name: /Create proposal/ }));

    expect(await screen.findByText("proposal failed")).toBeInTheDocument();
    expect(formatAIChatError).toHaveBeenCalled();
  });
});
