import { render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { useContentLibraryTableColumns } from "@/pages/workspaces/content/library/content-library-table-columns";

describe("content-library-table-columns", () => {
  it("uses the compact V1 column set with explicit widths", () => {
    const { result } = renderHook(() =>
      useContentLibraryTableColumns({
        formatDateTimeOrNull: () => "2026-03-19 08:00",
        actionPending: false,
        onDuplicate: () => {},
        onDelete: () => {},
        onArchive: () => {},
        onUnarchive: () => {},
      }),
    );

    const columns = result.current;
    const columnIds = columns.map(
      (column) => column.id ?? ("accessorKey" in column ? column.accessorKey : undefined),
    );

    expect(columnIds).toEqual(["name", "derivedStatus", "locale", "updatedAt", "actions"]);

    expect(columns[0]).toMatchObject({ size: 280, minSize: 220 });
    expect(columns[1]).toMatchObject({ size: 140, minSize: 140, maxSize: 140 });
    expect(columns[2]).toMatchObject({ size: 196, minSize: 172 });
    expect(columns[3]).toMatchObject({ size: 180, minSize: 160 });
    expect(columns[4]).toMatchObject({ size: 56, minSize: 56, maxSize: 56 });
  });

  it("centers the actions cell content", () => {
    const { result } = renderHook(() =>
      useContentLibraryTableColumns({
        formatDateTimeOrNull: () => "2026-03-19 08:00",
        actionPending: false,
        onDuplicate: () => {},
        onDelete: () => {},
        onArchive: () => {},
        onUnarchive: () => {},
      }),
    );

    const actionsColumn = result.current[4];
    const cellRenderer = actionsColumn?.cell as ((context: unknown) => ReactNode) | undefined;
    const cell = cellRenderer?.({
      row: {
        original: {
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
          updatedAt: "2026-03-19T00:00:00Z",
          name: "Homepage",
          modelName: null,
          modelDescription: null,
          modelCapabilities: [],
          derivedStatus: "draft",
          runtime: "unknown",
          context: "standalone",
        },
      },
    });

    const { container } = render(<>{cell}</>);
    expect(actionsColumn?.meta).toMatchObject({
      kind: "actions",
      headerAlign: "center",
      title: "",
    });
    expect(container.firstElementChild).toHaveClass(
      "flex",
      "w-full",
      "items-center",
      "justify-center",
    );
  });
});
