import { render, screen } from "@testing-library/react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { describe, expect, it, vi } from "vitest";

import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function EmptyTableHarness() {
  const table = useReactTable({
    data: [],
    columns: [{ accessorKey: "name", header: "Name" }],
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <AdminDataTableSection
      table={table}
      emptyText="empty"
      emptyTitle="No rows"
      emptyDescription="Nothing here yet."
      loading={false}
      error={null}
      onRetry={() => undefined}
      t={(key) => key}
      rowHeight="md"
      toolbar={<div data-testid="table-toolbar">toolbar</div>}
    />
  );
}

describe("AdminDataTableSection", () => {
  it("keeps toolbar visible when the table is empty", () => {
    render(<EmptyTableHarness />);

    const toolbar = screen.getByTestId("table-toolbar");
    expect(toolbar).toBeInTheDocument();
    expect(screen.getByText("No rows")).toBeInTheDocument();
    expect(toolbar.parentElement).toHaveClass("min-w-0");
    expect(toolbar.parentElement?.parentElement).toHaveClass(
      "border-b",
      "border-border/60",
      "bg-muted/[0.04]",
      "py-3",
      "px-0",
    );
  });
});
