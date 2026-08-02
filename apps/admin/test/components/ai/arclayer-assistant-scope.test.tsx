import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listAIWorkspaceAgents } from "@/api/ai";
import { ArclayerAssistantScope } from "@/components/ai/arclayer-assistant-scope";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const runtimeMocks = vi.hoisted(() => ({
  providerProps: null as Record<string, unknown> | null,
}));

const COORDINATOR_ID = "A1b2C3d4E5f6G7h8I9j0K1";

vi.mock("@/components/ai/arclayer-assistant-provider", () => ({
  ArclayerAssistantProvider: (props: Record<string, unknown> & { children?: ReactNode }) => {
    runtimeMocks.providerProps = props;
    return <div data-testid="assistant-provider">{props.children}</div>;
  },
}));
vi.mock("@/api/ai", () => ({ listAIWorkspaceAgents: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/i18n", () => ({
  DEFAULT_LOCALE: "en-US",
  i18n: { t: (key: string) => key },
}));

function renderScope() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ArclayerAssistantScope>
        {(state) => <div data-testid="assistant-availability">{state.status}</div>}
      </ArclayerAssistantScope>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

describe("ArclayerAssistantScope", () => {
  beforeEach(() => {
    runtimeMocks.providerProps = null;
    useAiChatStore.setState({ composerMode: "build", selectedAgentId: COORDINATOR_ID });
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      lastWorkspaceId: "workspace-1",
      currentProjectId: "project-1",
      lastProjectId: "project-1",
    });
    vi.mocked(listAIWorkspaceAgents).mockResolvedValue({
      defaultAgentId: COORDINATOR_ID,
      agents: [
        {
          agentId: COORDINATOR_ID,
          versionId: "B1c2D3e4F5g6H7i8J9k0L1",
          assignmentId: "C1d2E3f4G5h6I7j8K9l0M1",
          versionNumber: 1,
          slug: "arclayer-coordinator",
          name: "Arclayer Coordinator",
          role: "orchestrator",
          description: "Coordinate plans and implementation",
          scope: "system",
          provenance: "arclayer_official",
          supportedExecutionModes: ["plan", "build"],
          collaborationAgentIds: [],
          toolGrants: [],
          available: true,
          unavailableReason: null,
          isDefault: true,
          isPinned: true,
        },
      ],
    });
  });

  it("provides one normalized Thread runtime to the whole Admin scene", async () => {
    renderScope();

    await waitFor(() => {
      expect(screen.getByTestId("assistant-availability")).toHaveTextContent("ready");
      expect(runtimeMocks.providerProps).toMatchObject({
        workspaceId: "workspace-1",
        projectId: "project-1",
        leadAgentId: COORDINATOR_ID,
        executionMode: "build",
      });
    });
  });

  it("exposes the unavailable state without mounting a fake runtime", () => {
    useWorkspaceStore.setState({
      currentWorkspaceId: null,
      lastWorkspaceId: null,
      currentProjectId: null,
      lastProjectId: null,
    });

    renderScope();

    expect(screen.getByTestId("assistant-availability")).toHaveTextContent("unavailable");
    expect(runtimeMocks.providerProps).toBeNull();
  });

  it("adopts only the explicit server default when no Agent is selected", async () => {
    useAiChatStore.setState({ selectedAgentId: null });

    renderScope();

    await waitFor(() => {
      expect(useAiChatStore.getState().selectedAgentId).toBe(COORDINATOR_ID);
      expect(runtimeMocks.providerProps).toMatchObject({ leadAgentId: COORDINATOR_ID });
    });
  });

  it("uses the server default immediately when the persisted Agent is unavailable", async () => {
    useAiChatStore.setState({ selectedAgentId: "Z1y2X3w4V5u6T7s8R9q0P1" });

    renderScope();

    await waitFor(() => {
      expect(screen.getByTestId("assistant-availability")).toHaveTextContent("ready");
      expect(runtimeMocks.providerProps).toMatchObject({ leadAgentId: COORDINATOR_ID });
      expect(useAiChatStore.getState().selectedAgentId).toBe(COORDINATOR_ID);
    });
  });

  it("stops using cached Agent data when a catalog refresh fails", async () => {
    const { queryClient } = renderScope();

    await waitFor(() => {
      expect(screen.getByTestId("assistant-availability")).toHaveTextContent("ready");
      expect(screen.getByTestId("assistant-provider")).toBeInTheDocument();
    });

    vi.mocked(listAIWorkspaceAgents).mockRejectedValueOnce(new Error("catalog unavailable"));
    await queryClient.invalidateQueries({
      queryKey: ["ai", "workspace-agents", "workspace-1", "project-1"],
    });

    await waitFor(() => {
      expect(screen.getByTestId("assistant-availability")).toHaveTextContent("unavailable");
      expect(screen.queryByTestId("assistant-provider")).not.toBeInTheDocument();
    });
  });
});
