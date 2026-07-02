import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EditIcon,
  GitBranchIcon,
  PackageIcon,
  PlusIcon,
  PowerIcon,
  PowerOffIcon,
  TerminalIcon,
  Trash2Icon,
} from "lucide-react";

import {
  createAISystemProvider,
  deleteAISystemProvider,
  getAIMonthlyUsageSummary,
  listAISystemProviders,
  listAIModels,
  updateAISystemProvider,
  type AIMonthlyUsageSummary,
  type AIModelCatalogResponse,
  type AISystemProvider,
  type AISystemProviderListResponse,
  type AISystemProviderCompatibility,
} from "@/api/ai";
import { BaseTag } from "@/components/ui/tags";
import { Button } from "@arclayer/ui/button";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Switch } from "@arclayer/ui/switch";
import { Textarea } from "@arclayer/ui/textarea";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifySuccessText } from "@/lib/notifications";
import {
  SystemSettingField,
  SystemSettingFooterActions,
  SystemSettingInlineNote,
  SystemSettingItem,
  SystemSettingRow,
  SystemSettingStack,
} from "@/pages/system/components/system-setting-item";
import {
  getSystemSettingsSection,
  readBooleanValue,
  readNumberValue,
  readStringArrayValue,
  readStringValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";
import { joinLineList, splitLineList } from "@/pages/system/system-settings-form-utils";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import { AgentCapabilitySummary } from "./agent-capability-summary";

type AgentMode = "build" | "plan" | "agent";
type ReasoningEffort = "low" | "medium" | "high";
type ApprovalPolicy =
  | "always_approve"
  | "approve_bulk_only"
  | "approve_schema_only"
  | "auto_approved";
type Checkpointer = "database" | "memory";

type AgentsFormValues = {
  enabled: boolean;
  defaultMode: AgentMode;
  defaultModel: string;
  reasoningEffort: ReasoningEffort;
  systemPrompt: string;
  conversationRetentionDays: number;
  autoTitleEnabled: boolean;
  contextRecommendationsEnabled: boolean;
  monthlyBudgetUsd: number;
  skillsEnabled: boolean;
  allowedSkillIds: string;
  writeToolsEnabled: boolean;
  approvalPolicy: ApprovalPolicy;
  dryRunRequired: boolean;
  langGraphEnabled: boolean;
  langGraphCheckpointer: Checkpointer;
  checkpointTtlDays: number;
  interruptResumeEnabled: boolean;
};

const AGENT_MODE_OPTIONS: readonly AgentMode[] = ["build", "plan", "agent"];
const REASONING_OPTIONS: readonly ReasoningEffort[] = ["low", "medium", "high"];
const APPROVAL_POLICY_OPTIONS: readonly ApprovalPolicy[] = [
  "always_approve",
  "approve_bulk_only",
  "approve_schema_only",
  "auto_approved",
];
const CHECKPOINTER_OPTIONS: readonly Checkpointer[] = ["database", "memory"];
const PROVIDER_COMPATIBILITY_OPTIONS: readonly AISystemProviderCompatibility[] = [
  "openai",
  "openai_compatible",
  "anthropic",
  "anthropic_compatible",
  "deepseek",
];
const PROVIDER_QUERY_KEY = ["system", "ai", "providers"] as const;
const SKILL_SOURCE_OPTIONS = ["inline", "github", "npx"] as const;
type SkillSourceKind = (typeof SKILL_SOURCE_OPTIONS)[number];

type SkillPackage = {
  id: string;
  source: SkillSourceKind;
  locator: string;
  raw: string;
};

type SkillFormValues = {
  source: SkillSourceKind;
  skillId: string;
  githubRepo: string;
  githubRef: string;
  npxPackage: string;
};

const DEFAULT_SKILL_FORM_VALUES: SkillFormValues = {
  source: "github",
  skillId: "",
  githubRepo: "",
  githubRef: "",
  npxPackage: "",
};

function currentUsagePeriod(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function normalizeAgentMode(value: string | null): AgentMode {
  return value === "plan" || value === "agent" ? value : "build";
}

function normalizeReasoningEffort(value: string | null): ReasoningEffort {
  return value === "low" || value === "high" ? value : "medium";
}

function normalizeApprovalPolicy(value: string | null): ApprovalPolicy {
  if (
    value === "approve_bulk_only" ||
    value === "approve_schema_only" ||
    value === "auto_approved"
  ) {
    return value;
  }
  return "always_approve";
}

function normalizeCheckpointer(value: string | null): Checkpointer {
  return value === "memory" ? "memory" : "database";
}

function readPositiveNumber(value: number | null, fallback: number): number {
  return value !== null && value > 0 ? value : fallback;
}

function microsToUsd(value: number | null, fallbackMicros: number): number {
  const micros = readPositiveNumber(value, fallbackMicros);
  return micros / 1_000_000;
}

function usdToMicros(value: number): number {
  return Math.round(value * 1_000_000);
}

function buildInitialValues(
  input: ReturnType<typeof useSystemCoreSettings>["coreSettings"],
): AgentsFormValues {
  const agents = getSystemSettingsSection(input, "ai_agents");
  const langgraph = getSystemSettingsSection(input, "langgraph");

  return {
    enabled: readBooleanValue(agents, "enabled") ?? true,
    defaultMode: normalizeAgentMode(readStringValue(agents, "default_mode")),
    defaultModel: readStringValue(agents, "default_model") ?? "deepseek-v4-pro",
    reasoningEffort: normalizeReasoningEffort(readStringValue(agents, "reasoning_effort")),
    systemPrompt: readStringValue(agents, "system_prompt") ?? "",
    conversationRetentionDays: readPositiveNumber(
      readNumberValue(agents, "conversation_retention_days"),
      90,
    ),
    autoTitleEnabled: readBooleanValue(agents, "auto_title_enabled") ?? true,
    contextRecommendationsEnabled:
      readBooleanValue(agents, "context_recommendations_enabled") ?? true,
    monthlyBudgetUsd: microsToUsd(readNumberValue(agents, "monthly_budget_micros"), 100_000_000),
    skillsEnabled: readBooleanValue(agents, "skills_enabled") ?? true,
    allowedSkillIds: joinLineList(readStringArrayValue(agents, "allowed_skill_ids")),
    writeToolsEnabled: readBooleanValue(agents, "write_tools_enabled") ?? false,
    approvalPolicy: normalizeApprovalPolicy(readStringValue(agents, "approval_policy")),
    dryRunRequired: readBooleanValue(agents, "dry_run_required") ?? true,
    langGraphEnabled: readBooleanValue(langgraph, "enabled") ?? true,
    langGraphCheckpointer: normalizeCheckpointer(readStringValue(langgraph, "checkpointer")),
    checkpointTtlDays: readPositiveNumber(readNumberValue(langgraph, "checkpoint_ttl_days"), 90),
    interruptResumeEnabled: readBooleanValue(langgraph, "interrupt_resume_enabled") ?? true,
  };
}

function isDirty(
  values: AgentsFormValues,
  initialValues: AgentsFormValues,
  fields: readonly (keyof AgentsFormValues)[],
): boolean {
  return fields.some((field) => values[field] !== initialValues[field]);
}

function validatePositiveInteger(value: number): number | null {
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

function validatePositiveCurrency(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function validateRequiredString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function availableModelIds(options: readonly string[]): Set<string> {
  return new Set(options);
}

function systemProviderModelOptions(
  catalog: AIModelCatalogResponse | undefined,
  providers: AISystemProviderListResponse | undefined,
): string[] {
  const activeProviders = new Set(
    (providers?.providers ?? [])
      .filter((provider) => provider.isActive && provider.hasVirtualKey)
      .map((provider) => provider.provider),
  );
  if (activeProviders.size === 0) return [];
  return (
    catalog?.models
      .filter((model) => model.available && activeProviders.has(model.provider))
      .map((model) => model.id) ?? []
  );
}

function formatCostMicros(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value / 1_000_000);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
    style: "percent",
  }).format(value);
}

function statusText(params: {
  loading: boolean;
  error: unknown;
  unavailable: string;
  loadingText: string;
  errorText: string;
  value: string;
}): string {
  if (params.loading) return params.loadingText;
  if (params.error) return params.errorText;
  if (!params.value) return params.unavailable;
  return params.value;
}

function MetricTag(props: {
  children: string;
  color?: "default" | "green" | "blue" | "red" | "gold";
}) {
  return (
    <BaseTag color={props.color} textStyle="footnote" className="max-w-full">
      {props.children}
    </BaseTag>
  );
}

function MetricDatum(props: {
  label: string;
  value: string;
  color?: "default" | "green" | "blue" | "red" | "gold";
  className?: string;
}) {
  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 ${props.className ?? ""}`}
    >
      <span className="shrink-0 text-headline text-label-primary">{props.label}</span>
      <MetricTag color={props.color}>{props.value}</MetricTag>
    </span>
  );
}

function SettingBooleanControl(props: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <SystemSettingRow
      title={props.title}
      description={props.description}
      control={<Switch checked={props.checked} onCheckedChange={props.onCheckedChange} />}
    />
  );
}

function SelectField<TValue extends string>(props: {
  label: string;
  description: string;
  value: TValue;
  options: readonly TValue[];
  getLabel: (value: TValue) => string;
  onValueChange: (value: TValue) => void;
}) {
  return (
    <SystemSettingField label={props.label} description={props.description}>
      <Select value={props.value} onValueChange={(value) => props.onValueChange(value as TValue)}>
        <SelectTrigger className="w-full sm:w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {props.options.map((option) => (
            <SelectItem key={option} value={option}>
              {props.getLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SystemSettingField>
  );
}

function ModelSelectField(props: {
  label: string;
  description: string;
  value: string;
  options: readonly string[];
  catalog: AIModelCatalogResponse | undefined;
  disabled?: boolean;
  onValueChange: (value: string) => void;
}) {
  const { t } = useTranslation(["settings"]);
  const labelForModel = (modelId: string) => {
    const model = props.catalog?.models.find((item) => item.id === modelId);
    return model?.label ?? modelId;
  };

  return (
    <SystemSettingField label={props.label} description={props.description}>
      <Select value={props.value} onValueChange={props.onValueChange} disabled={props.disabled}>
        <SelectTrigger className="w-full sm:w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {props.options.length > 0 ? (
            props.options.map((modelId) => (
              <SelectItem key={modelId} value={modelId}>
                {labelForModel(modelId)}
              </SelectItem>
            ))
          ) : (
            <SelectItem value={props.value || "unavailable"} disabled>
              {t("settings:SETTINGS_SYSTEM_AGENTS_MODEL_CATALOG_EMPTY")}
            </SelectItem>
          )}
        </SelectContent>
      </Select>
    </SystemSettingField>
  );
}

function AgentUsageGovernance(props: {
  monthlyBudgetUsd: number;
  workspaceId: string | null;
  usagePeriod: string;
  usageQuery: {
    data: AIMonthlyUsageSummary | undefined;
    isLoading: boolean;
    error: unknown;
  };
  modelCatalogQuery: {
    data: AIModelCatalogResponse | undefined;
    isLoading: boolean;
    error: unknown;
  };
}) {
  const { t } = useTranslation(["settings"]);
  const usage = props.usageQuery.data;
  const catalog = props.modelCatalogQuery.data;
  const monthlyBudgetMicros = usdToMicros(props.monthlyBudgetUsd);
  const budgetRemainingMicros = monthlyBudgetMicros - (usage?.totalCostMicros ?? 0);
  const budgetUsedRatio =
    monthlyBudgetMicros > 0 && usage ? usage.totalCostMicros / monthlyBudgetMicros : 0;
  const availableModels = catalog?.models.filter((model) => model.available).length ?? 0;
  const providers = Array.from(
    new Set(
      (catalog?.models ?? []).filter((model) => model.available).map((model) => model.provider),
    ),
  ).sort();

  if (!props.workspaceId) {
    return (
      <SystemSettingInlineNote>
        {t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_NO_WORKSPACE")}
      </SystemSettingInlineNote>
    );
  }

  return (
    <div className="grid gap-3">
      <SystemSettingRow
        title={t("settings:SETTINGS_SYSTEM_AGENTS_USAGE_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_AGENTS_USAGE_DESC", {
          period: props.usagePeriod,
        })}
      >
        <div className="grid gap-2 text-footnote text-label-primary sm:grid-cols-2">
          <MetricDatum
            label={t("settings:SETTINGS_SYSTEM_AGENTS_USAGE_COST_LABEL")}
            value={statusText({
              loading: props.usageQuery.isLoading,
              error: props.usageQuery.error,
              unavailable: formatCostMicros(0),
              loadingText: t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_LOADING"),
              errorText: t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_ERROR"),
              value: usage ? formatCostMicros(usage.totalCostMicros) : "",
            })}
          />
          <MetricDatum
            label={t("settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET_LABEL")}
            value={formatCostMicros(monthlyBudgetMicros)}
          />
          <MetricDatum
            label={t("settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET_USED_LABEL")}
            value={statusText({
              loading: props.usageQuery.isLoading,
              error: props.usageQuery.error,
              unavailable: formatPercent(0),
              loadingText: t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_LOADING"),
              errorText: t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_ERROR"),
              value: usage ? formatPercent(budgetUsedRatio) : "",
            })}
            color={budgetUsedRatio > 1 ? "red" : budgetUsedRatio > 0.8 ? "gold" : "blue"}
          />
          <MetricDatum
            label={t(
              budgetRemainingMicros < 0
                ? "settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET_OVER_LABEL"
                : "settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET_REMAINING_LABEL",
            )}
            value={statusText({
              loading: props.usageQuery.isLoading,
              error: props.usageQuery.error,
              unavailable: formatCostMicros(monthlyBudgetMicros),
              loadingText: t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_LOADING"),
              errorText: t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_ERROR"),
              value: usage ? formatCostMicros(Math.abs(budgetRemainingMicros)) : "",
            })}
            color={budgetRemainingMicros < 0 ? "red" : "green"}
          />
          <MetricDatum
            label={t("settings:SETTINGS_SYSTEM_AGENTS_USAGE_REQUESTS_LABEL")}
            value={usage ? formatInteger(usage.totalRequests) : "0"}
          />
          <MetricDatum
            label={t("settings:SETTINGS_SYSTEM_AGENTS_USAGE_PROMPT_TOKENS_LABEL")}
            value={usage ? formatInteger(usage.totalPromptTokens) : "0"}
          />
          <MetricDatum
            label={t("settings:SETTINGS_SYSTEM_AGENTS_USAGE_COMPLETION_TOKENS_LABEL")}
            value={usage ? formatInteger(usage.totalCompletionTokens) : "0"}
          />
        </div>
      </SystemSettingRow>
      <SystemSettingRow
        title={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_DESC")}
      >
        <div className="grid gap-2 text-footnote text-label-primary sm:grid-cols-2">
          <MetricDatum
            label={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_MODELS_LABEL")}
            value={statusText({
              loading: props.modelCatalogQuery.isLoading,
              error: props.modelCatalogQuery.error,
              unavailable: "0",
              loadingText: t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_LOADING"),
              errorText: t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_ERROR"),
              value: String(availableModels),
            })}
            color="blue"
          />
          <MetricDatum
            label={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_DEFAULT_MODEL_LABEL")}
            value={
              catalog?.defaultModel ?? t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_MODEL_EMPTY")
            }
          />
          <MetricDatum
            label={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_KEYS_LABEL")}
            value={
              providers.length
                ? providers.join(", ")
                : t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_KEYS_EMPTY")
            }
            color={providers.length ? "green" : "default"}
            className="sm:col-span-2"
          />
        </div>
      </SystemSettingRow>
    </div>
  );
}

type ProviderDialogState =
  | { mode: "create"; provider: null }
  | { mode: "edit"; provider: AISystemProvider };

type ProviderFormValues = {
  provider: string;
  label: string;
  compatibility: AISystemProviderCompatibility;
  providerApiKey: string;
  baseUrl: string;
  requestModel: string;
  isActive: boolean;
};

function buildProviderFormValues(provider: AISystemProvider | null): ProviderFormValues {
  return {
    provider: provider?.provider ?? "",
    label: provider?.label ?? "",
    compatibility: provider?.compatibility ?? "openai_compatible",
    providerApiKey: "",
    baseUrl: provider?.baseUrl ?? "",
    requestModel: provider?.requestModel ?? "",
    isActive: provider?.isActive ?? true,
  };
}

type SettingsTranslate = (key: string, options?: Record<string, unknown>) => string;

function ProviderCompatibilityTag(props: {
  compatibility: AISystemProviderCompatibility;
  t: SettingsTranslate;
}) {
  return (
    <BaseTag color="blue">
      {props.t(
        `settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_COMPAT_${props.compatibility.toUpperCase()}`,
      )}
    </BaseTag>
  );
}

function ProviderConnectionTag(props: { connected: boolean; t: SettingsTranslate }) {
  return (
    <BaseTag color={props.connected ? "green" : "gold"}>
      {props.connected
        ? props.t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_KEY_SET")
        : props.t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_KEY_MISSING")}
    </BaseTag>
  );
}

function ProviderStatusTag(props: { active: boolean; t: SettingsTranslate }) {
  return (
    <BaseTag color={props.active ? "green" : "default"}>
      {props.active
        ? props.t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_ACTIVE")
        : props.t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_INACTIVE")}
    </BaseTag>
  );
}

function ProviderManagementTable(props: {
  providers: readonly AISystemProvider[];
  loading: boolean;
  pending: boolean;
  t: SettingsTranslate;
  onEdit: (provider: AISystemProvider) => void;
  onToggleActive: (provider: AISystemProvider) => void;
  onDelete: (providerId: string) => void;
}) {
  const emptyText = props.loading
    ? props.t("common:DATA_TABLE_REFRESHING")
    : props.t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDERS_EMPTY");

  return (
    <div className="min-w-0 overflow-x-auto rounded-md border border-border/45 bg-background">
      <table className="min-w-full text-callout">
        <thead className="border-b border-border/60 text-left text-callout font-semibold text-label-secondary/90">
          <tr>
            <th className="px-3 py-3">
              {props.t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_TABLE_NAME")}
            </th>
            <th className="px-3 py-3">
              {props.t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_TABLE_MODEL")}
            </th>
            <th className="px-3 py-3">
              {props.t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_TABLE_COMPATIBILITY")}
            </th>
            <th className="px-3 py-3">
              {props.t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_TABLE_KEY_STATE")}
            </th>
            <th className="px-3 py-3">
              {props.t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_TABLE_STATUS")}
            </th>
            <th className="w-px px-3 py-3">
              <span className="sr-only">
                {props.t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_ACTIONS_LABEL")}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.providers.length ? (
            props.providers.map((provider) => (
              <tr key={provider.id} className="border-b border-border/45 last:border-b-0">
                <td className="px-3 py-4">
                  <div className="min-w-0">
                    <div className="truncate text-footnote font-semibold text-label-primary">
                      {provider.label}
                    </div>
                    <div className="truncate font-mono text-caption text-label-secondary">
                      {provider.provider}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-4">
                  <span className="font-mono text-caption text-label-primary">
                    {provider.requestModel}
                  </span>
                </td>
                <td className="px-3 py-4">
                  <ProviderCompatibilityTag compatibility={provider.compatibility} t={props.t} />
                </td>
                <td className="px-3 py-4">
                  <ProviderConnectionTag connected={provider.hasVirtualKey} t={props.t} />
                </td>
                <td className="px-3 py-4">
                  <ProviderStatusTag active={provider.isActive} t={props.t} />
                </td>
                <td className="px-3 py-4">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={props.t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_EDIT")}
                      disabled={props.pending}
                      onClick={() => props.onEdit(provider)}
                    >
                      <EditIcon className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={
                        provider.isActive
                          ? props.t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_DISABLE")
                          : props.t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_ENABLE")
                      }
                      disabled={props.pending}
                      onClick={() => props.onToggleActive(provider)}
                    >
                      {provider.isActive ? (
                        <PowerOffIcon className="size-4" aria-hidden="true" />
                      ) : (
                        <PowerIcon className="size-4" aria-hidden="true" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={props.t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_DELETE")}
                      disabled={props.pending}
                      onClick={() => props.onDelete(provider.id)}
                    >
                      <Trash2Icon className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="h-28 px-6 text-center text-label-secondary">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AIProviderManagement(props: {
  providersQuery: {
    data: AISystemProviderListResponse | undefined;
    isError: boolean;
    isLoading: boolean;
  };
  pending: boolean;
  onCreate: (values: ProviderFormValues) => void;
  onUpdate: (providerId: string, values: ProviderFormValues) => void;
  onDelete: (providerId: string) => void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const [dialog, setDialog] = useState<ProviderDialogState | null>(null);
  const [values, setValues] = useState<ProviderFormValues>(() => buildProviderFormValues(null));
  const providers = props.providersQuery.data?.providers ?? [];

  const openCreate = () => {
    setValues(buildProviderFormValues(null));
    setDialog({ mode: "create", provider: null });
  };

  const openEdit = (provider: AISystemProvider) => {
    setValues(buildProviderFormValues(provider));
    setDialog({ mode: "edit", provider });
  };

  const closeDialog = () => setDialog(null);
  const toggleProviderActive = (provider: AISystemProvider) => {
    props.onUpdate(provider.id, {
      ...buildProviderFormValues(provider),
      isActive: !provider.isActive,
    });
  };

  const submit = () => {
    if (!dialog) return;
    if (dialog.mode === "create") {
      props.onCreate(values);
      return;
    }
    props.onUpdate(dialog.provider.id, values);
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SystemSettingInlineNote>
          {t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_MANAGEMENT_NOTE")}
        </SystemSettingInlineNote>
        <Button type="button" size="sm" tapScale={1} onClick={openCreate} className="gap-1.5">
          <PlusIcon className="size-4" aria-hidden="true" />
          {t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_CREATE")}
        </Button>
      </div>

      {props.providersQuery.isError ? (
        <SystemSettingInlineNote>
          {t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_LOAD_FAILED")}
        </SystemSettingInlineNote>
      ) : null}

      <ProviderManagementTable
        providers={providers}
        loading={props.providersQuery.isLoading}
        pending={props.pending}
        t={t}
        onEdit={openEdit}
        onToggleActive={toggleProviderActive}
        onDelete={props.onDelete}
      />

      <SettingDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        title={
          dialog?.mode === "edit"
            ? t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_EDIT")
            : t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_CREATE")
        }
        description={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_DIALOG_DESC")}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeDialog}>
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              disabled={
                props.pending ||
                !values.provider.trim() ||
                !values.label.trim() ||
                !values.requestModel.trim() ||
                (dialog?.mode === "create" && !values.providerApiKey.trim())
              }
              onClick={submit}
            >
              {t("settings:SETTINGS_SAVE")}
            </Button>
          </>
        }
      >
        <SettingDialogFields>
          <SettingDialogField
            title={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_KEY_LABEL")}
            description={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_KEY_DESC")}
          >
            <Input
              value={values.provider}
              disabled={dialog?.mode === "edit"}
              onChange={(event) =>
                setValues((current) => ({ ...current, provider: event.target.value }))
              }
              placeholder="openai"
            />
          </SettingDialogField>
          <SettingDialogField title={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_NAME_LABEL")}>
            <Input
              value={values.label}
              onChange={(event) =>
                setValues((current) => ({ ...current, label: event.target.value }))
              }
              placeholder="OpenAI"
            />
          </SettingDialogField>
          <SettingDialogField title={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_COMPAT_LABEL")}>
            <Select
              value={values.compatibility}
              onValueChange={(value) =>
                setValues((current) => ({
                  ...current,
                  compatibility: value as AISystemProviderCompatibility,
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_COMPATIBILITY_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_COMPAT_${option.toUpperCase()}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingDialogField>
          <SettingDialogField
            title={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_API_KEY_LABEL")}
            description={
              dialog?.mode === "edit"
                ? t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_API_KEY_EDIT_DESC")
                : t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_API_KEY_CREATE_DESC")
            }
          >
            <Input
              type="password"
              value={values.providerApiKey}
              onChange={(event) =>
                setValues((current) => ({ ...current, providerApiKey: event.target.value }))
              }
              placeholder={dialog?.mode === "edit" ? "••••••••" : "sk-..."}
            />
          </SettingDialogField>
          <SettingDialogField title={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_BASE_URL_LABEL")}>
            <Input
              value={values.baseUrl}
              onChange={(event) =>
                setValues((current) => ({ ...current, baseUrl: event.target.value }))
              }
              placeholder="https://api.openai.com/v1"
            />
          </SettingDialogField>
          <SettingDialogField
            title={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_REQUEST_MODEL_LABEL")}
            description={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_REQUEST_MODEL_DESC")}
          >
            <Input
              value={values.requestModel}
              onChange={(event) =>
                setValues((current) => ({ ...current, requestModel: event.target.value }))
              }
              placeholder="gpt-4o"
            />
          </SettingDialogField>
          <SystemSettingRow
            title={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_ACTIVE")}
            description={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_ACTIVE_DESC")}
            control={
              <Switch
                checked={values.isActive}
                onCheckedChange={(checked) =>
                  setValues((current) => ({ ...current, isActive: checked }))
                }
              />
            }
          />
        </SettingDialogFields>
      </SettingDialog>
    </div>
  );
}

function parseSkillPackage(raw: string): SkillPackage {
  const value = raw.trim();
  if (value.startsWith("github:")) {
    const body = value.slice("github:".length);
    const [repoAndRef, skillId] = body.split(":");
    return {
      id: skillId?.trim() || repoAndRef.trim(),
      source: "github",
      locator: repoAndRef.trim(),
      raw: value,
    };
  }
  if (value.startsWith("npx:")) {
    const body = value.slice("npx:".length);
    const [packageName, skillId] = body.split(":");
    return {
      id: skillId?.trim() || packageName.trim(),
      source: "npx",
      locator: packageName.trim(),
      raw: value,
    };
  }
  return { id: value, source: "inline", locator: value, raw: value };
}

function serializeSkillForm(values: SkillFormValues): string | null {
  const skillId = values.skillId.trim();
  if (values.source === "inline") return skillId || null;
  if (values.source === "github") {
    const repo = values.githubRepo.trim();
    if (!repo) return null;
    const ref = values.githubRef.trim();
    const locator = ref ? `${repo}#${ref}` : repo;
    return skillId ? `github:${locator}:${skillId}` : `github:${locator}`;
  }
  const packageName = values.npxPackage.trim();
  if (!packageName) return null;
  return skillId ? `npx:${packageName}:${skillId}` : `npx:${packageName}`;
}

