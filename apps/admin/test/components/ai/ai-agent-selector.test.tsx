import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listAIWorkspaceAgents, type AIWorkspaceAgentCatalogItem } from "@/api/ai";
import { AIAgentSelector } from "@/components/ai/ai-agent-selector";
import { DEFAULT_AI_AGENT_ID, useAiChatStore } from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

vi.mock("@/api/ai", () => ({
  listAIWorkspaceAgents: vi.fn(),
}));

const ANALYST_ID = "A1b2C3d4E5f6G7h8I9j0K1";
const ARCHITECT_ID = "B1c2D3e4F5g6H7i8J9k0L1";
const COORDINATOR_ID = "C1d2E3f4G5h6I7j8K9l0M1";
const STALE_AGENT_ID = "D1e2F3g4H5i6J7k8L9m0N1";

function catalogAgent(input: {
  agentId: string;
  slug: string;
  name: string;
  role: string;
  modes: AIWorkspaceAgentCatalogItem["supportedExecutionModes"];
  available?: boolean;
  unavailableReason?: string | null;
}): AIWorkspaceAgentCatalogItem {
  return {
    agentId: input.agentId,
    versionId: `v${input.agentId.slice(1)}`,
    assignmentId: `a${input.agentId.slice(1)}`,
    versionNumber: 1,
    slug: input.slug,
    name: input.name,
    role: input.role,
    description: `${input.name} description`,
    scope: "system",
    provenance: "arclayer_official",
    supportedExecutionModes: input.modes,
    collaborationAgentIds: [],
    toolGrants: [],
    available: input.available ?? true,
    unavailableReason: input.unavailableReason ?? null,
    isDefault: input.agentId === COORDINATOR_ID,
    isPinned: true,
  };
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        "ai:AI_AGENT_SELECT": "Select agent",
        "ai:AI_AGENT_LOADING": "Loading agents...",
        "ai:AI_AGENT_LOAD_FAILED": "Unable to load agents",
        "ai:AI_AGENT_EMPTY": "No enabled agents",
        "ai:AI_AGENT_WORKSPACE_REQUIRED": "Select a project first",
        "ai:AI_AGENT_SEARCH_PLACEHOLDER": "Search agents, roles, or capabilities…",
        "ai:AI_AGENT_SEARCH_LABEL": "Search agents",
        "ai:AI_AGENT_SEARCH_EMPTY": "No matching agents found.",
        "ai:AI_AGENT_ASSIGNED_GROUP": "Available agents",
        "ai:AI_AGENT_PROVENANCE_OFFICIAL": "Arclayer official",
        "ai:AI_AGENT_PROVENANCE_WORKSPACE": "Workspace",
        "ai:AI_AGENT_VERSION": "v1",
        "ai:AI_AGENT_SCOPE_SYSTEM": "System scope",
        "ai:AI_AGENT_SCOPE_WORKSPACE": "Workspace scope",
        "ai:AI_AGENT_UNAVAILABLE": "Currently unavailable",
        "ai:AI_AGENT_UNAVAILABLE_AGENTS_DISABLED": "Agent service is disabled",
        "ai:AI_AGENT_UNAVAILABLE_ASSIGNMENT_DISABLED": "This assignment is disabled",
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
    vi.mocked(listAIWorkspaceAgents).mockResolvedValue({
      defaultAgentId: COORDINATOR_ID,
      agents: [
        catalogAgent({
          agentId: ANALYST_ID,
          slug: "data-analyst",
          name: "Data Analyst",
          role: "data_analysis",
          modes: ["plan"],
        }),
        catalogAgent({
          agentId: ARCHITECT_ID,
          slug: "site-architect",
          name: "Site Architect",
          role: "information_architecture",
          modes: ["plan", "build"],
        }),
        catalogAgent({
          agentId: COORDINATOR_ID,
          slug: "arclayer-coordinator",
          name: "Arclayer Coordinator",
          role: "orchestrator",
          modes: ["plan", "build"],
        }),
      ],
    });
  });

  it("loads selectable agents from the backend catalog", async () => {
    const user = userEvent.setup();
    renderSelector();

    await waitFor(() => {
      expect(listAIWorkspaceAgents).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "project-1" }),
      );
    });
    await user.click(await screen.findByRole("button", { name: "Select agent" }));
    await user.click(await screen.findByRole("option", { name: /Site Architect/ }));

    expect(useAiChatStore.getState().selectedAgentId).toBe(ARCHITECT_ID);
  });

  it("exposes the Coordinator from the backend catalog", async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(await screen.findByRole("button", { name: "Select agent" }));
    await user.click(await screen.findByRole("option", { name: /Arclayer Coordinator/ }));

    expect(useAiChatStore.getState().selectedAgentId).toBe(COORDINATOR_ID);
  });

  it("filters the assigned catalog by agent name, role, description, or ID", async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(await screen.findByRole("button", { name: "Select agent" }));
    await user.type(screen.getByRole("combobox", { name: "Search agents" }), "architect");

    expect(await screen.findByRole("option", { name: /Site Architect/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Data Analyst/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Arclayer Coordinator/ })).not.toBeInTheDocument();
  });

  it("renders an explicit no-results state for an unmatched search", async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(await screen.findByRole("button", { name: "Select agent" }));
    await user.type(screen.getByRole("combobox", { name: "Search agents" }), "billing specialist");

    expect(await screen.findByText("No matching agents found.")).toBeInTheDocument();
  });

  it("keeps an unavailable selected agent visible with its catalog reason", async () => {
    const user = userEvent.setup();
    useAiChatStore.setState({ selectedAgentId: ANALYST_ID });
    vi.mocked(listAIWorkspaceAgents).mockResolvedValueOnce({
      defaultAgentId: null,
      agents: [
        catalogAgent({
          agentId: ANALYST_ID,
          slug: "data-analyst",
          name: "Data Analyst",
          role: "data_analysis",
          modes: ["plan"],
          available: false,
          unavailableReason: "assignment_disabled",
        }),
      ],
    });

    renderSelector();

    const trigger = await screen.findByRole("button", { name: "Select agent" });
    await waitFor(() => expect(trigger).toBeEnabled());
    expect(trigger).toHaveTextContent("Data Analyst");
    await user.click(trigger);

    const unavailable = await screen.findByRole("option", { name: /Data Analyst/ });
    expect(unavailable).toHaveAttribute("aria-disabled", "true");
    expect(unavailable).toHaveTextContent("This assignment is disabled");
    await user.click(unavailable);
    expect(useAiChatStore.getState().selectedAgentId).toBe(ANALYST_ID);
  });

  it("keeps a stale selection explicit instead of silently choosing the first agent", async () => {
    const user = userEvent.setup();
    useAiChatStore.setState({ selectedAgentId: STALE_AGENT_ID });
    vi.mocked(listAIWorkspaceAgents).mockResolvedValueOnce({
      defaultAgentId: COORDINATOR_ID,
      agents: [
        catalogAgent({
          agentId: COORDINATOR_ID,
          slug: "arclayer-coordinator",
          name: "Arclayer Coordinator",
          role: "orchestrator",
          modes: ["plan", "build"],
        }),
      ],
    });

    renderSelector();

    await screen.findByText("Select agent");
    const trigger = screen.getByRole("button", { name: "Select agent" });
    expect(trigger).toHaveTextContent("Select agent");
    expect(useAiChatStore.getState().selectedAgentId).toBe(STALE_AGENT_ID);

    await user.click(trigger);
    expect(await screen.findByRole("option", { name: /Arclayer Coordinator/ })).toBeInTheDocument();
    expect(useAiChatStore.getState().selectedAgentId).toBe(STALE_AGENT_ID);
  });

  it("uses the workspace catalog when no project is selected", async () => {
    const user = userEvent.setup();
    useWorkspaceStore.setState({ currentProjectId: null, lastProjectId: null });

    renderSelector();

    await waitFor(() =>
      expect(listAIWorkspaceAgents).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "workspace-1", projectId: null }),
      ),
    );
    const button = await screen.findByRole("button", { name: "Select agent" });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(await screen.findByRole("option", { name: /Data Analyst/ })).toBeInTheDocument();
  });

  it("does not expose a fake selectable agent without workspace context", async () => {
    useWorkspaceStore.setState({
      currentWorkspaceId: null,
      lastWorkspaceId: null,
      currentProjectId: null,
      lastProjectId: null,
    });

    renderSelector();

    const button = await screen.findByRole("button", { name: "Select agent" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Select a project first")).toBeInTheDocument();
    expect(listAIWorkspaceAgents).not.toHaveBeenCalled();
  });
});
