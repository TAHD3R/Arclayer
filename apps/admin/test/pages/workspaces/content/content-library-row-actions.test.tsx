import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { ContentLibraryRowActions } from "@/pages/workspaces/content/library/components/content-library-row-actions";
import type { ContentLibraryTableRow } from "@/pages/workspaces/content/library/types";

function buildRow(overrides: Partial<ContentLibraryTableRow> = {}): ContentLibraryTableRow {
  return {
    id: "content-1",
    workspaceId: "ws-1",
    siteId: "site-1",
    slug: "homepage",
    title: "Homepage",
    status: "draft",
    visibility: "private",
    locale: "en-US",
    bootstrapPresetState: "none",
    capabilityPackIds: [],
    draftVersion: 1,
    updatedAt: "2026-03-20T00:00:00Z",
    name: "Homepage",
    modelName: null,
    modelDescription: null,
    modelCategory: null,
    modelCapabilities: [],
    derivedStatus: "draft",
    runtime: "unknown",
    context: "standalone",
    ...overrides,
  };
}

describe("content-library-row-actions", () => {
  it("enables duplicate delete archive actions and routes them to callbacks", async () => {
    const user = userEvent.setup();
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    const onArchive = vi.fn();

    render(
      <ContentLibraryRowActions
        row={buildRow()}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onArchive={onArchive}
        onUnarchive={vi.fn()}
      />,
    );

    const trigger = screen.getByLabelText("CONTENT_LIBRARY_ROW_ACTIONS");

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_ACTION_DUPLICATE" }));
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_ACTION_DELETE" }));
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_ACTION_ARCHIVE" }));

    expect(onDuplicate).toHaveBeenCalledWith(expect.objectContaining({ id: "content-1" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "content-1" }));
    expect(onArchive).toHaveBeenCalledWith(expect.objectContaining({ id: "content-1" }));
  });

  it("keeps archive action enabled for non-archived rows without relying on version pointers", async () => {
    const user = userEvent.setup();

    render(
      <ContentLibraryRowActions
        row={buildRow({ draftVersion: 0, publishedVersion: null })}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onArchive={vi.fn()}
        onUnarchive={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText("CONTENT_LIBRARY_ROW_ACTIONS"));

    expect(
      screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_ACTION_ARCHIVE" }),
    ).toHaveAttribute("data-disabled", "false");
  });

  it("switches archived rows to an unarchive action", async () => {
    const user = userEvent.setup();
    const onUnarchive = vi.fn();

    render(
      <ContentLibraryRowActions
        row={buildRow({ status: "archived", derivedStatus: "archived" })}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onArchive={vi.fn()}
        onUnarchive={onUnarchive}
      />,
    );

    await user.click(screen.getByLabelText("CONTENT_LIBRARY_ROW_ACTIONS"));
    await user.click(screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_ACTION_UNARCHIVE" }));

    expect(onUnarchive).toHaveBeenCalledWith(
      expect.objectContaining({ id: "content-1", derivedStatus: "archived" }),
    );
  });
});
