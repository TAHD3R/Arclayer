import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listAIWorkspaceAgents, type AIWorkspaceAgentCatalogItem } from "@/api/ai";
import { AgentLauncher } from "@/components/ai/agent-launcher";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const runtimeMocks = vi.hoisted(() => ({
  switchToNewThread: vi.fn(async () => undefined),
}));

const ANALYST_ID = "A1b2C3d4E5f6G7h8I9j0K1";
const COORDINATOR_ID = "B1c2D3e4F5g6H7i8J9k0L1";
const WRITER_ID = "C1d2E3f4G5h6I7j8K9l0M1";

function catalogAgent(input: {
  agentId: string;
  name: string;
  role: string;
  description: string;
  isPinned: boolean;
  isDefault?: boolean;
  available?: boolean;
  unavailableReason?: string | null;
}): AIWorkspaceAgentCatalogItem {
  return {
    agentId: input.agentId,
    versionId: `v${input.agentId.slice(1)}`,
    assignmentId: `a${input.agentId.slice(1)}`,
    versionNumber: 1,
    slug: input.name.toLowerCase().replaceAll(" ", "-"),
    name: input.name,
    role: input.role,
    description: input.description,
    scope: "system",
    provenance: "arclayer_official",
    supportedExecutionModes: ["plan"],
    collaborationAgentIds: [],
    toolGrants: ["search_content"],
    available: input.available ?? true,
    unavailableReason: input.unavailableReason ?? null,
    isDefault: input.isDefault ?? false,
    isPinned: input.isPinned,
  };
}

vi.mock("@assistant-ui/react", () => ({
  useAui: () => ({
    threads: () => ({ switchToNewThread: runtimeMocks.switchToNewThread }),
  }),
}));
vi.mock("@/api/ai", () => ({ listAIWorkspaceAgents: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const labels: Record<string, string> = {
        "ai:AI_AGENT_LAUNCHER_LABEL": "Start with an agent",
        "ai:AI_AGENT_LAUNCHER_START": `Start a new conversation with ${values?.name ?? ""}`,
        "ai:AI_AGENT_LAUNCHER_UNAVAILABLE": `${values?.name ?? ""} is unavailable: ${values?.reason ?? ""}`,
        "ai:AI_AGENT_LAUNCHER_ALL": "All agents",
        "ai:AI_AGENT_LAUNCHER_SEARCH_LABEL": "Search all agents",
        "ai:AI_AGENT_LAUNCHER_SEARCH_PLACEHOLDER": "Search agents, roles, or capabilities…",
        "ai:AI_AGENT_LAUNCHER_SEARCH_EMPTY": "No matching agents found.",
        "ai:AI_AGENT_LAUNCHER_ALL_GROUP": "Assigned agents",
        "ai:AI_AGENT_LAUNCHER_LOADING": "Loading assigned agents…",
        "ai:AI_AGENT_LAUNCHER_EMPTY": "No agents are configured for this scope.",
        "ai:AI_AGENT_LAUNCHER_FAILED": "The agent catalog could not be loaded.",
        "ai:AI_AGENT_LAUNCH_FAILED": "A new conversation could not be started. Try again.",
        "ai:AI_AGENT_LAUNCHER_RETRY": "Retry",
        "ai:AI_AGENT_LAUNCHER_PROJECT_REQUIRED": "Select a workspace to see its agents.",
        "ai:AI_AGENT_PROVENANCE_OFFICIAL": "Arclayer official",
        "ai:AI_AGENT_PROVENANCE_WORKSPACE": "Workspace",
        "ai:AI_AGENT_VERSION": "v1",
        "ai:AI_AGENT_UNAVAILABLE": "Currently unavailable",
        "ai:AI_AGENT_UNAVAILABLE_AGENTS_DISABLED": "Agent service is disabled",
        "ai:AI_AGENT_UNAVAILABLE_ASSIGNMENT_DISABLED": "This assignment is disabled",
      };
      return labels[key] ?? key;
    },
  }),
}));

function renderLauncher() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgentLauncher />
    </QueryClientProvider>,
  );
}

