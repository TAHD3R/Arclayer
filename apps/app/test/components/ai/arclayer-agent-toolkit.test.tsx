import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ARCLAYER_AGENT_TOOL_NAMES,
  HumanRequestInputTool,
} from "@/components/ai/arclayer-agent-toolkit";
import { DesignGenerateTool } from "@/components/ai/design-generate-tool";
import { StyleGuideGenerateTool } from "@/components/ai/style-guide-generate-tool";
import { WireframeGenerateTool } from "@/components/ai/wireframe-generate-tool";
import { getProjectBuilderGeneration } from "@/api/project-builder";
import { getProjectDesignSystemConceptGeneration } from "@/api/project-design-systems";

vi.mock("@/api/project-builder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/project-builder")>();
  return {
    ...actual,
    getProjectBuilderGeneration: vi.fn(),
  };
});

vi.mock("@/api/project-design-systems", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/project-design-systems")>();
  return {
    ...actual,
    getProjectDesignSystemConceptGeneration: vi.fn(),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function toolProps(
  args: Record<string, unknown>,
  overrides: Partial<ToolCallMessagePartProps> = {},
): ToolCallMessagePartProps {
  return {
    toolCallId: "tool-call-1",
    toolName: "human.request_input",
    args,
    argsText: JSON.stringify(args),
    status: { type: "requires-action", reason: "interrupt" },
    addResult: vi.fn(),
    resume: vi.fn(),
    respondToApproval: vi.fn(),
    ...overrides,
  } as ToolCallMessagePartProps;
}

function renderStyleGuideTool(props: ToolCallMessagePartProps) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StyleGuideGenerateTool {...props} />
    </QueryClientProvider>,
  );
}

function renderWireframeTool(props: ToolCallMessagePartProps) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WireframeGenerateTool {...props} />
    </QueryClientProvider>,
  );
}

function renderDesignTool(props: ToolCallMessagePartProps) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DesignGenerateTool {...props} />
    </QueryClientProvider>,
  );
}

const styleGuideArgs = {
  objective: "Create two editorial Style Guide directions.",
  locale: "en-US",
  candidateCount: 2,
};

const styleGuideReference = {
  generationId: "generation-1",
  jobId: "job-1",
  projectId: "project-1",
  designSystemId: "design-system-1",
  baseVersionId: "version-2",
  baseRevisionId: "revision-4",
  status: "queued",
};

const wireframeArgs = {
  pageItemId: "home-page",
  objective: "Compose the page from its ordered section intents.",
  locale: "en-US",
  candidateCount: 2,
};

const wireframeReference = {
  generationId: "wireframe-generation-1",
  jobId: "wireframe-job-1",
  projectId: "project-1",
  baseRevisionId: "revision-1",
  targetStage: "wireframe",
  selectedPageId: "home-page",
  status: "queued",
};

const designArgs = {
  pageItemId: "home-page",
  objective: "Create a calm editorial visual direction.",
  locale: "en-US",
  candidateCount: 2,
};

const designReference = {
  generationId: "design-generation-1",
  jobId: "design-job-1",
  projectId: "project-1",
  baseRevisionId: "revision-1",
  targetStage: "design",
  selectedPageId: "home-page",
  status: "queued",
};

