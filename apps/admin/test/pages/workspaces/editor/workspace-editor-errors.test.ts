import { describe, expect, test } from "vitest";

import { ApiError } from "@/lib/http";
import { formatWorkspaceEditorSaveError } from "@/pages/workspaces/editor/workspace-editor-errors";

type TranslateLike = (key: string, vars?: Record<string, unknown>) => string;

const t: TranslateLike = (key, vars) => {
  if (!vars) return key;
  return `${key}:${JSON.stringify(vars)}`;
};

describe("formatWorkspaceEditorSaveError", () => {
  test("formats 409 conflicts with revision details", () => {
    const err = new ApiError({
      status: 409,
      message: "Conflict",
      meta: {
        expectedRevision: 5,
        currentRevision: 7,
      },
    });

    const out = formatWorkspaceEditorSaveError(err, t);

    expect(out).toBe('content_pages:EDITOR_SHELL_DRAFT_CONFLICT:{"expected":5,"current":7}');
  });

  test("falls back to generic 409 conflict message", () => {
    const err = new ApiError({
      status: 409,
      message: "Conflict",
      meta: {
        unexpected: true,
      },
    });

    const out = formatWorkspaceEditorSaveError(err, t);

    expect(out).toBe("content_pages:EDITOR_SHELL_DRAFT_CONFLICT_GENERIC");
  });

  test("uses regular error message for non-409 errors", () => {
    const out = formatWorkspaceEditorSaveError(new Error("boom"), t);

    expect(out).toBe("boom");
  });
});
