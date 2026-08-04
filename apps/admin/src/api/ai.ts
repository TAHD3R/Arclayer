import { api } from "@/lib/http";
import { i18n } from "@/lib/i18n";
import {
  useAiChatStore,
  type AIComposerMode,
  type AIReasoningEffort,
} from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { ContentModelImpactPreviewOut as AdminContentModelImpactPreview } from "@arclayer/openapi";

export interface AIModelCatalogItem {
  id: string;
  provider: string;
  label: string;
  labelI18n: Record<string, string>;
  description?: string | null;
  descriptionI18n: Record<string, string>;
  providerIcon?: {
    lightUrl: string;
    darkUrl: string;
  } | null;
  available: boolean;
}

export interface AIModelCatalogResponse {
  defaultModel: string | null;
  defaultMode: AIComposerMode;
  reasoningEffort: AIReasoningEffort;
  models: AIModelCatalogItem[];
}

type AIModelCatalogItemPayload = Omit<AIModelCatalogItem, "labelI18n" | "descriptionI18n"> & {
  labelI18n?: Record<string, string>;
  descriptionI18n?: Record<string, string>;
};

type AIModelCatalogResponsePayload = Omit<AIModelCatalogResponse, "models"> & {
  models: AIModelCatalogItemPayload[];
};

export type AIWorkspaceActionKind =
  | "create_project"
  | "create_content_model"
  | "list_content_models"
  | "update_content_model"
  | "delete_content_model"
  | "list_content_items"
  | "create_content_item"
  | "update_content_item"
  | "update_homepage"
  | "delete_content_item"
  | "list_projects"
  | "open_projects"
  | "read_project_source"
  | "write_project_source_file"
  | "delete_project_source_file"
  | "update_site_settings"
  | "refine_plan";

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

export interface AIWorkspaceActionDomain {
  hostname: string;
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

export type AIWorkspaceActionContentModelAction =
  | "list_content_models"
  | "create_content_model"
  | "update_content_model"
  | "delete_content_model";

export interface AIWorkspaceActionContentItem {
  id: string;
  workspaceId: string;
  siteId: string;
  modelId?: string | null;
  modelKey?: string | null;
  title?: string | null;
  slug: string;
  locale: string;
  status: string;
  derivedStatus?: string | null;
}

export interface AIWorkspaceActionContentVersion {
  itemId: string;
  versionNumber: number;
  state: string;
  changeSummary?: string | null;
}

export interface AIWorkspaceActionSourceFile {
  path: string;
  role?: string | null;
  language?: string | null;
  contents?: string | null;
}

export interface AIWorkspaceActionSourceManifest {
  files?: AIWorkspaceActionSourceFile[];
}

export interface AIWorkspaceActionSourceFileDelete {
  path: string;
  deleted?: boolean;
}

export interface AIWorkspaceActionRelease {
  release?: {
    releaseNumber?: number | null;
  } | null;
}

export interface AIWorkspaceActionSiteSettings {
  value?: Record<string, unknown>;
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
  domain?: AIWorkspaceActionDomain | null;
  contentModel?: AIWorkspaceActionContentModel | null;
  contentModels: AIWorkspaceActionContentModel[];
  contentModelItems?: AIWorkspaceActionContentModel[];
  deletedContentModelId?: string | null;
  contentItem?: AIWorkspaceActionContentItem | null;
  contentItems?: AIWorkspaceActionContentItem[];
  contentVersion?: AIWorkspaceActionContentVersion | null;
  deletedContentItemId?: string | null;
  sourceManifest?: AIWorkspaceActionSourceManifest | null;
  sourceFile?: AIWorkspaceActionSourceFile | null;
  sourceFileDelete?: AIWorkspaceActionSourceFileDelete | null;
  release?: AIWorkspaceActionRelease | null;
  siteSettings?: AIWorkspaceActionSiteSettings | null;
  projects: AIWorkspaceActionProject[];
  total?: number | null;
  navigation?: AIWorkspaceActionNavigation | null;
}

export interface AIWorkspaceActionContextMessage {
  role: "user" | "assistant";
  content: string;
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

export type AIAgentCatalogMode = AIComposerMode | "agent";

export interface AIAgentCatalogSkill {
  skillId: string;
  name: string;
  description: string;
  mode: AIAgentCatalogMode;
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
  mode: AIAgentCatalogMode;
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

export type AIWorkspaceAgentExecutionMode = "plan" | "build";

export interface AIWorkspaceAgentCatalogItem {
  agentId: string;
  versionId: string;
  assignmentId: string;
  versionNumber: number;
  slug: string;
  name: string;
  nameI18nKey?: string | null;
  role: string;
  roleI18nKey?: string | null;
  description: string;
  descriptionI18nKey?: string | null;
  avatarUrl?: string | null;
  scope: "system" | "workspace";
  provenance: "arclayer_official" | "workspace";
  supportedExecutionModes: AIWorkspaceAgentExecutionMode[];
  collaborationAgentIds: string[];
  toolGrants: string[];
  available: boolean;
  unavailableReason?: string | null;
  isDefault: boolean;
  isPinned: boolean;
}

export interface AIWorkspaceAgentCatalogResponse {
  agents: AIWorkspaceAgentCatalogItem[];
  defaultAgentId?: string | null;
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
  impactPreview: AdminContentModelImpactPreview;
}

const AI_GENERIC_ERROR_MESSAGE_KEY = "AI_CHAT_ERROR_GENERIC";

const AI_ERROR_MESSAGE_KEYS: Record<string, string> = {
  AUTH_NO_KEY: "AI_CHAT_ERROR_AUTH_NO_KEY",
  AUTH_NOT_WORKSPACE_MEMBER: "AI_CHAT_ERROR_AUTH_NOT_WORKSPACE_MEMBER",
  AI_AGENT_PROJECT_CONTEXT_REQUIRED: "AI_CHAT_ERROR_AGENT_PROJECT_CONTEXT_REQUIRED",
  AI_AGENT_APPROVAL_PROJECT_CONTEXT_REQUIRED:
    "AI_CHAT_ERROR_AGENT_APPROVAL_PROJECT_CONTEXT_REQUIRED",
  AGENT_SKILL_SELECTION_INVALID: "AI_CHAT_ERROR_SKILL_SELECTION_INVALID",
  AI_WORKSPACE_ACTION_PLAN_MODE_READ_ONLY: "AI_CHAT_ERROR_WORKSPACE_ACTION_PLAN_MODE_READ_ONLY",
  AI_WORKSPACE_ACTION_PROJECT_REQUIRED: "AI_CHAT_ERROR_WORKSPACE_ACTION_PROJECT_REQUIRED",
  AI_MODEL_CATALOG_UNAVAILABLE: "AI_CHAT_ERROR_MODEL_CATALOG_UNAVAILABLE",
  AI_MODEL_CATALOG_MASTER_KEY_REQUIRED: "AI_CHAT_ERROR_MODEL_CATALOG_MASTER_KEY_REQUIRED",
  AI_MODEL_CATALOG_EMPTY: "AI_CHAT_ERROR_MODEL_CATALOG_EMPTY",
  AI_MODEL_CATALOG_LITELLM_UNREACHABLE: "AI_CHAT_ERROR_MODEL_CATALOG_LITELLM_UNREACHABLE",
  AI_MODEL_CATALOG_RESPONSE_INVALID: "AI_CHAT_ERROR_MODEL_CATALOG_RESPONSE_INVALID",
};

export const AI_AGENT_PROJECT_CONTEXT_REQUIRED = "AI_AGENT_PROJECT_CONTEXT_REQUIRED";
export const AI_AGENT_APPROVAL_PROJECT_CONTEXT_REQUIRED =
  "AI_AGENT_APPROVAL_PROJECT_CONTEXT_REQUIRED";

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

