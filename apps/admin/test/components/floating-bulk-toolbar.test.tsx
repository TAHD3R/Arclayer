import { render, screen } from "@testing-library/react";
import { Archive, Trash2 } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { FloatingBulkToolbar } from "@/components/common/floating-bulk-toolbar";

describe("FloatingBulkToolbar", () => {
  it("renders selected count as tag and places clear action first", () => {
    const onClear = vi.fn();

    render(
      <FloatingBulkToolbar
        visible
        selectedLabel="已选择 3 项"
        clearLabel="清除已选"
        onClear={onClear}
        actions={[]}
      />,
    );

    expect(screen.getByText("已选择 3 项")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清除已选" })).toBeInTheDocument();
    expect(screen.queryByText("清除已选")).not.toBeInTheDocument();
  });

  it("renders icon-only action buttons with tooltip labels", () => {
    const archive = vi.fn();
    const remove = vi.fn();

    render(
      <FloatingBulkToolbar
        visible
        selectedLabel="已选择 2 项"
        clearLabel="清除已选"
        onClear={() => undefined}
        actions={[
          {
            key: "archive",
            label: "归档",
            icon: <Archive className="size-4" />,
            onClick: archive,
          },
          {
            key: "delete",
            label: "删除",
            icon: <Trash2 className="size-4" />,
            onClick: remove,
            variant: "destructive",
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "归档" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
    expect(screen.queryByText("归档")).not.toBeInTheDocument();
    expect(screen.queryByText("删除")).not.toBeInTheDocument();
  });
});
