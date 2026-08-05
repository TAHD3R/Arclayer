import fs from "node:fs/promises";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buttonVariants } from "@arclayer/ui/button";
import { SelectedCountTag } from "@/components/ui/tags";
import { BaseTag, lucideTagIcon } from "@/components/ui/tags/tag-base";
import { RadioTower } from "lucide-react";

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

  it("keeps BaseTag text truncatable without shrinking its icon", () => {
    render(
      <div className="w-24">
        <BaseTag color="blue" icon={lucideTagIcon(RadioTower)}>
          Current storage profile with a very long name
        </BaseTag>
      </div>,
    );

    const label = screen.getByText("Current storage profile with a very long name");
    const labelWrapper = label.closest("span");
    const content = labelWrapper?.parentElement;
    const root = content?.parentElement;
    const icon = root?.querySelector("svg")?.parentElement;

    expect(root).toHaveClass("min-w-0", "max-w-full", "overflow-hidden");
    expect(content).toHaveClass("min-w-0", "max-w-full", "flex-1", "overflow-hidden");
    expect(labelWrapper).toHaveClass("min-w-0", "max-w-full", "flex-1", "truncate");
    expect(icon).toHaveClass("shrink-0");
  });

  it("lets semantic tag wrappers opt into footnote typography", () => {
    render(<SelectedCountTag label="3 selected" textStyle="footnote" />);

    expect(screen.getByText("3 selected").closest("span")?.parentElement).toHaveClass(
      "text-footnote",
    );
  });
});
