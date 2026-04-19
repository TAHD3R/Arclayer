import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getCoreRowModel, type SortingState, useReactTable } from "@tanstack/react-table";
import { describe, expect, it, vi } from "vitest";

import {
  DataTablePresenter,
  buildOrdering,
  collectColumnSortKeys,
  useDataTableCore,
} from "@arclayer/ui/data-table";
import { DataPaginationControls } from "@/components/common/data-pagination-controls";

function SortableTableHarness() {
  const data = React.useMemo(() => [{ name: "Alice" }], []);
  const columns = React.useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        meta: { sortKey: "name" },
      },
    ],
    [],
  );

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const sortKeyByColumnId = React.useMemo(() => collectColumnSortKeys(columns), [columns]);
  const ordering = React.useMemo(
    () => buildOrdering(sorting, sortKeyByColumnId),
    [sortKeyByColumnId, sorting],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableSortingRemoval: true,
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <>
      <span data-testid="ordering">{ordering ?? ""}</span>
      <DataTablePresenter table={table} emptyText="empty" />
    </>
  );
}

function PinnedActionsHarness() {
  const data = React.useMemo(() => [{ name: "Alice" }], []);
  const columns = React.useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
      },
      {
        id: "actions",
        header: "",
        meta: { kind: "actions" as const },
        cell: () => null,
      },
    ],
    [],
  );

  const core = useDataTableCore({
    columns,
    data,
    pageCount: 1,
  });

  return <DataTablePresenter table={core.table} emptyText="empty" />;
}

