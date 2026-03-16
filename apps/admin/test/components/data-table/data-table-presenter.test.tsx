import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getCoreRowModel, type SortingState, useReactTable } from "@tanstack/react-table";
import { describe, expect, it } from "vitest";

import {
  DataTablePresenter,
  buildOrdering,
  collectColumnSortKeys,
  useDataTableCore,
} from "@arclayer/ui/data-table";

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
  it("sortable header button forces uppercase text rendering", () => {
    render(<SortableTableHarness />);

    const headerButton = screen.getByRole("button", { name: "Name" });
    expect(headerButton).toHaveStyle({ textTransform: "uppercase" });
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
});