describe("AgentLauncher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      lastWorkspaceId: "workspace-1",
      currentProjectId: "project-1",
      lastProjectId: "project-1",
    });
    useAiChatStore.setState({
      selectedAgentId: ANALYST_ID,
      drawerOpen: false,
    });
    vi.mocked(listAIWorkspaceAgents).mockResolvedValue({
      defaultAgentId: COORDINATOR_ID,
      agents: [
        catalogAgent({
          agentId: ANALYST_ID,
          name: "Data Analyst",
          role: "data_analysis",
          description: "Inspect content and summarize findings",
          isPinned: false,
        }),
        catalogAgent({
          agentId: COORDINATOR_ID,
          name: "Arclayer Coordinator",
          role: "orchestrator",
          description: "Coordinate plans and implementation",
          isDefault: true,
          isPinned: true,
        }),
      ],
    });
  });

  it("starts one new normalized Thread from an assigned Agent avatar", async () => {
    const user = userEvent.setup();
    renderLauncher();

    const builder = await screen.findByRole("button", {
      name: "Start a new conversation with Arclayer Coordinator",
    });
    await user.click(builder);

    expect(useAiChatStore.getState().selectedAgentId).toBe(COORDINATOR_ID);
    expect(runtimeMocks.switchToNewThread).toHaveBeenCalledTimes(1);
    expect(useAiChatStore.getState().drawerOpen).toBe(true);
  });

  it("searches the complete catalog and starts an unpinned agent", async () => {
    const user = userEvent.setup();
    useAiChatStore.setState({ selectedAgentId: COORDINATOR_ID, drawerOpen: false });
    renderLauncher();

    await user.click(await screen.findByRole("button", { name: "All agents" }));
    await user.type(screen.getByRole("combobox", { name: "Search all agents" }), "data analyst");

    const analyst = await screen.findByRole("option", { name: /Data Analyst/ });
    expect(screen.queryByRole("option", { name: /Arclayer Coordinator/ })).toBeNull();
    await user.click(analyst);

    expect(useAiChatStore.getState().selectedAgentId).toBe(ANALYST_ID);
    expect(runtimeMocks.switchToNewThread).toHaveBeenCalledTimes(1);
    expect(useAiChatStore.getState().drawerOpen).toBe(true);
  });

  it("renders a clear no-results state in the complete catalog search", async () => {
    const user = userEvent.setup();
    renderLauncher();

    await user.click(await screen.findByRole("button", { name: "All agents" }));
    await user.type(
      screen.getByRole("combobox", { name: "Search all agents" }),
      "billing specialist",
    );

    expect(await screen.findByText("No matching agents found.")).toBeInTheDocument();
  });

  it("shows an unavailable catalog agent and prevents launching it", async () => {
    const user = userEvent.setup();
    vi.mocked(listAIWorkspaceAgents).mockResolvedValueOnce({
      defaultAgentId: null,
      agents: [
        catalogAgent({
          agentId: WRITER_ID,
          name: "Content Writer",
          role: "content_strategy",
          description: "Draft product copy",
          isPinned: false,
          available: false,
          unavailableReason: "assignment_disabled",
        }),
      ],
    });
    renderLauncher();

    await user.click(await screen.findByRole("button", { name: "All agents" }));
    const writer = await screen.findByRole("option", { name: /Content Writer/ });

    expect(writer).toHaveAttribute("aria-disabled", "true");
    expect(writer).toHaveTextContent("This assignment is disabled");
    await user.click(writer);
    expect(runtimeMocks.switchToNewThread).not.toHaveBeenCalled();
  });

  it("shows a real empty state without rendering fallback Agent buttons", async () => {
    vi.mocked(listAIWorkspaceAgents).mockResolvedValueOnce({
      defaultAgentId: null,
      agents: [],
    });

    renderLauncher();

    expect(await screen.findByText("No agents are configured for this scope.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start a new conversation with/ })).toBeNull();
  });

  it("surfaces a catalog failure and retries through the same query", async () => {
    const user = userEvent.setup();
    vi.mocked(listAIWorkspaceAgents)
      .mockRejectedValueOnce(new Error("catalog offline"))
      .mockResolvedValueOnce({ defaultAgentId: null, agents: [] });

    renderLauncher();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The agent catalog could not be loaded.",
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(listAIWorkspaceAgents).toHaveBeenCalledTimes(2));
  });

  it("shows product copy when a new Agent conversation cannot start", async () => {
    const user = userEvent.setup();
    runtimeMocks.switchToNewThread.mockRejectedValueOnce(new Error("thread adapter unavailable"));

    renderLauncher();
    await user.click(
      await screen.findByRole("button", {
        name: "Start a new conversation with Arclayer Coordinator",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A new conversation could not be started. Try again.",
    );
    expect(screen.queryByText("thread adapter unavailable")).not.toBeInTheDocument();
  });
});
