import { createRef, type ComponentProps } from "react";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssetPreviewSidebar } from "@/pages/workspaces/assets/components/asset-preview-sidebar";
import type { AssetMasonryItem } from "@/types/assets-masonry";

const asset: AssetMasonryItem = {
  id: "asset-1",
  name: "hero.png",
  ext: "png",
  mimeType: "image/png",
  sizeText: "128 KB",
  createdAtText: "2026-04-15 10:00",
  checksumSha256: "abc123",
  indexable: true,
  altName: "Hero",
};

function createController(): ComponentProps<typeof AssetPreviewSidebar>["controller"] {
  return {
    t: (key: string) => key,
    uploaderName: "Philip Cole",
    uploaderAndTimeText: "Philip Cole · 2026-04-15",
    dateTime: {
      locale: "en-US",
      timezone: "UTC",
      dateFormat: undefined,
      useRelativeDateTime: false,
    },
    linkSnippets: {
      url: "https://cdn.example.com/hero.png",
      html: '<img src="https://cdn.example.com/hero.png" alt="hero.png" />',
      markdown: "![hero.png](https://cdn.example.com/hero.png)",
    },
    selectedTags: [],
    inputVisible: false,
    inputRef: createRef<HTMLInputElement>(),
    inputValue: "",
    setInputValue: vi.fn(),
    confirmAddTag: vi.fn(),
    setInputVisible: vi.fn(),
    removeTag: vi.fn(),
    altNameDraft: "Hero",
    setAltNameDraft: vi.fn(),
    dirtyRef: { current: { altName: false, tags: false } },
    saveState: "idle",
  } as unknown as ComponentProps<typeof AssetPreviewSidebar>["controller"];
}

describe("AssetPreviewSidebar", () => {
  it("renders Overview and Share as the first two accordion items", () => {
    render(
      <AssetPreviewSidebar
        active={asset}
        controller={createController()}
        currentFolderPathLabel="Root / Campaigns"
      />,
    );

    const accordion = screen.getByTestId("asset-preview-sidebar-accordion");
    const triggers = within(accordion)
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("aria-expanded"));

    expect(triggers[0]).toHaveTextContent("assets:ASSET_DIALOG_OVERVIEW");
    expect(triggers[1]).toHaveTextContent("assets:ASSET_DIALOG_SHARE");
    expect(triggers[2]).toHaveTextContent("assets:ASSET_META_ADVANCED_TITLE");
    expect(triggers[0]).toHaveAttribute("aria-expanded", "true");
    expect(triggers[1]).toHaveAttribute("aria-expanded", "false");
    expect(triggers[2]).toHaveAttribute("aria-expanded", "false");
    expect(triggers[2].parentElement?.parentElement).toHaveClass("last:border-b");
    expect(screen.getByText("Root / Campaigns")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Hero")).toBeInTheDocument();
    expect(screen.queryByText("https://cdn.example.com/hero.png")).toBeNull();
    expect(screen.queryByText("Philip Cole · 2026-04-15")).toBeNull();
    expect(screen.queryByRole("button", { name: "assets:ASSET_DIALOG_NOTES" })).toBeNull();
  });
});
