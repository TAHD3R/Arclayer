import { render, screen } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useDropzoneMock } = vi.hoisted(() => ({
  useDropzoneMock: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("react-dropzone", () => ({
  useDropzone: useDropzoneMock,
}));

vi.mock("@arclayer/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactElement }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { FileUpload } from "@/pages/workspaces/assets/components/file-upload/file-upload";

describe("FileUpload.Panel", () => {
  beforeEach(() => {
    useDropzoneMock.mockReset();
    useDropzoneMock.mockReturnValue({
      getRootProps: (props?: Record<string, unknown>) => props ?? {},
      getInputProps: () => ({}),
      isDragActive: false,
      open: vi.fn(),
    });
  });

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

  it("passes upload policy limits into dropzone validation", () => {
    render(
      <FileUpload.Panel
        items={[]}
        accept=".png,image/png"
        maxSizeBytes={4}
        onPickFiles={() => undefined}
        onDeleteItem={() => undefined}
      />,
    );

    const validator = useDropzoneMock.mock.calls[0][0].validator as (file: File) => unknown;

    expect(validator(new File(["ok"], "avatar.png", { type: "image/png" }))).toBeNull();
    expect(validator(new File(["large"], "avatar.png", { type: "image/png" }))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "file-too-large" })]),
    );
    expect(validator(new File(["ok"], "avatar.gif", { type: "image/gif" }))).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "file-invalid-type" })]),
    );
  });
});
