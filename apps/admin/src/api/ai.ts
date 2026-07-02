import { api } from "@/lib/http";
import { getAppConfig } from "@/lib/config/app-config";
import { i18n } from "@/lib/i18n";
import { useAuthStore } from "@/stores/use-auth-store";
import {
  useAiChatStore,
  type AIChatMessage as StoreAIChatMessage,
  type AIComposerMode,
  type AIReasoningEffort,
  type AIConversation,
  type AIAgentArtifactStep,
  type AIAgentInterrupt,
  type AIAgentMessageArtifact,
  type AIAgentRunStatus,
  type AIWorkspaceActionArtifact,
} from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

export interface AIChatResponse {
  id: string;
  model: string;
  content: string;
  usage: AIChatUsage;
  finish_reason: string;
}

export interface AIModelCatalogItem {
  id: string;
  provider: string;
  label: string;
  labelKey?: string | null;
  description?: string | null;
  descriptionKey?: string | null;
  available: boolean;
}

export interface AIModelCatalogResponse {
  defaultModel: string;
  defaultMode: AIComposerMode;
  reasoningEffort: AIReasoningEffort;
  models: AIModelCatalogItem[];
}

export type AIWorkspaceActionKind =
  | "create_project"
  | "create_content_model"
  | "list_projects"
  | "open_projects";

export interface AIWorkspaceActionNavigation {
  label: string;
  path: string;
}

export type AIWorkspaceActionResolutionKind = "tool_call" | "chat" | "clarification";

export type AIWorkspaceActionStatus =
  | "completed"
  | "planned"
  | "routed_to_chat"
  | "needs_clarification";

export interface AIWorkspaceActionExecutionStep {
  id: string;
  title: string;
  status: string;
  detail?: string | null;
  toolName?: string | null;
}

export interface AIWorkspaceActionToolCall {
  toolName: string;
  status: string;
  arguments: Record<string, unknown>;
}

export interface AIWorkspaceActionProject {
  id: string;
  workspaceId?: string | null;
  name: string;
  slug: string;
  description?: string | null;
}

export interface AIWorkspaceActionContentModel {
  id: string;
  workspaceId: string;
  siteId: string;
  singularKey: string;
  pluralKey: string;
  name: string;
  description?: string | null;
  modelKind: string;
}

export interface AIWorkspaceActionResponse {
  kind: AIWorkspaceActionResolutionKind;
  action?: AIWorkspaceActionKind | null;
  status: AIWorkspaceActionStatus;
  content: string;
  plan?: string | null;
  executionSteps: AIWorkspaceActionExecutionStep[];
  toolCalls: AIWorkspaceActionToolCall[];
  project?: AIWorkspaceActionProject | null;
  contentModel?: AIWorkspaceActionContentModel | null;
  projects: AIWorkspaceActionProject[];
  total?: number | null;
  navigation?: AIWorkspaceActionNavigation | null;
}

export type AISystemProviderCompatibility =
  | "openai"
  | "anthropic"
  | "deepseek"
  | "openai_compatible"
  | "anthropic_compatible";

export interface AISystemProvider {
  id: string;
  provider: string;
  label: string;
  compatibility: AISystemProviderCompatibility;
  isActive: boolean;
  hasVirtualKey: boolean;
  litellmKeyId?: string | null;
  baseUrl?: string | null;
  requestModel: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
}

export interface AISystemProviderListResponse {
  providers: AISystemProvider[];
}

export interface AISystemProviderCreateRequest {
  provider: string;
  label: string;
  compatibility: AISystemProviderCompatibility;
  providerApiKey: string;
  baseUrl?: string | null;
  requestModel: string;
  expiresAt?: string | null;
}

export interface AISystemProviderUpdateRequest {
  label?: string;
  compatibility?: AISystemProviderCompatibility;
  providerApiKey?: string;
  baseUrl?: string | null;
  requestModel?: string;
  isActive?: boolean;
  expiresAt?: string | null;
}

export interface AIUsageModelBreakdown {
  provider: string;
  model: string;
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  costMicros: number;
}

export interface AIMonthlyUsageSummary {
  totalCostMicros: number;
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  periodStart: string;
  periodEnd: string;
  byModel: AIUsageModelBreakdown[];
}

export interface AIAgentCatalogTool {
  name: string;
  description: string;
  readOnly: boolean;
  requiredPermission: string;
  inputSchema?: Record<string, unknown>;
}

export interface AIAgentCatalogSkill {
  skillId: string;
  name: string;
  description: string;
  mode: AIComposerMode;
  agentId?: string | null;
  toolNames: string[];
  readOnly: boolean;
  requiresApproval: boolean;
  enabled: boolean;
  disabledReason?: string | null;
  approvalPolicy?: string | null;
}

export interface AIAgentCatalogItem {
  agentId: string;
  name: string;
  description: string;
  mode: AIComposerMode;
  skillId: string;
  toolNames: string[];
  readOnly: boolean;
  requiresApproval: boolean;
}

export interface AIAgentCatalogResponse {
  agents: AIAgentCatalogItem[];
  tools: AIAgentCatalogTool[];
  skills: AIAgentCatalogSkill[];
}

