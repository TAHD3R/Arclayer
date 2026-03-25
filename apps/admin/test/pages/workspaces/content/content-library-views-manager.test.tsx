import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { ContentLibraryViewsManager } from "@/pages/workspaces/content/library/components/content-library-views-manager";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@arclayer/ui/sheet", () => ({
  Sheet: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  SheetContent: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  SheetHeader: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  SheetTitle: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  SheetDescription: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}));

describe("ContentLibraryViewsManager", () => {
  test("manages saved views through save, rename, pin, reorder, and delete actions", async () => {
    const user = userEvent.setup();
    const onCreateSavedView = vi.fn();
    const onRenameSavedView = vi.fn();
    const onTogglePinSavedView = vi.fn();
    const onMoveSavedView = vi.fn();
    const onDeleteSavedView = vi.fn();
    const onApplyFacetGroupItem = vi.fn();

    render(
      <ContentLibraryViewsManager
        open
        onOpenChange={vi.fn()}
        systemViews={[
          { id: "all", label: "All", active: true, onSelect: vi.fn() },
          { id: "draft", label: "Draft", active: false, onSelect: vi.fn() },
        ]}
        savedViews={[
          {
            id: "view-1",
            name: "Draft pages",
            baseViewId: "draft",
            query: "home",
            filters: { modelKey: "page" },
            pinned: true,
          },
          {
            id: "view-2",
            name: "Published stories",
            baseViewId: "published",
            query: "launch",
            filters: { status: "published" },
            pinned: false,
          },
        ]}
        onSelectSavedView={vi.fn()}
        onCreateSavedView={onCreateSavedView}
        onRenameSavedView={onRenameSavedView}
        onTogglePinSavedView={onTogglePinSavedView}
        onMoveSavedView={onMoveSavedView}
        onDeleteSavedView={onDeleteSavedView}
        facetGroups={[
          {
            id: "surface",
            title: "Surfaces",
            items: [
              {
                id: "writing",
                label: "CONTENT_LIBRARY_EDIT_WITH_WRITING",
                onSelect: () => onApplyFacetGroupItem("writing"),
              },
            ],
          },
          {
            id: "role",
            title: "Roles",
            items: [
              {
                id: "page",
                label: "CONTENT_LIBRARY_ROLE_PAGE",
                onSelect: () => onApplyFacetGroupItem("page"),
              },
            ],
          },
        ]}
      />,
    );

    await user.type(screen.getByLabelText("CONTENT_LIBRARY_VIEW_CREATE_NAME"), "My view");
    await user.click(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_SAVE_VIEW" }));
    expect(onCreateSavedView).toHaveBeenCalledWith("My view");

    await user.click(
      screen.getAllByRole("button", { name: "CONTENT_LIBRARY_ACTION_RENAME_VIEW" })[0]!,
    );
    const renameInput = screen.getByLabelText("CONTENT_LIBRARY_VIEW_RENAME_NAME");
    await user.clear(renameInput);
    await user.type(renameInput, "Renamed view");
    await user.click(
      screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_CONFIRM_RENAME_VIEW" }),
    );
    expect(onRenameSavedView).toHaveBeenCalledWith("view-1", "Renamed view");

    await user.click(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_UNPIN_VIEW" }));
    expect(onTogglePinSavedView).toHaveBeenCalledWith("view-1");

    await user.click(
      screen.getAllByRole("button", { name: "CONTENT_LIBRARY_ACTION_MOVE_VIEW_UP" })[1]!,
    );
    expect(onMoveSavedView).toHaveBeenCalledWith("view-2", "up");

    await user.click(
      screen.getAllByRole("button", { name: "CONTENT_LIBRARY_ACTION_DELETE_VIEW" })[0]!,
    );
    expect(onDeleteSavedView).toHaveBeenCalledWith("view-1");

    await user.click(screen.getByRole("button", { name: "CONTENT_LIBRARY_EDIT_WITH_WRITING" }));
    await user.click(screen.getByRole("button", { name: "CONTENT_LIBRARY_ROLE_PAGE" }));
    expect(onApplyFacetGroupItem).toHaveBeenNthCalledWith(1, "writing");
    expect(onApplyFacetGroupItem).toHaveBeenNthCalledWith(2, "page");
  });
});
