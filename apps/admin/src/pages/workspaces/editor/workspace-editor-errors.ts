import { ApiError } from "@/lib/http";

type TranslateLike = (key: string, vars?: Record<string, unknown>) => string;

export function formatWorkspaceEditorSaveError(err: unknown, t: TranslateLike): string {
  if (err instanceof ApiError && err.status === 409) {
    const meta = err.meta;
    if (meta && typeof meta === "object") {
      const record = meta as Record<string, unknown>;
      const expected = record.expectedRevision;
      const current = record.currentRevision;
      if (typeof expected === "number" && typeof current === "number") {
        return t("content_pages:EDITOR_SHELL_DRAFT_CONFLICT", {
          expected,
          current,
        });
      }
    }
    return t("content_pages:EDITOR_SHELL_DRAFT_CONFLICT_GENERIC");
  }

  return err instanceof Error ? err.message : String(err);
}
