import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { ContentLibraryToolbar } from "@/pages/projects/content/library/components/content-library-toolbar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/common/data-table-search-input", () => ({
  DataTableSearchInput: () => <div data-testid="content-library-search-input" />,
}));

vi.mock("@/components/common/data-table-toolbar-antd-icon-button", () => ({
  DataTableToolbarAntdIconButton: () => null,
}));

vi.mock("@/components/common/reui-filter-i18n", () => ({
  buildReuiFilterI18n: () => ({}),
}));

vi.mock("@/layouts/page-shell/page-extra-toolbar", () => ({
  PageExtraToolbar: (props: {
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
    className?: string;
  }) => (
    <div className={props.className}>
      <div>{props.leading}</div>
      <div>{props.trailing}</div>
    </div>
  ),
}));

vi.mock("@arclayer/ui/data-table", () => ({
  DataTableToolbarTools: () => <div data-testid="content-library-toolbar-tools" />,
}));

vi.mock("@arclayer/ui/filters", () => ({
  Filters: () => <div data-testid="content-library-filters" />,
  createFilter: vi.fn(),
}));
vi.mock("@arclayer/ui/tooltip", () => ({
  Tooltip: (props: { children: React.ReactNode }) => <>{props.children}</>,
  TooltipTrigger: (props: { children: React.ReactNode }) => <>{props.children}</>,
  TooltipContent: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}));

vi.mock("@/components/common/view-mode-toggle", () => ({
  ViewModeToggle: () => <div data-testid="content-library-view-mode-toggle" />,
}));