describe("DataTablePresenter", () => {
  it("sortable header button does not force uppercase text rendering", () => {
    render(<SortableTableHarness />);

    const headerButton = screen.getByRole("button", { name: "Name" });
    expect(headerButton).not.toHaveStyle({ textTransform: "uppercase" });
    expect(headerButton.querySelector("svg")).toBeNull();
  });

  it("sortable header opens a menu for sort actions", async () => {
    const user = userEvent.setup();
    render(<SortableTableHarness />);

    const headerButton = screen.getByRole("button", { name: "Name" });
    const ordering = screen.getByTestId("ordering");

    expect(ordering).toHaveTextContent("");

    await user.click(headerButton);
    screen.getByRole("menuitem", { name: "Sort" }).focus();
    await user.keyboard("{ArrowRight}");
    await user.click(await screen.findByRole("menuitem", { name: "Sort ascending" }));
    expect(ordering).toHaveTextContent("name");

    await user.click(headerButton);
    screen.getByRole("menuitem", { name: "Sort" }).focus();
    await user.keyboard("{ArrowRight}");
    await user.click(await screen.findByRole("menuitem", { name: "Sort descending" }));
    expect(ordering).toHaveTextContent("-name");

    await user.click(headerButton);
    await user.click(screen.getByRole("menuitem", { name: "Wrap content" }));
    await user.click(headerButton);
    expect(screen.getByRole("menuitem", { name: "Unwrap content" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(headerButton);
    await user.click(screen.getByRole("menuitem", { name: "Hide" }));
    expect(screen.queryByRole("columnheader", { name: "Name" })).not.toBeInTheDocument();
  });

  it("non-sortable header still uses the header menu trigger and keeps default alignment", async () => {
    function NonSortableHarness() {
      const data = [{ value: "A" }];
      const columns = [
        {
          accessorKey: "value",
          header: "Value",
        },
        {
          id: "actions",
          header: "Actions",
          meta: { kind: "actions" as const },
          cell: () => null,
        },
      ];

      const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
      });

      return <DataTablePresenter table={table} emptyText="empty" />;
    }

    const user = userEvent.setup();
    const { container } = render(<NonSortableHarness />);

    await user.click(screen.getByRole("button", { name: "Value" }));
    expect(screen.getByRole("menuitem", { name: "Hide" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Wrap content" })).toBeInTheDocument();

    const headerCells = container.querySelectorAll("th");
    expect(headerCells[0]?.className).toContain("text-left");
    expect(headerCells[1]?.className).toContain("text-right");
  });

  it("status-tag style headers use the default left alignment", () => {
    function StatusHeaderHarness() {
      const data = [{ status: "Pending" }];
      const columns = [
        {
          accessorKey: "status",
          header: "Status",
          meta: { kind: "status" as const },
        },
      ];

      const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
      });

      return <DataTablePresenter table={table} emptyText="empty" />;
    }

    render(<StatusHeaderHarness />);

    expect(screen.getByRole("columnheader", { name: "Status" }).className).toContain("text-left");
  });

  it("whole-header menu can expose the shared filter action contract", async () => {
    const onFilterSelect = vi.fn();

    function FilterHarness() {
      const data = [{ name: "Alice" }];
      const columns = [{ accessorKey: "name", header: "Name" }];
      const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
      });

      return (
        <DataTablePresenter
          table={table}
          emptyText="empty"
          resolveColumnFilterAction={() => ({
            active: true,
            summary: "Contains: Alice",
            onSelect: onFilterSelect,
          })}
        />
      );
    }

    const user = userEvent.setup();
    render(<FilterHarness />);

    await user.click(screen.getByRole("button", { name: "Name" }));
    expect(screen.getByText("Contains: Alice")).toBeInTheDocument();
    const menuItems = screen.getAllByRole("menuitem").map((item) => item.textContent?.trim());
    expect(menuItems).toEqual(["FilterContains: Alice", "Hide", "Wrap content"]);
    await user.click(screen.getByRole("menuitem", { name: "Filter" }));
    expect(onFilterSelect).toHaveBeenCalledTimes(1);
  });

  it("header trigger uses the tighter connected cell styling without drag affordance", () => {
    render(<SortableTableHarness />);

    const headerButton = screen.getByRole("button", { name: "Name" });
    const headerCell = screen.getByRole("columnheader", { name: "Name" });

    expect(headerButton.className).toContain("rounded-none");
    expect(headerButton.className).not.toContain("cursor-grab");
    expect(headerCell.className).toContain("border-r");
    expect(headerCell.className).toContain("px-0");
    expect(headerCell.className).toContain("bg-background");
    expect(headerCell.className).toContain("font-semibold");
    expect(headerCell.className).toContain("z-20");
  });

  it("keeps ordinary headers above the overflow gradient beside right-pinned columns", () => {
    const { container } = render(<PinnedActionsHarness />);

    const nameHeader = screen.getByRole("columnheader", { name: "Name" });
    const actionsHeader = container.querySelector<HTMLTableCellElement>(
      'th[data-column-id="actions"]',
    );

    expect(nameHeader.className).toContain("z-20");
    expect(actionsHeader).not.toBeNull();
    expect(actionsHeader?.className).toContain("z-30");
    expect(actionsHeader?.dataset.pinned).toBe("right");
  });

  it("renders toolbar and footer inside the shared table surface", () => {
    function SurfaceHarness() {
      const data = [{ name: "Alice" }];
      const columns = [{ accessorKey: "name", header: "Name" }];
      const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
      });

      return (
        <DataTablePresenter
          table={table}
          emptyText="empty"
          toolbar={{ fullWidth: <div data-testid="toolbar">toolbar</div> }}
          footer={<div data-testid="footer">footer</div>}
        />
      );
    }

    const { container } = render(<SurfaceHarness />);

    const toolbar = screen.getByTestId("toolbar");
    const footer = screen.getByTestId("footer");
    const surface = toolbar.closest("div.relative.min-h-0.flex.flex-1.flex-col.overflow-hidden");

    expect(surface).not.toBeNull();
    expect(surface).toContainElement(toolbar);
    expect(surface).toContainElement(footer);
    expect(surface?.className).toContain("rounded-lg");
    expect(surface?.className).toContain("bg-background");

    const separators = container.querySelectorAll(
      "div.border-b.border-border\\/60, div.border-t.border-border\\/60",
    );
    expect(separators.length).toBe(0);
  });

  it("renders shared infinite-scroll footer states", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();

    function InfiniteHarness(props: {
      hasMore: boolean;
      loadingMore: boolean;
      loadMoreError?: unknown;
    }) {
      const data = [{ name: "Alice" }];
      const columns = [{ accessorKey: "name", header: "Name" }];
      const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
      });

      return (
        <DataTablePresenter
          table={table}
          emptyText="empty"
          infiniteScroll={{
            hasMore: props.hasMore,
            loadingMore: props.loadingMore,
            loadMoreError: props.loadMoreError,
            onLoadMore,
            loadingMoreLabel: "Loading more",
            loadMoreErrorLabel: "Load failed",
            endLabel: "All loaded",
          }}
        />
      );
    }

    const { rerender } = render(<InfiniteHarness hasMore loadingMore={false} />);

    await user.click(screen.getByRole("button", { name: "Load more rows" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(<InfiniteHarness hasMore loadingMore />);
    expect(screen.getByText("Loading more")).toBeInTheDocument();

    rerender(<InfiniteHarness hasMore={false} loadingMore={false} />);
    expect(
      screen.queryByText("All loaded", {
        selector: '[data-slot="data-table-infinite-scroll-footer"] *',
      }),
    ).not.toBeInTheDocument();

    rerender(<InfiniteHarness hasMore loadingMore={false} loadMoreError={new Error("boom")} />);
    expect(screen.getByText("Load failed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("uses text-callout styling for header cells", () => {
    render(<SortableTableHarness />);

    const headerButton = screen.getByRole("button", { name: "Name" });
    expect(headerButton.className).toContain("text-callout");
  });

  it("uses shared background classes for header cells and rows", () => {
    const { container } = render(<SortableTableHarness />);

    const headerCell = screen.getByRole("columnheader", { name: "Name" });
    const bodyRow = container.querySelector("tbody tr");

    expect(headerCell.className).toContain("bg-background");
    expect(bodyRow?.className).toContain("bg-background");
    expect(bodyRow?.className).toContain("hover:bg-muted/20");
  });
});

function ClientSortingHarness() {
  const data = React.useMemo(() => [{ name: "Bravo" }, { name: "Alpha" }], []);
  const columns = React.useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        meta: { sortKey: "name" },
      },
    ],
    [],
  );

  const core = useDataTableCore({
    columns,
    data,
    pageCount: 1,
    features: {
      sorting: {
        enabled: true,
        mode: "client",
      },
    },
  });

  const names = core.table
    .getRowModel()
    .rows.map((row) => String(row.getValue("name")))
    .join(",");

  return (
    <div>
      <button type="button" onClick={() => core.setSorting([{ id: "name", desc: false }])}>
        sort-asc
      </button>
      <button type="button" onClick={() => core.setSorting([{ id: "name", desc: true }])}>
        sort-desc
      </button>
      <span data-testid="client-order">{names}</span>
    </div>
  );
}

