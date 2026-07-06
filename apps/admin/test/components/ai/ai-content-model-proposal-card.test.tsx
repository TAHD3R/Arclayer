import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { executeAIWorkspaceAction, formatAIChatError } from "@/api/ai";
import { AIContentModelProposalCard } from "@/components/ai/ai-content-model-proposal-card";

vi.mock("@/api/ai", () => ({
  executeAIWorkspaceAction: vi.fn(),
  formatAIChatError: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error),
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const labels: Record<string, string> = {
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL": "Model assistant",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_ACTION_PREFIX": `Update model ${values?.modelId ?? ""}`,
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_INSTRUCTION": "Model assistant instruction",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_PLACEHOLDER": "Ask AI to update this model",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_TARGET": "Can update this model",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_CREATE": "Apply with AI",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_CREATING": "Applying...",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_CREATED": "Model update applied",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_NO_UPDATE": "The assistant did not update this model.",
        "ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_UPDATED": "Model update applied",
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
    vi.mocked(executeAIWorkspaceAction).mockResolvedValue({
      kind: "tool_call",
      action: "update_content_model",
      status: "completed",
      content: "Updated the content model.",
      executionSteps: [],
      toolCalls: [],
      contentModel: {
        id: "model-1",
        workspaceId: "workspace-1",
        siteId: "site-1",
        singularKey: "caseStudy",
        pluralKey: "caseStudies",
        name: "Case Study",
        description: "Customer proof pages.",
        modelKind: "collection_type",
      },
      contentModels: [],
      projects: [],
      total: null,
      navigation: {
        label: "Open model",
        path: "/projects/project-1/content/models/edit?modelId=model-1",
      },
    });
  });

  it("updates the current content model through workspace actions", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.type(
      await screen.findByLabelText("Model assistant instruction"),
      "Rename it to Case Study and improve the description",
    );
    await user.click(screen.getByRole("button", { name: /Apply with AI/ }));

    await waitFor(() => {
      expect(executeAIWorkspaceAction).toHaveBeenCalledWith(
        ["Update model model-1", "", "Rename it to Case Study and improve the description"].join(
          "\n",
        ),
        {
          mode: "build",
          projectId: "project-1",
        },
      );
    });
    expect(await screen.findByText("Updated the content model.")).toBeInTheDocument();
  });

  it("surfaces workspace action errors", async () => {
    const user = userEvent.setup();
    vi.mocked(executeAIWorkspaceAction).mockRejectedValue(new Error("workspace action failed"));

    renderCard();

    await user.type(await screen.findByLabelText("Model assistant instruction"), "Rename");
    await user.click(screen.getByRole("button", { name: /Apply with AI/ }));

    expect(await screen.findByText("workspace action failed")).toBeInTheDocument();
    expect(formatAIChatError).toHaveBeenCalled();
  });

  it("requires an update_content_model response", async () => {
    const user = userEvent.setup();
    vi.mocked(executeAIWorkspaceAction).mockResolvedValue({
      kind: "chat",
      action: null,
      status: "completed",
      content: "No mutation executed.",
      executionSteps: [],
      toolCalls: [],
      contentModels: [],
      projects: [],
    });

    renderCard();

    await user.type(await screen.findByLabelText("Model assistant instruction"), "Rename");
    await user.click(screen.getByRole("button", { name: /Apply with AI/ }));

    expect(await screen.findByText("The assistant did not update this model.")).toBeInTheDocument();
  });
});
