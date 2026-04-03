import * as React from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("katex/dist/katex.min.css", () => ({}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("platejs/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("platejs/react")>();

  return {
    ...actual,
    PlateLeaf: ({
      children,
      className,
      ...props
    }: React.HTMLAttributes<HTMLSpanElement> & { children?: React.ReactNode }) => (
      <span className={className} {...props}>
        {children}
      </span>
    ),
  };
});

import { articleEditorCodeBlockLowlight } from "../../../../../../packages/ui/shadcn/src/editor/code-block-highlighting";
import { CodeSyntaxLeaf } from "../../../../../../packages/ui/shadcn/src/editor/ui/code-block-node";

describe("content-library-editor-code-block", () => {
  it("registers lowlight-backed syntax highlighting languages for code blocks", () => {
    expect(articleEditorCodeBlockLowlight.listLanguages()).toContain("typescript");
    expect(articleEditorCodeBlockLowlight.listLanguages()).toContain("python");
  });

  it("applies syntax token classes to decorated code leaves", () => {
    const CodeSyntaxLeafAny = CodeSyntaxLeaf as React.ComponentType<any>;

    render(
      <CodeSyntaxLeafAny
        attributes={{ "data-slate-leaf": true }}
        leaf={{ className: "hljs-keyword" }}
        text={{ text: "const" }}
      >
        const
      </CodeSyntaxLeafAny>,
    );

    expect(screen.getByText("const")).toHaveClass("hljs-keyword");
  });
});
