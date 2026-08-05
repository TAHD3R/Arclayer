import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { apiDeleteMock, apiGetMock, apiPatchMock, apiPostMock } = vi.hoisted(() => ({
  apiDeleteMock: vi.fn(),
  apiGetMock: vi.fn(),
  apiPatchMock: vi.fn(),
  apiPostMock: vi.fn(),
}));

vi.mock("@/lib/http", () => ({
  api: {
    delete: apiDeleteMock,
    get: apiGetMock,
    patch: apiPatchMock,
    post: apiPostMock,
  },
}));

import {
  approveAIAgentApproval,
  applyAIAgentApproval,
  createAIAgentContentDryRun,
  createAIAgentContentDraftProposal,
  createAIAgentContentModelDraftProposal,
  executeAIWorkspaceAction,
  formatAIChatError,
  getAIMonthlyUsageSummary,
  listAIAgentActionableApprovals,
  listAIAgentApprovals,
  listAIProjectAgents,
  listAIModels,
  modifyAIAgentApproval,
  rejectAIAgentApproval,
} from "@/api/ai";
import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

describe("AI agent API", () => {
  beforeAll(async () => {
    await initI18n(DEFAULT_LOCALE);
  });

  beforeEach(async () => {
    await i18n.changeLanguage(DEFAULT_LOCALE);
    vi.clearAllMocks();
    apiPostMock.mockResolvedValue({});
    apiPatchMock.mockResolvedValue({});
    localStorage.clear();
    useAiChatStore.setState({
      composerMode: "build",
    });
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      lastWorkspaceId: "workspace-last",
      currentProjectId: "project-1",
    });
  });

  it("executes workspace AI actions with current workspace and composer mode", async () => {
    useAiChatStore.setState({ composerMode: "plan" });
    apiPostMock.mockResolvedValue({
      kind: "tool_call",
      action: "create_project",
      status: "completed",
      content: "已创建项目",
      executionSteps: [],
      toolCalls: [],
      project: {
        id: "project-created",
        name: "内容实验室",
        slug: "project",
        description: "由 AI 创建",
      },
      contentModels: [],
      projects: [],
      total: null,
      navigation: { label: "打开编辑器", path: "/projects/project-created/editor" },
    });

    await executeAIWorkspaceAction("帮我创建一个随机项目", { projectId: "project-target" });

    expect(apiPostMock).toHaveBeenCalledWith(
      "/chat/workspace-actions",
      {
        workspaceId: "workspace-1",
        projectId: "project-target",
        message: "帮我创建一个随机项目",
        mode: "plan",
        conversationContext: [],
      },
      { signal: undefined },
    );
  });

  it("rejects workspace AI actions without a current workspace instead of falling back", async () => {
    useWorkspaceStore.setState({
      currentWorkspaceId: null,
      lastWorkspaceId: "workspace-last",
    });

    await expect(executeAIWorkspaceAction("create a project")).rejects.toThrow(
      "AI workspace actions require an active workspace context",
    );
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("loads selectable chat models from the backend catalog", async () => {
    apiGetMock.mockResolvedValue({
      defaultModel: "deepseek-v4-pro",
      defaultMode: "build",
      reasoningEffort: "medium",
      models: [
        {
          id: "deepseek-v4-pro",
          provider: "deepseek",
          label: "DeepSeek V4 Pro",
          labelI18n: { "zh-CN": "DeepSeek V4 专业版" },
          description: "Configured model description",
          descriptionI18n: { "zh-CN": "已配置的模型介绍" },
          providerIcon: {
            lightUrl: "/provider-icons/deepseek.svg",
            darkUrl: "/provider-icons/deepseek.svg",
          },
          available: true,
        },
      ],
    });

    const catalog = await listAIModels({ workspaceId: "workspace-1" });

    expect(apiGetMock).toHaveBeenCalledWith("/chat/models?workspaceId=workspace-1", undefined);
    expect(catalog.defaultModel).toBe("deepseek-v4-pro");
    expect(catalog.defaultMode).toBe("build");
    expect(catalog.reasoningEffort).toBe("medium");
    expect(catalog.models[0]?.id).toBe("deepseek-v4-pro");
    expect(catalog.models[0]?.providerIcon).toEqual({
      lightUrl: "/provider-icons/deepseek.svg",
      darkUrl: "/provider-icons/deepseek.svg",
    });
  });

  it("normalizes catalog entries created before localized model copy was added", async () => {
    apiGetMock.mockResolvedValue({
      defaultModel: "gpt-5.6-test",
      defaultMode: "build",
      reasoningEffort: "medium",
      models: [
        {
          id: "gpt-5.6-test",
          provider: "openai",
          label: "GPT-5.6 Test",
          description: "Configured test model",
          available: true,
        },
      ],
    });

    const catalog = await listAIModels({ workspaceId: "workspace-1" });

    expect(catalog.models[0]).toMatchObject({
      labelI18n: {},
      descriptionI18n: {},
    });
  });

  it("loads workspace monthly AI usage from the backend rollup", async () => {
    apiGetMock.mockResolvedValue({
      totalCostMicros: 1250000,
      totalRequests: 7,
      totalPromptTokens: 3000,
      totalCompletionTokens: 1200,
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      byModel: [],
    });

    const usage = await getAIMonthlyUsageSummary({
      workspaceId: "workspace-1",
      period: "2026-06",
    });

    expect(apiGetMock).toHaveBeenCalledWith(
      "/workspaces/workspace-1/usage?period=2026-06",
      undefined,
    );
    expect(usage.totalCostMicros).toBe(1250000);
    expect(usage.totalRequests).toBe(7);
  });

  it("loads project agent catalog from the backend", async () => {
    apiGetMock.mockResolvedValue({
      agents: [
        {
          agentId: "content_analyzer",
          name: "Content Analyzer",
          description: "Inspect content",
          mode: "agent",
          skillId: "content.analysis",
          toolNames: ["search_content"],
          readOnly: true,
          requiresApproval: false,
        },
      ],
      tools: [],
      skills: [],
    });

    const catalog = await listAIProjectAgents({ projectId: "project-1" });

    expect(apiGetMock).toHaveBeenCalledWith("/projects/project-1/agents", undefined);
    expect(catalog.agents[0]?.skillId).toBe("content.analysis");
  });

  it("formats known workspace AI errors through the current locale", () => {
    expect(
      formatAIChatError(
        JSON.stringify({
          detail: {
            message: "No valid LiteLLM virtual key available for this workspace",
            error: "AUTH_NO_KEY",
          },
        }),
      ),
    ).toBe(i18n.t("ai:AI_CHAT_ERROR_AUTH_NO_KEY"));

    expect(formatAIChatError("AGENT_SKILL_SELECTION_INVALID")).toBe(
      i18n.t("ai:AI_CHAT_ERROR_SKILL_SELECTION_INVALID"),
    );
  });

  it("formats model catalog errors from backend codes instead of raw messages", () => {
    expect(
      formatAIChatError(
        JSON.stringify({
          detail: {
            message: "No selectable AI models are configured for this workspace",
            error: "AI_MODEL_CATALOG_EMPTY",
          },
        }),
      ),
    ).toBe(i18n.t("ai:AI_CHAT_ERROR_MODEL_CATALOG_EMPTY"));

    expect(
      formatAIChatError({
        message: "No selectable AI models are configured for this workspace",
        error: "AI_MODEL_CATALOG_EMPTY",
      }),
    ).toBe(i18n.t("ai:AI_CHAT_ERROR_MODEL_CATALOG_EMPTY"));
  });

  it("uses a stable localized message for blank AI errors", () => {
    expect(formatAIChatError("")).toBe(i18n.t("ai:AI_CHAT_ERROR_GENERIC"));
    expect(formatAIChatError(null)).toBe(i18n.t("ai:AI_CHAT_ERROR_GENERIC"));
  });

  it("keeps unknown backend error messages visible", () => {
    const backendMessage = "The AI provider returned an unrecognized capacity state.";

    expect(
      formatAIChatError({ error: "UNRECOGNIZED_CAPACITY_STATE", message: backendMessage }),
    ).toBe(backendMessage);
  });

  it("surfaces i18n initialization and missing-key invariants", () => {
    const wasInitialized = i18n.isInitialized;
    i18n.isInitialized = false;
    try {
      expect(() => formatAIChatError("AUTH_NO_KEY")).toThrow(
        "AI error i18n invariant violated: i18n is not initialized",
      );
    } finally {
      i18n.isInitialized = wasInitialized;
    }

    const getResourceSpy = vi.spyOn(i18n, "getResource").mockReturnValue(undefined);
    try {
      expect(() => formatAIChatError("AUTH_NO_KEY")).toThrow(
        "AI error i18n invariant violated: missing ai.AI_CHAT_ERROR_AUTH_NO_KEY copy",
      );
    } finally {
      getResourceSpy.mockRestore();
    }
  });

  it("loads pending agent approvals from the backend", async () => {
    apiGetMock.mockResolvedValue({ approvals: [] });

    await listAIAgentApprovals({ projectId: "project-1", status: "pending" });

    expect(apiGetMock).toHaveBeenCalledWith(
      "/projects/project-1/agents/approvals?status=pending",
      undefined,
    );
  });

  it("loads actionable agent approvals by querying pending and approved statuses", async () => {
    apiGetMock
      .mockResolvedValueOnce({ approvals: [{ id: "approval-pending", status: "pending" }] })
      .mockResolvedValueOnce({ approvals: [{ id: "approval-approved", status: "approved" }] });

    const result = await listAIAgentActionableApprovals({ projectId: "project-1" });

    expect(apiGetMock).toHaveBeenNthCalledWith(
      1,
      "/projects/project-1/agents/approvals?status=pending",
      undefined,
    );
    expect(apiGetMock).toHaveBeenNthCalledWith(
      2,
      "/projects/project-1/agents/approvals?status=approved",
      undefined,
    );
    expect(result.approvals).toEqual([
      { id: "approval-pending", status: "pending" },
      { id: "approval-approved", status: "approved" },
    ]);
  });

  it("creates content dry-run approval checkpoints", async () => {
    apiPostMock.mockResolvedValue({ id: "approval-1", status: "pending" });

    await createAIAgentContentDryRun({
      projectId: "project-1",
      payload: {
        targetId: "item-1",
        fieldsSnapshot: { title: "Next" },
      },
    });

    expect(apiPostMock).toHaveBeenCalledWith(
      "/projects/project-1/agents/approvals/dry-run",
      {
        targetId: "item-1",
        fieldsSnapshot: { title: "Next" },
      },
      undefined,
    );
  });

  it("modifies pending content approval checkpoints", async () => {
    apiPatchMock.mockResolvedValue({ id: "approval-1", status: "pending" });

    await modifyAIAgentApproval({
      projectId: "project-1",
      approvalId: "approval-1",
      payload: {
        fieldsSnapshot: { title: "Reviewer title" },
        changeSummary: "Reviewer adjusted title",
      },
    });

    expect(apiPatchMock).toHaveBeenCalledWith(
      "/projects/project-1/agents/approvals/approval-1",
      {
        fieldsSnapshot: { title: "Reviewer title" },
        changeSummary: "Reviewer adjusted title",
      },
      undefined,
    );
  });

  it("modifies pending content model approval checkpoints", async () => {
    apiPatchMock.mockResolvedValue({ id: "approval-2", status: "pending" });

    await modifyAIAgentApproval({
      projectId: "project-1",
      approvalId: "approval-2",
      payload: {
        modelPatch: { name: "Article Reviewed" },
        changeSummary: "Reviewer adjusted schema",
      },
    });

    expect(apiPatchMock).toHaveBeenCalledWith(
      "/projects/project-1/agents/approvals/approval-2",
      {
        modelPatch: { name: "Article Reviewed" },
        changeSummary: "Reviewer adjusted schema",
      },
      undefined,
    );
  });

  it("creates AI content draft proposals", async () => {
    apiPostMock.mockResolvedValue({
      approval: { id: "approval-1", status: "pending" },
      model: "gpt-4o-mini",
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    });

    await createAIAgentContentDraftProposal({
      projectId: "project-1",
      payload: {
        targetId: "item-1",
        instruction: "Improve the summary",
        model: "gpt-4o-mini",
        reasoningEffort: "medium",
      },
    });

    expect(apiPostMock).toHaveBeenCalledWith(
      "/projects/project-1/agents/content-draft-proposals",
      {
        targetId: "item-1",
        instruction: "Improve the summary",
        model: "gpt-4o-mini",
        reasoningEffort: "medium",
      },
      undefined,
    );
  });

  it("creates AI content model draft proposals", async () => {
    apiPostMock.mockResolvedValue({
      approval: { id: "approval-1", status: "pending", targetType: "content_model" },
      model: "gpt-4o-mini",
      usage: { prompt_tokens: 10, completion_tokens: 20 },
      impactPreview: { previewToken: "signed-preview-token" },
    });

    await createAIAgentContentModelDraftProposal({
      projectId: "project-1",
      payload: {
        targetId: "model-1",
        instruction: "Add a summary field",
        model: "gpt-4o-mini",
        reasoningEffort: "medium",
      },
    });

    expect(apiPostMock).toHaveBeenCalledWith(
      "/projects/project-1/agents/content-model-draft-proposals",
      {
        targetId: "model-1",
        instruction: "Add a summary field",
        model: "gpt-4o-mini",
        reasoningEffort: "medium",
      },
      undefined,
    );
  });

  it("submits approval decisions to the backend", async () => {
    apiPostMock.mockResolvedValue({ id: "approval-1", status: "approved" });

    await approveAIAgentApproval({
      projectId: "project-1",
      approvalId: "approval-1",
      reason: "Looks correct",
    });
    await rejectAIAgentApproval({
      projectId: "project-1",
      approvalId: "approval-2",
      reason: "Needs revision",
    });

    expect(apiPostMock).toHaveBeenCalledWith(
      "/projects/project-1/agents/approvals/approval-1/approve",
      { reason: "Looks correct" },
      undefined,
    );
    expect(apiPostMock).toHaveBeenCalledWith(
      "/projects/project-1/agents/approvals/approval-2/reject",
      { reason: "Needs revision" },
      undefined,
    );
  });

  it("applies approved agent approvals through the backend", async () => {
    apiPostMock.mockResolvedValue({
      approval: { id: "approval-1", status: "applied" },
      version: { itemId: "item-1", versionNumber: 3, state: "draft" },
    });

    const result = await applyAIAgentApproval({ projectId: "project-1", approvalId: "approval-1" });

    expect(apiPostMock).toHaveBeenCalledWith(
      "/projects/project-1/agents/approvals/approval-1/apply",
      undefined,
      undefined,
    );
    expect(result.version?.versionNumber).toBe(3);
  });
});