export interface AIConversationResponse {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  mode: AIComposerMode;
  model?: string | null;
  reasoningEffort?: AIReasoningEffort | null;
  messages: StoreAIChatMessage[];
  projectId?: string | null;
  runtimeId?: string | null;
  siteId?: string | null;
  environmentId?: string | null;
  contextSnapshot?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AIConversationListResponse {
  conversations: AIConversationResponse[];
}

export interface AIChatOptions {
  signal?: AbortSignal;
  model?: string;
  reasoningEffort?: AIReasoningEffort;
  contextSnapshot?: Record<string, unknown>;
}

export type AIChatStreamPart = { type: "text"; text: string } | { type: "reasoning"; text: string };

export type AgentRunEventName =
  | "run.created"
  | "approval.required"
  | "run.interrupted"
  | "run.resumed"
  | "message.delta"
  | "tool.started"
  | "tool.completed"
  | "usage.partial"
  | "run.completed"
  | "run.cancelled"
  | "run.failed";

export interface AgentRunEvent {
  event: AgentRunEventName;
  data: Record<string, unknown>;
}

export type AgentRunStatus =
  | "queued"
  | "running"
  | "interrupted"
  | "completed"
  | "cancelled"
  | "failed";

export interface AgentRunState {
  id: string;
  agentId: string;
  status: AgentRunStatus;
  prompt: string;
  model?: string | null;
  result?: Record<string, unknown> | null;
  toolOutputs?: Record<string, unknown>;
  events?: AgentRunEvent[];
  cancellationRequested?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  langgraphThreadId: string;
  langgraphCheckpointNs: string;
  langgraphCheckpointId?: string | null;
  langgraphCheckpointNode?: string | null;
}

export interface AgentRunResumeRequest {
  approved: boolean;
  comment?: string | null;
  metadata?: Record<string, unknown>;
}

export type AgentApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "applied";
export type AgentApprovalTargetType = "content_item" | "content_model";

export interface AgentApprovalFieldChange {
  field: string;
  before?: unknown;
  after?: unknown;
}

export interface AgentApprovalDryRun {
  operation?: string;
  willApply?: boolean;
  requiresApproval?: boolean;
  expectedDraftVersion?: number;
  fieldChanges?: AgentApprovalFieldChange[];
  presentationReplacementCount?: number | null;
  [key: string]: unknown;
}

export interface AgentApprovalRecord {
  id: string;
  requesterUserId: string;
  approverUserId?: string | null;
  skillId: string;
  toolName?: string | null;
  action: string;
  targetType: AgentApprovalTargetType;
  targetId?: string | null;
  expectedDraftVersion?: number | null;
  targetSnapshot: Record<string, unknown>;
  proposedPatch: Record<string, unknown>;
  dryRun: AgentApprovalDryRun;
  status: AgentApprovalStatus;
  expiresAt: string;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  expiredAt?: string | null;
  appliedAt?: string | null;
  decisionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentApprovalListResponse {
  approvals: AgentApprovalRecord[];
}

export interface AgentApprovalApplyResponse {
  approval: AgentApprovalRecord;
  version?: {
    itemId: string;
    versionNumber: number;
    state: string;
    fieldsSnapshot?: Record<string, unknown>;
    presentations?: Array<Record<string, unknown>>;
    changeSummary?: string | null;
  } | null;
  model?: {
    id: string;
    workspaceId: string;
    siteId: string;
    singularKey: string;
    pluralKey: string;
    name: string;
    description?: string | null;
    draftContractRevision: number;
    publishedContractRevision?: number | null;
    impact: Record<string, unknown>;
  } | null;
}

export interface AgentContentApprovalDryRunRequest {
  skillId?: string;
  toolName?: string | null;
  action?: string;
  agentRunId?: string | null;
  targetType?: AgentApprovalTargetType;
  targetId: string;
  changeSummary?: string | null;
  fieldsSnapshot?: Record<string, unknown> | null;
  presentations?: Array<Record<string, unknown>> | null;
  expiresInSeconds?: number;
}

export interface AgentContentApprovalModifyRequest {
  changeSummary?: string | null;
  fieldsSnapshot?: Record<string, unknown>;
  presentations?: Array<Record<string, unknown>>;
  modelPatch?: Record<string, unknown>;
}

export interface AgentContentDraftProposalRequest {
  targetId: string;
  instruction: string;
  model?: string | null;
  reasoningEffort?: AIReasoningEffort | null;
  expiresInSeconds?: number;
}

export interface AgentContentDraftProposalResponse {
  approval: AgentApprovalRecord;
  model: string;
  usage: Record<string, unknown>;
}

export interface AgentContentModelDraftProposalRequest {
  targetId: string;
  instruction: string;
  model?: string | null;
  reasoningEffort?: AIReasoningEffort | null;
  expiresInSeconds?: number;
}

export interface AgentContentModelDraftProposalResponse {
  approval: AgentApprovalRecord;
  model: string;
  usage: Record<string, unknown>;
  impactPreview: Record<string, unknown>;
}

export interface AgentRunStreamOptions extends AIChatOptions {
  agentId: string;
  prompt: string;
  toolInputs?: Record<string, Record<string, unknown>>;
}

export interface SendAIAgentMessageOptions {
  signal?: AbortSignal;
  onRunCreated?: (runId: string) => void;
  projectId?: string | null;
  agentId?: string;
  model?: string;
  reasoningEffort?: AIReasoningEffort;
}

type ConversationPersistOptions = Readonly<{
  applyResponse?: boolean;
}>;

const MAX_AI_ERROR_DETAIL_LENGTH = 12_000;
const AI_ERROR_MESSAGE_KEYS: Record<string, { key: string; fallback: string }> = {
  AUTH_NO_KEY: {
    key: "AI_CHAT_ERROR_AUTH_NO_KEY",
    fallback:
      "当前工作区还没有可用的 AI 模型密钥。请先配置 LiteLLM virtual key，或在本地开发环境启用 AI mock 模式。",
  },
  AUTH_NOT_WORKSPACE_MEMBER: {
    key: "AI_CHAT_ERROR_AUTH_NOT_WORKSPACE_MEMBER",
    fallback: "AI 请求缺少有效的工作区上下文，请重新进入一个工作区后再试。",
  },
  AI_AGENT_PROJECT_CONTEXT_REQUIRED: {
    key: "AI_CHAT_ERROR_AGENT_PROJECT_CONTEXT_REQUIRED",
    fallback: "Agent 模式需要先进入一个项目。",
  },
  AI_AGENT_RESUME_PROJECT_CONTEXT_REQUIRED: {
    key: "AI_CHAT_ERROR_AGENT_RESUME_PROJECT_CONTEXT_REQUIRED",
    fallback: "继续 Agent 运行需要先进入原项目。",
  },
  AI_AGENT_APPROVAL_PROJECT_CONTEXT_REQUIRED: {
    key: "AI_CHAT_ERROR_AGENT_APPROVAL_PROJECT_CONTEXT_REQUIRED",
    fallback: "处理 Agent 审批需要先进入对应项目。",
  },
  AI_WORKSPACE_ACTION_PLAN_MODE_READ_ONLY: {
    key: "AI_CHAT_ERROR_WORKSPACE_ACTION_PLAN_MODE_READ_ONLY",
    fallback: "规划模式不会直接执行创建或修改操作。请切换到构建模式后再执行。",
  },
  AI_WORKSPACE_ACTION_PROJECT_REQUIRED: {
    key: "AI_CHAT_ERROR_WORKSPACE_ACTION_PROJECT_REQUIRED",
    fallback: "执行该操作需要先选择一个项目。请输入 @ 选择目标项目后再试。",
  },
  AI_MODEL_CATALOG_UNAVAILABLE: {
    key: "AI_CHAT_ERROR_MODEL_CATALOG_UNAVAILABLE",
    fallback: "暂时无法读取模型目录。请检查模型供应商配置后重试。",
  },
  AI_MODEL_CATALOG_MASTER_KEY_REQUIRED: {
    key: "AI_CHAT_ERROR_MODEL_CATALOG_MASTER_KEY_REQUIRED",
    fallback: "模型目录服务尚未完成配置。请先配置 LiteLLM 管理密钥。",
  },
  AI_MODEL_CATALOG_EMPTY: {
    key: "AI_CHAT_ERROR_MODEL_CATALOG_EMPTY",
    fallback: "当前没有可用于对话的模型。请在系统设置中新增并启用模型供应商。",
  },
  AI_MODEL_CATALOG_LITELLM_UNREACHABLE: {
    key: "AI_CHAT_ERROR_MODEL_CATALOG_LITELLM_UNREACHABLE",
    fallback: "暂时无法连接模型目录服务。请检查 LiteLLM 服务状态后重试。",
  },
  AI_MODEL_CATALOG_RESPONSE_INVALID: {
    key: "AI_CHAT_ERROR_MODEL_CATALOG_RESPONSE_INVALID",
    fallback: "模型目录返回的数据不符合预期。请检查 LiteLLM 模型配置。",
  },
};

export const AI_AGENT_PROJECT_CONTEXT_REQUIRED = "AI_AGENT_PROJECT_CONTEXT_REQUIRED";
export const AI_AGENT_RESUME_PROJECT_CONTEXT_REQUIRED = "AI_AGENT_RESUME_PROJECT_CONTEXT_REQUIRED";
export const AI_AGENT_APPROVAL_PROJECT_CONTEXT_REQUIRED =
  "AI_AGENT_APPROVAL_PROJECT_CONTEXT_REQUIRED";

export class AIChatRequestError extends Error {
  readonly details: string;
  readonly status?: number;

