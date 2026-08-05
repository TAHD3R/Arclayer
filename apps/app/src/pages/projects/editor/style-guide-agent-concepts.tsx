import { cn } from "@arclayer/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@arclayer/ui/avatar";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Textarea } from "@arclayer/ui/textarea";
import {
  AlertCircleIcon,
  CheckIcon,
  LoaderCircleIcon,
  PaletteIcon,
  SparklesIcon,
  SquareIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AIWorkspaceAgentCatalogItem } from "@/api/ai";
import { getErrorMessage } from "@/lib/notifications";
import type { ProjectStyleGuideController } from "@/pages/projects/editor/use-project-style-guide-controller";
import { StyleGuideConceptResults } from "@/pages/projects/editor/style-guide-concept-results";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function agentName(agent: AIWorkspaceAgentCatalogItem, translate: (key: string) => string): string {
  return agent.nameI18nKey ? translate(`ai:${agent.nameI18nKey}`) : agent.name;
}

export function StyleGuideAgentConcepts({
  controller,
}: {
  controller: ProjectStyleGuideController;
}) {
  const { t } = useTranslation(["account", "ai", "errors"]);
  const { generation } = controller;
  const active = generation.active;

  return (
    <section
      aria-labelledby="style-guide-agent-title"
      className="mt-6 overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm"
    >
      <div className="flex items-start gap-3 border-b border-border/60 px-5 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <SparklesIcon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2
            id="style-guide-agent-title"
            className="text-headline font-semibold text-label-primary"
          >
            {t("account:CREATION_EDITOR_STYLE_AI_TITLE")}
          </h2>
          <p className="mt-1 max-w-3xl text-footnote leading-relaxed text-label-secondary">
            {t("account:CREATION_EDITOR_STYLE_AI_DESC")}
          </p>
        </div>
      </div>

      <div className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.42fr)]">
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-footnote font-semibold text-label-primary">
                {t("account:CREATION_EDITOR_STYLE_AI_AGENT_LABEL")}
              </p>
              <PaletteIcon className="size-4 text-label-tertiary" aria-hidden="true" />
            </div>
            {generation.agentsQuery.isPending ? (
              <div
                className="mt-3 flex min-h-11 items-center gap-2 text-footnote text-label-secondary"
                role="status"
              >
                <LoaderCircleIcon
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                {t("account:CREATION_EDITOR_STYLE_AI_AGENTS_LOADING")}
              </div>
            ) : generation.eligibleAgents.length > 0 ? (
              <div
                className="mt-3 flex flex-wrap gap-2"
                role="group"
                aria-label={t("account:CREATION_EDITOR_STYLE_AI_AGENT_LABEL")}
              >
                {generation.eligibleAgents.map((agent) => {
                  const selected = generation.selectedAgentId === agent.agentId;
                  const recommended = generation.recommendedAgentId === agent.agentId;
                  const name = agentName(agent, t);
                  return (
                    <button
                      key={agent.agentId}
                      type="button"
                      aria-pressed={selected}
                      disabled={active}
                      onClick={() => generation.setSelectedAgentId(agent.agentId)}
                      className={cn(
                        "flex min-h-11 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60",
                        selected
                          ? "border-primary bg-primary/5 shadow-[0_0_0_1px_var(--primary)]"
                          : "border-border hover:bg-muted/70",
                      )}
                    >
                      <Avatar size="sm">
                        {agent.avatarUrl ? <AvatarImage src={agent.avatarUrl} alt="" /> : null}
                        <AvatarFallback>{initials(name)}</AvatarFallback>
                      </Avatar>
                      <span className="max-w-36 truncate text-footnote font-medium text-label-primary">
                        {name}
                      </span>
                      {recommended ? (
                        <Badge variant="outline">
                          {t("account:CREATION_EDITOR_STYLE_AI_RECOMMENDED")}
                        </Badge>
                      ) : null}
                      {selected ? (
                        <CheckIcon className="size-3.5 text-primary" aria-hidden="true" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-dashed border-border p-4 text-footnote text-label-secondary">
                {t("account:CREATION_EDITOR_STYLE_AI_AGENT_EMPTY")}
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="style-guide-agent-objective"
              className="text-footnote font-semibold text-label-primary"
            >
              {t("account:CREATION_EDITOR_STYLE_AI_OBJECTIVE_LABEL")}
            </label>
            <p className="mt-1 text-caption leading-relaxed text-label-secondary">
              {t("account:CREATION_EDITOR_STYLE_AI_OBJECTIVE_DESC")}
            </p>
            <Textarea
              id="style-guide-agent-objective"
              value={generation.objective}
              onChange={(event) => generation.setObjective(event.target.value)}
              placeholder={t("account:CREATION_EDITOR_STYLE_AI_OBJECTIVE_PLACEHOLDER")}
              className="mt-3 min-h-24 resize-none"
              maxLength={8000}
              disabled={active}
            />
          </div>
        </div>

        <div className="flex flex-col rounded-lg border border-border/60 bg-muted/25 p-4">
          <p className="text-footnote font-semibold text-label-primary">
            {t("account:CREATION_EDITOR_STYLE_AI_DIRECTION_COUNT")}
          </p>
          <p className="mt-1 text-caption leading-relaxed text-label-secondary">
            {t("account:CREATION_EDITOR_STYLE_AI_DIRECTION_COUNT_DESC")}
          </p>
          <div
            className="mt-4 grid grid-cols-3 gap-2"
            role="group"
            aria-label={t("account:CREATION_EDITOR_STYLE_AI_DIRECTION_COUNT")}
          >
            {[1, 2, 3].map((count) => (
              <button
                key={count}
                type="button"
                aria-pressed={generation.candidateCount === count}
                disabled={active}
                onClick={() => generation.setCandidateCount(count)}
                className={cn(
                  "min-h-11 rounded-md border text-footnote font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60",
                  generation.candidateCount === count
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-label-primary hover:bg-muted",
                )}
              >
                {count}
              </button>
            ))}
          </div>
          <div className="mt-auto pt-5">
            <Button
              className="w-full"
              loading={generation.startMutation.isPending}
              disabled={!generation.canStart}
              title={
                generation.canStart ? undefined : t(`account:${generation.startDisabledReason}`)
              }
              onClick={() => generation.startMutation.mutate()}
            >
              <SparklesIcon data-icon="inline-start" />
              {t("account:CREATION_EDITOR_STYLE_AI_GENERATE")}
            </Button>
            {!generation.canStart && !active ? (
              <p className="mt-2 text-caption leading-relaxed text-label-secondary">
                {t(`account:${generation.startDisabledReason}`)}
              </p>
            ) : null}
            {active ? (
              <Button
                className="mt-2 w-full"
                variant="outline"
                loading={generation.cancelMutation.isPending}
                onClick={() => generation.cancelMutation.mutate()}
              >
                <SquareIcon data-icon="inline-start" />
                {t("account:CREATION_EDITOR_STYLE_AI_CANCEL")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {generation.error ? (
        <div
          className="mx-5 mb-5 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-footnote text-destructive"
          role="alert"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{getErrorMessage(generation.error)}</span>
        </div>
      ) : null}

      <StyleGuideConceptResults controller={controller} />
    </section>
  );
}
