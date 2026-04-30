import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { useContentLibraryTableColumns } from "@/pages/projects/content/library/components/content-library-table-columns";
import type { ContentLibraryTableRow } from "@/pages/projects/content/library/types";

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
    publishReadiness: { ready: false, blockerCodes: ["WORKFLOW_STAGE_NOT_APPROVED"] },
    updatedAt: "2026-03-26T00:00:00Z",
    workflowAssigneeUserId: null,
    workflowNotes: [],
    workflowStage: "drafting",
    workflowSummary: "Needs review",
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

function ActionsCellHarness() {
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
  const actionsColumn = columns.find((column) => column.id === "actions");
  if (!actionsColumn || typeof actionsColumn.cell !== "function") return null;

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
    publishReadiness: { ready: true, blockerCodes: [] },
    updatedAt: "2026-03-26T00:00:00Z",
    workflowAssigneeUserId: null,
    workflowNotes: [],
    workflowStage: "approved",
    workflowSummary: "Approved for release",
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

  return <div>{actionsColumn.cell({ row: { original: row } } as never)}</div>;
}

function WorkflowCellHarness() {
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
  const workflowColumn = columns.find((column) => {
    const id =
      typeof column.id === "string"
        ? column.id
        : "accessorKey" in column && typeof column.accessorKey === "string"
          ? column.accessorKey
          : null;
    return id === "workflowStage";
  });
  if (!workflowColumn || typeof workflowColumn.cell !== "function") return null;

  const row = {
    id: "content-2",
    workspaceId: "ws-1",
    siteId: "site-1",
    modelId: "model-article",
    modelKey: "article",
    slug: "launch-note",
    title: "Launch note",
    name: "Launch note",
    status: "draft",
    visibility: "public",
    locale: "en-US",
    bootstrapPresetKey: "article",
    bootstrapPresetState: "selected",
    capabilityPackIds: ["publishable", "rich_text_editable"],
    draftVersion: 2,
    publishReadiness: { ready: false, blockerCodes: ["WORKFLOW_STAGE_NOT_APPROVED"] },
    updatedAt: "2026-03-26T00:00:00Z",
    workflowAssigneeUserId: null,
    workflowNotes: [],
    workflowStage: "in_review",
    workflowSummary: "Sent to review",
    modelName: "Article",
    modelDescription: null,
    modelCategory: "content_library",
    modelCapabilities: ["publishable", "rich_text_editable"],
    derivedStatus: "draft",
    runtime: "text",
    context: "content_library",
    libraryGroup: "general-content",
    editWith: "writing",
    role: "article",
  } satisfies ContentLibraryTableRow;

  return <div>{workflowColumn.cell({ row: { original: row } } as never)}</div>;
}

describe("content-library-table-columns", () => {
  test("uses the agreed default visible workbench columns", () => {
    render(<ColumnsHarness />);

    expect(screen.getByText("CONTENT_LIBRARY_TABLE_COL_NAME")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_TABLE_COL_CONTENT_TYPE")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_TABLE_COL_LIBRARY_GROUP")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_TABLE_COL_STATUS")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_TABLE_COL_WORKFLOW")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_TABLE_COL_DIAGNOSTICS")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_TABLE_COL_UPDATED")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_TABLE_COL_LOCALE")).toBeInTheDocument();
  });

  test("shows the type as a leading icon and demotes the address into muted secondary text", () => {
    render(<NameCellHarness />);

    expect(screen.getByLabelText("CONTENT_LIBRARY_ROLE_PAGE")).toBeInTheDocument();
    expect(screen.getByText("Homepage")).toBeInTheDocument();
    expect(screen.getByText("/homepage")).toBeInTheDocument();
    expect(screen.queryByText("CONTENT_LIBRARY_ROLE_PAGE")).not.toBeInTheDocument();
    expect(screen.queryByText("CONTENT_LIBRARY_EDIT_WITH_CANVAS")).not.toBeInTheDocument();
  });

  test("renders row actions in the dedicated shared actions column", () => {
    render(<ActionsCellHarness />);

    expect(screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_OPEN" })).toBeInTheDocument();
    expect(screen.getByLabelText("CONTENT_LIBRARY_ROW_ACTIONS")).toBeInTheDocument();
  });

  test("renders workflow stage and blocker summary in the workflow column", () => {
    render(<WorkflowCellHarness />);

    expect(screen.getByText("CONTENT_LIBRARY_WORKFLOW_STAGE_IN_REVIEW")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_WORKFLOW_BLOCKED_BY")).toBeInTheDocument();
  });

  test("hides library group by default when no persisted column preference exists", () => {
    const { rerender } = render(<ColumnMetaHarness columnId="libraryGroup" />);
    expect(screen.getByText("hidden")).toBeInTheDocument();

    rerender(<ColumnMetaHarness columnId="modelName" />);
    expect(screen.getByText("visible")).toBeInTheDocument();
  });
});
