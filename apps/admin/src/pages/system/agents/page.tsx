import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import {
  getAIMonthlyUsageSummary,
  listAIModels,
  type AIMonthlyUsageSummary,
  type AIModelCatalogResponse,
} from "@/api/ai";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
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
const DEFAULT_SKILL_IDS_PLACEHOLDER =
  "content.analysis\ncontent.planning\ncontent.build\ncontent.modeling\ncontent.writer\ncontent.modeler";

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

function availableModelIds(catalog: AIModelCatalogResponse | undefined): Set<string> {
  return new Set(catalog?.models.filter((model) => model.available).map((model) => model.id) ?? []);
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
          <span>
            {t("settings:SETTINGS_SYSTEM_AGENTS_USAGE_COST", {
              value: statusText({
                loading: props.usageQuery.isLoading,
                error: props.usageQuery.error,
                unavailable: formatCostMicros(0),
                loadingText: t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_LOADING"),
                errorText: t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_ERROR"),
                value: usage ? formatCostMicros(usage.totalCostMicros) : "",
              }),
            })}
          </span>
          <span>
            {t("settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET", {
              value: formatCostMicros(monthlyBudgetMicros),
            })}
          </span>
          <span>
            {t("settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET_USED", {
              value: statusText({
                loading: props.usageQuery.isLoading,
                error: props.usageQuery.error,
                unavailable: formatPercent(0),
                loadingText: t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_LOADING"),
                errorText: t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_ERROR"),
                value: usage ? formatPercent(budgetUsedRatio) : "",
              }),
            })}
          </span>
          <span>
            {t(
              budgetRemainingMicros < 0
                ? "settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET_OVER"
                : "settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET_REMAINING",
              {
                value: statusText({
                  loading: props.usageQuery.isLoading,
                  error: props.usageQuery.error,
                  unavailable: formatCostMicros(monthlyBudgetMicros),
                  loadingText: t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_LOADING"),
                  errorText: t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_ERROR"),
                  value: usage ? formatCostMicros(Math.abs(budgetRemainingMicros)) : "",
                }),
              },
            )}
          </span>
          <span>
            {t("settings:SETTINGS_SYSTEM_AGENTS_USAGE_REQUESTS", {
              value: usage ? formatInteger(usage.totalRequests) : "0",
            })}
          </span>
          <span>
            {t("settings:SETTINGS_SYSTEM_AGENTS_USAGE_PROMPT_TOKENS", {
              value: usage ? formatInteger(usage.totalPromptTokens) : "0",
            })}
          </span>
          <span>
            {t("settings:SETTINGS_SYSTEM_AGENTS_USAGE_COMPLETION_TOKENS", {
              value: usage ? formatInteger(usage.totalCompletionTokens) : "0",
            })}
          </span>
        </div>
      </SystemSettingRow>
      <SystemSettingRow
        title={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_DESC")}
      >
        <div className="grid gap-2 text-footnote text-label-primary sm:grid-cols-2">
          <span>
            {t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_MODELS", {
              value: statusText({
                loading: props.modelCatalogQuery.isLoading,
                error: props.modelCatalogQuery.error,
                unavailable: "0",
                loadingText: t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_LOADING"),
                errorText: t("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_ERROR"),
                value: String(availableModels),
              }),
            })}
          </span>
          <span>
            {t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_DEFAULT_MODEL", {
              value:
                catalog?.defaultModel ?? t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_MODEL_EMPTY"),
            })}
          </span>
          <span className="sm:col-span-2">
            {t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_KEYS", {
              value: providers.length
                ? providers.join(", ")
                : t("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_KEYS_EMPTY"),
            })}
          </span>
        </div>
      </SystemSettingRow>
    </div>
  );
}

export function SystemSettingsAgentsPage() {
  const { t } = useTranslation(["settings"]);
  const { savingKey, withSavingKey } = useSavingKey();
  const coreSettingsQuery = useSystemCoreSettings();
  const patchMutation = usePatchSystemCoreSettings();
  const workspaceId = useWorkspaceStore(
    (state) => state.currentWorkspaceId ?? state.lastWorkspaceId,
  );
  const usagePeriod = useMemo(() => currentUsagePeriod(), []);
  const usageQuery = useQuery({
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
  const modelCatalogQuery = useQuery({
    queryKey: ["ai", "chat-models", workspaceId],
    queryFn: ({ signal }) => listAIModels({ workspaceId: String(workspaceId), signal }),
    enabled: Boolean(workspaceId),
    retry: false,
    meta: { silent: true },
  });

  const initialValues = useMemo(
    () => buildInitialValues(coreSettingsQuery.coreSettings),
    [coreSettingsQuery.coreSettings],
  );

  const form = useForm<AgentsFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });
  const values = form.watch();

  const runtimeDirty = isDirty(values, initialValues, [
    "enabled",
    "defaultModel",
    "reasoningEffort",
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
      const selectableModels = availableModelIds(modelCatalogQuery.data);
      if (selectableModels.size > 0 && !selectableModels.has(defaultModel)) {
        form.setError("defaultModel", {
          type: "validate",
          message: t("settings:SETTINGS_SYSTEM_AGENTS_DEFAULT_MODEL_UNAVAILABLE"),
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
            conversation_retention_days: conversationRetentionDays,
            auto_title_enabled: Boolean(nextValues.autoTitleEnabled),
            context_recommendations_enabled: Boolean(nextValues.contextRecommendationsEnabled),
          },
        },
        { ...nextValues, defaultModel, conversationRetentionDays },
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
                <SystemSettingField
                  label={t("settings:SETTINGS_SYSTEM_AGENTS_DEFAULT_MODEL_LABEL")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_DEFAULT_MODEL_DESC")}
                  message={
                    form.formState.errors.defaultModel?.message ? (
                      <span className="text-footnote text-destructive">
                        {form.formState.errors.defaultModel.message}
                      </span>
                    ) : null
                  }
                >
                  <Input
                    {...field}
                    placeholder="deepseek-v4-pro"
                    className="sm:w-72"
                    onChange={(event) => {
                      field.onChange(event);
                      if (event.target.value.trim()) {
                        form.clearErrors("defaultModel");
                      }
                    }}
                  />
                </SystemSettingField>
              )}
            />
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
                  label={t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_IDS_LABEL")}
                  description={t("settings:SETTINGS_SYSTEM_AGENTS_SKILL_IDS_DESC")}
                >
                  <Textarea {...field} rows={5} placeholder={DEFAULT_SKILL_IDS_PLACEHOLDER} />
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
