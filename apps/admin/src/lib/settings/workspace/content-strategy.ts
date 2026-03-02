import { pickBool, pickNumber } from "@/lib/settings/general/utils";

const MIN_AUTOSAVE_INTERVAL_SEC = 10;
const MAX_AUTOSAVE_INTERVAL_SEC = 300;

const MIN_DRAFT_RETENTION_REVISIONS = 1;
const MAX_DRAFT_RETENTION_REVISIONS = 5000;

export type WorkspaceContentAutosavePolicy = {
  enabled: boolean;
  intervalSec: number;
  saveOnBlur: boolean;
};

export type WorkspaceContentRetentionPolicy = {
  /** Keep the latest N draft revisions (published revision is always retained). */
  draftMaxRevisions: number;
};

export type WorkspaceContentStrategyPolicy = {
  autosave: WorkspaceContentAutosavePolicy;
  retention: WorkspaceContentRetentionPolicy;
};

export const DEFAULT_WORKSPACE_CONTENT_STRATEGY: WorkspaceContentStrategyPolicy = {
  autosave: {
    enabled: true,
    intervalSec: 30,
    saveOnBlur: true,
  },
  retention: {
    draftMaxRevisions: 100,
  },
} as const;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const n = Math.round(value);
  return Math.max(min, Math.min(max, n));
}

export function readWorkspaceContentStrategy(value: unknown): WorkspaceContentStrategyPolicy {
  const enabled = pickBool(value, ["content_strategy", "autosave", "enabled"]);
  const intervalSec = pickNumber(value, ["content_strategy", "autosave", "interval_sec"]);
  const saveOnBlur = pickBool(value, ["content_strategy", "autosave", "save_on_blur"]);

  const draftMaxRevisions = pickNumber(value, [
    "content_strategy",
    "retention",
    "draft_max_revisions",
  ]);

  return {
    autosave: {
      enabled: enabled ?? DEFAULT_WORKSPACE_CONTENT_STRATEGY.autosave.enabled,
      intervalSec: clampInt(
        intervalSec ?? DEFAULT_WORKSPACE_CONTENT_STRATEGY.autosave.intervalSec,
        MIN_AUTOSAVE_INTERVAL_SEC,
        MAX_AUTOSAVE_INTERVAL_SEC,
      ),
      saveOnBlur: saveOnBlur ?? DEFAULT_WORKSPACE_CONTENT_STRATEGY.autosave.saveOnBlur,
    },
    retention: {
      draftMaxRevisions: clampInt(
        draftMaxRevisions ?? DEFAULT_WORKSPACE_CONTENT_STRATEGY.retention.draftMaxRevisions,
        MIN_DRAFT_RETENTION_REVISIONS,
        MAX_DRAFT_RETENTION_REVISIONS,
      ),
    },
  };
}

export function buildWorkspaceContentStrategyPatch(
  policy: WorkspaceContentStrategyPolicy,
): Record<string, unknown> {
  return {
    content_strategy: {
      autosave: {
        enabled: Boolean(policy.autosave.enabled),
        interval_sec: clampInt(
          policy.autosave.intervalSec,
          MIN_AUTOSAVE_INTERVAL_SEC,
          MAX_AUTOSAVE_INTERVAL_SEC,
        ),
        save_on_blur: Boolean(policy.autosave.saveOnBlur),
      },
      retention: {
        draft_max_revisions: clampInt(
          policy.retention.draftMaxRevisions,
          MIN_DRAFT_RETENTION_REVISIONS,
          MAX_DRAFT_RETENTION_REVISIONS,
        ),
      },
    },
  };
}

export function buildWorkspaceContentAutosavePatch(
  policy: WorkspaceContentAutosavePolicy,
): Record<string, unknown> {
  return {
    content_strategy: {
      autosave: {
        enabled: Boolean(policy.enabled),
        interval_sec: clampInt(
          policy.intervalSec,
          MIN_AUTOSAVE_INTERVAL_SEC,
          MAX_AUTOSAVE_INTERVAL_SEC,
        ),
        save_on_blur: Boolean(policy.saveOnBlur),
      },
    },
  };
}

export function buildWorkspaceContentRetentionPatch(
  policy: WorkspaceContentRetentionPolicy,
): Record<string, unknown> {
  return {
    content_strategy: {
      retention: {
        draft_max_revisions: clampInt(
          policy.draftMaxRevisions,
          MIN_DRAFT_RETENTION_REVISIONS,
          MAX_DRAFT_RETENTION_REVISIONS,
        ),
      },
    },
  };
}