describe("useDataTableCore", () => {
  it("applies client-side sorting when sorting mode is client", async () => {
    const user = userEvent.setup();
    render(<ClientSortingHarness />);

    expect(screen.getByTestId("client-order")).toHaveTextContent("Bravo,Alpha");

    await user.click(screen.getByRole("button", { name: "sort-asc" }));
    expect(screen.getByTestId("client-order")).toHaveTextContent("Alpha,Bravo");

    await user.click(screen.getByRole("button", { name: "sort-desc" }));
    expect(screen.getByTestId("client-order")).toHaveTextContent("Bravo,Alpha");
  });

  it("does not auto-pin an actions column when meta.pin is false", () => {
    function AutoPinOptOutHarness() {
      const core = useDataTableCore({
        columns: [
          { accessorKey: "name", header: "Name" },
          {
            id: "actions",
            header: "Actions",
            meta: { kind: "actions" as const, pin: false as const },
            cell: () => null,
          },
        ],
        data: [{ name: "Alpha" }],
        pageCount: 1,
      });

      return (
        <span data-testid="pin-state">{JSON.stringify(core.table.getState().columnPinning)}</span>
      );
    }

    render(<AutoPinOptOutHarness />);
    expect(screen.getByTestId("pin-state")).toHaveTextContent("{}");
  });

  it("auto-pins select columns to the left and actions columns to the right", () => {
    function AutoPinHarness() {
      const core = useDataTableCore({
        columns: [
          {
            id: "select",
            header: "Select",
            meta: { kind: "select" as const },
            cell: () => null,
          },
          { accessorKey: "name", header: "Name" },
          {
            id: "actions",
            header: "Actions",
            meta: { kind: "actions" as const },
            cell: () => null,
          },
        ],
        data: [{ name: "Alpha" }],
        pageCount: 1,
      });

      return (
        <span data-testid="pin-state">{JSON.stringify(core.table.getState().columnPinning)}</span>
      );
    }

    render(<AutoPinHarness />);
    expect(screen.getByTestId("pin-state")).toHaveTextContent(
      '{"left":["select"],"right":["actions"]}',
    );
  });
});

describe("DataPaginationControls", () => {
  it("renders result count left, pager center, and page-size control right", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { container } = render(
      <DataPaginationControls
        page={3}
        size={10}
        total={88}
        onChange={onChange}
        t={(key, options) =>
          (
            ({
              "common:ITEMS_PER_PAGE": "Items per page",
              "common:PREVIOUS": "Previous",
              "common:NEXT": "Next",
              "common:DATA_TABLE_SHOWING_RESULTS": `showing ${String(options?.start)} - ${String(options?.end)} of ${String(options?.total)} results`,
            }) as const
          )[
            key as
              | "common:ITEMS_PER_PAGE"
              | "common:PREVIOUS"
              | "common:NEXT"
              | "common:DATA_TABLE_SHOWING_RESULTS"
          ] ?? key
        }
      />,
    );

    expect(screen.getByText("showing 21 - 30 of 88 results")).toBeInTheDocument();

    const pageNav = screen.getByRole("navigation", { name: "Pagination" });
    expect(within(pageNav).getByRole("button", { name: "Previous" })).toBeEnabled();
    expect(within(pageNav).getByRole("button", { name: "Next" })).toBeEnabled();
    expect(within(pageNav).getByRole("button", { name: "3" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.click(within(pageNav).getByRole("button", { name: "4" }));
    expect(onChange).toHaveBeenCalledWith(4, 10);

    expect(screen.getByText("Items per page")).toBeInTheDocument();

    const root = container.firstElementChild;
    expect(root).toHaveClass("px-4");
  });
});
