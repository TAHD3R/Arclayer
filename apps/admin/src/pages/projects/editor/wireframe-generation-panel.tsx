import { cn } from "@arclayer/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@arclayer/ui/avatar";
import { Button } from "@arclayer/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Textarea } from "@arclayer/ui/textarea";
import type { BuilderCompositionSagaOut, BuilderGenerationOut } from "@arclayer/openapi";
import { AlertTriangle, Check, CircleDashed, LoaderCircle, Sparkles, Square } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AIWorkspaceAgentCatalogItem } from "@/api/ai";
import { CompositionSagaPhaseRail } from "@/pages/projects/editor/composition-saga-phase-rail";
import { WireframeGenerationTargetSelector } from "@/pages/projects/editor/wireframe-generation-target-selector";
import type { WireframeGenerationTargetOption } from "@/pages/projects/editor/wireframe-generation-targets";

interface WireframeGenerationPanelProps {
  selectedTargets: readonly WireframeGenerationTargetOption[];
  availableTargets: readonly WireframeGenerationTargetOption[];
  onAddTarget: (target: WireframeGenerationTargetOption) => void;
  onRemoveTarget: (target: WireframeGenerationTargetOption) => void;
  onMoveTarget: (target: WireframeGenerationTargetOption, direction: -1 | 1) => void;
  agents: AIWorkspaceAgentCatalogItem[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  objective: string;
  onObjectiveChange: (objective: string) => void;
  candidateCount: number;
  onCandidateCountChange: (count: number) => void;
  generation: BuilderGenerationOut | null;
  compositionSaga: BuilderCompositionSagaOut | null;
  startMode: "direct" | "plan_first";
  selectedCandidateIndex: number | null;
  onSelectCandidate: (candidateIndex: number) => void;
  onStart: () => void;
  onCancel: () => void;
  starting: boolean;
  cancelling: boolean;
  canStart: boolean;
  active: boolean;
  startDisabledReason: string;
  error: string | null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function WireframeGenerationPanel({
  selectedTargets,
  availableTargets,
  onAddTarget,
  onRemoveTarget,
  onMoveTarget,
  agents,
  selectedAgentId,
  onSelectAgent,
  objective,
  onObjectiveChange,
  candidateCount,
  onCandidateCountChange,
  generation,
  compositionSaga,
  startMode,
  selectedCandidateIndex,
  onSelectCandidate,
  onStart,
  onCancel,
  starting,
  cancelling,
  canStart,
  active,
  startDisabledReason,
  error,
}: WireframeGenerationPanelProps) {
  const { t } = useTranslation(["account", "errors"]);
  return (
    <section
      aria-label={t("CREATION_EDITOR_WIREFRAME_GENERATION_LABEL")}
      className="border-b border-border bg-muted/20 px-4 py-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-footnote font-semibold text-label-primary">
            {t("CREATION_EDITOR_WIREFRAME_GENERATION_TITLE")}
          </h3>
          <p className="mt-0.5 text-caption leading-5 text-label-secondary">
            {t("CREATION_EDITOR_WIREFRAME_GENERATION_DESC", {
              count: selectedTargets.length,
            })}
          </p>
        </div>
      </div>

      <WireframeGenerationTargetSelector
        selectedTargets={selectedTargets}
        availableTargets={availableTargets}
        disabled={active}
        onAdd={onAddTarget}
        onRemove={onRemoveTarget}
        onMove={onMoveTarget}
      />

      <div
        className="mt-4 flex gap-2 overflow-x-auto pb-1"
        role="list"
        aria-label={t("CREATION_EDITOR_WIREFRAME_GENERATION_AGENT_SELECT")}
      >
        {agents.map((agent) => {
          const selected = agent.agentId === selectedAgentId;
          return (
            <button
              key={agent.agentId}
              type="button"
              role="listitem"
              aria-pressed={selected}
              disabled={active}
              onClick={() => onSelectAgent(agent.agentId)}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60 motion-reduce:transition-none",
                selected
                  ? "border-primary bg-background shadow-[0_0_0_1px_var(--primary)]"
                  : "border-border bg-background/70 hover:bg-background",
              )}
            >
              <Avatar size="sm">
                {agent.avatarUrl ? <AvatarImage src={agent.avatarUrl} alt="" /> : null}
                <AvatarFallback>{initials(agent.name)}</AvatarFallback>
              </Avatar>
              <span className="max-w-28 truncate text-caption font-medium text-label-primary">
                {agent.name}
              </span>
              {selected ? <Check className="size-3.5 text-primary" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      {agents.length === 0 ? (
        <p className="mt-3 text-caption text-label-secondary">
          {t("CREATION_EDITOR_WIREFRAME_GENERATION_AGENT_EMPTY")}
        </p>
      ) : null}

      <label
        htmlFor="wireframe-generation-objective"
        className="mt-4 block text-caption font-semibold text-label-primary"
      >
        {t("CREATION_EDITOR_WIREFRAME_GENERATION_OBJECTIVE_LABEL")}
      </label>
      <Textarea
        id="wireframe-generation-objective"
        value={objective}
        disabled={active}
        maxLength={8000}
        onChange={(event) => onObjectiveChange(event.target.value)}
        placeholder={t("CREATION_EDITOR_WIREFRAME_GENERATION_OBJECTIVE_PLACEHOLDER")}
        className="mt-2 min-h-24 resize-none bg-background text-footnote"
      />

      <div className="mt-3 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="wireframe-generation-count"
            className="text-caption font-medium text-label-secondary"
          >
            {t("CREATION_EDITOR_WIREFRAME_GENERATION_COUNT_LABEL")}
          </label>
          <Select
            value={String(candidateCount)}
            disabled={active}
            onValueChange={(value) => onCandidateCountChange(Number(value))}
          >
            <SelectTrigger
              id="wireframe-generation-count"
              className="mt-1 w-full bg-background"
              aria-label={t("CREATION_EDITOR_WIREFRAME_GENERATION_COUNT_LABEL")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3].map((count) => (
                <SelectItem key={count} value={String(count)}>
                  {t("CREATION_EDITOR_WIREFRAME_GENERATION_COUNT", { count })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {active ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label={t(
              compositionSaga
                ? "CREATION_EDITOR_COMPOSITION_SAGA_CANCEL"
                : "CREATION_EDITOR_WIREFRAME_GENERATION_CANCEL",
            )}
            loading={cancelling}
            onClick={onCancel}
          >
            <Square className="size-3.5" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="button"
            className="min-h-11 flex-1"
            disabled={!canStart}
            loading={starting}
            title={!canStart ? startDisabledReason : undefined}
            onClick={onStart}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {t(
              startMode === "plan_first"
                ? "CREATION_EDITOR_COMPOSITION_SAGA_PLAN_FIRST"
                : "CREATION_EDITOR_WIREFRAME_GENERATION_START",
            )}
          </Button>
        )}
      </div>
      {!canStart && !active ? (
        <p className="mt-2 text-caption leading-5 text-label-secondary">{startDisabledReason}</p>
      ) : null}
      {startMode === "plan_first" && !active ? (
        <p className="mt-2 text-caption leading-5 text-label-secondary">
          {t("CREATION_EDITOR_COMPOSITION_SAGA_PLAN_FIRST_DESC")}
        </p>
      ) : null}

      {compositionSaga ? <CompositionSagaPhaseRail saga={compositionSaga} /> : null}
      {generation ? (
        <GenerationEvidence
          generation={generation}
          hideProgress={Boolean(compositionSaga)}
          selectedCandidateIndex={selectedCandidateIndex}
          onSelectCandidate={onSelectCandidate}
        />
      ) : null}
      {error ? (
        <div
          role="alert"
          className="mt-4 flex gap-2 border-t border-destructive/30 pt-3 text-caption text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
    </section>
  );
}

function GenerationEvidence({
  generation,
  hideProgress,
  selectedCandidateIndex,
  onSelectCandidate,
}: {
  generation: BuilderGenerationOut;
  hideProgress: boolean;
  selectedCandidateIndex: number | null;
  onSelectCandidate: (candidateIndex: number) => void;
}) {
  const { t } = useTranslation(["account", "errors"]);
  const active = generation.status === "queued" || generation.status === "running";
  const StatusIcon = active
    ? LoaderCircle
    : generation.status === "failed"
      ? AlertTriangle
      : CircleDashed;
  return (
    <div className="mt-4 border-t border-border pt-4" aria-live="polite" aria-busy={active}>
      {!hideProgress ? (
        <div className="flex items-start gap-2">
          <StatusIcon
            className={cn(
              "mt-0.5 size-4 shrink-0 text-label-secondary",
              active && "animate-spin motion-reduce:animate-none",
            )}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-caption font-semibold text-label-primary">
              {t(`CREATION_EDITOR_WIREFRAME_GENERATION_STATUS_${generation.status.toUpperCase()}`)}
            </p>
            <p className="mt-0.5 text-caption text-label-secondary">
              {t("CREATION_EDITOR_WIREFRAME_GENERATION_PROGRESS", {
                completed: generation.progressCompleted,
                total: generation.progressTotal ?? generation.candidates.length,
              })}
            </p>
          </div>
        </div>
      ) : null}

      {generation.failures.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {generation.failures.map((failure) => (
            <li
              key={`${failure.candidateIndex}:${failure.code}`}
              className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-caption"
            >
              <p className="font-semibold text-destructive">
                {t("CREATION_EDITOR_WIREFRAME_GENERATION_CANDIDATE_FAILED", {
                  index: failure.candidateIndex + 1,
                })}
              </p>
              <p className="mt-0.5 text-label-secondary">
                {t(failure.messageKey, { ns: "errors", defaultValue: failure.code })}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {generation.candidates.length > 0 ? (
        <div className="mt-3">
          <p className="text-caption font-medium text-label-secondary">
            {t("CREATION_EDITOR_WIREFRAME_GENERATION_CANDIDATES")}
          </p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {generation.candidates.map((candidate) => {
              const selected = candidate.candidateIndex === selectedCandidateIndex;
              const blockers = candidate.changeSet.issues.filter(
                (issue) => issue.severity === "blocker",
              ).length;
              return (
                <button
                  key={candidate.candidateIndex}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectCandidate(candidate.candidateIndex)}
                  className={cn(
                    "min-h-11 shrink-0 rounded-md border px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  <span className="block text-caption font-semibold">
                    {t("CREATION_EDITOR_WIREFRAME_GENERATION_CANDIDATE", {
                      index: candidate.candidateIndex + 1,
                    })}
                  </span>
                  <span className="mt-0.5 block text-caption opacity-75">
                    {t("CREATION_EDITOR_WIREFRAME_GENERATION_CANDIDATE_EVIDENCE", {
                      operations: candidate.changeSet.operations.length,
                      blockers,
                    })}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-caption leading-5 text-label-secondary">
            {t("CREATION_EDITOR_WIREFRAME_GENERATION_REVIEW_HINT")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
