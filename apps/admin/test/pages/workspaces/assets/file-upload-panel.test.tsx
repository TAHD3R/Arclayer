import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("react-dropzone", () => ({
  useDropzone: () => ({
    getRootProps: (props?: Record<string, unknown>) => props ?? {},
    getInputProps: () => ({}),
    isDragActive: false,
    open: vi.fn(),
  }),
}));

vi.mock("@arclayer/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactElement }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { FileUpload } from "@/pages/workspaces/assets/components/file-upload/file-upload";

describe("FileUpload.Panel", () => {
  it("renders upload items without wrapping the list in an extra card container", () => {
    render(
      <FileUpload.Panel
        items={[
          {
            id: "upload-1",
            file: new File(["hello"], "cover.png", { type: "image/png" }),
            status: "uploading",
            progress: 32,
          },
        ]}
        onPickFiles={() => undefined}
        onDeleteItem={() => undefined}
      />,
    );

    const list = screen.getByRole("list");
    const listContainer = list.parentElement;

    expect(list).toHaveClass("grid", "gap-3");
    expect(list).not.toHaveClass("flex", "flex-col");
    expect(listContainer).not.toHaveClass("rounded-xl", "border", "bg-card", "p-3");
  });
});
