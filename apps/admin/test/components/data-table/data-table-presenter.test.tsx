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

describe("DataTablePresenter", () => {
  it("sortable header button does not force uppercase text rendering", () => {
    render(<SortableTableHarness />);

    const headerButton = screen.getByRole("button", { name: "Name" });
    expect(headerButton).not.toHaveStyle({ textTransform: "uppercase" });
  });

  it("sortable header opens a menu for sort actions", async () => {
    const user = userEvent.setup();
    render(<SortableTableHarness />);

    const headerButton = screen.getByRole("button", { name: "Name" });
    const ordering = screen.getByTestId("ordering");

    expect(ordering).toHaveTextContent("");

    await user.click(headerButton);
    await user.click(screen.getByRole("menuitem", { name: "Sort ascending" }));
    expect(ordering).toHaveTextContent("name");

    await user.click(headerButton);
    await user.click(screen.getByRole("menuitem", { name: "Sort descending" }));
    expect(ordering).toHaveTextContent("-name");

    await user.click(headerButton);
    await user.click(screen.getByRole("menuitem", { name: "Hide column" }));
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
    expect(screen.getByRole("menuitem", { name: "Hide column" })).toBeInTheDocument();

    const headerCells = container.querySelectorAll("th");
    expect(headerCells[0]?.className).toContain("text-left");
    expect(headerCells[1]?.className).toContain("text-right");
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
    expect(surface?.className).not.toContain("rounded-2xl");
    expect(surface?.className).toContain("rounded-none");
    expect(surface?.className).toContain("border-0");

    const separators = container.querySelectorAll(
      "div.border-b.border-border\\/60, div.border-t.border-border\\/60",
    );
    expect(separators.length).toBeGreaterThanOrEqual(2);
  });

  it("uses text-callout styling for header cells", () => {
    render(<SortableTableHarness />);

    const headerButton = screen.getByRole("button", { name: "Name" });
    expect(headerButton.className).toContain("text-callout");
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

    render(
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
  });
});
