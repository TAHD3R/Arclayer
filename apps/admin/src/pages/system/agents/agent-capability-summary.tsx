import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { BaseTag } from "@/components/ui/tags";

type AgentMode = "build" | "plan" | "agent";
type ReasoningEffort = "low" | "medium" | "high";
type ApprovalPolicy =
  | "always_approve"
  | "approve_bulk_only"
  | "approve_schema_only"
  | "auto_approved";
type Checkpointer = "database" | "memory";
type SummaryTagColor = "default" | "green" | "blue" | "red" | "gold";

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

function SummaryRow(props: { label: string; value: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1 border-t border-border/70 py-3 first:border-t-0 sm:grid-cols-[minmax(8rem,0.35fr)_minmax(0,1fr)] sm:gap-4">
      <div className="text-headline text-label-primary">{props.label}</div>
      <div className="grid min-w-0 gap-2 text-footnote text-label-primary">{props.value}</div>
    </div>
  );
}

function SummaryTag(props: { children: ReactNode; color?: SummaryTagColor }) {
  return (
    <BaseTag color={props.color} textStyle="footnote" className="max-w-full">
      {props.children}
    </BaseTag>
  );
}

function SummaryDatum(props: { label: string; value: ReactNode; color?: SummaryTagColor }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
      <span className="shrink-0 text-headline text-label-secondary">{props.label}</span>
      <SummaryTag color={props.color}>{props.value}</SummaryTag>
    </span>
  );
}

function BoolDatum(props: { label: string; value: boolean; on: string; off: string }) {
  return (
    <SummaryDatum
      label={props.label}
      value={props.value ? props.on : props.off}
      color={props.value ? "green" : "default"}
    />
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

  const policy = t(
    `settings:SETTINGS_SYSTEM_AGENTS_APPROVAL_POLICY_${values.approvalPolicy.toUpperCase()}`,
  );
  const checkpointer = t(
    `settings:SETTINGS_SYSTEM_AGENTS_CHECKPOINTER_${values.langGraphCheckpointer.toUpperCase()}`,
  );

  return (
    <div className="min-w-0">
      <SummaryRow
        label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_RUNTIME")}
        value={
          values.enabled ? (
            <>
              <SummaryDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_DEFAULT_MODE_LABEL")}
                value={t(
                  `settings:SETTINGS_SYSTEM_AGENTS_MODE_${values.defaultMode.toUpperCase()}`,
                )}
                color="green"
              />
              <SummaryDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_DEFAULT_MODEL_LABEL")}
                value={
                  values.defaultModel || t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_MODEL_EMPTY")
                }
              />
              <SummaryDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_REASONING_LABEL")}
                value={t(
                  `settings:SETTINGS_SYSTEM_AGENTS_REASONING_${values.reasoningEffort.toUpperCase()}`,
                )}
                color="blue"
              />
            </>
          ) : (
            <SummaryDatum
              label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_STATUS_LABEL")}
              value={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_RUNTIME_DISABLED")}
              color="red"
            />
          )
        }
      />
      <SummaryRow
        label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_CONVERSATIONS")}
        value={
          <>
            <BoolDatum
              label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_AUTO_TITLE_LABEL")}
              value={values.autoTitleEnabled}
              on={on}
              off={off}
            />
            <BoolDatum
              label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_CONTEXT_LABEL")}
              value={values.contextRecommendationsEnabled}
              on={on}
              off={off}
            />
            <SummaryDatum
              label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_RETENTION_LABEL")}
              value={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_RETENTION_DAYS", {
                days: values.conversationRetentionDays,
              })}
              color="blue"
            />
          </>
        }
      />
      <SummaryRow
        label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_SKILLS")}
        value={
          values.skillsEnabled ? (
            <SummaryDatum
              label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_SKILL_ALLOWLIST_LABEL")}
              value={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_SKILLS_VALUE", {
                count: allowedSkillCount,
              })}
              color="blue"
            />
          ) : (
            <SummaryDatum
              label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_STATUS_LABEL")}
              value={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_SKILLS_DISABLED")}
            />
          )
        }
      />
      <SummaryRow
        label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_WRITES")}
        value={
          !values.writeToolsEnabled ? (
            <SummaryDatum
              label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_STATUS_LABEL")}
              value={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_WRITES_DISABLED")}
            />
          ) : !values.dryRunRequired ? (
            <>
              <SummaryDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_APPROVAL_POLICY_LABEL")}
                value={policy}
                color="blue"
              />
              <SummaryDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_DRY_RUN_LABEL")}
                value={off}
                color="gold"
              />
              <SummaryDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_STATUS_LABEL")}
                value={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_WRITES_NEEDS_DRY_RUN_VALUE")}
                color="gold"
              />
            </>
          ) : values.approvalPolicy === "approve_schema_only" ? (
            <>
              <SummaryDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_APPROVAL_POLICY_LABEL")}
                value={policy}
                color="blue"
              />
              <BoolDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_SCHEMA_PROPOSALS_LABEL")}
                value={true}
                on={on}
                off={off}
              />
              <BoolDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_CONTENT_WRITES_LABEL")}
                value={false}
                on={on}
                off={off}
              />
              <BoolDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_DRY_RUN_LABEL")}
                value={values.dryRunRequired}
                on={on}
                off={off}
              />
            </>
          ) : writePolicyUnsupported(values.approvalPolicy) ? (
            <>
              <SummaryDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_APPROVAL_POLICY_LABEL")}
                value={policy}
                color="gold"
              />
              <SummaryDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_WRITES_RUNTIME_LABEL")}
                value={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_WRITES_UNSUPPORTED_VALUE")}
                color="gold"
              />
              <BoolDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_DRY_RUN_LABEL")}
                value={values.dryRunRequired}
                on={on}
                off={off}
              />
            </>
          ) : (
            <>
              <SummaryDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_APPROVAL_POLICY_LABEL")}
                value={policy}
                color="blue"
              />
              <BoolDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_DRY_RUN_LABEL")}
                value={values.dryRunRequired}
                on={on}
                off={off}
              />
            </>
          )
        }
      />
      <SummaryRow
        label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_LANGGRAPH")}
        value={
          values.langGraphEnabled ? (
            <>
              <SummaryDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_CHECKPOINTER_LABEL")}
                value={checkpointer}
                color="green"
              />
              <SummaryDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_RETENTION_LABEL")}
                value={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_RETENTION_DAYS", {
                  days: values.checkpointTtlDays,
                })}
                color="blue"
              />
              <BoolDatum
                label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_INTERRUPT_RESUME_LABEL")}
                value={values.interruptResumeEnabled}
                on={on}
                off={off}
              />
            </>
          ) : (
            <SummaryDatum
              label={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_STATUS_LABEL")}
              value={t("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_LANGGRAPH_DISABLED")}
            />
          )
        }
      />
    </div>
  );
}
