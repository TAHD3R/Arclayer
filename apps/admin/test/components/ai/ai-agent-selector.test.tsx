import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listAIProjectAgents } from "@/api/ai";
import { AIAgentSelector } from "@/components/ai/ai-agent-selector";
import { DEFAULT_AI_AGENT_ID, useAiChatStore } from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

vi.mock("@/api/ai", () => ({
  listAIProjectAgents: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        "ai:AI_AGENT_SELECT": "Select agent",
        "ai:AI_AGENT_LOADING": "Loading agents...",
        "ai:AI_AGENT_LOAD_FAILED": "Unable to load agents",
        "ai:AI_AGENT_EMPTY": "No enabled agents",
        "ai:AI_AGENT_WORKSPACE_REQUIRED": "Select a project first",
        "ai:AI_AGENT_CONTENT_ANALYZER": "Content Analyzer",
        "ai:AI_AGENT_CONTENT_ANALYZER_DESC": "Inspect content",
        "ai:AI_AGENT_CONTENT_ADVISOR": "Content Advisor",
        "ai:AI_AGENT_CONTENT_ADVISOR_DESC": "Advise content",
        "ai:AI_AGENT_CONTENT_BUILDER": "Content Builder",
        "ai:AI_AGENT_CONTENT_BUILDER_DESC": "Build content plans",
        "ai:AI_AGENT_CONTENT_MODEL_ADVISOR": "Model Advisor",
        "ai:AI_AGENT_CONTENT_MODEL_ADVISOR_DESC": "Review models",
      };
      return labels[key] ?? key;
    },
  }),
}));

function renderSelector() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AIAgentSelector />
    </QueryClientProvider>,
  );
}

describe("AIAgentSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      lastWorkspaceId: "workspace-1",
      currentProjectId: "project-1",
      lastProjectId: "project-1",
    });
    useAiChatStore.setState({
      selectedAgentId: DEFAULT_AI_AGENT_ID,
    });
    vi.mocked(listAIProjectAgents).mockResolvedValue({
      agents: [
        {
          agentId: "content_analyzer",
          name: "Content Analyzer",
          description: "Inspect content and summarize findings",
          mode: "agent",
          skillId: "content.analysis",
          toolNames: ["search_content"],
          readOnly: true,
          requiresApproval: false,
        },
        {
          agentId: "content_model_advisor",
          name: "Model Advisor",
          description: "Review content model structure",
          mode: "agent",
          skillId: "content.modeling",
          toolNames: ["list_content_types"],
          readOnly: true,
          requiresApproval: false,
        },
        {
          agentId: "content_builder",
          name: "Content Builder",
          description: "Build implementation blueprints",
          mode: "build",
          skillId: "content.build",
          toolNames: ["search_content"],
          readOnly: true,
          requiresApproval: false,
        },
      ],
      tools: [],
      skills: [],
    });
  });

  it("loads selectable agents from the backend catalog", async () => {
    const user = userEvent.setup();
    renderSelector();

    await waitFor(() => {
      expect(listAIProjectAgents).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "project-1" }),
      );
    });
    await user.click(await screen.findByRole("button", { name: "Select agent" }));
    await user.click(await screen.findByRole("option", { name: /Model Advisor/ }));

    expect(useAiChatStore.getState().selectedAgentId).toBe("content_model_advisor");
  });

  it("exposes the builder agent from the backend catalog", async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(await screen.findByRole("button", { name: "Select agent" }));
    await user.click(await screen.findByRole("option", { name: /Content Builder/ }));

    expect(useAiChatStore.getState().selectedAgentId).toBe("content_builder");
  });

  it("syncs a stale selected agent to the first available backend agent", async () => {
    useAiChatStore.setState({ selectedAgentId: "content_writer" });
    vi.mocked(listAIProjectAgents).mockResolvedValueOnce({
      agents: [
        {
          agentId: "content_builder",
          name: "Content Builder",
          description: "Build implementation blueprints",
          mode: "build",
          skillId: "content.build",
          toolNames: ["search_content"],
          readOnly: true,
          requiresApproval: false,
        },
      ],
      tools: [],
      skills: [],
    });

    renderSelector();

    expect(await screen.findByText("Content Builder")).toBeInTheDocument();
    await waitFor(() => {
      expect(useAiChatStore.getState().selectedAgentId).toBe("content_builder");
    });
  });

  it("does not expose a fake selectable agent without project context", async () => {
    useWorkspaceStore.setState({ currentProjectId: null, lastProjectId: null });

    renderSelector();

    const button = await screen.findByRole("button", { name: "Select agent" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Select a project first")).toBeInTheDocument();
    expect(listAIProjectAgents).not.toHaveBeenCalled();
  });
});