describe("arclayerAgentToolkit", () => {
  beforeEach(() => {
    vi.mocked(getProjectDesignSystemConceptGeneration).mockReset();
    vi.mocked(getProjectBuilderGeneration).mockReset();
  });

  it("renders the human question as normal assistant content", () => {
    render(
      <HumanRequestInputTool
        {...toolProps({ question: "What should the hero say?", responseType: "text", options: [] })}
      />,
    );

    expect(screen.getByText("What should the hero say?")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("normalizes escaped line breaks in the Agent question", () => {
    render(
      <HumanRequestInputTool
        {...toolProps({
          question: "Company?\\nIndustry?\\nMain pages?",
          responseType: "text",
          options: [],
        })}
      />,
    );

    const question = screen.getByText(
      (_content, element) =>
        element?.tagName === "P" && element.textContent?.includes("Company?") === true,
    );
    expect(question.textContent).toBe("Company?\nIndustry?\nMain pages?");
  });

  it("renders a single-select human question without a nested answer form", () => {
    render(
      <HumanRequestInputTool
        {...toolProps({
          question: "Choose a release policy",
          responseType: "single_select",
          options: ["Create a draft", "Publish now"],
        })}
      />,
    );

    expect(screen.getByText("Choose a release policy")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("surfaces malformed backend arguments instead of inventing an input fallback", () => {
    render(
      <HumanRequestInputTool
        {...toolProps({
          question: "Choose a release policy",
          responseType: "single_select",
          options: [],
        })}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("ai:AI_CHAT_HUMAN_TOOL_INVALID");
  });

  it("leaves running tool preparation to the thread loading indicator", () => {
    render(<HumanRequestInputTool {...toolProps({}, { status: { type: "running" } })} />);

    expect(screen.queryByText("ai:AI_CHAT_HUMAN_TOOL_PREPARING")).not.toBeInTheDocument();
  });

  it("records a one-time approval for durable Style Guide generation", async () => {
    const user = userEvent.setup();
    const respondToApproval = vi.fn();
    renderStyleGuideTool(
      toolProps(styleGuideArgs, {
        toolName: "builder.style_guide.generate",
        approval: { id: "approval-1" },
        respondToApproval,
      }),
    );

    await user.click(screen.getByRole("button", { name: "ai:AI_AGENT_APPROVAL_ALLOW_ONCE" }));

    expect(respondToApproval).toHaveBeenCalledWith({ approved: true });
  });

  it("records an explicit rejection without starting generation", async () => {
    const user = userEvent.setup();
    const respondToApproval = vi.fn();
    renderStyleGuideTool(
      toolProps(styleGuideArgs, {
        toolName: "builder.style_guide.generate",
        approval: { id: "approval-1" },
        respondToApproval,
      }),
    );

    await user.click(screen.getByRole("button", { name: "ai:AI_AGENT_APPROVAL_REJECT_ONCE" }));

    expect(respondToApproval).toHaveBeenCalledWith({
      approved: false,
      reason: "ai:AI_AGENT_APPROVAL_REASON_STYLE_GUIDE_REJECTED",
    });
    expect(getProjectDesignSystemConceptGeneration).not.toHaveBeenCalled();
  });

  it("shows the durable command starting after approval while the result is empty", () => {
    renderStyleGuideTool(
      toolProps(styleGuideArgs, {
        toolName: "builder.style_guide.generate",
        approval: { id: "approval-1", approved: true },
        status: { type: "complete" },
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("ai:AI_CHAT_STYLE_GUIDE_TOOL_STARTING");
  });

  it("surfaces a malformed durable reference as a protocol error", () => {
    renderStyleGuideTool(
      toolProps(styleGuideArgs, {
        toolName: "builder.style_guide.generate",
        approval: { id: "approval-1", approved: true },
        result: { generationId: "generation-1", status: "queued" },
        status: { type: "complete" },
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "ai:AI_CHAT_STYLE_GUIDE_TOOL_INVALID_RESULT_TITLE",
    );
  });

  it("polls and renders the authoritative completed generation projection", async () => {
    vi.mocked(getProjectDesignSystemConceptGeneration).mockResolvedValue({
      ...styleGuideReference,
      status: "succeeded",
      jobStatus: "succeeded",
      phase: "finalizing",
      statusKey: "ai:DESIGN_SYSTEM_CONCEPT_GENERATION_STATUS_FINALIZING",
      progressCompleted: 2,
      progressTotal: 2,
      candidates: [
        {
          candidateIndex: 0,
          summary: "Editorial restraint with high-contrast typography.",
          version: { versionNumber: 3 },
          validation: { status: "valid" },
        },
      ],
      failures: [],
      cancelRequestedAt: null,
      cancellationAcknowledgedAt: null,
      createdAt: "2026-07-21T10:00:00Z",
      updatedAt: "2026-07-21T10:01:00Z",
    } as never);

    renderStyleGuideTool(
      toolProps(styleGuideArgs, {
        toolName: "builder.style_guide.generate",
        approval: { id: "approval-1", approved: true },
        result: styleGuideReference,
        status: { type: "complete" },
      }),
    );

    expect(
      await screen.findByText("Editorial restraint with high-contrast typography."),
    ).toBeVisible();
    expect(screen.getByText("ai:AI_CHAT_STYLE_GUIDE_TOOL_VERSION")).toBeVisible();
    expect(getProjectDesignSystemConceptGeneration).toHaveBeenCalledWith(
      "project-1",
      "design-system-1",
      "generation-1",
      expect.any(AbortSignal),
    );
  });

  it("registers the backend Style Guide Tool with the exact provider-facing name", () => {
    expect(ARCLAYER_AGENT_TOOL_NAMES.has("builder.style_guide.generate")).toBe(true);
  });

  it("records a one-time approval for durable Wireframe generation", async () => {
    const user = userEvent.setup();
    const respondToApproval = vi.fn();
    renderWireframeTool(
      toolProps(wireframeArgs, {
        toolName: "builder.wireframe.generate",
        approval: { id: "approval-2" },
        respondToApproval,
      }),
    );

    await user.click(
      screen.getByRole("button", { name: "ai:AI_AGENT_APPROVAL_WIREFRAME_ALLOW_ONCE" }),
    );

    expect(respondToApproval).toHaveBeenCalledWith({ approved: true });
    expect(getProjectBuilderGeneration).not.toHaveBeenCalled();
  });

  it("records an explicit Wireframe rejection without reading or applying a candidate", async () => {
    const user = userEvent.setup();
    const respondToApproval = vi.fn();
    renderWireframeTool(
      toolProps(wireframeArgs, {
        toolName: "builder.wireframe.generate",
        approval: { id: "approval-2" },
        respondToApproval,
      }),
    );

    await user.click(
      screen.getByRole("button", { name: "ai:AI_AGENT_APPROVAL_WIREFRAME_REJECT_ONCE" }),
    );

    expect(respondToApproval).toHaveBeenCalledWith({
      approved: false,
      reason: "ai:AI_AGENT_APPROVAL_REASON_WIREFRAME_REJECTED",
    });
    expect(getProjectBuilderGeneration).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", "ai:AI_CHAT_WIREFRAME_TOOL_APPROVAL_EXPIRED"],
    ["cancelled", "ai:AI_CHAT_WIREFRAME_TOOL_APPROVAL_CANCELLED"],
  ] as const)("renders the distinct %s approval terminal state", (resolution, messageKey) => {
    renderWireframeTool(
      toolProps(wireframeArgs, {
        toolName: "builder.wireframe.generate",
        approval: { id: "approval-2", resolution },
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(messageKey);
  });

  it("keeps rejection and missing approval protocol states distinct", () => {
    const { rerender } = renderWireframeTool(
      toolProps(wireframeArgs, {
        toolName: "builder.wireframe.generate",
        approval: { id: "approval-2", approved: false },
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "ai:AI_CHAT_WIREFRAME_TOOL_REJECTED_TITLE",
    );

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <WireframeGenerateTool
          {...toolProps(wireframeArgs, {
            toolName: "builder.wireframe.generate",
            status: { type: "complete" },
          })}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "ai:AI_CHAT_WIREFRAME_TOOL_PROTOCOL_ERROR_TITLE",
    );
  });

  it("rejects a durable reference for a different Sitemap page", () => {
    renderWireframeTool(
      toolProps(wireframeArgs, {
        toolName: "builder.wireframe.generate",
        approval: { id: "approval-2", approved: true },
        result: { ...wireframeReference, selectedPageId: "about-page" },
        status: { type: "complete" },
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "ai:AI_CHAT_WIREFRAME_TOOL_INVALID_RESULT_TITLE",
    );
    expect(getProjectBuilderGeneration).not.toHaveBeenCalled();
  });

  it("polls and renders the authoritative Wireframe candidate without applying it", async () => {
    vi.mocked(getProjectBuilderGeneration).mockResolvedValue({
      generationId: "wireframe-generation-1",
      jobId: "wireframe-job-1",
      targetStage: "wireframe",
      status: "partial",
      jobStatus: "succeeded",
      phase: "completed",
      progressCompleted: 2,
      progressTotal: 2,
      candidates: [
        {
          candidateIndex: 0,
          changeSet: {
            operations: [{ type: "wireframe.section.configure" }],
            issues: [
              {
                severity: "blocker",
                code: "BUILDER_INTENT_UNKNOWN",
                messageKey: "errors:BUILDER_INTENT_UNKNOWN",
              },
              {
                severity: "warning",
                code: "BUILDER_INTENT_MISSING",
                messageKey: "errors:BUILDER_INTENT_MISSING",
              },
            ],
          },
        },
      ],
      failures: [
        {
          candidateIndex: 1,
          code: "BUILDER_PROVIDER_FAILED",
          messageKey: "errors:BUILDER_PROVIDER_FAILED",
        },
      ],
    } as never);

    renderWireframeTool(
      toolProps(wireframeArgs, {
        toolName: "builder.wireframe.generate",
        approval: { id: "approval-2", approved: true },
        result: wireframeReference,
        status: { type: "complete" },
      }),
    );

    expect(await screen.findByText("BUILDER_INTENT_UNKNOWN")).toBeVisible();
    expect(screen.getByText("BUILDER_INTENT_MISSING")).toBeVisible();
    expect(screen.getByText("BUILDER_PROVIDER_FAILED")).toBeVisible();
    expect(getProjectBuilderGeneration).toHaveBeenCalledWith(
      "project-1",
      "wireframe-generation-1",
      expect.any(AbortSignal),
    );
    expect(screen.queryByRole("button", { name: /apply/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "ai:AI_CHAT_WIREFRAME_TOOL_OPEN_EDITOR" }),
    ).toHaveAttribute("href", "/projects/project-1/editor?stage=wireframe&page=home-page");
  });

  it("registers the backend Wireframe Tool with the exact provider-facing name", () => {
    expect(ARCLAYER_AGENT_TOOL_NAMES.has("builder.wireframe.generate")).toBe(true);
  });

  it("records one-time approval and explicit rejection for durable Design generation", async () => {
    const user = userEvent.setup();
    const respondToApproval = vi.fn();
    const { rerender } = renderDesignTool(
      toolProps(designArgs, {
        toolName: "builder.design.generate",
        approval: { id: "approval-design" },
        respondToApproval,
      }),
    );

    await user.click(
      screen.getByRole("button", { name: "ai:AI_AGENT_APPROVAL_DESIGN_ALLOW_ONCE" }),
    );
    expect(respondToApproval).toHaveBeenCalledWith({ approved: true });

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <DesignGenerateTool
          {...toolProps(designArgs, {
            toolName: "builder.design.generate",
            approval: { id: "approval-design-reject" },
            respondToApproval,
          })}
        />
      </QueryClientProvider>,
    );
    await user.click(
      screen.getByRole("button", { name: "ai:AI_AGENT_APPROVAL_DESIGN_REJECT_ONCE" }),
    );
    expect(respondToApproval).toHaveBeenCalledWith({
      approved: false,
      reason: "ai:AI_AGENT_APPROVAL_REASON_DESIGN_REJECTED",
    });
    expect(getProjectBuilderGeneration).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", "ai:AI_CHAT_DESIGN_TOOL_APPROVAL_EXPIRED"],
    ["cancelled", "ai:AI_CHAT_DESIGN_TOOL_APPROVAL_CANCELLED"],
  ] as const)(
    "renders the distinct Design %s approval terminal state",
    (resolution, messageKey) => {
      renderDesignTool(
        toolProps(designArgs, {
          toolName: "builder.design.generate",
          approval: { id: "approval-design", resolution },
        }),
      );

      expect(screen.getByRole("alert")).toHaveTextContent(messageKey);
    },
  );

  it("rejects a Design result for another page and a missing approval protocol", () => {
    const { rerender } = renderDesignTool(
      toolProps(designArgs, {
        toolName: "builder.design.generate",
        approval: { id: "approval-design", approved: true },
        result: { ...designReference, selectedPageId: "about-page" },
        status: { type: "complete" },
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "ai:AI_CHAT_DESIGN_TOOL_INVALID_RESULT_TITLE",
    );

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <DesignGenerateTool
          {...toolProps(designArgs, {
            toolName: "builder.design.generate",
            status: { type: "complete" },
          })}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "ai:AI_CHAT_DESIGN_TOOL_PROTOCOL_ERROR_TITLE",
    );
  });

  it("polls and renders a durable Design candidate without exposing Apply", async () => {
    vi.mocked(getProjectBuilderGeneration).mockResolvedValue({
      generationId: "design-generation-1",
      jobId: "design-job-1",
      targetStage: "design",
      status: "partial",
      jobStatus: "succeeded",
      phase: "completed",
      progressCompleted: 2,
      progressTotal: 2,
      candidates: [
        {
          candidateIndex: 0,
          changeSet: {
            operations: [{ type: "design.initialize" }],
            affectedTargets: [{ targetType: "page", targetId: "home-page" }],
            issues: [{ severity: "warning", code: "DESIGN_WARNING", messageKey: "DESIGN_WARNING" }],
          },
        },
      ],
      failures: [],
    } as never);

    renderDesignTool(
      toolProps(designArgs, {
        toolName: "builder.design.generate",
        approval: { id: "approval-design", approved: true },
        result: designReference,
        status: { type: "complete" },
      }),
    );

    expect(await screen.findByText("ai:AI_CHAT_DESIGN_TOOL_WARNING_COUNT")).toBeVisible();
    expect(getProjectBuilderGeneration).toHaveBeenCalledWith(
      "project-1",
      "design-generation-1",
      expect.any(AbortSignal),
    );
    expect(screen.queryByRole("button", { name: /apply/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "ai:AI_CHAT_DESIGN_TOOL_OPEN_EDITOR" }),
    ).toHaveAttribute("href", "/projects/project-1/editor?stage=design&page=home-page");
  });

  it("registers the backend Design Tool with the exact provider-facing name", () => {
    expect(ARCLAYER_AGENT_TOOL_NAMES.has("builder.design.generate")).toBe(true);
  });
});
