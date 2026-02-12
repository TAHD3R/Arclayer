import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getCoreRowModel, type SortingState, useReactTable } from "@tanstack/react-table";
import { describe, expect, it } from "vitest";

import { DataTablePresenter } from "@/components/data-table";
import { buildOrdering, collectColumnSortKeys } from "@/components/data-table/utils";

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
  it("sortable header cycles none -> asc -> desc -> none", async () => {
    const user = userEvent.setup();
    render(<SortableTableHarness />);

    const headerButton = screen.getByRole("button", { name: "Name" });
    const ordering = screen.getByTestId("ordering");

    expect(ordering).toHaveTextContent("");

    await user.click(headerButton);
    expect(ordering).toHaveTextContent("name");

    await user.click(headerButton);
    expect(ordering).toHaveTextContent("-name");

    await user.click(headerButton);
    expect(ordering).toHaveTextContent("");
  });

  it("non-sortable header does not render a button and default header is left aligned", () => {
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

    const { container } = render(<NonSortableHarness />);

    expect(screen.queryByRole("button", { name: "Value" })).not.toBeInTheDocument();

    const headerCells = container.querySelectorAll("th");
    expect(headerCells[0]?.className).toContain("text-left");
    expect(headerCells[1]?.className).toContain("text-right");
  });
});
