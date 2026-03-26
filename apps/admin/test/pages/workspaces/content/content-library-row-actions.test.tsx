import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    libraryGroup: "general-content",
    editWith: "structured",
    role: "general",
    ...overrides,
  };
}

describe("content-library-row-actions", () => {
  it("uses shared shadcn button sizes for inline actions", () => {
    render(
      <ContentLibraryRowActions
        row={buildRow()}
        onContinue={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onArchive={vi.fn()}
        onUnarchive={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_CONTINUE" })).toHaveAttribute(
      "data-size",
      "sm",
    );
    expect(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_CONTINUE" })).toHaveAttribute(
      "data-slot",
      "button",
    );
    expect(screen.getByLabelText("CONTENT_LIBRARY_ROW_ACTIONS")).toHaveAttribute(
      "data-size",
      "icon-sm",
    );
    expect(screen.getByLabelText("CONTENT_LIBRARY_ROW_ACTIONS")).toHaveClass("!rounded-lg");
  });

  it("shows a direct continue action and routes duplicate delete archive actions to callbacks", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    const onArchive = vi.fn();

    render(
      <ContentLibraryRowActions
        row={buildRow()}
        onContinue={onContinue}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onArchive={onArchive}
        onUnarchive={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_CONTINUE" }));

    const trigger = screen.getByLabelText("CONTENT_LIBRARY_ROW_ACTIONS");

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_ACTION_DUPLICATE" }));
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_ACTION_DELETE" }));
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_ACTION_ARCHIVE" }));

    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ id: "content-1" }));
    expect(onDuplicate).toHaveBeenCalledWith(expect.objectContaining({ id: "content-1" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "content-1" }));
    expect(onArchive).toHaveBeenCalledWith(expect.objectContaining({ id: "content-1" }));
  });

  it("keeps archive action enabled for non-archived rows without relying on version pointers", async () => {
    const user = userEvent.setup();

    render(
      <ContentLibraryRowActions
        row={buildRow({ draftVersion: 0, publishedVersion: null })}
        onContinue={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onArchive={vi.fn()}
        onUnarchive={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText("CONTENT_LIBRARY_ROW_ACTIONS"));

    expect(
      screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_ACTION_ARCHIVE" }),
    ).not.toHaveAttribute("data-disabled", "true");
  });

  it("switches archived rows to an unarchive action", async () => {
    const user = userEvent.setup();
    const onUnarchive = vi.fn();

    render(
      <ContentLibraryRowActions
        row={buildRow({ status: "archived", derivedStatus: "archived" })}
        onContinue={vi.fn()}
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

  it("releases the persisted visible state after closing the menu by clicking outside", async () => {
    const user = userEvent.setup();

    render(
      <div>
        <ContentLibraryRowActions
          row={buildRow()}
          onContinue={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onArchive={vi.fn()}
          onUnarchive={vi.fn()}
          persistVisible={false}
        />
        <button type="button">outside</button>
      </div>,
    );

    const root = screen.getByTestId("content-library-row-actions");
    const trigger = screen.getByLabelText("CONTENT_LIBRARY_ROW_ACTIONS");

    expect(root).toHaveAttribute("data-visible", "false");

    await user.click(trigger);
    expect(root).toHaveAttribute("data-visible", "true");

    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);

    await waitFor(() => {
      expect(root).toHaveAttribute("data-visible", "false");
    });
  });
});
