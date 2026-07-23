import { CircleAlert, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SystemPluginOperation } from "@/api/plugins";
import { BaseTag } from "@/components/ui/tags";
import { Progress } from "@arclayer/ui/progress";

const TERMINAL_OPERATION_STATES = new Set<SystemPluginOperation["state"]>([
  "succeeded",
  "failed",
  "cancelled",
]);

export function isTerminalPluginOperation(operation: SystemPluginOperation) {
  return TERMINAL_OPERATION_STATES.has(operation.state);
}

function operationProgress(operation: SystemPluginOperation) {
  if (!operation.progressTotal || operation.progressTotal <= 0) return 0;
  return Math.min(100, Math.round((operation.progressCompleted / operation.progressTotal) * 100));
}

function operationStateColor(operation: SystemPluginOperation) {
  if (operation.state === "succeeded") return "green" as const;
  if (operation.state === "failed" || operation.state === "cancelled") return "red" as const;
  if (operation.state === "waiting_for_restart") return "gold" as const;
  return "blue" as const;
}

export function PluginOperationStatus(props: { operation: SystemPluginOperation }) {
  const { t } = useTranslation(["settings", "errors"]);
  const operation = props.operation;

  return (
    <section className="rounded-lg border bg-muted/20 p-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {!isTerminalPluginOperation(operation) ? (
            <RotateCw className="size-4 animate-spin text-label-secondary" aria-hidden="true" />
          ) : null}
          <h3 className="text-footnote font-semibold text-label-primary">
            {t(`SETTINGS_SYSTEM_PLUGIN_OPERATION_${operation.kind.toUpperCase()}_TITLE`)}
          </h3>
        </div>
        <BaseTag color={operationStateColor(operation)}>
          {t(`SETTINGS_SYSTEM_PLUGIN_OPERATION_STATE_${operation.state.toUpperCase()}`)}
        </BaseTag>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-3 text-caption text-label-secondary">
          <span>
            {t(`SETTINGS_SYSTEM_PLUGIN_OPERATION_PHASE_${operation.phase.toUpperCase()}`)}
          </span>
          <span className="font-mono tabular-nums">{operationProgress(operation)}%</span>
        </div>
        <Progress
          value={operationProgress(operation)}
          aria-label={t("SETTINGS_SYSTEM_PLUGIN_PROGRESS")}
        />
      </div>

      {operation.restartRequired && !operation.activationVerified ? (
        <p className="mt-3 text-footnote leading-6 text-label-secondary">
          {t("SETTINGS_SYSTEM_PLUGIN_WAITING_FOR_RESTART")}
        </p>
      ) : null}

      {operation.failureSummary ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-footnote text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {operation.failureCode
              ? t(`errors:${operation.failureCode}`, { defaultValue: operation.failureSummary })
              : operation.failureSummary}
          </span>
        </div>
      ) : null}
    </section>
  );
}
