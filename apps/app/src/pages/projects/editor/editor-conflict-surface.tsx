import { Button } from "@arclayer/ui/button";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ApiError } from "@/lib/http";
import { getErrorMessage } from "@/lib/notifications";

export function EditorConflictSurface({
  error,
  refreshing,
  repreviewError,
  onRefresh,
  onDiscard,
}: {
  error: ApiError;
  refreshing: boolean;
  repreviewError?: string | null;
  onRefresh: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation("account");
  const meta = readConflictMeta(error.meta);
  return (
    <section
      className="absolute right-4 bottom-4 left-4 z-40 flex flex-col gap-3 rounded-xl border border-warning/45 bg-background px-4 py-4 shadow-[0_18px_44px_rgba(0,0,0,0.16)] sm:flex-row sm:items-start sm:justify-between"
      aria-label={t("CREATION_EDITOR_CONFLICT_LABEL")}
      aria-live="assertive"
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-footnote font-semibold text-label-primary">
            {t("CREATION_EDITOR_CONFLICT_TITLE")}
          </h2>
          <p className="mt-1 text-caption leading-5 text-label-secondary">
            {t("CREATION_EDITOR_CONFLICT_DESC")}
          </p>
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-caption text-label-secondary sm:grid-cols-2">
            <ConflictValue label={t("CREATION_EDITOR_CONFLICT_BASE")} value={meta.baseVersion} />
            <ConflictValue
              label={t("CREATION_EDITOR_CONFLICT_CURRENT")}
              value={meta.currentVersion}
            />
            <ConflictValue label={t("CREATION_EDITOR_CONFLICT_OBJECT")} value={meta.itemId} />
            <ConflictValue
              label={t("CREATION_EDITOR_CONFLICT_REASON")}
              value={getErrorMessage(error)}
            />
          </dl>
          {repreviewError ? (
            <p className="mt-3 text-caption leading-5 text-destructive" role="alert">
              {repreviewError}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          disabled={refreshing}
          onClick={onDiscard}
        >
          <X className="mr-2 size-4" aria-hidden="true" />
          {t("CREATION_EDITOR_CONFLICT_DISCARD")}
        </Button>
        <Button type="button" className="min-h-11" disabled={refreshing} onClick={onRefresh}>
          <RefreshCw className="mr-2 size-4" aria-hidden="true" />
          {refreshing
            ? t("CREATION_EDITOR_CONFLICT_REFRESHING")
            : t("CREATION_EDITOR_CONFLICT_REFRESH")}
        </Button>
      </div>
    </section>
  );
}

function ConflictValue({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="font-medium text-label-secondary">{label}</dt>
      <dd className="truncate text-label-primary">{value}</dd>
    </div>
  );
}

function readConflictMeta(meta: unknown): {
  baseVersion: string | null;
  currentVersion: string | null;
  itemId: string | null;
} {
  if (!meta || typeof meta !== "object") {
    return { baseVersion: null, currentVersion: null, itemId: null };
  }
  const values = meta as Record<string, unknown>;
  return {
    baseVersion: stringValue(
      values.expectedVersion ?? values.baseVersion ?? values.base_revision_id,
    ),
    currentVersion: stringValue(
      values.currentVersion ?? values.current_version ?? values.latestVersion,
    ),
    itemId: stringValue(values.itemId ?? values.item_id),
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}
