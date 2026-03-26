import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { useContentLibraryTableColumns } from "@/pages/workspaces/content/library/content-library-table-columns";
import type { ContentLibraryTableRow } from "@/pages/workspaces/content/library/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function ColumnsHarness() {
  const columns = useContentLibraryTableColumns({
    formatDateTimeOrNull: (value) => value ?? null,
    actionPending: false,
    selectedRowIds: new Set(),
    onToggleVisibleRows: vi.fn(),
    onToggleRowSelection: vi.fn(),
    onOpen: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
  });

  return (
    <div>
      {columns.map((column) => {
        const header = column.header;
        return typeof header === "string" ? <span key={column.id ?? header}>{header}</span> : null;
      })}
    </div>
  );
}

function ColumnMetaHarness(props: { columnId: string }) {
  const columns = useContentLibraryTableColumns({
    formatDateTimeOrNull: (value) => value ?? null,
    actionPending: false,
    selectedRowIds: new Set(),
    onToggleVisibleRows: vi.fn(),
    onToggleRowSelection: vi.fn(),
    onOpen: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
  });
  const column = columns.find((column) => {
    const id =
      typeof column.id === "string"
        ? column.id
        : "accessorKey" in column && typeof column.accessorKey === "string"
          ? column.accessorKey
          : null;
    return id === props.columnId;
  });
  const meta = column?.meta as { defaultHidden?: boolean } | undefined;
  return <span>{meta?.defaultHidden ? "hidden" : "visible"}</span>;
}

function NameCellHarness() {
  const columns = useContentLibraryTableColumns({
    formatDateTimeOrNull: (value) => value ?? null,
    actionPending: false,
    selectedRowIds: new Set(),
    onToggleVisibleRows: vi.fn(),
    onToggleRowSelection: vi.fn(),
    onOpen: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
  });
  const nameColumn = columns.find((column) => {
    const id =
      typeof column.id === "string"
        ? column.id
        : "accessorKey" in column && typeof column.accessorKey === "string"
          ? column.accessorKey
          : null;
    return id === "name";
  });
  if (!nameColumn) return null;
  const row = {
    id: "content-1",
    workspaceId: "ws-1",
    siteId: "site-1",
    modelId: "model-page",
    modelKey: "page",
    slug: "homepage",
    title: "Homepage",
    name: "Homepage",
    status: "draft",
    visibility: "private",
    locale: "en-US",
    bootstrapPresetKey: "page",
    bootstrapPresetState: "selected",
    capabilityPackIds: ["publishable", "routable"],
    draftVersion: 1,
    updatedAt: "2026-03-26T00:00:00Z",
    modelName: "Page",
    modelDescription: null,
    modelCategory: "site_builder",
    modelCapabilities: ["visual_editable", "publishable", "routable"],
    derivedStatus: "draft",
    runtime: "visual",
    context: "site_builder",
    libraryGroup: "site-content",
    editWith: "canvas",
    role: "page",
  } satisfies ContentLibraryTableRow;

  const cell = nameColumn.cell;
  if (typeof cell !== "function") return null;

  return <div>{cell({ row: { original: row } } as never)}</div>;
}

describe("content-library-table-columns", () => {
  test("uses the agreed default visible workbench columns", () => {
    render(<ColumnsHarness />);

    expect(screen.getByText("CONTENT_LIBRARY_TABLE_COL_NAME")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_TABLE_COL_MODEL")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_TABLE_COL_LIBRARY_GROUP")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_TABLE_COL_STATUS")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_TABLE_COL_UPDATED")).toBeInTheDocument();
    expect(screen.queryByText("CONTENT_LIBRARY_TABLE_COL_LOCALE")).not.toBeInTheDocument();
  });

  test("shows the type as a leading icon and demotes the address into muted secondary text", () => {
    render(<NameCellHarness />);

    expect(screen.getByLabelText("CONTENT_LIBRARY_ROLE_PAGE")).toBeInTheDocument();
    expect(screen.getByText("Homepage")).toBeInTheDocument();
    expect(screen.getByText("/homepage")).toBeInTheDocument();
    expect(screen.queryByText("CONTENT_LIBRARY_ROLE_PAGE")).not.toBeInTheDocument();
    expect(screen.queryByText("CONTENT_LIBRARY_EDIT_WITH_CANVAS")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_OPEN" })).toBeInTheDocument();
  });

  test("hides library group by default when no persisted column preference exists", () => {
    const { rerender } = render(<ColumnMetaHarness columnId="libraryGroup" />);
    expect(screen.getByText("hidden")).toBeInTheDocument();

    rerender(<ColumnMetaHarness columnId="modelName" />);
    expect(screen.getByText("visible")).toBeInTheDocument();
  });
});
