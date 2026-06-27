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
import { useAiChatStore } from "@/stores/use-ai-chat-store";

const { useRouterStateMock } = vi.hoisted(() => ({
  useRouterStateMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    useRouterState: useRouterStateMock,
  };
});

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
        "ai:AI_AGENT_CONTENT_PROPOSAL_CREATED": "Approval checkpoint created",
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
      <AIContentProposalCard enabled />
    </QueryClientProvider>,
  );
}

function mockContentItemRoute(pathname = "/projects/project-1/content/library/item-1/") {
  useRouterStateMock.mockImplementation((options?: { select?: (state: unknown) => unknown }) => {
    const state = { location: { pathname } };
    return options?.select ? options.select(state) : state;
  });
}

describe("AIContentProposalCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContentItemRoute();
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

  it("creates a content writer proposal for the current content item route", async () => {
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
    expect(await screen.findByText("Approval checkpoint created")).toBeInTheDocument();
  });

  it("does not render outside a content item route", () => {
    mockContentItemRoute("/projects/project-1/content/library/");

    renderCard();

    expect(screen.queryByText("Content proposal")).not.toBeInTheDocument();
    expect(listAIProjectAgents).not.toHaveBeenCalled();
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

    await waitFor(() => expect(listAIProjectAgents).toHaveBeenCalled());
    expect(screen.getByRole("region", { name: "Content proposal" })).toBeInTheDocument();
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
