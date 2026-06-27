import { useTranslation } from "react-i18next";

type AgentMode = "build" | "plan" | "agent";
type ReasoningEffort = "low" | "medium" | "high";
type ApprovalPolicy =
  | "always_approve"
  | "approve_bulk_only"
  | "approve_schema_only"
  | "auto_approved";
type Checkpointer = "database" | "memory";

export type AgentCapabilitySummaryValues = {
  enabled: boolean;
  defaultMode: AgentMode;
  defaultModel: string;
  reasoningEffort: ReasoningEffort;
  conversationRetentionDays: number;
  autoTitleEnabled: boolean;
  contextRecommendationsEnabled: boolean;
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

function countAllowedSkills(value: string): number {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function SummaryRow(props: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 border-t border-border/70 py-3 first:border-t-0 sm:grid-cols-[minmax(8rem,0.35fr)_minmax(0,1fr)] sm:gap-4">
      <div className="text-caption font-medium text-label-secondary">{props.label}</div>
      <div className="min-w-0 text-footnote text-label-primary">{props.value}</div>
    </div>
  );
}

function writePolicyUnsupported(policy: ApprovalPolicy): boolean {
  return policy === "approve_bulk_only" || policy === "auto_approved";
}

export function AgentCapabilitySummary(props: { values: AgentCapabilitySummaryValues }) {
  const { t } = useTranslation(["settings"]);
  const values = props.values;
  const allowedSkillCount = countAllowedSkills(values.allowedSkillIds);
  const on = t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_ON");
  const off = t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_OFF");

  const runtime = values.enabled
    ? t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_RUNTIME_ENABLED", {
        mode: t(`settings:SETTINGS_SYSTEM_AGENTS_MODE_${values.defaultMode.toUpperCase()}`),
        model: values.defaultModel || t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_MODEL_EMPTY"),
        reasoning: t(
          `settings:SETTINGS_SYSTEM_AGENTS_REASONING_${values.reasoningEffort.toUpperCase()}`,
        ),
      })
    : t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_RUNTIME_DISABLED");

  const conversations = t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_CONVERSATIONS_VALUE", {
    days: values.conversationRetentionDays,
    autoTitle: values.autoTitleEnabled ? on : off,
    context: values.contextRecommendationsEnabled ? on : off,
  });

  const skills = values.skillsEnabled
    ? t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_SKILLS_VALUE", {
        count: allowedSkillCount,
      })
    : t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_SKILLS_DISABLED");

  const policy = t(
    `settings:SETTINGS_SYSTEM_AGENTS_APPROVAL_POLICY_${values.approvalPolicy.toUpperCase()}`,
  );
  const writes = !values.writeToolsEnabled
    ? t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_WRITES_DISABLED")
    : !values.dryRunRequired
      ? t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_WRITES_DRY_RUN_REQUIRED")
      : values.approvalPolicy === "approve_schema_only"
        ? t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_WRITES_SCHEMA_ONLY", {
            dryRun: on,
          })
        : writePolicyUnsupported(values.approvalPolicy)
          ? t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_WRITES_POLICY_UNSUPPORTED", { policy })
          : t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_WRITES_ENABLED", {
              policy,
              dryRun: on,
            });

  const langGraph = values.langGraphEnabled
    ? t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_LANGGRAPH_ENABLED", {
        checkpointer: t(
          `settings:SETTINGS_SYSTEM_AGENTS_CHECKPOINTER_${values.langGraphCheckpointer.toUpperCase()}`,
        ),
        days: values.checkpointTtlDays,
        interrupt: values.interruptResumeEnabled ? on : off,
      })
    : t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_LANGGRAPH_DISABLED");

  return (
    <div className="min-w-0">
      <SummaryRow label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_RUNTIME")} value={runtime} />
      <SummaryRow
        label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_CONVERSATIONS")}
        value={conversations}
      />
      <SummaryRow label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_SKILLS")} value={skills} />
      <SummaryRow label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_WRITES")} value={writes} />
      <SummaryRow
        label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_LANGGRAPH")}
        value={langGraph}
      />
    </div>
  );
}
