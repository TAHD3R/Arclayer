import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/http";
import { EditorConflictSurface } from "@/pages/projects/editor/editor-conflict-surface";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("EditorConflictSurface", () => {
  it("shows server conflict metadata and exposes reload/discard actions", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const onDiscard = vi.fn();
    const error = new ApiError({
      status: 409,
      error: "SITE_REVISION_STALE",
      message: "The site revision changed.",
      meta: { expectedVersion: 3, currentVersion: 4, itemId: "page-1" },
    });

    render(
      <EditorConflictSurface
        error={error}
        refreshing={false}
        onRefresh={onRefresh}
        onDiscard={onDiscard}
      />,
    );

    expect(screen.getByText("3")).toBeVisible();
    expect(screen.getByText("4")).toBeVisible();
    expect(screen.getByText("page-1")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_CONFLICT_REFRESH" }));
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_CONFLICT_DISCARD" }));
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledOnce();
  });
});