  if (!trimmed) return readAIErrorMessage(AI_GENERIC_ERROR_MESSAGE_KEY);
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
  const key = AI_ERROR_MESSAGE_KEYS[code];
  return key ? readAIErrorMessage(key) : null;
}

function readAIErrorMessage(key: string): string {
  if (!i18n.isInitialized) {
    throw new Error("AI error i18n invariant violated: i18n is not initialized");
  }

  const language = i18n.language;
  const message = i18n.getResource(language, "ai", key);
  if (typeof message !== "string" || !message.trim()) {
    throw new Error(
      `AI error i18n invariant violated: missing ai.${key} copy for locale ${language}`,
    );
  }

  return message;
}

export async function listAIModels(options: {
  workspaceId: string;
  signal?: AbortSignal;
}): Promise<AIModelCatalogResponse> {
  const query = new URLSearchParams({ workspaceId: options.workspaceId });
  const catalog = await api.get<AIModelCatalogResponsePayload>(
    `/chat/models?${query.toString()}`,
    options?.signal ? { signal: options.signal } : undefined,
  );
  return {
    ...catalog,
    models: catalog.models.map((model) => ({
      ...model,
      labelI18n: model.labelI18n ?? {},
      descriptionI18n: model.descriptionI18n ?? {},
    })),
  };
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

export async function listAIProjectAgents(options: {
  projectId: string;
  signal?: AbortSignal;
}): Promise<AIAgentCatalogResponse> {
  return api.get<AIAgentCatalogResponse>(
    `/projects/${encodeURIComponent(options.projectId)}/agents`,
    options.signal ? { signal: options.signal } : undefined,
  );
}

export async function listAIWorkspaceAgents(options: {
  workspaceId: string;
  projectId?: string | null;
  signal?: AbortSignal;
}): Promise<AIWorkspaceAgentCatalogResponse> {
  const query = new URLSearchParams();
  if (options.projectId) query.set("projectId", options.projectId);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return api.get<AIWorkspaceAgentCatalogResponse>(
    `/workspaces/${encodeURIComponent(options.workspaceId)}/agents${suffix}`,
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

export async function executeAIWorkspaceAction(
  message: string,
  options?: {
    signal?: AbortSignal;
    projectId?: string | null;
    mode?: AIComposerMode;
    conversationContext?: AIWorkspaceActionContextMessage[];
  },
): Promise<AIWorkspaceActionResponse> {
  const workspaceId = requireCurrentWorkspaceId();
  return api.post<AIWorkspaceActionResponse>(
    "/chat/workspace-actions",
    {
      workspaceId,
      projectId: options?.projectId ?? undefined,
      message,
      mode: options?.mode ?? useAiChatStore.getState().composerMode,
      conversationContext: options?.conversationContext ?? [],
    },
    { signal: options?.signal },
  );
}

function readCurrentWorkspaceId(): string | null {
  const state = useWorkspaceStore.getState();
  return state.currentWorkspaceId;
}

function requireCurrentWorkspaceId(): string {
  const workspaceId = readCurrentWorkspaceId();
  if (!workspaceId) {
    throw new Error("AI workspace actions require an active workspace context");
  }
  return workspaceId;
}
