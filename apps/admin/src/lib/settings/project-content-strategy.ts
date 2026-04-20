import { pickBool, pickNumber } from "./general/utils";

export type ProjectContentAutosaveStrategy = {
  enabled: boolean;
  intervalSec: number;
  saveOnBlur: boolean;
};

export type ProjectContentRetentionStrategy = {
  draftMaxRevisions: number;
};

export type ProjectContentStrategy = {
  autosave: ProjectContentAutosaveStrategy;
  retention: ProjectContentRetentionStrategy;
};

export const DEFAULT_PROJECT_CONTENT_STRATEGY: ProjectContentStrategy = {
  autosave: {
    enabled: true,
    intervalSec: 30,
    saveOnBlur: true,
  },
  retention: {
    draftMaxRevisions: 100,
  },
};

function sanitizePositiveInteger(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.max(1, Math.round(value ?? fallback));
  return normalized;
}

export function readProjectContentStrategy(source: unknown): ProjectContentStrategy {
  return {
    autosave: {
      enabled:
        pickBool(source, ["content_strategy", "autosave", "enabled"]) ??
        DEFAULT_PROJECT_CONTENT_STRATEGY.autosave.enabled,
      intervalSec: sanitizePositiveInteger(
        pickNumber(source, ["content_strategy", "autosave", "interval_sec"]),
        DEFAULT_PROJECT_CONTENT_STRATEGY.autosave.intervalSec,
      ),
      saveOnBlur:
        pickBool(source, ["content_strategy", "autosave", "save_on_blur"]) ??
        DEFAULT_PROJECT_CONTENT_STRATEGY.autosave.saveOnBlur,
    },
    retention: {
      draftMaxRevisions: sanitizePositiveInteger(
        pickNumber(source, ["content_strategy", "retention", "draft_max_revisions"]),
        DEFAULT_PROJECT_CONTENT_STRATEGY.retention.draftMaxRevisions,
      ),
    },
  };
}

export function buildProjectContentStrategyPatch(strategy: ProjectContentStrategy) {
  return {
    content_strategy: {
      autosave: {
        enabled: Boolean(strategy.autosave.enabled),
        interval_sec: sanitizePositiveInteger(
          strategy.autosave.intervalSec,
          DEFAULT_PROJECT_CONTENT_STRATEGY.autosave.intervalSec,
        ),
        save_on_blur: Boolean(strategy.autosave.saveOnBlur),
      },
      retention: {
        draft_max_revisions: sanitizePositiveInteger(
          strategy.retention.draftMaxRevisions,
          DEFAULT_PROJECT_CONTENT_STRATEGY.retention.draftMaxRevisions,
        ),
      },
    },
  };
}
