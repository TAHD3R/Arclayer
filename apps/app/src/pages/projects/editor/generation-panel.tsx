import { cn } from "@arclayer/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@arclayer/ui/avatar";
import { Button } from "@arclayer/ui/button";
import { ScrollArea } from "@arclayer/ui/scroll-area";
import { Textarea } from "@arclayer/ui/textarea";
import type { BuilderGenerationOut } from "@arclayer/openapi";
import { AlertCircle, Check, LoaderCircle, Sparkles, Square } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AIWorkspaceAgentCatalogItem } from "@/api/ai";
import {
  CandidateReview,
  GenerationStatus,
} from "@/pages/projects/editor/generation-candidate-review";

interface GenerationPanelProps {
  agents: AIWorkspaceAgentCatalogItem[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  objective: string;
  onObjectiveChange: (objective: string) => void;
  generation: BuilderGenerationOut | null;
  selectedCandidateIndex: number | null;
  onSelectCandidate: (candidateIndex: number) => void;
  onStart: () => void;
  onCancel: () => void;
  onApply: () => void;
  starting: boolean;
  cancelling: boolean;
  applying: boolean;
  canStart: boolean;
  startDisabledReason: string;
  error: string | null;
}

const TERMINAL_STATUSES = new Set(["partial", "succeeded", "failed", "cancelled"]);

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function GenerationPanel({
  agents,
  selectedAgentId,
  onSelectAgent,
  objective,
  onObjectiveChange,
  generation,
  selectedCandidateIndex,
  onSelectCandidate,
  onStart,
  onCancel,
  onApply,
  starting,
  cancelling,
  applying,
  canStart,
  startDisabledReason,
  error,
}: GenerationPanelProps) {
  const { t } = useTranslation("account");
  const active = Boolean(generation && !TERMINAL_STATUSES.has(generation.status));
  const selectedCandidate =
    generation?.candidates.find(
      (candidate) => candidate.candidateIndex === selectedCandidateIndex,
    ) ??
    generation?.candidates[0] ??
    null;
  const blockingIssues =
    selectedCandidate?.changeSet.issues.filter((issue) => issue.severity === "blocker") ?? [];
  const approval = selectedCandidate?.changeSet.approval;
  const approvalMissing =
    selectedCandidate !== null &&
    selectedCandidate.changeSet.approvalClass !== "none" &&
    approval == null;
  const applyDisabled =
    !selectedCandidate || blockingIssues.length > 0 || approvalMissing || applying || active;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 p-5">
          <section aria-labelledby="editor-agent-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2
                  id="editor-agent-heading"
                  className="text-body font-semibold text-label-primary"
                >
                  {t("CREATION_EDITOR_AI_AGENT_TITLE")}
                </h2>
                <p className="mt-1 text-footnote text-label-secondary">
                  {t("CREATION_EDITOR_AI_AGENT_DESC")}
                </p>
              </div>
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
            </div>
            {agents.length > 0 ? (
              <div
                className="flex flex-wrap gap-2"
                role="list"
                aria-label={t("CREATION_EDITOR_AI_AGENT_SELECT")}
              >
                {agents.map((agent) => {
                  const selected = agent.agentId === selectedAgentId;
                  return (
                    <button
                      key={agent.agentId}
                      type="button"
                      role="listitem"
                      aria-pressed={selected}
                      onClick={() => onSelectAgent(agent.agentId)}
                      className={cn(
                        "flex min-h-11 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                        selected
                          ? "border-primary bg-primary/5 shadow-[0_0_0_1px_var(--primary)]"
                          : "border-border hover:bg-muted/70",
                      )}
                    >
                      <Avatar size="sm">
                        {agent.avatarUrl ? <AvatarImage src={agent.avatarUrl} alt="" /> : null}
                        <AvatarFallback>{initials(agent.name)}</AvatarFallback>
                      </Avatar>
                      <span className="max-w-32 truncate text-footnote font-medium text-label-primary">
                        {agent.name}
                      </span>
                      {selected ? (
                        <Check className="size-3.5 text-primary" aria-hidden="true" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-4 text-footnote text-label-secondary">
                {t("CREATION_EDITOR_AI_AGENT_EMPTY")}
              </div>
            )}
          </section>

          <section>
            <label
              htmlFor="editor-generation-objective"
              className="text-body font-semibold text-label-primary"
            >
              {t("CREATION_EDITOR_AI_OBJECTIVE_LABEL")}
            </label>
            <p className="mt-1 text-footnote text-label-secondary">
              {t("CREATION_EDITOR_AI_OBJECTIVE_DESC")}
            </p>
            <Textarea
              id="editor-generation-objective"
              value={objective}
              onChange={(event) => onObjectiveChange(event.target.value)}
              placeholder={t("CREATION_EDITOR_AI_OBJECTIVE_PLACEHOLDER")}
              className="mt-3 min-h-28 resize-none"
              maxLength={8000}
              disabled={Boolean(active)}
            />
            <div className="mt-3 flex items-center gap-2">
              <Button
                className="flex-1"
                onClick={onStart}
                loading={starting}
                disabled={!canStart || Boolean(active)}
                title={!canStart ? startDisabledReason : undefined}
              >
                <Sparkles className="size-4" />
                {t("CREATION_EDITOR_AI_GENERATE")}
              </Button>
              {active ? (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t("CREATION_EDITOR_AI_CANCEL")}
                  onClick={onCancel}
                  loading={cancelling}
                >
                  <Square className="size-3.5" />
                </Button>
              ) : null}
            </div>
            {!canStart ? (
              <p className="mt-2 text-caption text-label-secondary">{startDisabledReason}</p>
            ) : null}
          </section>

          {generation ? (
            <section
              aria-labelledby="editor-generation-heading"
              className="border-t border-border pt-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2
                    id="editor-generation-heading"
                    className="text-body font-semibold text-label-primary"
                  >
                    {t("CREATION_EDITOR_AI_RESULT_TITLE")}
                  </h2>
                  <p className="mt-1 text-footnote text-label-secondary">
                    {t("CREATION_EDITOR_AI_PROGRESS", {
                      completed: generation.progressCompleted,
                      total: generation.progressTotal ?? generation.candidates.length,
                    })}
                  </p>
                </div>
                <GenerationStatus status={generation.status} />
              </div>

              {active ? (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-muted/45 p-3">
                  <LoaderCircle className="size-4 animate-spin text-primary motion-reduce:animate-none" />
                  <span className="text-footnote text-label-secondary">
                    {t("CREATION_EDITOR_AI_RUNNING")}
                  </span>
                </div>
              ) : null}

              {generation.failures.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {generation.failures.map((failure) => (
                    <div
                      key={`${failure.candidateIndex}:${failure.code}`}
                      className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                    >
                      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                      <div>
                        <p className="text-footnote font-medium text-label-primary">
                          {t("CREATION_EDITOR_AI_CANDIDATE_FAILED", {
                            index: failure.candidateIndex + 1,
                          })}
                        </p>
                        <p className="mt-1 text-caption text-label-secondary">{failure.code}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {generation.candidates.length > 0 ? (
                <div className="mt-4 space-y-3">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {generation.candidates.map((candidate) => (
                      <button
                        key={candidate.candidateIndex}
                        type="button"
                        aria-pressed={
                          selectedCandidate?.candidateIndex === candidate.candidateIndex
                        }
                        onClick={() => onSelectCandidate(candidate.candidateIndex)}
                        className={cn(
                          "min-h-9 shrink-0 rounded-md border px-3 text-footnote font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                          selectedCandidate?.candidateIndex === candidate.candidateIndex
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-label-primary hover:bg-muted",
                        )}
                      >
                        {t("CREATION_EDITOR_AI_CANDIDATE", { index: candidate.candidateIndex + 1 })}
                      </button>
                    ))}
                  </div>
                  {selectedCandidate ? (
                    <CandidateReview
                      generation={generation}
                      candidateIndex={selectedCandidate.candidateIndex}
                    />
                  ) : null}
                  <Button
                    className="w-full"
                    onClick={onApply}
                    loading={applying}
                    disabled={applyDisabled}
                  >
                    {selectedCandidate?.changeSet.approvalClass === "none"
                      ? t("CREATION_EDITOR_AI_APPLY")
                      : t("CREATION_EDITOR_AI_APPROVE_APPLY")}
                  </Button>
                  {blockingIssues.length > 0 ? (
                    <p className="text-caption text-destructive">
                      {t("CREATION_EDITOR_AI_BLOCKED", { count: blockingIssues.length })}
                    </p>
                  ) : null}
                  {approvalMissing ? (
                    <p className="text-caption text-destructive">
                      {t("CREATION_EDITOR_AI_APPROVAL_MISSING")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-footnote text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
