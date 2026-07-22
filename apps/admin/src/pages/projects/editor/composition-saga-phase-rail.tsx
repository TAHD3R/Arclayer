import { cn } from "@arclayer/lib/utils";
import type { BuilderCompositionSagaOut } from "@arclayer/openapi";
import { Check, CircleDashed, LoaderCircle, X } from "lucide-react";
import { useTranslation } from "react-i18next";

const RUNNING_STATUSES = new Set<BuilderCompositionSagaOut["status"]>([
  "planning_queued",
  "planning_running",
  "composition_queued",
  "composition_running",
]);

function phaseState(
  saga: BuilderCompositionSagaOut,
  phase: "planning" | "composition",
): "pending" | "active" | "review" | "complete" | "terminal" {
  if (saga.status === "failed" || saga.status === "cancelled") {
    if (saga.compositionGeneration) return phase === "planning" ? "complete" : "terminal";
    return phase === "planning" ? "terminal" : "pending";
  }
  if (phase === "planning") {
    if (saga.status === "planning_queued" || saga.status === "planning_running") return "active";
    if (saga.status === "planning_review_pending") return "review";
    return "complete";
  }
  if (saga.status === "composition_queued" || saga.status === "composition_running") {
    return "active";
  }
  if (saga.status === "composition_review_pending") return "review";
  if (saga.status === "completed") return "complete";
  return "pending";
}

export function CompositionSagaPhaseRail({ saga }: { saga: BuilderCompositionSagaOut }) {
  const { t } = useTranslation(["account", "errors"]);
  const busy = RUNNING_STATUSES.has(saga.status);
  return (
    <div
      role="status"
      aria-label={t("CREATION_EDITOR_COMPOSITION_SAGA_PHASE_RAIL")}
      aria-live="polite"
      aria-busy={busy}
      className="mt-4 border-t border-border pt-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption font-semibold text-label-primary">
            {t("CREATION_EDITOR_COMPOSITION_SAGA_TITLE")}
          </p>
          <p className="mt-0.5 text-caption text-label-secondary">
            {t(`CREATION_EDITOR_COMPOSITION_SAGA_STATUS_${saga.status.toUpperCase()}`)}
          </p>
        </div>
        <span className="shrink-0 font-mono text-caption text-label-secondary">
          {t("CREATION_EDITOR_COMPOSITION_SAGA_TARGET_COUNT", {
            count: saga.targets.length,
          })}
        </span>
      </div>

      <ol className="relative mt-3 space-y-2 before:absolute before:top-4 before:bottom-4 before:left-[0.4375rem] before:w-px before:bg-border">
        <SagaPhaseRow
          phase="planning"
          state={phaseState(saga, "planning")}
          jobId={saga.planningGeneration.jobId}
          sourceRevisionId={saga.initialBaseRevisionId}
          resultRevisionId={saga.planningResultRevisionId}
        />
        <SagaPhaseRow
          phase="composition"
          state={phaseState(saga, "composition")}
          jobId={saga.compositionGeneration?.jobId ?? null}
          sourceRevisionId={saga.planningResultRevisionId}
          resultRevisionId={saga.compositionResultRevisionId}
        />
      </ol>

      {saga.failure ? (
        <div className="mt-3 border-l-2 border-destructive pl-3 text-caption">
          <p className="font-semibold text-destructive">{saga.failure.code}</p>
          <p className="mt-0.5 text-label-secondary">
            {t(saga.failure.messageKey, { ns: "errors", defaultValue: saga.failure.code })}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function SagaPhaseRow({
  phase,
  state,
  jobId,
  sourceRevisionId,
  resultRevisionId,
}: Readonly<{
  phase: "planning" | "composition";
  state: "pending" | "active" | "review" | "complete" | "terminal";
  jobId: string | null;
  sourceRevisionId: string | null;
  resultRevisionId: string | null;
}>) {
  const { t } = useTranslation("account");
  const Icon =
    state === "complete"
      ? Check
      : state === "terminal"
        ? X
        : state === "active"
          ? LoaderCircle
          : CircleDashed;
  return (
    <li className="relative flex gap-3" data-state={state}>
      <span
        className={cn(
          "relative z-10 mt-1 flex size-3.5 shrink-0 items-center justify-center rounded-full border bg-background",
          state === "complete" && "border-primary bg-primary text-primary-foreground",
          state === "review" && "border-primary text-primary",
          state === "terminal" && "border-destructive text-destructive",
        )}
      >
        <Icon
          className={cn(
            "size-2.5",
            state === "active" && "animate-spin motion-reduce:animate-none",
          )}
          aria-hidden="true"
        />
      </span>
      <div className="min-w-0 flex-1 border-b border-border/70 pb-2 last:border-b-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption font-medium text-label-primary">
            {t(`CREATION_EDITOR_COMPOSITION_SAGA_PHASE_${phase.toUpperCase()}`)}
          </p>
          <span className="text-caption text-label-secondary">
            {t(`CREATION_EDITOR_COMPOSITION_SAGA_PHASE_STATE_${state.toUpperCase()}`)}
          </span>
        </div>
        <p
          className="mt-1 truncate font-mono text-caption text-label-secondary"
          title={jobId ?? undefined}
        >
          {jobId ?? t("CREATION_EDITOR_COMPOSITION_SAGA_JOB_PENDING")}
        </p>
        <p className="mt-0.5 truncate font-mono text-caption text-label-secondary">
          {sourceRevisionId ?? "—"} → {resultRevisionId ?? "—"}
        </p>
      </div>
    </li>
  );
}