  constructor(message: string, details: string, status?: number) {
    super(message);
    this.name = "AIChatRequestError";
    this.details = details;
    this.status = status;
  }
}

function pickErrorMessage(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const code = pickErrorCode(record);
  if (code) {
    const message = translateAIErrorCode(code);
    if (message) return message;
  }

  if (typeof record.errorMessage === "string" && record.errorMessage.trim()) {
    return record.errorMessage.trim();
  }

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  const detail = record.detail;
  if (detail && typeof detail === "object") {
    const detailRecord = detail as Record<string, unknown>;
    const detailCode = pickErrorCode(detailRecord);
    if (detailCode) {
      const message = translateAIErrorCode(detailCode);
      if (message) return message;
    }
    if (typeof detailRecord.message === "string" && detailRecord.message.trim()) {
      return detailRecord.message.trim();
    }
  }

  const nested = record.error;
  if (nested && typeof nested === "object") {
    const nestedRecord = nested as Record<string, unknown>;
    if (typeof nestedRecord.message === "string" && nestedRecord.message.trim()) {
      return nestedRecord.message.trim();
    }
  }

  return null;
}

function pickErrorCode(record: Record<string, unknown>): string | null {
  if (typeof record.errorCode === "string" && record.errorCode.trim()) {
    return record.errorCode.trim();
  }
  if (typeof record.error === "string" && record.error.trim()) return record.error.trim();
  if (typeof record.code === "string" && record.code.trim()) return record.code.trim();

  const nested = record.error;
  if (nested && typeof nested === "object") {
    const nestedRecord = nested as Record<string, unknown>;
    if (typeof nestedRecord.code === "string" && nestedRecord.code.trim()) {
      return nestedRecord.code.trim();
    }
  }

  return null;
}

export function formatAIChatError(error: unknown): string {
  if (error && typeof error === "object") {
    const objectMessage = pickErrorMessage(error);
    if (objectMessage) return objectMessage;
  }

  const raw = error instanceof Error ? error.message : String(error || "");
  const trimmed = raw.trim();

  if (!trimmed) return "AI 请求失败";
  const codeMessage = translateAIErrorCode(trimmed);
  if (codeMessage) return codeMessage;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return pickErrorMessage(parsed) ?? trimmed;
  } catch {
    return trimmed;
  }
}

function translateAIErrorCode(code: string): string | null {
  const entry = AI_ERROR_MESSAGE_KEYS[code];
  if (!entry) return null;
  if (!i18n.isInitialized) return entry.fallback;
  const translated = i18n.t(entry.key, { ns: "ai", defaultValue: entry.fallback });
  return translated && translated !== entry.key ? translated : entry.fallback;
}

function formatAIChatErrorDetails(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const detail = (() => {
    try {
      return JSON.stringify(JSON.parse(trimmed) as unknown, null, 2);
    } catch {
      return trimmed;
    }
  })();

  if (detail.length <= MAX_AI_ERROR_DETAIL_LENGTH) return detail;
  return `${detail.slice(0, MAX_AI_ERROR_DETAIL_LENGTH)}\n\n[truncated error detail: showing first ${MAX_AI_ERROR_DETAIL_LENGTH} characters]`;
}

export function getAIChatErrorDetails(error: unknown): string {
  if (error instanceof AIChatRequestError) return error.details;
  if (error instanceof Error) return error.message;
  return String(error || "");
}

export async function chat(
  messages: AIChatMessage[],
  options?: AIChatOptions,
): Promise<AIChatResponse> {
  return api.post<AIChatResponse>(
    "/chat",
    buildChatRequestBody(messages, options),
    options?.signal ? { signal: options.signal } : undefined,
  );
}

export async function listAIModels(options: {
  workspaceId: string;
  signal?: AbortSignal;
}): Promise<AIModelCatalogResponse> {
  const query = new URLSearchParams({ workspaceId: options.workspaceId });
  return api.get<AIModelCatalogResponse>(
    `/chat/models?${query.toString()}`,
    options?.signal ? { signal: options.signal } : undefined,
  );
}

export async function getAIMonthlyUsageSummary(options: {
  workspaceId: string;
  period: string;
  signal?: AbortSignal;
}): Promise<AIMonthlyUsageSummary> {
  const query = new URLSearchParams({ period: options.period });
  return api.get<AIMonthlyUsageSummary>(
    `/workspaces/${encodeURIComponent(options.workspaceId)}/usage?${query.toString()}`,
    options.signal ? { signal: options.signal } : undefined,
  );
}

export async function listAISystemProviders(options?: {
  signal?: AbortSignal;
}): Promise<AISystemProviderListResponse> {
  return api.get<AISystemProviderListResponse>(
    "/system/ai/providers",
    options?.signal ? { signal: options.signal } : undefined,
  );
}

export async function createAISystemProvider(
  payload: AISystemProviderCreateRequest,
): Promise<AISystemProvider> {
  return api.post<AISystemProvider>("/system/ai/providers", payload);
}

export async function updateAISystemProvider(
  providerId: string,
  payload: AISystemProviderUpdateRequest,
): Promise<AISystemProvider> {
  return api.patch<AISystemProvider>(
    `/system/ai/providers/${encodeURIComponent(providerId)}`,
    payload,
  );
}

export async function deleteAISystemProvider(providerId: string): Promise<void> {
  await api.delete<null>(`/system/ai/providers/${encodeURIComponent(providerId)}`);
}

export async function listAIProjectAgents(options: {
  projectId: string;
  signal?: AbortSignal;
}): Promise<AIAgentCatalogResponse> {
  return api.get<AIAgentCatalogResponse>(
    `/projects/${encodeURIComponent(options.projectId)}/agents`,
    options.signal ? { signal: options.signal } : undefined,
  );
}

export function buildAIAgentApprovalsQueryKey(projectId: string | null | undefined) {
  return ["ai", "agent-approvals", projectId ?? null, "actionable"] as const;
}

export async function listAIAgentApprovals(options: {
  projectId: string;
  status?: AgentApprovalStatus;
  signal?: AbortSignal;
}): Promise<AgentApprovalListResponse> {
  const query = new URLSearchParams();
  if (options.status) query.set("status", options.status);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return api.get<AgentApprovalListResponse>(
    `/projects/${encodeURIComponent(options.projectId)}/agents/approvals${suffix}`,
    options.signal ? { signal: options.signal } : undefined,
  );
}

export async function listAIAgentActionableApprovals(options: {
  projectId: string;
  signal?: AbortSignal;
}): Promise<AgentApprovalListResponse> {
  const [pending, approved] = await Promise.all([
    listAIAgentApprovals({ ...options, status: "pending" }),
    listAIAgentApprovals({ ...options, status: "approved" }),
  ]);
  return { approvals: [...pending.approvals, ...approved.approvals] };
}

export async function createAIAgentContentDryRun(options: {
  projectId: string;
  payload: AgentContentApprovalDryRunRequest;
  signal?: AbortSignal;
}): Promise<AgentApprovalRecord> {
  return api.post<AgentApprovalRecord>(
    `/projects/${encodeURIComponent(options.projectId)}/agents/approvals/dry-run`,
    options.payload,
    options.signal ? { signal: options.signal } : undefined,
  );
}

export async function createAIAgentContentDraftProposal(options: {
  projectId: string;
  payload: AgentContentDraftProposalRequest;
  signal?: AbortSignal;
}): Promise<AgentContentDraftProposalResponse> {
  return api.post<AgentContentDraftProposalResponse>(
    `/projects/${encodeURIComponent(options.projectId)}/agents/content-draft-proposals`,
    options.payload,
    options.signal ? { signal: options.signal } : undefined,
  );
}

export async function createAIAgentContentModelDraftProposal(options: {
  projectId: string;
  payload: AgentContentModelDraftProposalRequest;
  signal?: AbortSignal;
}): Promise<AgentContentModelDraftProposalResponse> {
  return api.post<AgentContentModelDraftProposalResponse>(
    `/projects/${encodeURIComponent(options.projectId)}/agents/content-model-draft-proposals`,
    options.payload,
    options.signal ? { signal: options.signal } : undefined,
  );
}

export async function modifyAIAgentApproval(options: {
  projectId: string;
  approvalId: string;
  payload: AgentContentApprovalModifyRequest;
  signal?: AbortSignal;
}): Promise<AgentApprovalRecord> {
  return api.patch<AgentApprovalRecord>(
    `/projects/${encodeURIComponent(options.projectId)}/agents/approvals/${encodeURIComponent(options.approvalId)}`,
    options.payload,
    options.signal ? { signal: options.signal } : undefined,
  );
}

export async function approveAIAgentApproval(options: {
  projectId: string;
  approvalId: string;
  reason?: string | null;
  signal?: AbortSignal;
}): Promise<AgentApprovalRecord> {
  return api.post<AgentApprovalRecord>(
    `/projects/${encodeURIComponent(options.projectId)}/agents/approvals/${encodeURIComponent(options.approvalId)}/approve`,
    { reason: options.reason ?? undefined },
    options.signal ? { signal: options.signal } : undefined,
  );
}

export async function rejectAIAgentApproval(options: {
  projectId: string;
  approvalId: string;
  reason?: string | null;
  signal?: AbortSignal;
}): Promise<AgentApprovalRecord> {
  return api.post<AgentApprovalRecord>(
    `/projects/${encodeURIComponent(options.projectId)}/agents/approvals/${encodeURIComponent(options.approvalId)}/reject`,
    { reason: options.reason ?? undefined },
    options.signal ? { signal: options.signal } : undefined,
  );
}

export async function applyAIAgentApproval(options: {
  projectId: string;
  approvalId: string;
  signal?: AbortSignal;
}): Promise<AgentApprovalApplyResponse> {
  return api.post<AgentApprovalApplyResponse>(
    `/projects/${encodeURIComponent(options.projectId)}/agents/approvals/${encodeURIComponent(options.approvalId)}/apply`,
    undefined,
    options.signal ? { signal: options.signal } : undefined,
  );
}

export async function loadAIConversations(options?: { signal?: AbortSignal }): Promise<void> {
  const workspaceId = readCurrentWorkspaceId();
  if (!workspaceId) return;

  const query = new URLSearchParams({ workspaceId });
  const response = await api.get<AIConversationListResponse>(
    `/chat/conversations?${query.toString()}`,
    options?.signal ? { signal: options.signal } : undefined,
  );
  if (response.conversations.length === 0 && useAiChatStore.getState().conversations.length > 0) {
    return;
  }
  useAiChatStore.getState().replaceConversations(response.conversations.map(toStoreConversation));
}

export async function deleteAIConversation(conversationId: string): Promise<void> {
  const workspaceId = requireCurrentWorkspaceId();
  const query = new URLSearchParams({ workspaceId });
  await api.delete<null>(
    `/chat/conversations/${encodeURIComponent(conversationId)}?${query.toString()}`,
  );
  useAiChatStore.getState().deleteConversation(conversationId);
}

export async function renameAIConversation(conversationId: string, title: string): Promise<void> {
  await ensureAIConversationPersisted(conversationId);
  const workspaceId = requireCurrentWorkspaceId();
  const query = new URLSearchParams({ workspaceId });
  const response = await api.patch<AIConversationResponse>(
    `/chat/conversations/${encodeURIComponent(conversationId)}?${query.toString()}`,
    { title },
  );
  useAiChatStore.getState().upsertConversation(toStoreConversation(response));
}

export async function* chatStream(
  messages: AIChatMessage[],
  options?: AIChatOptions,
): AsyncGenerator<AIChatStreamPart> {
  const response = await fetch(buildApiUrl("/chat?stream=true"), {
    method: "POST",
    headers: buildStreamHeaders(),
    body: JSON.stringify(buildChatRequestBody(messages, options)),
    signal: options?.signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const raw = errorBody || `Chat API error: ${response.status} ${response.statusText}`;
    throw new AIChatRequestError(
      formatAIChatError(raw),
      formatAIChatErrorDetails(raw),
      response.status,
    );
  }

  if (!response.body) {
    throw new Error("Response body is empty");
  }

  for await (const event of readSseEvents(response)) {
    if (event.event === "error") {
      throw new AIChatRequestError(
        formatAIChatError(event.rawData),
        formatAIChatErrorDetails(event.rawData),
      );
    }
    if (event.event === "message.delta") {
      if (typeof event.data.reasoning === "string") {
        yield { type: "reasoning", text: event.data.reasoning };
      }
      if (typeof event.data.content === "string") {
        yield { type: "text", text: event.data.content };
      }
    }
  }
}

export async function executeAIWorkspaceAction(
  message: string,
  options?: { signal?: AbortSignal; projectId?: string | null },
): Promise<AIWorkspaceActionResponse> {
  const workspaceId = requireCurrentWorkspaceId();
  return api.post<AIWorkspaceActionResponse>(
    "/chat/workspace-actions",
    {
      workspaceId,
      projectId: options?.projectId ?? undefined,
      message,
      mode: useAiChatStore.getState().composerMode,
    },
    { signal: options?.signal },
  );
}

export function toAIWorkspaceActionArtifact(
  response: AIWorkspaceActionResponse,
): AIWorkspaceActionArtifact | undefined {
  if (response.kind !== "tool_call" || response.status !== "completed") return undefined;
  const navigation = response.navigation ?? undefined;
  if (response.action === "create_project" && response.project && navigation) {
    return {
      type: "workspace_project_created",
      status: response.status,
      project: toWorkspaceActionProject(response.project),
      navigation,
    };
  }
  if (response.action === "list_projects" && navigation) {
    return {
      type: "workspace_project_list",
      status: response.status,
      projects: response.projects.map(toWorkspaceActionProject),
      total: response.total ?? response.projects.length,
      navigation,
    };
  }
  if (response.action === "create_content_model" && response.contentModel && navigation) {
    return {
      type: "workspace_content_model_created",
      status: response.status,
      contentModel: {
        id: response.contentModel.id,
        name: response.contentModel.name,
        singularKey: response.contentModel.singularKey,
        pluralKey: response.contentModel.pluralKey,
        description: response.contentModel.description,
        modelKind: response.contentModel.modelKind,
      },
      navigation,
    };
  }
  if (response.action === "open_projects" && navigation) {
    return {
      type: "workspace_navigation",
      status: response.status,
      navigation,
    };
  }
  return undefined;
}

export async function* agentRunStream(
  projectId: string,
  options: AgentRunStreamOptions,
): AsyncGenerator<AgentRunEvent> {
  const response = await fetch(
    buildApiUrl(`/projects/${encodeURIComponent(projectId)}/agents/runs/stream`),
    {
      method: "POST",
      headers: buildStreamHeaders(),
      body: JSON.stringify({
        agentId: options.agentId,
        prompt: options.prompt,
        model: normalizeAIModelForRequest(options.model),
        reasoningEffort: options.reasoningEffort,
        toolInputs: options.toolInputs ?? {},
      }),
      signal: options.signal,
    },
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    const raw = errorBody || `Agent API error: ${response.status} ${response.statusText}`;
    throw new AIChatRequestError(
      formatAIChatError(raw),
      formatAIChatErrorDetails(raw),
      response.status,
    );
  }

  for await (const event of readSseEvents(response)) {
    if (event.event === "error") {
      throw new AIChatRequestError(
        formatAIChatError(JSON.stringify(event.data)),
        formatAIChatErrorDetails(JSON.stringify(event.data)),
      );
    }
    yield {
      event: event.event as AgentRunEventName,
      data: event.data,
    };
  }
}

export async function getAIAgentRun(
  projectId: string,
  runId: string,
  options?: { signal?: AbortSignal },
): Promise<AgentRunState> {
  return api.get<AgentRunState>(
    `/projects/${encodeURIComponent(projectId)}/agents/runs/${encodeURIComponent(runId)}`,
    options?.signal ? { signal: options.signal } : undefined,
  );
}

export async function cancelAIAgentRun(
  projectId: string,
  runId: string,
  options?: { signal?: AbortSignal },
): Promise<AgentRunState> {
  return api.post<AgentRunState>(
    `/projects/${encodeURIComponent(projectId)}/agents/runs/${encodeURIComponent(runId)}/cancel`,
    undefined,
    options?.signal ? { signal: options.signal } : undefined,
  );
}

export async function resumeAIAgentRun(
  projectId: string,
  runId: string,
  payload: AgentRunResumeRequest,
  options?: { signal?: AbortSignal },
): Promise<AgentRunState> {
  return api.post<AgentRunState>(
    `/projects/${encodeURIComponent(projectId)}/agents/runs/${encodeURIComponent(runId)}/resume`,
    payload,
    options?.signal ? { signal: options.signal } : undefined,
  );
}

export async function sendAIAgentMessage(
  conversationId: string,
  text: string,
  options?: SendAIAgentMessageOptions,
): Promise<void> {
  return sendAIAgentMessageWithSignal(conversationId, text, options);
}

export async function resumeAIAgentRunForConversation(
  conversationId: string,
  options: {
    runId: string;
    approved: boolean;
    comment?: string | null;
    signal?: AbortSignal;
  },
): Promise<void> {
  const projectId = useWorkspaceStore.getState().currentProjectId;
  if (!projectId) {
    throw new Error(AI_AGENT_RESUME_PROJECT_CONTEXT_REQUIRED);
  }

  const conversation = readConversation(conversationId);
  const message = conversation.messages.find(
    (item) => item.role === "assistant" && item.agentRunId === options.runId,
  );
  if (!message) {
    throw new Error(`AI conversation does not contain agent run: ${options.runId}`);
  }
  if (message.agentStatus !== "interrupted") {
    throw new Error(`Agent run is not interrupted: ${options.runId}`);
  }

  replaceLastAssistantMessage(conversationId, options.runId, {
    agentRunId: options.runId,
    agentStatus: "running",
    agentThreadId: message.agentThreadId,
    agentCheckpointId: message.agentCheckpointId,
    agentInterrupt: message.agentInterrupt,
  });
  useAiChatStore.getState().setStreaming(true);

  try {
    const run = await resumeAIAgentRun(
      projectId,
      options.runId,
      {
        approved: options.approved,
        comment: options.comment ?? undefined,
        metadata: { conversationId },
      },
      options.signal ? { signal: options.signal } : undefined,
    );
    applyAIAgentRunStateToConversation(conversationId, options.runId, run);
    await saveAIConversationSnapshot(conversationId);
  } catch (err) {
    replaceLastAssistantMessage(conversationId, options.runId, {
      agentRunId: options.runId,
      agentStatus: "interrupted",
      agentThreadId: message.agentThreadId,
      agentCheckpointId: message.agentCheckpointId,
      agentInterrupt: message.agentInterrupt,
    });
    throw err;
  } finally {
    useAiChatStore.getState().setStreaming(false);
  }
}

async function sendAIAgentMessageWithSignal(
  conversationId: string,
  text: string,
  options?: SendAIAgentMessageOptions,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const state = useAiChatStore.getState();
  const projectId = options?.projectId ?? useWorkspaceStore.getState().currentProjectId;
  if (!projectId) {
    throw new Error(AI_AGENT_PROJECT_CONTEXT_REQUIRED);
  }

  const conversation = state.conversations.find((c) => c.id === conversationId);
  if (!conversation) {
    throw new Error(`AI conversation not found: ${conversationId}`);
  }

  const agentId = options?.agentId ?? state.selectedAgentId;
  state.appendMessage(conversationId, { role: "user", content: trimmed });
  state.appendDelta(conversationId, "");
  state.setStreaming(true);
  let activeRunId: string | null = null;
  const liveExecutionSummary = createMutableExecutionSummary();

  try {
    await ensureAIConversationPersisted(conversationId, { applyResponse: false });
    await saveAIConversationSnapshot(conversationId, { applyResponse: false });
    for await (const event of agentRunStream(projectId, {
      agentId,
      prompt: trimmed,
      model: options?.model ?? state.selectedModel,
      reasoningEffort: options?.reasoningEffort ?? state.selectedReasoningEffort,
      toolInputs: buildAgentToolInputs(agentId, trimmed),
      signal: options?.signal,
    })) {
      if (event.event === "run.created") {
        const runId = readRunId(event.data);
        if (runId) {
          activeRunId = runId;
          options?.onRunCreated?.(runId);
          useAiChatStore.getState().setLastAssistantAgentRun(conversationId, {
            runId,
            status: "running",
            threadId: readStringEventValue(event.data.threadId),
          });
        }
      }
      if (event.event === "message.delta" && typeof event.data.reasoning === "string") {
        useAiChatStore.getState().appendReasoningDelta(conversationId, event.data.reasoning);
      }
      if (event.event === "message.delta" && typeof event.data.content === "string") {
        useAiChatStore.getState().appendDelta(conversationId, event.data.content);
      }
      if (event.event === "tool.completed" && activeRunId) {
        const toolName = readStringEventValue(event.data.toolName);
        if (toolName) {
          liveExecutionSummary.toolNames.add(toolName);
          updateLastAssistantExecutionSummary(conversationId, activeRunId, liveExecutionSummary);
        }
      }
      if (event.event === "usage.partial" && activeRunId) {
        mergeUsagePartial(liveExecutionSummary, event.data);
        updateLastAssistantExecutionSummary(conversationId, activeRunId, liveExecutionSummary);
      }
      if (event.event === "run.completed" && activeRunId) {
        useAiChatStore.getState().setLastAssistantAgentRun(conversationId, {
          runId: activeRunId,
          status: "completed",
          threadId: readStringEventValue(event.data.threadId),
          checkpointId: readStringEventValue(event.data.checkpointId),
        });
      }
      if (event.event === "run.cancelled" && activeRunId) {
        useAiChatStore.getState().setLastAssistantAgentRun(conversationId, {
          runId: activeRunId,
          status: "cancelled",
          threadId: readStringEventValue(event.data.threadId),
          checkpointId: readStringEventValue(event.data.checkpointId),
        });
      }
      if (event.event === "run.interrupted") {
        const eventRunId: string | null = readRunId(event.data);
        const interruptedRunId: string | null = eventRunId ?? activeRunId;
        if (!interruptedRunId) {
          throw new Error("Agent interrupt event is missing runId");
        }
        activeRunId = interruptedRunId;
        useAiChatStore.getState().setLastAssistantAgentRun(conversationId, {
          runId: interruptedRunId,
          status: "interrupted",
          threadId: readStringEventValue(event.data.threadId),
          checkpointId: readStringEventValue(event.data.checkpointId),
          interrupt: readAgentInterrupt(event.data),
        });
      }
      if (event.event === "run.failed") {
        const eventRunId = readRunId(event.data);
        const failedRunId = eventRunId ?? activeRunId;
        if (failedRunId) {
          activeRunId = failedRunId;
          replaceLastAssistantMessage(conversationId, null, {
            streaming: false,
            error: true,
            errorMessage: formatAIChatError(JSON.stringify(event.data)),
            errorDetails: formatAIChatErrorDetails(JSON.stringify(event.data)),
            agentRunId: failedRunId,
            agentStatus: "failed",
            agentThreadId: readStringEventValue(event.data.threadId),
            agentCheckpointId: readStringEventValue(event.data.checkpointId),
            agentInterrupt: undefined,
            agentArtifact: undefined,
            agentExecutionSummary: snapshotExecutionSummary(liveExecutionSummary),
          });
        }
        throw new AIChatRequestError(
          formatAIChatError(JSON.stringify(event.data)),
          formatAIChatErrorDetails(JSON.stringify(event.data)),
        );
      }
    }
    if (activeRunId) {
      await recoverAIAgentRun(projectId, conversationId, activeRunId);
    } else {
      useAiChatStore.getState().finalizeLastAssistant(conversationId);
    }
    await saveAIConversationSnapshot(conversationId);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      useAiChatStore.getState().finalizeLastAssistant(conversationId);
      await saveAIConversationSnapshot(conversationId);
      return;
    }
    let recovered = false;
    let recoveryError: unknown = null;
    if (activeRunId) {
      try {
        await recoverAIAgentRun(projectId, conversationId, activeRunId);
        recovered = true;
      } catch (recoveryErr) {
        recoveryError = recoveryErr;
      }
    }
    if (recovered) {
      await saveAIConversationSnapshot(conversationId);
      return;
    }
    const message = formatAIChatError(err);
    const details = [
      getAIChatErrorDetails(err),
      recoveryError ? `Agent run recovery failed: ${getAIChatErrorDetails(recoveryError)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    useAiChatStore.getState().finalizeLastAssistant(conversationId, {
      error: true,
      errorMessage: message,
      errorDetails: details,
    });
    await saveAIConversationSnapshot(conversationId);
  } finally {
    useAiChatStore.getState().setStreaming(false);
  }
}

async function recoverAIAgentRun(
  projectId: string,
  conversationId: string,
  runId: string,
): Promise<void> {
  const run = await getAIAgentRun(projectId, runId);
  applyAIAgentRunStateToConversation(conversationId, runId, run);
}

function applyAIAgentRunStateToConversation(
  conversationId: string,
  runId: string,
  run: AgentRunState,
): void {
  const status = toMessageAgentStatus(run.status);
  useAiChatStore.getState().setLastAssistantAgentRun(conversationId, {
    runId,
    status,
    threadId: run.langgraphThreadId,
    checkpointId: run.langgraphCheckpointId ?? undefined,
  });

  if (run.status === "completed") {
    replaceLastAssistantMessage(conversationId, runId, {
      content: readRunContent(run),
      streaming: false,
      error: false,
      agentRunId: runId,
      agentStatus: "completed",
      agentThreadId: run.langgraphThreadId,
      agentCheckpointId: run.langgraphCheckpointId ?? undefined,
      agentInterrupt: undefined,
      agentArtifact: readAgentArtifact(run),
      agentExecutionSummary: readAgentExecutionSummary(run),
    });
    return;
  }

  if (run.status === "cancelled") {
    replaceLastAssistantMessage(conversationId, runId, {
      content: readRunContent(run),
      streaming: false,
      error: false,
      agentRunId: runId,
      agentStatus: "cancelled",
      agentThreadId: run.langgraphThreadId,
      agentCheckpointId: run.langgraphCheckpointId ?? undefined,
      agentInterrupt: undefined,
      agentArtifact: readAgentArtifact(run),
      agentExecutionSummary: readAgentExecutionSummary(run),
    });
    return;
  }

  if (run.status === "interrupted") {
    replaceLastAssistantMessage(conversationId, runId, {
      content: readRunContent(run),
      streaming: false,
      error: false,
      agentRunId: runId,
      agentStatus: "interrupted",
      agentThreadId: run.langgraphThreadId,
      agentCheckpointId: run.langgraphCheckpointId ?? undefined,
      agentInterrupt: readRunInterrupt(run),
      agentExecutionSummary: readAgentExecutionSummary(run),
    });
    return;
  }

  if (run.status === "failed") {
    writeFailedAIAgentRunState(conversationId, runId, run);
    return;
  }

  throw new AIChatRequestError(
    `Agent run is still ${run.status}`,
    formatAIChatErrorDetails(JSON.stringify(run)),
  );
}

function writeFailedAIAgentRunState(
  conversationId: string,
  runId: string,
  run: AgentRunState,
): void {
  replaceLastAssistantMessage(conversationId, runId, {
    content: readRunContent(run),
    streaming: false,
    error: true,
    errorMessage: run.errorMessage || run.errorCode || "Agent run failed",
    errorDetails: formatAIChatErrorDetails(JSON.stringify(run)),
    agentRunId: runId,
    agentStatus: "failed",
    agentThreadId: run.langgraphThreadId,
    agentCheckpointId: run.langgraphCheckpointId ?? undefined,
    agentInterrupt: undefined,
    agentArtifact: undefined,
    agentExecutionSummary: readAgentExecutionSummary(run),
  });
}

function replaceLastAssistantMessage(
  conversationId: string,
  runId: string | null,
  patch: Partial<StoreAIChatMessage>,
): void {
  const state = useAiChatStore.getState();
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    throw new Error(`AI conversation not found: ${conversationId}`);
  }

  const messages = [...conversation.messages];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    if (runId && message.agentRunId !== runId) continue;
    messages[index] = { ...message, ...patch };
    state.replaceMessages(conversationId, messages);
    return;
  }

  throw new Error(`AI conversation has no assistant message to recover: ${conversationId}`);
}

function readRunContent(run: AgentRunState): string {
  const resultContent = run.result?.content;
  if (typeof resultContent === "string") return resultContent;
  return (run.events ?? [])
    .filter((event) => event.event === "message.delta")
    .map((event) => event.data.content)
    .filter((content): content is string => typeof content === "string")
    .join("");
}

function readAgentArtifact(run: AgentRunState): AIAgentMessageArtifact | undefined {
  const result = run.result;
  if (!isRecord(result)) return undefined;

  if ("plan" in result) {
    return readPlanArtifact(result.plan);
  }

  if ("build" in result) {
    return readBuildArtifact(result.build);
  }

  return undefined;
}

type MutableExecutionSummary = {
  toolNames: Set<string>;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

function createMutableExecutionSummary(): MutableExecutionSummary {
  return { toolNames: new Set<string>() };
}

function updateLastAssistantExecutionSummary(
  conversationId: string,
  runId: string,
  summary: MutableExecutionSummary,
): void {
  const snapshot = snapshotExecutionSummary(summary);
  if (!snapshot) return;
  replaceLastAssistantMessage(conversationId, runId, { agentExecutionSummary: snapshot });
}

function snapshotExecutionSummary(
  summary: MutableExecutionSummary,
): StoreAIChatMessage["agentExecutionSummary"] {
  if (summary.toolNames.size === 0 && summary.totalTokens === undefined) return undefined;
  return {
    toolNames: [...summary.toolNames].sort(),
    ...(summary.promptTokens !== undefined ? { promptTokens: summary.promptTokens } : {}),
    ...(summary.completionTokens !== undefined
      ? { completionTokens: summary.completionTokens }
      : {}),
    ...(summary.totalTokens !== undefined ? { totalTokens: summary.totalTokens } : {}),
  };
}

function mergeUsagePartial(summary: MutableExecutionSummary, data: Record<string, unknown>): void {
  const usage = isRecord(data.usage) ? data.usage : data;
  const promptTokens = readUsageNumber(usage, "prompt_tokens", "promptTokens");
  const completionTokens = readUsageNumber(usage, "completion_tokens", "completionTokens");
  const totalTokens =
    readUsageNumber(usage, "total_tokens", "totalTokens") ??
    (promptTokens !== undefined || completionTokens !== undefined
      ? (promptTokens ?? 0) + (completionTokens ?? 0)
      : undefined);
  summary.promptTokens = promptTokens ?? summary.promptTokens;
  summary.completionTokens = completionTokens ?? summary.completionTokens;
  summary.totalTokens = totalTokens ?? summary.totalTokens;
}

function readAgentExecutionSummary(
  run: AgentRunState,
): StoreAIChatMessage["agentExecutionSummary"] {
  const toolNames = readRunToolNames(run);
  const usage =
    isRecord(run.result) && isRecord(run.result.usage)
      ? run.result.usage
      : (readLatestUsagePartial(run.events ?? []) ?? {});
  const promptTokens = readUsageNumber(usage, "prompt_tokens", "promptTokens");
  const completionTokens = readUsageNumber(usage, "completion_tokens", "completionTokens");
  const totalTokens =
    readUsageNumber(usage, "total_tokens", "totalTokens") ??
    (promptTokens !== undefined || completionTokens !== undefined
      ? (promptTokens ?? 0) + (completionTokens ?? 0)
      : undefined);

  if (toolNames.length === 0 && totalTokens === undefined) return undefined;
  return {
    toolNames,
    ...(promptTokens !== undefined ? { promptTokens } : {}),
    ...(completionTokens !== undefined ? { completionTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
}

function readRunToolNames(run: AgentRunState): string[] {
  const names = new Set<string>();
  for (const toolName of Object.keys(run.toolOutputs ?? {})) {
    if (toolName.trim()) names.add(toolName);
  }
  for (const event of run.events ?? []) {
    if (event.event !== "tool.completed") continue;
    const toolName = readStringEventValue(event.data.toolName);
    if (toolName) names.add(toolName);
  }
  return [...names].sort();
}

function readLatestUsagePartial(events: AgentRunEvent[]): Record<string, unknown> | undefined {
  for (const event of [...events].reverse()) {
    if (event.event !== "usage.partial") continue;
    return isRecord(event.data.usage) ? event.data.usage : event.data;
  }
  return undefined;
}

function readUsageNumber(
  usage: Record<string, unknown>,
  snakeKey: string,
  camelKey: string,
): number | undefined {
  const value = usage[snakeKey] ?? usage[camelKey];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readRunInterrupt(run: AgentRunState): AIAgentInterrupt {
  const event = [...(run.events ?? [])].reverse().find((item) => item.event === "run.interrupted");
  if (!event) {
    throw new Error("Interrupted agent run is missing run.interrupted event");
  }

  return readAgentInterrupt({
    ...event.data,
    runId: run.id,
    threadId: run.langgraphThreadId,
    checkpointId: run.langgraphCheckpointId ?? event.data.checkpointId,
  });
}

function readAgentInterrupt(data: Record<string, unknown>): AIAgentInterrupt {
  const mode = readInterruptMode(data.mode);
  const toolOutputs = data.toolOutputs;
  if (!isRecord(toolOutputs)) {
    throw new Error("Agent interrupt event is missing toolOutputs");
  }

  return {
    kind: readInterruptString(data.kind, "kind"),
    runId: readInterruptString(data.runId, "runId"),
    agentId: readInterruptString(data.agentId, "agentId"),
    mode,
    prompt: readInterruptString(data.prompt, "prompt"),
    toolOutputs,
    requiredDecision: readInterruptString(data.requiredDecision, "requiredDecision"),
    interruptId: readStringEventValue(data.interruptId),
    threadId: readStringEventValue(data.threadId),
    checkpointId: readStringEventValue(data.checkpointId),
  };
}

function readInterruptMode(value: unknown): AIComposerMode {
  if (value === "build" || value === "plan" || value === "agent") return value;
  throw new Error("Agent interrupt event returned an invalid mode");
}

function readInterruptString(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`Agent interrupt event is missing ${field}`);
}

function readPlanArtifact(value: unknown): AIAgentMessageArtifact {
  if (!isRecord(value) || value.type !== "agent_execution_plan") {
    throw new Error("Completed agent run returned an invalid plan artifact");
  }

  return {
    type: "agent_execution_plan",
    goal: readArtifactString(value.goal, "plan.goal"),
    status: readArtifactString(value.status, "plan.status"),
    steps: readArtifactSteps(value.steps, "plan.steps"),
    source: readOptionalArtifactString(value.source, "plan.source"),
  };
}

function readBuildArtifact(value: unknown): AIAgentMessageArtifact {
  if (!isRecord(value) || value.type !== "agent_build_blueprint") {
    throw new Error("Completed agent run returned an invalid build artifact");
  }

  return {
    type: "agent_build_blueprint",
    goal: readArtifactString(value.goal, "build.goal"),
    status: readArtifactString(value.status, "build.status"),
    operations: readArtifactSteps(value.operations, "build.operations"),
    appliesChanges: readArtifactBoolean(value.appliesChanges, "build.appliesChanges"),
    requiresApprovalBeforeApply: readArtifactBoolean(
      value.requiresApprovalBeforeApply,
      "build.requiresApprovalBeforeApply",
    ),
    source: readOptionalArtifactString(value.source, "build.source"),
  };
}

function readArtifactSteps(value: unknown, path: string): AIAgentArtifactStep[] {
  if (!Array.isArray(value)) {
    throw new Error(`Completed agent run returned invalid artifact field: ${path}`);
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Completed agent run returned invalid artifact field: ${path}[${index}]`);
    }
    return {
      id: readArtifactString(item.id, `${path}[${index}].id`),
      title: readArtifactString(item.title, `${path}[${index}].title`),
      status: readArtifactString(item.status, `${path}[${index}].status`),
    };
  });
}

