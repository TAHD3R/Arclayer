import fs from "node:fs/promises";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buttonVariants } from "@arclayer/ui/button";
import { SelectedCountTag } from "@/components/ui/tags";
import { BaseTag } from "@/components/ui/tags/tag-base";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const TOKENS_CSS_PATH = path.join(REPO_ROOT, "packages/ui/src/tokens.css");

describe("semantic typography contract", () => {
  it("uses the updated small-text scale in tokens", async () => {
    const tokensCss = await fs.readFile(TOKENS_CSS_PATH, "utf-8");

    expect(tokensCss).toContain("--font-size-footnote: 0.875rem;");
    expect(tokensCss).toContain("--font-size-caption: 0.875rem;");
  });

  it("uses semibold text in shared button variants", () => {
    const className = buttonVariants();

    expect(className).toContain("font-semibold");
    expect(className).not.toContain("font-medium");
  });

  it("keeps BaseTag on caption typography by default", () => {
    render(<BaseTag>Draft</BaseTag>);

    expect(screen.getByText("Draft").closest("span")?.parentElement).toHaveClass(
      "text-caption",
      "font-semibold!",
    );
  });

  it("lets semantic tag wrappers opt into footnote typography", () => {
    render(<SelectedCountTag label="3 selected" textStyle="footnote" />);

    expect(screen.getByText("3 selected").closest("span")?.parentElement).toHaveClass(
      "text-footnote",
    );
  });
});
