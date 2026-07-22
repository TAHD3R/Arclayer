import { cn } from "@arclayer/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@arclayer/ui/avatar";
import { Button } from "@arclayer/ui/button";
import { Progress } from "@arclayer/ui/progress";
import { Textarea } from "@arclayer/ui/textarea";
import type { BuilderGenerationOut } from "@arclayer/openapi";
import { AlertTriangle, Check, LoaderCircle, Sparkles, Square, SwatchBook } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AIWorkspaceAgentCatalogItem } from "@/api/ai";
import { BaseTag, lucideTagIcon } from "@/components/ui/tags";

const TERMINAL_STATUSES = new Set<BuilderGenerationOut["status"]>([
  "partial",
  "succeeded",
  "failed",
  "cancelled",
]);

interface DesignGenerationPanelProps {
  agents: readonly AIWorkspaceAgentCatalogItem[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  objective: string;
  onObjectiveChange: (objective: string) => void;
  candidateCount: number;
  onCandidateCountChange: (count: number) => void;
  generation: BuilderGenerationOut | null;
  selectedCandidateIndex: number | null;
  onSelectCandidate: (candidateIndex: number) => void;
  onStart: () => void;
  onCancel: () => void;
  starting: boolean;
  cancelling: boolean;
  canStart: boolean;
  startDisabledReason: string;
  recoveryPending: boolean;
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

export function DesignGenerationPanel({
  agents,
  selectedAgentId,
  onSelectAgent,
  objective,
  onObjectiveChange,
  candidateCount,
  onCandidateCountChange,
  generation,
  selectedCandidateIndex,
  onSelectCandidate,
  onStart,
  onCancel,
  starting,
  cancelling,
  canStart,
  startDisabledReason,
  recoveryPending,
  error,
}: DesignGenerationPanelProps) {
  const { t } = useTranslation(["account", "errors"]);
  const active = Boolean(generation && !TERMINAL_STATUSES.has(generation.status));
  const progress =
    generation?.progressTotal && generation.progressTotal > 0
      ? Math.min(100, (generation.progressCompleted / generation.progressTotal) * 100)
      : null;

  return (
    <section aria-labelledby="design-agent-heading" className="space-y-4 px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="design-agent-heading" className="text-footnote font-semibold text-label-primary">
            {t("CREATION_EDITOR_DESIGN_GENERATION_TITLE")}
          </h3>
          <p className="mt-1 text-caption leading-5 text-label-secondary">
            {t("CREATION_EDITOR_DESIGN_GENERATION_DESC")}
          </p>
        </div>
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      </div>

      {agents.length > 0 ? (
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          role="list"
          aria-label={t("CREATION_EDITOR_DESIGN_GENERATION_AGENT_SELECT")}
        >
          {agents.map((agent) => {
            const selected = agent.agentId === selectedAgentId;
            return (
              <div key={agent.agentId} role="listitem">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectAgent(agent.agentId)}
                  className={cn(
                    "flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none",
                    selected
                      ? "border-primary bg-primary/5 shadow-[0_0_0_1px_var(--primary)]"
                      : "border-border hover:bg-muted/60",
                  )}
                >
                  <Avatar size="sm">
                    {agent.avatarUrl ? <AvatarImage src={agent.avatarUrl} alt="" /> : null}
                    <AvatarFallback>{initials(agent.name)}</AvatarFallback>
                  </Avatar>
                  <span className="max-w-32 truncate text-caption font-medium text-label-primary">
                    {agent.name}
                  </span>
                  {selected ? <Check className="size-3.5 text-primary" aria-hidden="true" /> : null}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-3 text-caption text-label-secondary">
          {t("CREATION_EDITOR_DESIGN_GENERATION_AGENT_EMPTY")}
        </p>
      )}

      <label
        htmlFor="design-generation-objective"
        className="block text-caption font-medium text-label-secondary"
      >
        {t("CREATION_EDITOR_DESIGN_GENERATION_OBJECTIVE_LABEL")}
      </label>
      <Textarea
        id="design-generation-objective"
        value={objective}
        onChange={(event) => onObjectiveChange(event.target.value)}
        placeholder={t("CREATION_EDITOR_DESIGN_GENERATION_OBJECTIVE_PLACEHOLDER")}
        className="min-h-24 resize-none"
        maxLength={8000}
        disabled={active}
      />

      <div className="flex items-center justify-between gap-3">
        <span className="text-caption font-medium text-label-secondary">
          {t("CREATION_EDITOR_DESIGN_GENERATION_DIRECTIONS_LABEL")}
        </span>
        <div
          className="flex rounded-lg border border-border bg-muted/35 p-0.5"
          role="group"
          aria-label={t("CREATION_EDITOR_DESIGN_GENERATION_DIRECTIONS_LABEL")}
        >
          {[1, 2, 3].map((count) => (
            <button
              key={count}
              type="button"
              className={cn(
                "flex min-h-10 min-w-10 items-center justify-center rounded-md font-mono text-caption tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none",
                candidateCount === count
                  ? "bg-background text-label-primary shadow-sm"
                  : "text-label-secondary hover:text-label-primary",
              )}
              aria-pressed={candidateCount === count}
              disabled={active}
              onClick={() => onCandidateCountChange(count)}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          className="min-h-11 flex-1"
          loading={starting}
          disabled={!canStart || active}
          title={!canStart ? startDisabledReason : undefined}
          onClick={onStart}
        >
          <Sparkles className="size-4" aria-hidden="true" />
          {t("CREATION_EDITOR_DESIGN_GENERATION_START")}
        </Button>
        {active ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="min-h-11 min-w-11"
            loading={cancelling}
            aria-label={t("CREATION_EDITOR_DESIGN_GENERATION_CANCEL")}
            onClick={onCancel}
          >
            <Square className="size-3.5" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {!canStart && !active ? (
        <p className="text-caption leading-5 text-label-secondary">{startDisabledReason}</p>
      ) : null}

      {recoveryPending ? (
        <div className="flex items-center gap-2 text-caption text-label-secondary" role="status">
          <LoaderCircle
            className="size-3.5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          {t("CREATION_EDITOR_DESIGN_GENERATION_RECOVERING")}
        </div>
      ) : null}
      {generation ? (
        <GenerationEvidence
          generation={generation}
          progress={progress}
          selectedCandidateIndex={selectedCandidateIndex}
          onSelectCandidate={onSelectCandidate}
        />
      ) : null}
      {error ? (
        <div
          role="alert"
          className="flex gap-2 rounded-lg border border-negative/30 bg-negative/5 p-3 text-caption text-negative"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
    </section>
  );
}

function GenerationEvidence({
  generation,
  progress,
  selectedCandidateIndex,
  onSelectCandidate,
}: Readonly<{
  generation: BuilderGenerationOut;
  progress: number | null;
  selectedCandidateIndex: number | null;
  onSelectCandidate: (candidateIndex: number) => void;
}>) {
  const { t } = useTranslation(["account", "errors"]);
  const terminal = TERMINAL_STATUSES.has(generation.status);
  return (
    <div className="border-t border-border pt-4" aria-live="polite" aria-busy={!terminal}>
      <div className="flex flex-wrap items-center gap-2">
        <BaseTag icon={lucideTagIcon(terminal ? SwatchBook : LoaderCircle)}>
          {t(`CREATION_EDITOR_DESIGN_GENERATION_STATUS_${generation.status.toUpperCase()}`)}
        </BaseTag>
        {generation.phase ? <BaseTag>{generation.phase}</BaseTag> : null}
        <span className="ml-auto font-mono text-caption text-label-tertiary">
          {generation.generationId}
        </span>
      </div>
      {progress !== null && !terminal ? (
        <div className="mt-3 space-y-2">
          <Progress value={progress} />
          <p className="text-caption text-label-secondary">
            {t("CREATION_EDITOR_DESIGN_GENERATION_PROGRESS", {
              completed: generation.progressCompleted,
              total: generation.progressTotal,
            })}
          </p>
        </div>
      ) : null}
      {generation.candidates.length > 0 ? (
        <div className="mt-3 space-y-2">
          {generation.candidates.map((candidate) => {
            const blockers = candidate.changeSet.issues.filter(
              (issue) => issue.severity === "blocker",
            ).length;
            return (
              <button
                key={candidate.candidateIndex}
                type="button"
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-[border-color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none",
                  selectedCandidateIndex === candidate.candidateIndex
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/55",
                )}
                aria-pressed={selectedCandidateIndex === candidate.candidateIndex}
                onClick={() => onSelectCandidate(candidate.candidateIndex)}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-caption tabular-nums text-label-primary">
                  {candidate.candidateIndex + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-caption font-semibold text-label-primary">
                    {t("CREATION_EDITOR_DESIGN_GENERATION_DIRECTION", {
                      index: candidate.candidateIndex + 1,
                    })}
                  </span>
                  <span className="mt-0.5 block text-caption text-label-secondary">
                    {t("CREATION_EDITOR_DESIGN_GENERATION_DIRECTION_META", {
                      operations: candidate.changeSet.operations.length,
                      targets: candidate.changeSet.affectedTargets.length,
                      blockers,
                    })}
                  </span>
                </span>
                <BaseTag>{candidate.changeSet.approvalClass}</BaseTag>
              </button>
            );
          })}
        </div>
      ) : null}
      {generation.failures.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {generation.failures.map((failure) => (
            <li
              key={`${failure.candidateIndex}:${failure.code}`}
              className="rounded-lg border border-negative/25 bg-negative/5 p-3 text-caption text-label-secondary"
            >
              <span className="font-medium text-negative">
                {t("CREATION_EDITOR_DESIGN_GENERATION_DIRECTION_FAILED", {
                  index: failure.candidateIndex + 1,
                })}
              </span>
              <span aria-hidden="true"> · </span>
              {t(failure.messageKey, { ns: "errors", defaultValue: failure.code })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