function readArtifactString(value: unknown, path: string): string {
  if (typeof value === "string") return value;
  throw new Error(`Completed agent run returned invalid artifact field: ${path}`);
}

function readOptionalArtifactString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return readArtifactString(value, path);
}

function readArtifactBoolean(value: unknown, path: string): boolean {
  if (typeof value === "boolean") return value;
  throw new Error(`Completed agent run returned invalid artifact field: ${path}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toMessageAgentStatus(status: AgentRunStatus): AIAgentRunStatus {
  if (
    status === "interrupted" ||
    status === "completed" ||
    status === "cancelled" ||
    status === "failed"
  ) {
    return status;
  }
  return "running";
}

function readRunId(data: Record<string, unknown>): string | null {
  const value = data.runId;
  return typeof value === "string" && value.trim() ? value : null;
}

function readStringEventValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function buildApiUrl(path: string): string {
  const config = getAppConfig();
  const baseUrl = config.apiBaseUrl || "";
  const prefix = config.apiPrefix || "";
  const urlPath = `${prefix}${path}`;
  return baseUrl ? `${baseUrl}${urlPath}` : urlPath;
}

function buildChatRequestBody(
  messages: AIChatMessage[],
  options?: AIChatOptions,
): Record<string, unknown> {
  return {
    messages,
    workspaceId: readCurrentWorkspaceId(),
    mode: useAiChatStore.getState().composerMode,
    model: normalizeAIModelForRequest(options?.model),
    reasoningEffort: options?.reasoningEffort,
    contextSnapshot: options?.contextSnapshot ?? buildPageContextSnapshot(),
  };
}

export function normalizeAIModelForRequest(model: string | null | undefined): string | undefined {
  const value = model?.trim();
  if (!value || value === "__auto__") return undefined;
  return value;
}

export async function ensureAIConversationPersistedForRuntime(
  conversationId: string,
  options: ConversationPersistOptions = {},
): Promise<void> {
  await ensureAIConversationPersisted(conversationId, options);
  await saveAIConversationSnapshot(conversationId, options);
}

async function ensureAIConversationPersisted(
  conversationId: string,
  options: ConversationPersistOptions = {},
): Promise<void> {
  const conversation = readConversation(conversationId);
  const response = await api.post<AIConversationResponse>(
    "/chat/conversations",
    buildConversationRequestBody(conversation),
  );
  if (options.applyResponse !== false) {
    useAiChatStore.getState().upsertConversation(toStoreConversation(response));
  }
}

async function saveAIConversationSnapshot(
  conversationId: string,
  options: ConversationPersistOptions = {},
): Promise<void> {
  const workspaceId = requireCurrentWorkspaceId();
  const conversation = readConversation(conversationId);
  const query = new URLSearchParams({ workspaceId });
  const response = await api.patch<AIConversationResponse>(
    `/chat/conversations/${encodeURIComponent(conversationId)}?${query.toString()}`,
    buildConversationRequestBody(conversation),
  );
  if (options.applyResponse !== false) {
    useAiChatStore.getState().upsertConversation(toStoreConversation(response));
  }
}

function readConversation(conversationId: string): AIConversation {
  const conversation = useAiChatStore
    .getState()
    .conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    throw new Error(`AI conversation not found: ${conversationId}`);
  }
  return conversation;
}

function buildConversationRequestBody(conversation: AIConversation): Record<string, unknown> {
  const state = useAiChatStore.getState();
  const workspace = useWorkspaceStore.getState();
  return {
    id: conversation.id,
    workspaceId: requireCurrentWorkspaceId(),
    title: conversation.title,
    mode: state.composerMode,
    model: normalizeAIModelForRequest(state.selectedModel),
    reasoningEffort: state.selectedReasoningEffort,
    messages: conversation.messages
      .filter(shouldPersistConversationMessage)
      .map(toApiConversationMessage),
    projectId: workspace.currentProjectId ?? null,
    contextSnapshot: buildPageContextSnapshot(),
  };
}

function toApiConversationMessage(message: StoreAIChatMessage): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    role: message.role,
    content: message.content,
  };
  if (message.agentRunId) payload.agentRunId = message.agentRunId;
  if (message.reasoning) payload.reasoning = message.reasoning;
  if (message.agentStatus) payload.agentStatus = message.agentStatus;
  if (message.agentThreadId) payload.agentThreadId = message.agentThreadId;
  if (message.agentCheckpointId) payload.agentCheckpointId = message.agentCheckpointId;
  if (message.agentInterrupt) payload.agentInterrupt = message.agentInterrupt;
  if (message.agentArtifact) payload.agentArtifact = message.agentArtifact;
  if (message.workspaceAction) payload.workspaceAction = message.workspaceAction;
  if (message.agentExecutionSummary) {
    payload.agentExecutionSummary = message.agentExecutionSummary;
  }
  if (message.error) payload.error = true;
  if (message.errorMessage) payload.errorMessage = message.errorMessage;
  if (message.errorDetails) payload.errorDetails = message.errorDetails;
  return payload;
}

function shouldPersistConversationMessage(message: StoreAIChatMessage): boolean {
  if (message.role !== "assistant") return true;
  if (message.content.trim()) return true;
  if (message.reasoning?.trim()) return true;
  if (
    message.agentRunId ||
    message.agentStatus ||
    message.agentThreadId ||
    message.agentCheckpointId ||
    message.agentInterrupt ||
    message.agentArtifact ||
    message.workspaceAction ||
    message.agentExecutionSummary ||
    message.error ||
    message.errorMessage ||
    message.errorDetails
  )
    return true;
  return false;
}

function toWorkspaceActionProject(project: AIWorkspaceActionProject): AIWorkspaceActionProject {
  return {
    id: project.id,
    ...(project.workspaceId ? { workspaceId: project.workspaceId } : {}),
    name: project.name,
    slug: project.slug,
    description: project.description ?? null,
  };
}

function toStoreConversation(conversation: AIConversationResponse): AIConversation {
  return {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages,
    contextSnapshot: conversation.contextSnapshot,
    createdAt: Date.parse(conversation.createdAt),
    updatedAt: Date.parse(conversation.updatedAt),
  };
}

function buildPageContextSnapshot(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  const { pathname, search } = window.location;
  return {
    pathname,
    search,
    surfaceHint: resolveAISurface(pathname),
    ...resolvePageContextFacts(pathname, search),
  };
}

function resolveAISurface(pathname: string): string {
  if (pathname.startsWith("/system/settings")) return "system-settings";
  if (pathname.includes("/content")) return "content-workbench";
  if (pathname.includes("/assets")) return "asset-library";
  if (pathname.includes("/settings")) return "project-settings";
  return "admin";
}

function resolvePageContextFacts(pathname: string, search: string): Record<string, unknown> {
  const systemSettings = /^\/system\/settings(?:\/([^/?#]+))?/.exec(pathname);
  if (systemSettings) {
    return {
      surface: "system-settings",
      section: systemSettings[1] ?? "overview",
    };
  }

  const contentItem = /^\/projects\/([^/]+)\/content\/library\/([^/?#]+)/.exec(pathname);
  if (contentItem) {
    return {
      surface: "content-workbench",
      projectId: contentItem[1],
      entity: { type: "content-item", id: contentItem[2] },
    };
  }

  const contentModel = /^\/projects\/([^/]+)\/content\/models\/edit(?:\/|$)/.exec(pathname);
  if (contentModel) {
    const query = new URLSearchParams(search);
    const modelId = query.get("modelId");
    const facts: Record<string, unknown> = {
      surface: "content-workbench",
      projectId: contentModel[1],
    };
    const section = query.get("section");
    if (section) facts.section = section;
    if (modelId) facts.entity = { type: "content-model", id: modelId };
    return facts;
  }

  const content = /^\/projects\/([^/]+)\/content(?:\/|$)/.exec(pathname);
  if (content) return { surface: "content-workbench", projectId: content[1] };

  const assets = /^\/projects\/([^/]+)\/assets(?:\/|$)/.exec(pathname);
  if (assets) return { surface: "asset-library", projectId: assets[1] };

  const projectSettings = /^\/projects\/([^/]+)\/settings(?:\/|$)/.exec(pathname);
  if (projectSettings) return { surface: "project-settings", projectId: projectSettings[1] };

  return { surface: "admin" };
}

function readCurrentWorkspaceId(): string | null {
  const state = useWorkspaceStore.getState();
  return state.currentWorkspaceId ?? state.lastWorkspaceId ?? null;
}

function requireCurrentWorkspaceId(): string {
  const workspaceId = readCurrentWorkspaceId();
  if (!workspaceId) {
    throw new Error("AI conversation persistence requires an active workspace context");
  }
  return workspaceId;
}

function buildAgentToolInputs(
  agentId: string,
  prompt: string,
): Record<string, Record<string, unknown>> {
  if (agentId === "content_model_advisor") {
    return {
      list_content_types: { page: 1, size: 10, q: prompt.slice(0, 64) },
    };
  }

  return {
    search_content: { page: 1, size: 10, modelKey: null },
  };
}

function buildStreamHeaders(): Record<string, string> {
  const accessToken = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

async function* readSseEvents(response: Response): AsyncGenerator<{
  event: string;
  data: Record<string, unknown>;
  rawData: string;
}> {
  if (!response.body) {
    throw new Error("Response body is empty");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    // eslint-disable-next-line no-await-in-loop -- ReadableStream chunks must be consumed sequentially.
    const { done, value } = await reader.read();
    if (done) break;

    buffer += value;
    buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const event = parseSseChunk(chunk);
      if (!event) continue;
      if (event.rawData === "[DONE]") return;
      yield event;
    }
  }

  if (buffer.trim()) {
    const event = parseSseChunk(buffer);
    if (event && event.rawData !== "[DONE]") {
      yield event;
    }
  }
}

function parseSseChunk(
  chunk: string,
): { event: string; data: Record<string, unknown>; rawData: string } | null {
  let event = "";
  const dataLines: string[] = [];

  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.replace(/^event:\s*/, "");
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.replace(/^data:\s*/, ""));
    }
  }

  const rawData = dataLines.join("\n");
  if (!event && !rawData) return null;

  try {
    return { event, data: JSON.parse(rawData) as Record<string, unknown>, rawData };
  } catch (err) {
    if (err instanceof SyntaxError) return { event, data: { content: rawData }, rawData };
    throw err;
  }
}
