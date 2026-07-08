import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/lib/config/app-config", () => ({
  getAppConfig: () => ({ apiBaseUrl: "", apiPrefix: "/api/v1" }),
}));

vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: {
    getState: () => ({ accessToken: null }),
  },
}));

import {
  approveAIAgentApproval,
  applyAIAgentApproval,
  cancelAIAgentRun,
  chat,
  chatStream,
  createAIAgentContentDryRun,
  createAIAgentContentDraftProposal,
  createAIAgentContentModelDraftProposal,
  executeAIWorkspaceAction,
  formatAIChatError,
  getAIMonthlyUsageSummary,
  ensureAIConversationPersistedForRuntime,
  listAIAgentActionableApprovals,
  listAIAgentApprovals,
  loadAIConversations,
  listAIProjectAgents,
  listAIModels,
  modifyAIAgentApproval,
  rejectAIAgentApproval,
  resumeAIAgentRun,
  resumeAIAgentRunForConversation,
  sendAIAgentMessage,
  toAIWorkspaceActionArtifact,
} from "@/api/ai";
import {
  DEFAULT_AI_AGENT_ID,
  DEFAULT_AI_CHAT_MODEL,
  useAiChatStore,
} from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

function sseResponse(chunks: string[], error?: Error): Response {
  const encoder = new TextEncoder();
  let index = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        const chunk = chunks[index];
        if (chunk) {
          index += 1;
          controller.enqueue(encoder.encode(chunk));
          return;
        }
        if (error) {
          controller.error(error);
          return;
        }
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

function conversationResponse(payload: Record<string, unknown>) {
  return {
    id: String(payload.id ?? "conversation-1"),
    workspaceId: String(payload.workspaceId ?? "workspace-1"),
    userId: "user-1",
    title: String(payload.title ?? "新对话"),
    mode: payload.mode ?? "agent",
    model: payload.model ?? DEFAULT_AI_CHAT_MODEL,
    reasoningEffort: payload.reasoningEffort ?? "medium",
    messages: payload.messages ?? [],
    projectId: payload.projectId ?? null,
    runtimeId: null,
    siteId: null,
    environmentId: null,
    contextSnapshot: payload.contextSnapshot ?? {},
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:01.000Z",
  };
}

describe("AI agent API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiPostMock.mockImplementation(async (path: string, payload: Record<string, unknown>) => {
      if (path === "/chat/conversations") return conversationResponse(payload);
      return {};
    });
    apiPatchMock.mockImplementation(async (_path: string, payload: Record<string, unknown>) =>
      conversationResponse(payload),
    );
    localStorage.clear();
    useAiChatStore.setState({
      conversations: [],
      activeId: null,
      streaming: false,
      selectedModel: DEFAULT_AI_CHAT_MODEL,
      selectedAgentId: DEFAULT_AI_AGENT_ID,
      composerMode: "agent",
      drawerOpen: false,
    });
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      lastWorkspaceId: "workspace-last",
      currentProjectId: "project-1",
    });
  });

  it("sends workspace context for non-streaming chat", async () => {
    apiPostMock.mockResolvedValue({
      id: "chat-1",
      model: "gpt-4o-mini",
      content: "done",
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: "stop",
    });

    await chat([{ role: "user", content: "Hello" }], { model: "gpt-4o-mini" });

    expect(apiPostMock).toHaveBeenCalledWith(
      "/chat",
      {
        messages: [{ role: "user", content: "Hello" }],
        workspaceId: "workspace-1",
        mode: "agent",
        model: "gpt-4o-mini",
        reasoningEffort: undefined,
        contextSnapshot: {
          pathname: "/",
          search: "",
          surface: "admin",
          surfaceHint: "admin",
        },
      },
      undefined,
    );
  });

  it("sends selected reasoning effort for non-streaming chat", async () => {
    apiPostMock.mockResolvedValue({
      id: "chat-2",
      model: "deepseek-v4-pro",
      content: "done",
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: "stop",
    });

    await chat([{ role: "user", content: "Hello" }], {
      model: "deepseek-v4-pro",
      reasoningEffort: "high",
    });

    expect(apiPostMock).toHaveBeenCalledWith(
      "/chat",
      {
        messages: [{ role: "user", content: "Hello" }],
        workspaceId: "workspace-1",
        mode: "agent",
        model: "deepseek-v4-pro",
        reasoningEffort: "high",
        contextSnapshot: {
          pathname: "/",
          search: "",
          surface: "admin",
          surfaceHint: "admin",
        },
      },
      undefined,
    );
  });

  it("sends workspace context for streaming chat", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const chunks: unknown[] = [];
    for await (const chunk of chatStream([{ role: "user", content: "Hello" }])) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([]);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/chat?stream=true");
    expect(JSON.parse(String(init.body))).toEqual({
      messages: [{ role: "user", content: "Hello" }],
      workspaceId: "workspace-1",
      mode: "agent",
      contextSnapshot: {
        pathname: "/",
        search: "",
        surface: "admin",
        surfaceHint: "admin",
      },
    });
  });

  it("streams explicit reasoning parts separately from text deltas", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'event: message.delta\ndata: {"reasoning":"checking context"}\n\n',
          'event: message.delta\ndata: {"content":"done"}\n\n',
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const chunks: unknown[] = [];
    for await (const chunk of chatStream([{ role: "user", content: "Hello" }])) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: "reasoning", text: "checking context" },
      { type: "text", text: "done" },
    ]);
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

  it("converts workspace action responses into persisted assistant artifacts", () => {
    const projectArtifact = toAIWorkspaceActionArtifact({
      kind: "tool_call",
      action: "create_project",
      status: "completed",
      content: "已创建项目",
      executionSteps: [],
      toolCalls: [
        {
          toolName: "workspace.create_site_structure",
          status: "completed",
          arguments: {
            routePath: "/",
            hierarchyRootItemId: "item-home",
            hierarchyNodeCount: 1,
            componentBindings: [
              { componentKey: "landing.hero", bindingKey: "headline" },
              { componentKey: "landing.hero", bindingKey: "subheading" },
              { componentKey: "landing.hero", bindingKey: "primaryCtaLabel" },
              { componentKey: "landing.sections", bindingKey: "sections" },
            ],
          },
        },
        {
          toolName: "workspace.publish_project_release",
          status: "completed",
          arguments: {
            releaseId: "release-1",
            releaseNumber: 1,
            selectionCount: 1,
          },
        },
      ],
      project: {
        id: "project-created",
        name: "内容实验室",
        slug: "project",
        description: null,
      },
      domain: {
        hostname: "project.arclayer.localhost",
      },
      contentModels: [
        {
          id: "model-page",
          workspaceId: "workspace-1",
          siteId: "site-1",
          singularKey: "page",
          pluralKey: "pages",
          name: "Page",
          description: "Routable website pages",
          modelKind: "collection",
        },
        {
          id: "model-block",
          workspaceId: "workspace-1",
          siteId: "site-1",
          singularKey: "reusableBlock",
          pluralKey: "reusableBlocks",
          name: "Reusable block",
          description: "Shared site sections",
          modelKind: "component",
        },
      ],
      contentItem: {
        id: "item-home",
        workspaceId: "workspace-1",
        siteId: "site-1",
        modelId: "model-page",
        modelKey: "page",
        title: "Homepage",
        slug: "home",
        locale: "en-US",
        status: "published",
        derivedStatus: "published",
      },
      contentItems: [
        {
          id: "item-home",
          workspaceId: "workspace-1",
          siteId: "site-1",
          modelId: "model-page",
          modelKey: "page",
          title: "Homepage",
          slug: "home",
          locale: "en-US",
          status: "published",
          derivedStatus: "published",
        },
      ],
      projects: [],
      sourceManifest: {
        files: [
          {
            path: "src/App.tsx",
            role: "entry",
            language: "typescriptreact",
          },
          {
            path: "src/index.css",
            role: "style",
            language: "css",
          },
        ],
      },
      release: null,
      total: null,
      navigation: { label: "打开编辑器", path: "/projects/project-created/editor" },
    });

    expect(projectArtifact).toEqual({
      type: "workspace_project_created",
      status: "completed",
      project: {
        id: "project-created",
        name: "内容实验室",
        slug: "project",
        description: null,
      },
      summary: {
        appEntryPath: "src/App.tsx",
        componentBindingCount: 4,
        contentItemCount: 1,
        contentModelCount: 2,
        domainHostname: null,
        editorPath: "/projects/project-created/editor",
        homepageItemId: "item-home",
        homepageTitle: "Homepage",
        hierarchyNodeCount: 1,
        releaseNumber: 1,
        releaseReady: true,
        routePath: "/",
        sourceFileCount: 2,
      },
      navigation: { label: "打开编辑器", path: "/projects/project-created/editor" },
    });

    const contentModelArtifact = toAIWorkspaceActionArtifact({
      kind: "tool_call",
      action: "create_content_model",
      status: "completed",
      content: "已创建内容模型",
      executionSteps: [],
      toolCalls: [],
      project: null,
      contentModel: {
        id: "model-1",
        workspaceId: "workspace-1",
        siteId: "site-1",
        singularKey: "article",
        pluralKey: "articles",
        name: "文章",
        description: null,
        modelKind: "collection_type",
      },
      contentModels: [],
      projects: [],
      total: null,
      navigation: {
        label: "编辑内容模型",
        path: "/projects/project-1/content/models/edit?modelId=model-1",
      },
    });

    expect(contentModelArtifact).toEqual({
      type: "workspace_content_model_created",
      status: "completed",
      contentModel: {
        id: "model-1",
        workspaceId: "workspace-1",
        siteId: "site-1",
        name: "文章",
        singularKey: "article",
        pluralKey: "articles",
        description: null,
        modelKind: "collection_type",
      },
      navigation: {
        label: "编辑内容模型",
        path: "/projects/project-1/content/models/edit?modelId=model-1",
      },
    });

    const contentModelsArtifact = toAIWorkspaceActionArtifact({
      kind: "tool_call",
      action: "create_content_model",
      status: "completed",
      content: "已创建内容模型",
      executionSteps: [],
      toolCalls: [],
      project: null,
      contentModel: {
        id: "model-1",
        workspaceId: "workspace-1",
        siteId: "site-1",
        singularKey: "article",
        pluralKey: "articles",
        name: "文章",
        description: null,
        modelKind: "collection_type",
      },
      contentModels: [
        {
          id: "model-1",
          workspaceId: "workspace-1",
          siteId: "site-1",
          singularKey: "article",
          pluralKey: "articles",
          name: "文章",
          description: null,
          modelKind: "collection_type",
        },
        {
          id: "model-2",
          workspaceId: "workspace-1",
          siteId: "site-1",
          singularKey: "caseStudy",
          pluralKey: "caseStudies",
          name: "案例展示",
          description: "管理客户案例。",
          modelKind: "collection_type",
        },
      ],
      projects: [],
      total: null,
      navigation: {
        label: "查看内容模型",
        path: "/projects/project-1/content/models",
      },
    });

    expect(contentModelsArtifact).toEqual({
      type: "workspace_content_models_created",
      status: "completed",
      contentModels: [
        {
          id: "model-1",
          workspaceId: "workspace-1",
          siteId: "site-1",
          singularKey: "article",
          pluralKey: "articles",
          name: "文章",
          description: null,
          modelKind: "collection_type",
        },
        {
          id: "model-2",
          workspaceId: "workspace-1",
          siteId: "site-1",
          singularKey: "caseStudy",
          pluralKey: "caseStudies",
          name: "案例展示",
          description: "管理客户案例。",
          modelKind: "collection_type",
        },
      ],
      navigation: {
        label: "查看内容模型",
        path: "/projects/project-1/content/models",
      },
    });

    const contentModelUpdateArtifact = toAIWorkspaceActionArtifact({
      kind: "tool_call",
      action: "update_content_model",
      status: "completed",
      content: "已更新内容模型",
      executionSteps: [],
      toolCalls: [
        {
          toolName: "workspace.update_content_model",
          status: "completed",
          arguments: { modelId: "model-2", name: "案例展示" },
        },
      ],
      project: null,
      contentModel: {
        id: "model-2",
        workspaceId: "workspace-1",
        siteId: "site-1",
        singularKey: "caseStudy",
        pluralKey: "caseStudies",
        name: "案例展示",
        description: "管理客户案例。",
        modelKind: "collection_type",
      },
      contentModels: [
        {
          id: "model-2",
          workspaceId: "workspace-1",
          siteId: "site-1",
          singularKey: "caseStudy",
          pluralKey: "caseStudies",
          name: "案例展示",
          description: "管理客户案例。",
          modelKind: "collection_type",
        },
      ],
      contentModelItems: [
        {
          id: "model-2",
          workspaceId: "workspace-1",
          siteId: "site-1",
          singularKey: "caseStudy",
          pluralKey: "caseStudies",
          name: "案例展示",
          description: "管理客户案例。",
          modelKind: "collection_type",
        },
      ],
      projects: [],
      total: 2,
      navigation: {
        label: "编辑内容模型",
        path: "/projects/project-1/content/models/edit?modelId=model-2",
      },
    });

    expect(contentModelUpdateArtifact).toEqual({
      type: "workspace_content_model_updated",
      status: "completed",
      contentModel: {
        action: "update_content_model",
        contentModel: {
          id: "model-2",
          workspaceId: "workspace-1",
          siteId: "site-1",
          singularKey: "caseStudy",
          pluralKey: "caseStudies",
          name: "案例展示",
          description: "管理客户案例。",
          modelKind: "collection_type",
        },
        contentModels: [
          {
            id: "model-2",
            workspaceId: "workspace-1",
            siteId: "site-1",
            singularKey: "caseStudy",
            pluralKey: "caseStudies",
            name: "案例展示",
            description: "管理客户案例。",
            modelKind: "collection_type",
          },
        ],
        contentModelItems: [
          {
            id: "model-2",
            workspaceId: "workspace-1",
            siteId: "site-1",
            singularKey: "caseStudy",
            pluralKey: "caseStudies",
            name: "案例展示",
            description: "管理客户案例。",
            modelKind: "collection_type",
          },
        ],
        modelCount: 2,
        deletedContentModelId: null,
      },
      navigation: {
        label: "编辑内容模型",
        path: "/projects/project-1/content/models/edit?modelId=model-2",
      },
    });

    const contentModelListArtifact = toAIWorkspaceActionArtifact({
      kind: "tool_call",
      action: "list_content_models",
      status: "completed",
      content: "已读取内容模型",
      executionSteps: [],
      toolCalls: [
        {
          toolName: "workspace.list_content_models",
          status: "completed",
          arguments: { query: "case" },
        },
      ],
      project: null,
      contentModel: null,
      contentModels: [],
      contentModelItems: [
        {
          id: "model-2",
          workspaceId: "workspace-1",
          siteId: "site-1",
          singularKey: "caseStudy",
          pluralKey: "caseStudies",
          name: "案例展示",
          description: "管理客户案例。",
          modelKind: "collection_type",
        },
      ],
      projects: [],
      total: 1,
      navigation: {
        label: "查看内容模型",
        path: "/projects/project-1/content/models",
      },
    });

    expect(contentModelListArtifact).toMatchObject({
      type: "workspace_content_model_updated",
      contentModel: {
        action: "list_content_models",
        modelCount: 1,
        contentModelItems: [
          expect.objectContaining({
            id: "model-2",
            singularKey: "caseStudy",
          }),
        ],
      },
    });

    const contentModelDeleteArtifact = toAIWorkspaceActionArtifact({
      kind: "tool_call",
      action: "delete_content_model",
      status: "completed",
      content: "已删除内容模型",
      executionSteps: [],
      toolCalls: [
        {
          toolName: "workspace.delete_content_model",
          status: "completed",
          arguments: { modelId: "model-2" },
        },
      ],
      project: null,
      contentModel: null,
      contentModels: [],
      contentModelItems: [],
      deletedContentModelId: "model-2",
      projects: [],
      total: 1,
      navigation: {
        label: "查看内容模型",
        path: "/projects/project-1/content/models",
      },
    });

    expect(contentModelDeleteArtifact).toEqual({
      type: "workspace_content_model_updated",
      status: "completed",
      contentModel: {
        action: "delete_content_model",
        contentModel: null,
        contentModels: [],
        contentModelItems: [],
        modelCount: 1,
        deletedContentModelId: "model-2",
      },
      navigation: {
        label: "查看内容模型",
        path: "/projects/project-1/content/models",
      },
    });

    const sourceArtifact = toAIWorkspaceActionArtifact({
      kind: "tool_call",
      action: "write_project_source_file",
      status: "completed",
      content: "已写入项目源码文件并发布新版本。",
      executionSteps: [],
      toolCalls: [],
      project: null,
      contentModels: [],
      projects: [],
      sourceFile: {
        path: "src/App.tsx",
        role: "entry",
        language: "typescriptreact",
        contents: "export function App() { return null; }\n",
      },
      release: {
        release: {
          releaseNumber: 9,
        },
      },
      total: null,
      navigation: {
        label: "打开编辑器",
        path: "/projects/project-1/editor",
      },
    });

    expect(sourceArtifact).toEqual({
      type: "workspace_project_source_updated",
      status: "completed",
      source: {
        action: "write_project_source_file",
        filePath: "src/App.tsx",
        fileCount: null,
        released: true,
        releaseNumber: 9,
      },
      navigation: {
        label: "打开编辑器",
        path: "/projects/project-1/editor",
      },
    });

    const readSourceArtifact = toAIWorkspaceActionArtifact({
      kind: "tool_call",
      action: "read_project_source",
      status: "completed",
      content: "已读取目标项目源码：`src/App.tsx`。",
      executionSteps: [],
      toolCalls: [],
      project: null,
      contentModels: [],
      projects: [],
      sourceFile: {
        path: "src/App.tsx",
        role: "entry",
        language: "typescriptreact",
        contents: "export function App() { return null; }\n",
      },
      total: null,
      navigation: {
        label: "打开编辑器",
        path: "/projects/project-1/editor",
      },
    });

    expect(readSourceArtifact).toEqual({
      type: "workspace_project_source_updated",
      status: "completed",
      source: {
        action: "read_project_source",
        filePath: "src/App.tsx",
        fileCount: null,
        released: false,
        releaseNumber: null,
      },
      navigation: {
        label: "打开编辑器",
        path: "/projects/project-1/editor",
      },
    });

    const contentItemArtifact = toAIWorkspaceActionArtifact({
      kind: "tool_call",
      action: "update_homepage",
      status: "completed",
      content: "已更新首页内容。",
      executionSteps: [],
      toolCalls: [],
      project: null,
      contentModels: [],
      projects: [],
      contentItem: {
        id: "item-home",
        workspaceId: "workspace-1",
        siteId: "site-1",
        modelId: "model-page",
        modelKey: "page",
        title: "Homepage",
        slug: "home",
        locale: "en-US",
        status: "published",
        derivedStatus: "published",
      },
      contentItems: [
        {
          id: "item-home",
          workspaceId: "workspace-1",
          siteId: "site-1",
          modelId: "model-page",
          modelKey: "page",
          title: "Homepage",
          slug: "home",
          locale: "en-US",
          status: "published",
          derivedStatus: "published",
        },
      ],
      contentVersion: {
        itemId: "item-home",
        versionNumber: 3,
        state: "published",
        changeSummary: "Refresh hero copy",
      },
      total: 1,
      navigation: {
        label: "打开编辑器",
        path: "/projects/project-1/editor",
      },
    });

    expect(contentItemArtifact).toEqual({
      type: "workspace_content_item_updated",
      status: "completed",
      content: {
        action: "update_homepage",
        contentItem: {
          id: "item-home",
          workspaceId: "workspace-1",
          siteId: "site-1",
          modelId: "model-page",
          modelKey: "page",
          title: "Homepage",
          slug: "home",
          locale: "en-US",
          status: "published",
          derivedStatus: "published",
        },
        contentItems: [
          {
            id: "item-home",
            workspaceId: "workspace-1",
            siteId: "site-1",
            modelId: "model-page",
            modelKey: "page",
            title: "Homepage",
            slug: "home",
            locale: "en-US",
            status: "published",
            derivedStatus: "published",
          },
        ],
        itemCount: 1,
        deletedContentItemId: null,
        versionNumber: 3,
        versionState: "published",
        published: true,
      },
      navigation: {
        label: "打开编辑器",
        path: "/projects/project-1/editor",
      },
    });

    const siteArtifact = toAIWorkspaceActionArtifact({
      kind: "tool_call",
      action: "update_homepage",
      status: "completed",
      content: "已更新首页内容、源码并发布新版本。",
      executionSteps: [],
      toolCalls: [],
      project: null,
      contentModels: [],
      projects: [],
      contentItem: {
        id: "item-home",
        workspaceId: "workspace-1",
        siteId: "site-1",
        modelId: "model-page",
        modelKey: "page",
        title: "Homepage",
        slug: "home",
        locale: "en-US",
        status: "published",
        derivedStatus: "published",
      },
      contentItems: [
        {
          id: "item-home",
          workspaceId: "workspace-1",
          siteId: "site-1",
          modelId: "model-page",
          modelKey: "page",
          title: "Homepage",
          slug: "home",
          locale: "en-US",
          status: "published",
          derivedStatus: "published",
        },
      ],
      contentVersion: {
        itemId: "item-home",
        versionNumber: 4,
        state: "published",
        changeSummary: "Refresh hero copy and source",
      },
      sourceManifest: {
        files: [
          { path: "src/App.tsx", role: "entry", language: "typescriptreact" },
          { path: "src/index.css", role: "style", language: "css" },
        ],
      },
      release: {
        release: {
          releaseNumber: 12,
        },
      },
      total: 1,
      navigation: {
        label: "打开编辑器",
        path: "/projects/project-1/editor",
      },
    });

    expect(siteArtifact).toEqual({
      type: "workspace_site_updated",
      status: "completed",
      site: {
        action: "update_homepage",
        content: {
          action: "update_homepage",
          contentItem: {
            id: "item-home",
            workspaceId: "workspace-1",
            siteId: "site-1",
            modelId: "model-page",
            modelKey: "page",
            title: "Homepage",
            slug: "home",
            locale: "en-US",
            status: "published",
            derivedStatus: "published",
          },
          contentItems: [
            {
              id: "item-home",
              workspaceId: "workspace-1",
              siteId: "site-1",
              modelId: "model-page",
              modelKey: "page",
              title: "Homepage",
              slug: "home",
              locale: "en-US",
              status: "published",
              derivedStatus: "published",
            },
          ],
          itemCount: 1,
          deletedContentItemId: null,
          versionNumber: 4,
          versionState: "published",
          published: true,
        },
        source: {
          action: "write_project_source_file",
          filePath: null,
          fileCount: 2,
          released: true,
          releaseNumber: 12,
        },
      },
      navigation: {
        label: "打开编辑器",
        path: "/projects/project-1/editor",
      },
    });

    const settingsArtifact = toAIWorkspaceActionArtifact({
      kind: "tool_call",
      action: "update_site_settings",
      status: "completed",
      content: "已更新网站配置。",
      executionSteps: [],
      toolCalls: [
        {
          toolName: "workspace.update_site_settings",
          status: "completed",
          arguments: {
            siteName: "ArcLayer 企业站",
            defaultTitle: "ArcLayer 企业站",
            googleAnalyticsMeasurementId: "G-1234567890",
          },
        },
      ],
      project: null,
      contentModels: [],
      projects: [],
      siteSettings: {
        value: {
          site: { name: "ArcLayer 企业站" },
        },
      },
      total: null,
      navigation: {
        label: "打开网站配置",
        path: "/projects/project-1/website/config",
      },
    });

    expect(settingsArtifact).toEqual({
      type: "workspace_site_settings_updated",
      status: "completed",
      settings: {
        changedFields: ["defaultTitle", "googleAnalyticsMeasurementId", "siteName"],
        fieldCount: 3,
      },
      navigation: {
        label: "打开网站配置",
        path: "/projects/project-1/website/config",
      },
    });

    const sourceSettingsArtifact = toAIWorkspaceActionArtifact({
      kind: "tool_call",
      action: "update_site_settings",
      status: "completed",
      content: "已更新项目源码配置。",
      executionSteps: [],
      toolCalls: [
        {
          toolName: "workspace.update_project_source_settings",
          status: "completed",
          arguments: {
            framework: "astro",
            sourceProvider: "git",
            buildCommand: "pnpm astro build",
          },
        },
      ],
      project: null,
      contentModels: [],
      projects: [],
      siteSettings: {
        value: {
          project_source: {
            framework: "astro",
            source_provider: "git",
          },
        },
      },
      total: null,
      navigation: {
        label: "打开项目配置",
        path: "/projects/project-1/settings/general",
      },
    });

    expect(sourceSettingsArtifact).toEqual({
      type: "workspace_project_source_updated",
      status: "completed",
      source: {
        action: "update_project_source_settings",
        filePath: null,
        fileCount: null,
        released: false,
        releaseNumber: null,
      },
      navigation: {
        label: "打开项目配置",
        path: "/projects/project-1/settings/general",
      },
    });
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
          labelKey: "ai:AI_CHAT_MODEL_DEEPSEEK_V4_PRO",
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

  it("stores backend-enriched conversation context snapshots", async () => {
    apiGetMock.mockResolvedValue({
      conversations: [
        conversationResponse({
          id: "conversation-context-1",
          title: "Review agent policy",
          contextSnapshot: {
            pathname: "/system/settings/agents",
            surface: "system-settings",
            recommendedMode: "plan",
            recommendedActions: ["review-agent-policy"],
          },
        }),
      ],
    });

    await loadAIConversations();

    expect(apiGetMock).toHaveBeenCalledWith(
      "/chat/conversations?workspaceId=workspace-1",
      undefined,
    );
    expect(useAiChatStore.getState().conversations[0]?.contextSnapshot).toMatchObject({
      surface: "system-settings",
      recommendedMode: "plan",
      recommendedActions: ["review-agent-policy"],
    });
  });

  it("persists metadata-only assistant messages required for agent recovery", async () => {
    useAiChatStore.getState().upsertConversation({
      id: "conversation-metadata-1",
      title: "Agent recovery",
      createdAt: 1,
      updatedAt: 1,
      messages: [
        { role: "user", content: "Recover the agent run" },
        {
          role: "assistant",
          content: "",
          agentCheckpointId: "run-1:checkpoint-only",
        },
        {
          role: "assistant",
          content: "",
          agentArtifact: {
            type: "agent_execution_plan",
            goal: "Recover",
            status: "planned",
            steps: [{ id: "step-1", title: "Load checkpoint", status: "planned" }],
          },
        },
        {
          role: "assistant",
          content: "",
          agentExecutionSummary: {
            toolNames: ["search_content"],
            promptTokens: 12,
            completionTokens: 18,
            totalTokens: 30,
          },
        },
        {
          role: "assistant",
          content: "",
          errorDetails: "Raw agent failure details",
        },
      ],
    });

    await ensureAIConversationPersistedForRuntime("conversation-metadata-1", {
      applyResponse: false,
    });

    expect(apiPatchMock).toHaveBeenLastCalledWith(
      "/chat/conversations/conversation-metadata-1?workspaceId=workspace-1",
      expect.objectContaining({
        messages: [
          { role: "user", content: "Recover the agent run" },
          {
            role: "assistant",
            content: "",
            agentCheckpointId: "run-1:checkpoint-only",
          },
          {
            role: "assistant",
            content: "",
            agentArtifact: {
              type: "agent_execution_plan",
              goal: "Recover",
              status: "planned",
              steps: [{ id: "step-1", title: "Load checkpoint", status: "planned" }],
            },
          },
          {
            role: "assistant",
            content: "",
            agentExecutionSummary: {
              toolNames: ["search_content"],
              promptTokens: 12,
              completionTokens: 18,
              totalTokens: 30,
            },
          },
          {
            role: "assistant",
            content: "",
            errorDetails: "Raw agent failure details",
          },
        ],
      }),
    );
  });

  it("persists a null project id after leaving project scope", async () => {
    useWorkspaceStore.setState({ currentProjectId: null });
    useAiChatStore.getState().upsertConversation({
      id: "conversation-system-1",
      title: "System settings",
      createdAt: 1,
      updatedAt: 1,
      messages: [{ role: "user", content: "Review AI settings" }],
    });

    await ensureAIConversationPersistedForRuntime("conversation-system-1", {
      applyResponse: false,
    });

    expect(apiPatchMock).toHaveBeenLastCalledWith(
      "/chat/conversations/conversation-system-1?workspaceId=workspace-1",
      expect.objectContaining({
        projectId: null,
      }),
    );
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

  it("formats workspace and key configuration errors from backend detail envelopes", () => {
    expect(
      formatAIChatError(
        JSON.stringify({
          detail: {
            message: "No valid LiteLLM virtual key available for this workspace",
            error: "AUTH_NO_KEY",
          },
        }),
      ),
    ).toContain("还没有可用的 AI 模型密钥");
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
    ).toContain("当前没有可用于对话的模型");

    expect(
      formatAIChatError({
        message: "No selectable AI models are configured for this workspace",
        error: "AI_MODEL_CATALOG_EMPTY",
      }),
    ).toContain("当前没有可用于对话的模型");
  });

  it("stores agent run id and completion status from the stream", async () => {
    window.history.pushState({}, "", "/system/settings/agents");
    apiGetMock.mockResolvedValue({
      id: "run-1",
      agentId: "content_analyzer",
      status: "completed",
      prompt: "Inspect content",
      result: {
        content: "done",
        plan: {
          type: "agent_execution_plan",
          goal: "Inspect content",
          status: "planned",
          steps: [{ id: "step-1", title: "Check current page", status: "planned" }],
          source: "agent.plan",
        },
      },
      toolOutputs: { get_content: { title: "Current page" } },
      events: [
        { event: "tool.completed", data: { toolName: "search_content" } },
        {
          event: "usage.partial",
          data: { usage: { prompt_tokens: 14, completion_tokens: 20 } },
        },
      ],
      langgraphThreadId: "agent-run:run-1",
      langgraphCheckpointNs: "project-agent",
      langgraphCheckpointId: "run-1:run.completed",
      langgraphCheckpointNode: "run.completed",
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'event: run.created\ndata: {"runId":"run-1","agentId":"content_analyzer","threadId":"agent-run:run-1"}\n\n',
            'event: tool.completed\ndata: {"toolName":"search_content"}\n\n',
            'event: message.delta\ndata: {"content":"done"}\n\n',
            'event: usage.partial\ndata: {"usage":{"prompt_tokens":14,"completion_tokens":20}}\n\n',
            'event: run.completed\ndata: {"runId":"run-1","threadId":"agent-run:run-1","checkpointId":"run-1:run.completed"}\n\n',
          ]),
        ),
    );
    const onRunCreated = vi.fn();
    const conversationId = useAiChatStore.getState().createConversation();

    await sendAIAgentMessage(conversationId, "Inspect content", {
      agentId: "content_builder",
      model: "gpt-4o-mini",
      reasoningEffort: "high",
      onRunCreated,
    });

    const init = (vi.mocked(fetch).mock.calls[0]?.[1] ?? {}) as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      agentId: "content_builder",
      model: "gpt-4o-mini",
      reasoningEffort: "high",
    });
    const conversation = useAiChatStore.getState().conversations[0];
    expect(onRunCreated).toHaveBeenCalledWith("run-1");
    expect(apiGetMock).toHaveBeenCalledWith("/projects/project-1/agents/runs/run-1", undefined);
    expect(conversation.messages).toEqual([
      { role: "user", content: "Inspect content" },
      {
        role: "assistant",
        content: "done",
        agentRunId: "run-1",
        agentStatus: "completed",
        agentThreadId: "agent-run:run-1",
        agentCheckpointId: "run-1:run.completed",
        agentArtifact: {
          type: "agent_execution_plan",
          goal: "Inspect content",
          status: "planned",
          steps: [{ id: "step-1", title: "Check current page", status: "planned" }],
          source: "agent.plan",
        },
        agentExecutionSummary: {
          toolNames: ["get_content", "search_content"],
          promptTokens: 14,
          completionTokens: 20,
          totalTokens: 34,
        },
      },
    ]);
    expect(apiPostMock).toHaveBeenCalledWith(
      "/chat/conversations",
      expect.objectContaining({
        id: conversationId,
        workspaceId: "workspace-1",
        title: "Inspect content",
        mode: "agent",
        projectId: "project-1",
        messages: [{ role: "user", content: "Inspect content" }],
      }),
    );
    const createPayload = apiPostMock.mock.calls.find(
      ([path]) => path === "/chat/conversations",
    )?.[1] as Record<string, unknown> | undefined;
    expect(createPayload?.contextSnapshot).toMatchObject({
      pathname: "/system/settings/agents",
      search: "",
      surfaceHint: "system-settings",
      surface: "system-settings",
      section: "agents",
    });
    expect(createPayload?.contextSnapshot).not.toHaveProperty("recommendedActions");
    expect(apiPatchMock).toHaveBeenLastCalledWith(
      `/chat/conversations/${conversationId}?workspaceId=workspace-1`,
      expect.objectContaining({
        messages: expect.arrayContaining([
          { role: "user", content: "Inspect content" },
          expect.objectContaining({
            role: "assistant",
            content: "done",
            agentRunId: "run-1",
            agentStatus: "completed",
            agentThreadId: "agent-run:run-1",
            agentCheckpointId: "run-1:run.completed",
            agentArtifact: expect.objectContaining({
              type: "agent_execution_plan",
              goal: "Inspect content",
            }),
            agentExecutionSummary: {
              toolNames: ["get_content", "search_content"],
              promptTokens: 14,
              completionTokens: 20,
              totalTokens: 34,
            },
          }),
        ]),
      }),
    );
  });

  it("sends current content item route facts without client-side recommendations", async () => {
    window.history.pushState({}, "", "/projects/project-1/content/library/item-1?locale=en-US");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sseResponse(['event: message.delta\ndata: {"content":"ok"}\n\n'])),
    );
    const conversationId = useAiChatStore.getState().createConversation();

    await sendAIAgentMessage(conversationId, "Improve this entry");

    const createPayload = apiPostMock.mock.calls.find(
      ([path]) => path === "/chat/conversations",
    )?.[1] as Record<string, unknown> | undefined;
    expect(createPayload?.contextSnapshot).toMatchObject({
      pathname: "/projects/project-1/content/library/item-1",
      search: "?locale=en-US",
      surfaceHint: "content-workbench",
      surface: "content-workbench",
      projectId: "project-1",
      entity: { type: "content-item", id: "item-1" },
    });
    expect(createPayload?.contextSnapshot).not.toHaveProperty("recommendedActions");
  });

  it("recovers a completed run when the stream disconnects after run.created", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse(
            ['event: run.created\ndata: {"runId":"run-2","agentId":"content_analyzer"}\n\n'],
            new Error("network down"),
          ),
        ),
    );
    apiGetMock.mockResolvedValue({
      id: "run-2",
      agentId: "content_analyzer",
      status: "completed",
      prompt: "Inspect content",
      result: { content: "recovered result" },
      toolOutputs: {},
      events: [],
      langgraphThreadId: "agent-run:run-2",
      langgraphCheckpointNs: "project-agent",
      langgraphCheckpointId: "run-2:run.completed",
      langgraphCheckpointNode: "run.completed",
    });
    const conversationId = useAiChatStore.getState().createConversation();

    await sendAIAgentMessage(conversationId, "Inspect content");

    expect(apiGetMock).toHaveBeenCalledWith("/projects/project-1/agents/runs/run-2", undefined);
    const assistant = useAiChatStore.getState().conversations[0]?.messages[1];
    expect(assistant).toMatchObject({
      role: "assistant",
      content: "recovered result",
      agentRunId: "run-2",
      agentStatus: "completed",
      agentThreadId: "agent-run:run-2",
      agentCheckpointId: "run-2:run.completed",
    });
  });

  it("stores failed agent runs from a run.failed stream event without prior run.created", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'event: run.failed\ndata: {"runId":"run-failed-1","threadId":"agent-run:run-failed-1","checkpointId":"run-failed-1:run.failed","errorCode":"TOOL_FAILED","errorMessage":"Tool failed"}\n\n',
          ]),
        ),
    );
    apiGetMock.mockResolvedValue({
      id: "run-failed-1",
      agentId: "content_analyzer",
      status: "failed",
      prompt: "Inspect content",
      result: null,
      toolOutputs: {},
      events: [],
      errorCode: "TOOL_FAILED",
      errorMessage: "Tool failed",
      langgraphThreadId: "agent-run:run-failed-1",
      langgraphCheckpointNs: "project-agent",
      langgraphCheckpointId: "run-failed-1:run.failed",
      langgraphCheckpointNode: "run.failed",
    });
    const conversationId = useAiChatStore.getState().createConversation();

    await sendAIAgentMessage(conversationId, "Inspect content");

    expect(apiGetMock).toHaveBeenCalledWith(
      "/projects/project-1/agents/runs/run-failed-1",
      undefined,
    );
    const assistant = useAiChatStore.getState().conversations[0]?.messages[1];
    expect(assistant).toMatchObject({
      role: "assistant",
      content: "",
      agentRunId: "run-failed-1",
      agentStatus: "failed",
      agentThreadId: "agent-run:run-failed-1",
      agentCheckpointId: "run-failed-1:run.failed",
      error: true,
      errorMessage: "Tool failed",
    });
    expect(assistant?.errorDetails).toContain("TOOL_FAILED");
    expect(apiPatchMock).toHaveBeenLastCalledWith(
      `/chat/conversations/${conversationId}?workspaceId=workspace-1`,
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "assistant",
            agentRunId: "run-failed-1",
            agentStatus: "failed",
            error: true,
            errorMessage: "Tool failed",
          }),
        ]),
      }),
    );
  });

  it("keeps a readable run.failed error when recovery also fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'event: run.failed\ndata: {"runId":"run-failed-recovery-1","threadId":"agent-run:run-failed-recovery-1","checkpointId":"run-failed-recovery-1:run.failed","errorCode":"TOOL_FAILED","errorMessage":"Tool failed"}\n\n',
          ]),
        ),
    );
    apiGetMock.mockRejectedValue(new Error("recovery failed"));
    const conversationId = useAiChatStore.getState().createConversation();

    await sendAIAgentMessage(conversationId, "Inspect content");

    const assistant = useAiChatStore.getState().conversations[0]?.messages[1];
    expect(assistant).toMatchObject({
      role: "assistant",
      content: "",
      agentRunId: "run-failed-recovery-1",
      agentStatus: "failed",
      agentThreadId: "agent-run:run-failed-recovery-1",
      agentCheckpointId: "run-failed-recovery-1:run.failed",
      error: true,
      errorMessage: "Tool failed",
    });
    expect(assistant?.errorMessage).not.toContain("run-failed-recovery-1");
    expect(assistant?.errorDetails).toContain("TOOL_FAILED");
    expect(assistant?.errorDetails).toContain("Agent run recovery failed: recovery failed");
  });

  it("persists failed run state when recovery after stream disconnect returns failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse(
            ['event: run.created\ndata: {"runId":"run-failed-2","agentId":"content_analyzer"}\n\n'],
            new Error("network down"),
          ),
        ),
    );
    apiGetMock.mockResolvedValue({
      id: "run-failed-2",
      agentId: "content_analyzer",
      status: "failed",
      prompt: "Inspect content",
      result: null,
      toolOutputs: {},
      events: [{ event: "message.delta", data: { content: "partial output" } }],
      errorCode: "MODEL_FAILED",
      errorMessage: "Model request failed",
      langgraphThreadId: "agent-run:run-failed-2",
      langgraphCheckpointNs: "project-agent",
      langgraphCheckpointId: "run-failed-2:run.failed",
      langgraphCheckpointNode: "run.failed",
    });
    const conversationId = useAiChatStore.getState().createConversation();

    await sendAIAgentMessage(conversationId, "Inspect content");

    const assistant = useAiChatStore.getState().conversations[0]?.messages[1];
    expect(assistant).toMatchObject({
      role: "assistant",
      content: "partial output",
      agentRunId: "run-failed-2",
      agentStatus: "failed",
      agentThreadId: "agent-run:run-failed-2",
      agentCheckpointId: "run-failed-2:run.failed",
      error: true,
      errorMessage: "Model request failed",
    });
    expect(assistant?.errorDetails).toContain("MODEL_FAILED");
    expect(assistant?.errorDetails).not.toContain("network down");
  });

  it("stores interrupted agent runs from the stream", async () => {
    const interrupt = {
      kind: "agent_run_approval",
      runId: "run-interrupt-1",
      agentId: "content_builder",
      mode: "build",
      prompt: "Build draft changes",
      toolOutputs: { search_content: { items: [] } },
      requiredDecision: "approved",
      interruptId: "interrupt-1",
      threadId: "agent-run:run-interrupt-1",
      checkpointId: "run-interrupt-1:run.interrupted",
    };
    apiGetMock.mockResolvedValue({
      id: "run-interrupt-1",
      agentId: "content_builder",
      status: "interrupted",
      prompt: "Build draft changes",
      result: null,
      toolOutputs: interrupt.toolOutputs,
      events: [
        { event: "approval.required", data: interrupt },
        { event: "run.interrupted", data: interrupt },
      ],
      langgraphThreadId: "agent-run:run-interrupt-1",
      langgraphCheckpointNs: "project-agent",
      langgraphCheckpointId: "run-interrupt-1:run.interrupted",
      langgraphCheckpointNode: "run.interrupted",
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'event: run.created\ndata: {"runId":"run-interrupt-1","agentId":"content_builder","threadId":"agent-run:run-interrupt-1"}\n\n',
            `event: approval.required\ndata: ${JSON.stringify(interrupt)}\n\n`,
            `event: run.interrupted\ndata: ${JSON.stringify(interrupt)}\n\n`,
          ]),
        ),
    );
    const conversationId = useAiChatStore.getState().createConversation();

    await sendAIAgentMessage(conversationId, "Build draft changes", {
      agentId: "content_builder",
    });

    const assistant = useAiChatStore.getState().conversations[0]?.messages[1];
    expect(assistant).toMatchObject({
      role: "assistant",
      content: "",
      agentRunId: "run-interrupt-1",
      agentStatus: "interrupted",
      agentThreadId: "agent-run:run-interrupt-1",
      agentCheckpointId: "run-interrupt-1:run.interrupted",
      agentInterrupt: interrupt,
    });
    expect(apiPatchMock).toHaveBeenLastCalledWith(
      `/chat/conversations/${conversationId}?workspaceId=workspace-1`,
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "assistant",
            agentStatus: "interrupted",
            agentInterrupt: interrupt,
          }),
        ]),
      }),
    );
  });

  it("posts agent resume decisions to the backend", async () => {
    apiPostMock.mockResolvedValue({
      id: "run-resume-1",
      agentId: "content_builder",
      status: "completed",
      prompt: "Build draft changes",
      result: { content: "resumed result" },
      toolOutputs: {},
      events: [],
      langgraphThreadId: "agent-run:run-resume-1",
      langgraphCheckpointNs: "project-agent",
      langgraphCheckpointId: "run-resume-1:run.completed",
      langgraphCheckpointNode: "run.completed",
    });

    await resumeAIAgentRun("project-1", "run-resume-1", {
      approved: true,
      comment: "Looks correct",
      metadata: { source: "thread" },
    });

    expect(apiPostMock).toHaveBeenCalledWith(
      "/projects/project-1/agents/runs/run-resume-1/resume",
      {
        approved: true,
        comment: "Looks correct",
        metadata: { source: "thread" },
      },
      undefined,
    );
  });

  it("resumes an interrupted conversation run and clears the checkpoint card", async () => {
    const interrupt = {
      kind: "agent_run_approval",
      runId: "run-resume-2",
      agentId: "content_builder",
      mode: "build" as const,
      prompt: "Build draft changes",
      toolOutputs: {},
      requiredDecision: "approved",
      threadId: "agent-run:run-resume-2",
      checkpointId: "run-resume-2:run.interrupted",
    };
    useAiChatStore.getState().upsertConversation({
      id: "conversation-resume-1",
      title: "Build draft changes",
      createdAt: 1,
      updatedAt: 1,
      messages: [
        { role: "user", content: "Build draft changes" },
        {
          role: "assistant",
          content: "",
          agentRunId: "run-resume-2",
          agentStatus: "interrupted",
          agentThreadId: "agent-run:run-resume-2",
          agentCheckpointId: "run-resume-2:run.interrupted",
          agentInterrupt: interrupt,
        },
      ],
    });
    apiPostMock.mockImplementation(async (path: string, payload: Record<string, unknown>) => {
      if (path === "/chat/conversations") return conversationResponse(payload);
      if (path === "/projects/project-1/agents/runs/run-resume-2/resume") {
        return {
          id: "run-resume-2",
          agentId: "content_builder",
          status: "completed",
          prompt: "Build draft changes",
          result: { content: "resumed result" },
          toolOutputs: {},
          events: [],
          langgraphThreadId: "agent-run:run-resume-2",
          langgraphCheckpointNs: "project-agent",
          langgraphCheckpointId: "run-resume-2:run.completed",
          langgraphCheckpointNode: "run.completed",
        };
      }
      return {};
    });

    await resumeAIAgentRunForConversation("conversation-resume-1", {
      runId: "run-resume-2",
      approved: true,
      comment: "Continue",
    });

    const assistant = useAiChatStore.getState().conversations[0]?.messages[1];
    expect(assistant).toMatchObject({
      role: "assistant",
      content: "resumed result",
      agentRunId: "run-resume-2",
      agentStatus: "completed",
      agentThreadId: "agent-run:run-resume-2",
      agentCheckpointId: "run-resume-2:run.completed",
    });
    expect(assistant?.agentInterrupt).toBeUndefined();
    expect(apiPostMock).toHaveBeenCalledWith(
      "/projects/project-1/agents/runs/run-resume-2/resume",
      {
        approved: true,
        comment: "Continue",
        metadata: { conversationId: "conversation-resume-1" },
      },
      undefined,
    );
    expect(apiPatchMock).toHaveBeenLastCalledWith(
      "/chat/conversations/conversation-resume-1?workspaceId=workspace-1",
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: "resumed result",
            agentStatus: "completed",
          }),
        ]),
      }),
    );
  });

  it("keeps interrupted checkpoint metadata when resume is rejected by permissions", async () => {
    const interrupt = {
      kind: "agent_run_approval",
      runId: "run-resume-permission-1",
      agentId: "content_builder",
      mode: "build" as const,
      prompt: "Build draft changes",
      toolOutputs: {},
      requiredDecision: "approved",
      threadId: "agent-run:run-resume-permission-1",
      checkpointId: "run-resume-permission-1:run.interrupted",
    };
    useAiChatStore.getState().upsertConversation({
      id: "conversation-resume-permission-1",
      title: "Build draft changes",
      createdAt: 1,
      updatedAt: 1,
      messages: [
        { role: "user", content: "Build draft changes" },
        {
          role: "assistant",
          content: "",
          agentRunId: "run-resume-permission-1",
          agentStatus: "interrupted",
          agentThreadId: "agent-run:run-resume-permission-1",
          agentCheckpointId: "run-resume-permission-1:run.interrupted",
          agentInterrupt: interrupt,
        },
      ],
    });
    apiPostMock.mockImplementation(async (path: string) => {
      if (path === "/projects/project-1/agents/runs/run-resume-permission-1/resume") {
        throw new Error(
          JSON.stringify({
            detail: {
              error: "PERMISSION_DENIED",
              message: "Permission denied",
            },
          }),
        );
      }
      return {};
    });

    await expect(
      resumeAIAgentRunForConversation("conversation-resume-permission-1", {
        runId: "run-resume-permission-1",
        approved: true,
        comment: "Continue",
      }),
    ).rejects.toThrow("PERMISSION_DENIED");

    const assistant = useAiChatStore.getState().conversations[0]?.messages[1];
    expect(assistant).toMatchObject({
      role: "assistant",
      content: "",
      agentRunId: "run-resume-permission-1",
      agentStatus: "interrupted",
      agentThreadId: "agent-run:run-resume-permission-1",
      agentCheckpointId: "run-resume-permission-1:run.interrupted",
      agentInterrupt: interrupt,
    });
    expect(apiPatchMock).not.toHaveBeenCalledWith(
      "/chat/conversations/conversation-resume-permission-1?workspaceId=workspace-1",
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            agentRunId: "run-resume-permission-1",
            agentStatus: "running",
          }),
        ]),
      }),
    );
  });

  it("calls the backend cancel endpoint for agent runs", async () => {
    apiPostMock.mockResolvedValue({
      id: "run-3",
      agentId: "content_analyzer",
      status: "cancelled",
      prompt: "Inspect content",
    });

    await cancelAIAgentRun("project-1", "run-3");

    expect(apiPostMock).toHaveBeenCalledWith(
      "/projects/project-1/agents/runs/run-3/cancel",
      undefined,
      undefined,
    );
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