describe("ContentLibraryToolbar", () => {
  test("submits a create-view draft from the add-view popover", async () => {
    const user = userEvent.setup();
    const onCreateView = vi.fn();

    render(
      <ContentLibraryToolbar
        table={{} as never}
        searchInput=""
        onSearchInputChange={vi.fn()}
        filters={{}}
        onFiltersChange={vi.fn()}
        onRefresh={vi.fn()}
        toolsLabels={{} as never}
        modelOptions={[]}
        viewMode="table"
        onViewModeChange={vi.fn()}
        views={[
          { id: "all", label: "All", active: true, onSelect: vi.fn() },
          { id: "draft", label: "Draft", active: false, onSelect: vi.fn() },
        ]}
        onCreateView={onCreateView}
      />,
    );

    await user.click(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_CREATE_VIEW" }));

    const nameInput = screen.getByLabelText("CONTENT_LIBRARY_VIEW_CREATE_NAME");
    await user.type(nameInput, "Editorial queue");

    expect(screen.getByRole("button", { name: "Editorial queue" })).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_VIEW_VISIBILITY_LABEL")).toBeVisible();
    expect(
      screen.getByRole("switch", { name: "CONTENT_LIBRARY_VIEW_DEFAULT_LABEL" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("combobox", { name: "CONTENT_LIBRARY_VIEW_VISIBILITY_LABEL" }),
    );
    await user.click(
      screen.getByRole("option", { name: "CONTENT_LIBRARY_VIEW_VISIBILITY_WORKSPACE" }),
    );
    await user.click(screen.getByRole("switch", { name: "CONTENT_LIBRARY_VIEW_DEFAULT_LABEL" }));
    await user.click(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_SAVE_VIEW" }));

    expect(onCreateView).toHaveBeenCalledWith({
      name: "Editorial queue",
      visibility: "workspace",
      isDefault: true,
    });
  });

  test("renders active and inactive view chips correctly and opens saved-view actions", async () => {
    const user = userEvent.setup();
    const onMoveUp = vi.fn();
    const onMoveDown = vi.fn();
    const onEdit = vi.fn();
    const onSaveAs = vi.fn();
    const onUpdate = vi.fn();
    const onDelete = vi.fn();

    const { rerender } = render(
      <ContentLibraryToolbar
        table={{} as never}
        searchInput=""
        onSearchInputChange={vi.fn()}
        filters={{}}
        onFiltersChange={vi.fn()}
        onRefresh={vi.fn()}
        toolsLabels={{} as never}
        modelOptions={[]}
        viewMode="table"
        onViewModeChange={vi.fn()}
        views={[
          { id: "all", label: "All", active: true, onSelect: vi.fn() },
          {
            id: "view-1",
            label: "Editorial queue",
            active: false,
            onSelect: vi.fn(),
            onMoveForward: onMoveUp,
            moveForwardDisabled: false,
            onMoveBackward: onMoveDown,
            moveBackwardDisabled: false,
            onEdit,
            onSaveAs,
            onUpdate,
            onDelete,
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "All" }).parentElement?.className).toContain(
      "bg-accent",
    );
    expect(
      screen.getByRole("button", { name: "Editorial queue" }).parentElement?.className,
    ).toContain("bg-transparent");

    expect(
      screen.queryByRole("button", { name: "CONTENT_LIBRARY_ACTION_VIEW_MENU" }),
    ).not.toBeInTheDocument();

    const savedViewButton = screen.getByRole("button", { name: "Editorial queue" });

    await user.hover(savedViewButton);
    const menuButton = await screen.findByRole("button", {
      name: "CONTENT_LIBRARY_ACTION_VIEW_MENU",
    });
    expect(menuButton).toBeVisible();
    expect(menuButton.className).toContain("size-7");

    await user.click(menuButton);
    await user.click(screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_ACTION_EDIT_VIEW" }));
    expect(onEdit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_VIEW_MENU" }));
    await user.click(
      screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_ACTION_MOVE_VIEW_FORWARD" }),
    );
    expect(onMoveUp).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_VIEW_MENU" }));
    await user.click(
      screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_ACTION_MOVE_VIEW_BACKWARD" }),
    );
    expect(onMoveDown).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_VIEW_MENU" }));
    await user.click(screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_ACTION_SAVE_AS_VIEW" }));
    expect(onSaveAs).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_VIEW_MENU" }));
    await user.click(screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_ACTION_UPDATE_VIEW" }));
    expect(onUpdate).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_VIEW_MENU" }));
    await user.click(screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_ACTION_DELETE_VIEW" }));
    expect(onDelete).toHaveBeenCalledTimes(1);

    rerender(
      <ContentLibraryToolbar
        table={{} as never}
        searchInput=""
        onSearchInputChange={vi.fn()}
        filters={{}}
        onFiltersChange={vi.fn()}
        onRefresh={vi.fn()}
        toolsLabels={{} as never}
        modelOptions={[]}
        viewMode="table"
        onViewModeChange={vi.fn()}
        views={[
          {
            id: "view-1",
            label: "Editorial queue",
            active: true,
            onSelect: vi.fn(),
            onMoveForward: onMoveUp,
            moveForwardDisabled: true,
            onMoveBackward: onMoveDown,
            moveBackwardDisabled: false,
            onEdit,
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_VIEW_MENU" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Editorial queue" }).parentElement?.className,
    ).toContain("bg-accent");
    await user.click(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_VIEW_MENU" }));
    expect(
      screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_ACTION_MOVE_VIEW_FORWARD" }),
    ).toHaveAttribute("data-disabled");
  });

  test("shows a modified tag for a dirty saved view and constrains long labels", () => {
    render(
      <ContentLibraryToolbar
        table={{} as never}
        searchInput=""
        onSearchInputChange={vi.fn()}
        filters={{}}
        onFiltersChange={vi.fn()}
        onRefresh={vi.fn()}
        toolsLabels={{} as never}
        modelOptions={[]}
        viewMode="table"
        onViewModeChange={vi.fn()}
        views={[
          {
            id: "view-1",
            label: "An extremely long editorial queue view name that should truncate in the rail",
            active: true,
            dirty: true,
            onSelect: vi.fn(),
          },
        ]}
      />,
    );

    expect(screen.getByText("CONTENT_LIBRARY_VIEW_DIRTY_TAG")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "An extremely long editorial queue view name that should truncate in the rail",
      }).innerHTML,
    ).toContain("max-w-[12rem] truncate");
  });

  test("disables update when the active view already matches the current workbench", async () => {
    const user = userEvent.setup();

    render(
      <ContentLibraryToolbar
        table={{} as never}
        searchInput=""
        onSearchInputChange={vi.fn()}
        filters={{}}
        onFiltersChange={vi.fn()}
        onRefresh={vi.fn()}
        toolsLabels={{} as never}
        modelOptions={[]}
        viewMode="table"
        onViewModeChange={vi.fn()}
        views={[
          {
            id: "view-1",
            label: "Editorial queue",
            active: true,
            onSelect: vi.fn(),
            onUpdate: vi.fn(),
            updateDisabled: true,
            updateDisabledReason: "CONTENT_LIBRARY_UPDATE_VIEW_DISABLED_TOOLTIP",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_VIEW_MENU" }));
    expect(
      screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_ACTION_UPDATE_VIEW" }),
    ).toHaveAttribute("data-disabled");
    expect(screen.getByText("CONTENT_LIBRARY_UPDATE_VIEW_DISABLED_TOOLTIP")).toBeInTheDocument();
  });
});