function SkillSourceIcon(props: { source: SkillSourceKind }) {
  const Icon =
    props.source === "github" ? GitBranchIcon : props.source === "npx" ? TerminalIcon : PackageIcon;

  return <Icon className="size-3.5" aria-hidden="true" />;
}

function SkillSourceTag(props: { source: SkillSourceKind; t: SettingsTranslate }) {
  return (
    <BaseTag icon={<SkillSourceIcon source={props.source} />}>
      {props.t(`settings:SETTINGS_SYSTEM_AGENTS_SKILL_SOURCE_${props.source.toUpperCase()}`)}
    </BaseTag>
  );
}

function SkillPackageTable(props: {
  packages: readonly SkillPackage[];
  t: SettingsTranslate;
  onDelete: (raw: string) => void;
}) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-md border border-border/45 bg-background">
      <table className="min-w-full text-callout">
        <thead className="border-b border-border/60 text-left text-callout font-semibold text-label-secondary/90">
          <tr>
            <th className="px-3 py-3">
              {props.t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_TABLE_ID")}
            </th>
            <th className="px-3 py-3">
              {props.t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_TABLE_SOURCE")}
            </th>
            <th className="px-3 py-3">
              {props.t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_TABLE_LOCATOR")}
            </th>
            <th className="w-px px-3 py-3">
              <span className="sr-only">
                {props.t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_REMOVE")}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.packages.length ? (
            props.packages.map((skillPackage) => (
              <tr key={skillPackage.raw} className="border-b border-border/45 last:border-b-0">
                <td className="px-3 py-3">
                  <span className="font-mono text-caption text-label-primary">
                    {skillPackage.id}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <SkillSourceTag source={skillPackage.source} t={props.t} />
                </td>
                <td className="px-3 py-3">
                  <span className="truncate text-caption text-label-secondary">
                    {skillPackage.locator}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={props.t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_REMOVE")}
                    onClick={() => props.onDelete(skillPackage.raw)}
                  >
                    <Trash2Icon className="size-4" aria-hidden="true" />
                  </Button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} className="h-28 px-6 text-center text-label-secondary">
                {props.t("settings:SETTINGS_SYSTEM_AGENTS_SKILLS_EMPTY")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SkillLibraryEditor(props: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation(["settings", "common"]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<SkillFormValues>(DEFAULT_SKILL_FORM_VALUES);
  const rawSkillItems = useMemo(() => splitLineList(props.value), [props.value]);
  const skillPackages = useMemo(() => rawSkillItems.map(parseSkillPackage), [rawSkillItems]);
  const deleteSkill = (raw: string) => {
    props.onChange(rawSkillItems.filter((item) => item !== raw).join("\n"));
  };

  const appendSkill = () => {
    const raw = serializeSkillForm(draft);
    if (!raw) return;
    const next = Array.from(new Set([...rawSkillItems, raw]));
    props.onChange(next.join("\n"));
    setDialogOpen(false);
    setDraft(DEFAULT_SKILL_FORM_VALUES);
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SystemSettingInlineNote>
          {t("settings:SETTINGS_SYSTEM_AGENTS_SKILLS_LIBRARY_NOTE")}
        </SystemSettingInlineNote>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setDialogOpen(true)}
        >
          <PlusIcon className="size-4" aria-hidden="true" />
          {t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_UPLOAD")}
        </Button>
      </div>
      <SkillPackageTable packages={skillPackages} t={t} onDelete={deleteSkill} />
      <SettingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_DIALOG_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_DIALOG_DESC")}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common:CANCEL")}
            </Button>
            <Button type="button" onClick={appendSkill}>
              {t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_ADD_TO_LIBRARY")}
            </Button>
          </>
        }
      >
        <SettingDialogFields>
          <SettingDialogField
            title={t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_SOURCE_LABEL")}
            description={t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_SOURCE_DESC")}
          >
            <Select
              value={draft.source}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, source: value as SkillSourceKind }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SKILL_SOURCE_OPTIONS.map((source) => (
                  <SelectItem key={source} value={source}>
                    {t(`settings:SETTINGS_SYSTEM_AGENTS_SKILL_SOURCE_${source.toUpperCase()}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingDialogField>
          <SettingDialogField
            title={t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_ID_LABEL")}
            description={t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_ID_DESC")}
          >
            <Input
              value={draft.skillId}
              onChange={(event) =>
                setDraft((current) => ({ ...current, skillId: event.target.value }))
              }
              placeholder="content.custom"
            />
          </SettingDialogField>
          {draft.source === "github" ? (
            <>
              <SettingDialogField
                title={t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_GITHUB_REPO_LABEL")}
              >
                <Input
                  value={draft.githubRepo}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, githubRepo: event.target.value }))
                  }
                  placeholder="owner/repo"
                />
              </SettingDialogField>
              <SettingDialogField
                title={t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_GITHUB_REF_LABEL")}
              >
                <Input
                  value={draft.githubRef}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, githubRef: event.target.value }))
                  }
                  placeholder="main"
                />
              </SettingDialogField>
            </>
          ) : null}
          {draft.source === "npx" ? (
            <SettingDialogField
              title={t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_NPX_PACKAGE_LABEL")}
            >
              <Input
                value={draft.npxPackage}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, npxPackage: event.target.value }))
                }
                placeholder="@scope/skills"
              />
            </SettingDialogField>
          ) : null}
        </SettingDialogFields>
      </SettingDialog>
    </div>
  );
}

export function SystemSettingsAgentsPage() {
  const { t } = useTranslation(["settings"]);
  const queryClient = useQueryClient();
  const { savingKey, withSavingKey } = useSavingKey();
  const coreSettingsQuery = useSystemCoreSettings();
  const patchMutation = usePatchSystemCoreSettings();
  const workspaceId = useWorkspaceStore(
    (state) => state.currentWorkspaceId ?? state.lastWorkspaceId,
  );
  const usagePeriod = useMemo(() => currentUsagePeriod(), []);
  const {
    data: usageData,
    error: usageError,
    isLoading: usageIsLoading,
  } = useQuery({
    queryKey: ["ai", "usage", workspaceId, usagePeriod],
    queryFn: ({ signal }) =>
      getAIMonthlyUsageSummary({
        workspaceId: String(workspaceId),
        period: usagePeriod,
        signal,
      }),
    enabled: Boolean(workspaceId),
    retry: false,
    meta: { silent: true },
  });
  const {
    data: modelCatalogData,
    error: modelCatalogError,
    isLoading: modelCatalogIsLoading,
  } = useQuery({
    queryKey: ["ai", "chat-models", workspaceId],
    queryFn: ({ signal }) => listAIModels({ workspaceId: String(workspaceId), signal }),
    enabled: Boolean(workspaceId),
    retry: false,
    meta: { silent: true },
  });
  const {
    data: providersData,
    isError: providersIsError,
    isLoading: providersIsLoading,
  } = useQuery({
    queryKey: PROVIDER_QUERY_KEY,
    queryFn: ({ signal }) => listAISystemProviders({ signal }),
    retry: false,
    meta: { silent: true },
  });
  const usageQuery = useMemo(
    () => ({ data: usageData, error: usageError, isLoading: usageIsLoading }),
    [usageData, usageError, usageIsLoading],
  );
  const modelCatalogQuery = useMemo(
    () => ({
      data: modelCatalogData,
      error: modelCatalogError,
      isLoading: modelCatalogIsLoading,
    }),
    [modelCatalogData, modelCatalogError, modelCatalogIsLoading],
  );
  const providersQuery = useMemo(
    () => ({ data: providersData, isError: providersIsError, isLoading: providersIsLoading }),
    [providersData, providersIsError, providersIsLoading],
  );
  const refreshProviderState = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: PROVIDER_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ["ai", "chat-models"] }),
    ]);
  };
  const createProviderMutation = useMutation({
    mutationFn: createAISystemProvider,
    onSuccess: async () => {
      await refreshProviderState();
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    },
  });
  const updateProviderMutation = useMutation({
    mutationFn: (input: {
      providerId: string;
      values: Parameters<typeof updateAISystemProvider>[1];
    }) => updateAISystemProvider(input.providerId, input.values),
    onSuccess: async () => {
      await refreshProviderState();
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    },
  });
  const deleteProviderMutation = useMutation({
    mutationFn: deleteAISystemProvider,
    onSuccess: async () => {
      await refreshProviderState();
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    },
  });
  const providerMutationPending =
    createProviderMutation.isPending ||
    updateProviderMutation.isPending ||
    deleteProviderMutation.isPending;

  const initialValues = useMemo(
    () => buildInitialValues(coreSettingsQuery.coreSettings),
    [coreSettingsQuery.coreSettings],
  );

  const form = useForm<AgentsFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });
  const values = form.watch();
  const defaultModelOptions = useMemo(
    () => systemProviderModelOptions(modelCatalogQuery.data, providersQuery.data),
    [modelCatalogQuery.data, providersQuery.data],
  );

  const runtimeDirty = isDirty(values, initialValues, [
    "enabled",
    "defaultModel",
    "reasoningEffort",
    "systemPrompt",
    "conversationRetentionDays",
    "autoTitleEnabled",
    "contextRecommendationsEnabled",
  ]);
  const governanceDirty = isDirty(values, initialValues, ["monthlyBudgetUsd"]);
  const modesDirty = isDirty(values, initialValues, [
    "defaultMode",
    "skillsEnabled",
    "allowedSkillIds",
  ]);
  const approvalsDirty = isDirty(values, initialValues, [
    "writeToolsEnabled",
    "approvalPolicy",
    "dryRunRequired",
  ]);
  const langGraphDirty = isDirty(values, initialValues, [
    "langGraphEnabled",
    "langGraphCheckpointer",
    "checkpointTtlDays",
    "interruptResumeEnabled",
  ]);

  useEffect(() => {
    if (!coreSettingsQuery.coreSettings) return;
    if (form.formState.isDirty) return;
    form.reset(initialValues);
  }, [coreSettingsQuery.coreSettings, form, initialValues]);

  const persistPatch = async (
    patch: Record<string, unknown>,
    nextValues: AgentsFormValues,
    shouldResetForm: boolean,
  ) => {
    await patchMutation.mutateAsync(patch);
    if (shouldResetForm) {
      form.reset(nextValues);
    }
    notifySuccessText(t("settings:SETTINGS_SAVED"));
  };

  const saveRuntime = () =>
    withSavingKey("agents.runtime", async () => {
      const nextValues = form.getValues();
      const defaultModel = validateRequiredString(nextValues.defaultModel);
      if (defaultModel === null) {
        form.setError("defaultModel", {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_REQUIRED"),
        });
        form.setFocus("defaultModel");
        return;
      }
      const selectableModels = availableModelIds(defaultModelOptions);
      if (selectableModels.size > 0 && !selectableModels.has(defaultModel)) {
        form.setError("defaultModel", {
          type: "validate",
          message: t("settings:SETTINGS_SYSTEM_AGENTS_DEFAULT_MODEL_UNAVAILABLE"),
        });
        form.setFocus("defaultModel");
        return;
      }
      if (selectableModels.size === 0) {
        form.setError("defaultModel", {
          type: "validate",
          message: t("settings:SETTINGS_SYSTEM_AGENTS_DEFAULT_MODEL_NO_PROVIDER"),
        });
        form.setFocus("defaultModel");
        return;
      }
      const conversationRetentionDays = validatePositiveInteger(
        Number(nextValues.conversationRetentionDays),
      );
      if (conversationRetentionDays === null) {
        form.setError("conversationRetentionDays", {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_POSITIVE"),
        });
        form.setFocus("conversationRetentionDays");
        return;
      }
      await persistPatch(
        {
          ai_agents: {
            enabled: Boolean(nextValues.enabled),
            default_model: defaultModel,
            reasoning_effort: nextValues.reasoningEffort,
            system_prompt: nextValues.systemPrompt.trim(),
            conversation_retention_days: conversationRetentionDays,
            auto_title_enabled: Boolean(nextValues.autoTitleEnabled),
            context_recommendations_enabled: Boolean(nextValues.contextRecommendationsEnabled),
          },
        },
        {
          ...nextValues,
          defaultModel,
          systemPrompt: nextValues.systemPrompt.trim(),
          conversationRetentionDays,
        },
        !governanceDirty && !modesDirty && !approvalsDirty && !langGraphDirty,
      );
    });

  const saveGovernance = () =>
    withSavingKey("agents.governance", async () => {
      const nextValues = form.getValues();
      const monthlyBudgetUsd = validatePositiveCurrency(Number(nextValues.monthlyBudgetUsd));
      if (monthlyBudgetUsd === null) {
        form.setError("monthlyBudgetUsd", {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_POSITIVE"),
        });
        form.setFocus("monthlyBudgetUsd");
        return;
      }
      await persistPatch(
        {
          ai_agents: {
            monthly_budget_micros: usdToMicros(monthlyBudgetUsd),
          },
        },
        { ...nextValues, monthlyBudgetUsd },
        !runtimeDirty && !modesDirty && !approvalsDirty && !langGraphDirty,
      );
    });

  const saveModes = () =>
    withSavingKey("agents.modes", async () => {
      const nextValues = form.getValues();
      const allowedSkillIds = splitLineList(nextValues.allowedSkillIds);
      await persistPatch(
        {
          ai_agents: {
            default_mode: nextValues.defaultMode,
            skills_enabled: Boolean(nextValues.skillsEnabled),
            allowed_skill_ids: allowedSkillIds,
          },
        },
        { ...nextValues, allowedSkillIds: allowedSkillIds.join("\n") },
        !runtimeDirty && !governanceDirty && !approvalsDirty && !langGraphDirty,
      );
    });

  const saveApprovals = () =>
    withSavingKey("agents.approvals", async () => {
      const nextValues = form.getValues();
      await persistPatch(
        {
          ai_agents: {
            write_tools_enabled: Boolean(nextValues.writeToolsEnabled),
            approval_policy: nextValues.approvalPolicy,
            dry_run_required: Boolean(nextValues.dryRunRequired),
          },
        },
        nextValues,
        !runtimeDirty && !governanceDirty && !modesDirty && !langGraphDirty,
      );
    });

  const saveLangGraph = () =>
    withSavingKey("agents.langgraph", async () => {
      const nextValues = form.getValues();
      const checkpointTtlDays = validatePositiveInteger(Number(nextValues.checkpointTtlDays));
      if (checkpointTtlDays === null) {
        form.setError("checkpointTtlDays", {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_POSITIVE"),
        });
        form.setFocus("checkpointTtlDays");
        return;
      }
      await persistPatch(
        {
          langgraph: {
            enabled: Boolean(nextValues.langGraphEnabled),
            checkpointer: nextValues.langGraphCheckpointer,
            checkpoint_ttl_days: checkpointTtlDays,
            interrupt_resume_enabled: Boolean(nextValues.interruptResumeEnabled),
          },
        },
        { ...nextValues, checkpointTtlDays },
        !runtimeDirty && !governanceDirty && !modesDirty && !approvalsDirty,
      );
    });

  const createProvider = (providerValues: ProviderFormValues) => {
    createProviderMutation.mutate({
      provider: providerValues.provider.trim(),
      label: providerValues.label.trim(),
      compatibility: providerValues.compatibility,
      providerApiKey: providerValues.providerApiKey,
      baseUrl: providerValues.baseUrl.trim() || null,
      requestModel: providerValues.requestModel.trim(),
    });
  };

  const updateProvider = (providerId: string, providerValues: ProviderFormValues) => {
    const providerApiKey = providerValues.providerApiKey.trim();
    updateProviderMutation.mutate({
      providerId,
      values: {
        label: providerValues.label.trim(),
        compatibility: providerValues.compatibility,
        baseUrl: providerValues.baseUrl.trim() || null,
        requestModel: providerValues.requestModel.trim(),
        ...(providerApiKey ? { providerApiKey } : {}),
        isActive: providerValues.isActive,
      },
    });
  };

  return (
    <ContentGuard
      loading={coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings}
      error={coreSettingsQuery.error}
      onRetry={() => void coreSettingsQuery.refetch()}
    >
      <SystemSettingStack>
        <SystemSettingItem
          id="agent-effective-posture"
          title={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_DESC")}
        >
          <AgentCapabilitySummary values={values} />
        </SystemSettingItem>

        <SystemSettingItem
          id="agent-usage-governance"
          title={t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_DESC")}
          footer={
            <SystemSettingFooterActions
              dirty={governanceDirty}
              pending={savingKey === "agents.governance" || patchMutation.isPending}
              onReset={() =>
                form.reset({
                  ...form.getValues(),
                  monthlyBudgetUsd: initialValues.monthlyBudgetUsd,
                })
              }
              onSave={() => void saveGovernance()}
            />
          }
        >
          <div className="grid gap-3">
            <AgentUsageGovernance
              monthlyBudgetUsd={values.monthlyBudgetUsd}
              workspaceId={workspaceId}
              usagePeriod={usagePeriod}
              usageQuery={usageQuery}
              modelCatalogQuery={modelCatalogQuery}
            />
            <Controller
              control={form.control}
              name="monthlyBudgetUsd"
              render={({ field }) => (
                <SystemSettingField
                  label={t("settings:SETTINGS_SYSTEM_AGENTS_MONTHLY_BUDGET_LABEL")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_MONTHLY_BUDGET_DESC")}
                  message={
                    form.formState.errors.monthlyBudgetUsd?.message ? (
                      <span className="text-footnote text-destructive">
                        {form.formState.errors.monthlyBudgetUsd.message}
                      </span>
                    ) : null
                  }
                >
                  <Input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={field.value}
                    onChange={(event) => {
                      field.onChange(Number(event.target.value));
                      if (Number(event.target.value) > 0) {
                        form.clearErrors("monthlyBudgetUsd");
                      }
                    }}
                    className="sm:w-40"
                  />
                </SystemSettingField>
              )}
            />
          </div>
        </SystemSettingItem>

        <SystemSettingItem
          id="agent-providers"
          title={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDERS_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDERS_DESC")}
        >
          <AIProviderManagement
            providersQuery={providersQuery}
            pending={providerMutationPending}
            onCreate={createProvider}
            onUpdate={updateProvider}
            onDelete={(providerId) => deleteProviderMutation.mutate(providerId)}
          />
        </SystemSettingItem>

        <SystemSettingItem
          id="agent-runtime"
          title={t("settings:SETTINGS_SYSTEM_AGENTS_RUNTIME_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_AGENTS_RUNTIME_DESC")}
          footer={
            <SystemSettingFooterActions
              dirty={runtimeDirty}
              pending={savingKey === "agents.runtime" || patchMutation.isPending}
              onReset={() =>
                form.reset({
                  ...form.getValues(),
                  enabled: initialValues.enabled,
                  defaultModel: initialValues.defaultModel,
                  reasoningEffort: initialValues.reasoningEffort,
                  systemPrompt: initialValues.systemPrompt,
                  conversationRetentionDays: initialValues.conversationRetentionDays,
                  autoTitleEnabled: initialValues.autoTitleEnabled,
                  contextRecommendationsEnabled: initialValues.contextRecommendationsEnabled,
                })
              }
              onSave={() => void saveRuntime()}
            />
          }
        >
          <div className="grid gap-3">
            <Controller
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <SettingBooleanControl
                  title={t("settings:SETTINGS_SYSTEM_AGENTS_ENABLED_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_ENABLED_DESC")}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="defaultModel"
              render={({ field }) => (
                <ModelSelectField
                  label={t("settings:SETTINGS_SYSTEM_AGENTS_DEFAULT_MODEL_LABEL")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_DEFAULT_MODEL_DESC")}
                  value={field.value}
                  options={defaultModelOptions}
                  catalog={modelCatalogQuery.data}
                  disabled={defaultModelOptions.length === 0}
                  onValueChange={(value) => {
                    field.onChange(value);
                    if (value.trim()) form.clearErrors("defaultModel");
                  }}
                />
              )}
            />
            {form.formState.errors.defaultModel?.message ? (
              <span className="text-footnote text-destructive">
                {form.formState.errors.defaultModel.message}
              </span>
            ) : null}
            <Controller
              control={form.control}
              name="reasoningEffort"
              render={({ field }) => (
                <SelectField
                  label={t("settings:SETTINGS_SYSTEM_AGENTS_REASONING_LABEL")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_REASONING_DESC")}
                  value={field.value}
                  options={REASONING_OPTIONS}
                  getLabel={(value) =>
                    t(`settings:SETTINGS_SYSTEM_AGENTS_REASONING_${value.toUpperCase()}`)
                  }
                  onValueChange={field.onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="systemPrompt"
              render={({ field }) => (
                <SystemSettingField
                  label={t("settings:SETTINGS_SYSTEM_AGENTS_SYSTEM_PROMPT_LABEL")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_SYSTEM_PROMPT_DESC")}
                >
                  <Textarea
                    value={field.value}
                    onChange={field.onChange}
                    rows={5}
                    className="min-h-32 resize-y"
                    placeholder={t("settings:SETTINGS_SYSTEM_AGENTS_SYSTEM_PROMPT_PLACEHOLDER")}
                  />
                </SystemSettingField>
              )}
            />
            <Controller
              control={form.control}
              name="conversationRetentionDays"
              render={({ field }) => (
                <SystemSettingField
                  label={t("settings:SETTINGS_SYSTEM_AGENTS_RETENTION_LABEL")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_RETENTION_DESC")}
                  message={
                    form.formState.errors.conversationRetentionDays?.message ? (
                      <span className="text-footnote text-destructive">
                        {form.formState.errors.conversationRetentionDays.message}
                      </span>
                    ) : null
                  }
                >
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={field.value}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      field.onChange(nextValue);
                      if (validatePositiveInteger(nextValue) !== null) {
                        form.clearErrors("conversationRetentionDays");
                      }
                    }}
                    className="sm:w-40"
                  />
                </SystemSettingField>
              )}
            />
            <Controller
              control={form.control}
              name="autoTitleEnabled"
              render={({ field }) => (
                <SettingBooleanControl
                  title={t("settings:SETTINGS_SYSTEM_AGENTS_AUTO_TITLE_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_AUTO_TITLE_DESC")}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="contextRecommendationsEnabled"
              render={({ field }) => (
                <SettingBooleanControl
                  title={t("settings:SETTINGS_SYSTEM_AGENTS_CONTEXT_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_CONTEXT_DESC")}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>
        </SystemSettingItem>

        <SystemSettingItem
          id="agent-modes-skills"
          title={t("settings:SETTINGS_SYSTEM_AGENTS_MODES_SKILLS_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_AGENTS_MODES_SKILLS_DESC")}
          footer={
            <SystemSettingFooterActions
              dirty={modesDirty}
              pending={savingKey === "agents.modes" || patchMutation.isPending}
              onReset={() =>
                form.reset({
                  ...form.getValues(),
                  defaultMode: initialValues.defaultMode,
                  skillsEnabled: initialValues.skillsEnabled,
                  allowedSkillIds: initialValues.allowedSkillIds,
                })
              }
              onSave={() => void saveModes()}
            />
          }
        >
          <div className="grid gap-3">
            <Controller
              control={form.control}
              name="defaultMode"
              render={({ field }) => (
                <SelectField
                  label={t("settings:SETTINGS_SYSTEM_AGENTS_DEFAULT_MODE_LABEL")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_DEFAULT_MODE_DESC")}
                  value={field.value}
                  options={AGENT_MODE_OPTIONS}
                  getLabel={(value) =>
                    t(`settings:SETTINGS_SYSTEM_AGENTS_MODE_${value.toUpperCase()}`)
                  }
                  onValueChange={field.onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="skillsEnabled"
              render={({ field }) => (
                <SettingBooleanControl
                  title={t("settings:SETTINGS_SYSTEM_AGENTS_SKILLS_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_SKILLS_DESC")}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="allowedSkillIds"
              render={({ field }) => (
                <SystemSettingField
                  label={t("settings:SETTINGS_SYSTEM_AGENTS_SKILLS_LIBRARY_LABEL")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_SKILLS_LIBRARY_DESC")}
                  labelControls={false}
                >
                  <SkillLibraryEditor value={field.value} onChange={field.onChange} />
                </SystemSettingField>
              )}
            />
          </div>
        </SystemSettingItem>

        <SystemSettingItem
          id="agent-write-approvals"
          title={t("settings:SETTINGS_SYSTEM_AGENTS_APPROVALS_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_AGENTS_APPROVALS_DESC")}
          footer={
            <SystemSettingFooterActions
              dirty={approvalsDirty}
              pending={savingKey === "agents.approvals" || patchMutation.isPending}
              onReset={() =>
                form.reset({
                  ...form.getValues(),
                  writeToolsEnabled: initialValues.writeToolsEnabled,
                  approvalPolicy: initialValues.approvalPolicy,
                  dryRunRequired: initialValues.dryRunRequired,
                })
              }
              onSave={() => void saveApprovals()}
            />
          }
        >
          <div className="grid gap-3">
            <Controller
              control={form.control}
              name="writeToolsEnabled"
              render={({ field }) => (
                <SettingBooleanControl
                  title={t("settings:SETTINGS_SYSTEM_AGENTS_WRITE_TOOLS_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_WRITE_TOOLS_DESC")}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="approvalPolicy"
              render={({ field }) => (
                <SelectField
                  label={t("settings:SETTINGS_SYSTEM_AGENTS_APPROVAL_POLICY_LABEL")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_APPROVAL_POLICY_DESC")}
                  value={field.value}
                  options={APPROVAL_POLICY_OPTIONS}
                  getLabel={(value) =>
                    t(`settings:SETTINGS_SYSTEM_AGENTS_APPROVAL_POLICY_${value.toUpperCase()}`)
                  }
                  onValueChange={field.onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="dryRunRequired"
              render={({ field }) => (
                <SettingBooleanControl
                  title={t("settings:SETTINGS_SYSTEM_AGENTS_DRY_RUN_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_DRY_RUN_DESC")}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>
        </SystemSettingItem>

        <SystemSettingItem
          id="agent-langgraph"
          title={t("settings:SETTINGS_SYSTEM_AGENTS_LANGGRAPH_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_AGENTS_LANGGRAPH_DESC")}
          footer={
            <SystemSettingFooterActions
              dirty={langGraphDirty}
              pending={savingKey === "agents.langgraph" || patchMutation.isPending}
              onReset={() =>
                form.reset({
                  ...form.getValues(),
                  langGraphEnabled: initialValues.langGraphEnabled,
                  langGraphCheckpointer: initialValues.langGraphCheckpointer,
                  checkpointTtlDays: initialValues.checkpointTtlDays,
                  interruptResumeEnabled: initialValues.interruptResumeEnabled,
                })
              }
              onSave={() => void saveLangGraph()}
            />
          }
        >
          <div className="grid gap-3">
            <Controller
              control={form.control}
              name="langGraphEnabled"
              render={({ field }) => (
                <SettingBooleanControl
                  title={t("settings:SETTINGS_SYSTEM_AGENTS_LANGGRAPH_ENABLED_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_LANGGRAPH_ENABLED_DESC")}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="langGraphCheckpointer"
              render={({ field }) => (
                <SelectField
                  label={t("settings:SETTINGS_SYSTEM_AGENTS_CHECKPOINTER_LABEL")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_CHECKPOINTER_DESC")}
                  value={field.value}
                  options={CHECKPOINTER_OPTIONS}
                  getLabel={(value) =>
                    t(`settings:SETTINGS_SYSTEM_AGENTS_CHECKPOINTER_${value.toUpperCase()}`)
                  }
                  onValueChange={field.onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="checkpointTtlDays"
              render={({ field }) => (
                <SystemSettingField
                  label={t("settings:SETTINGS_SYSTEM_AGENTS_CHECKPOINT_TTL_LABEL")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_CHECKPOINT_TTL_DESC")}
                  message={
                    form.formState.errors.checkpointTtlDays?.message ? (
                      <span className="text-footnote text-destructive">
                        {form.formState.errors.checkpointTtlDays.message}
                      </span>
                    ) : null
                  }
                >
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={field.value}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      field.onChange(nextValue);
                      if (validatePositiveInteger(nextValue) !== null) {
                        form.clearErrors("checkpointTtlDays");
                      }
                    }}
                    className="sm:w-40"
                  />
                </SystemSettingField>
              )}
            />
            <Controller
              control={form.control}
              name="interruptResumeEnabled"
              render={({ field }) => (
                <SettingBooleanControl
                  title={t("settings:SETTINGS_SYSTEM_AGENTS_INTERRUPT_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_INTERRUPT_DESC")}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>
        </SystemSettingItem>
      </SystemSettingStack>
    </ContentGuard>
  );
}
