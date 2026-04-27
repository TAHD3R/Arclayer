import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { buildAssetMoreMenuItems } from "@/pages/workspaces/assets/components/asset-more-actions";
import { AssetMasonryTile } from "@/pages/workspaces/assets/components/asset-masonry-tile";
import type { AssetMasonryItem } from "@/types/assets-masonry";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const asset: AssetMasonryItem = {
  id: "asset-1",
  name: "hero.png",
  ext: "png",
  mimeType: "image/png",
  aspectRatio: 1.2,
  uploaderName: "Jane Doe",
};

const previewAsset: AssetMasonryItem = {
  ...asset,
  previewUrl: "https://cdn.example.com/hero.png",
};

describe("AssetMasonryTile", () => {
  const originalIntersectionObserver = globalThis.IntersectionObserver;

  beforeAll(() => {
    class MockIntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0];

      constructor(private readonly callback?: IntersectionObserverCallback) {}

      observe(target: Element) {
        this.callback?.([{ isIntersecting: true, target } as IntersectionObserverEntry], this);
      }
      disconnect() {}
      takeRecords() {
        return [];
      }
      unobserve() {}
    }

    globalThis.IntersectionObserver = MockIntersectionObserver as typeof IntersectionObserver;
  });

  afterAll(() => {
    globalThis.IntersectionObserver = originalIntersectionObserver;
  });

  it("opens the asset on the second click even after selection rerender", () => {
    const onOpen = vi.fn();
    const onSelect = vi.fn();

    function Harness() {
      const [selected, setSelected] = useState(false);

      return (
        <AssetMasonryTile
          asset={asset}
          selected={selected}
          onSelect={() => {
            onSelect();
            setSelected(true);
          }}
          onOpen={onOpen}
          onToggleSelected={vi.fn()}
        />
      );
    }

    const { container } = render(<Harness />);

    const tile = container.querySelector('[data-asset-tile="true"]');

    expect(tile).not.toBeNull();

    fireEvent.click(tile as HTMLElement, { detail: 1 });
    const rerenderedTile = container.querySelector('[data-asset-tile="true"]');
    expect(rerenderedTile).not.toBeNull();
    fireEvent.click(rerenderedTile as HTMLElement, { detail: 2 });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(asset);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("binds drag activator listeners on the tile root instead of a separate handle", () => {
    const onPointerDown = vi.fn();
    render(
      <AssetMasonryTile
        asset={asset}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        onToggleSelected={vi.fn()}
        dragHandle={{
          setNodeRef: vi.fn(),
          setActivatorNodeRef: vi.fn(),
          listeners: { onPointerDown },
          attributes: { "data-dnd-activator": "tile" },
          isDragging: false,
        }}
      />,
    );

    const tile = document.querySelector('[data-asset-tile="true"]');

    expect(tile).toHaveAttribute("data-dnd-activator", "tile");
    expect(screen.queryByLabelText("assets:ASSET_ACTION_MOVE")).not.toBeInTheDocument();

    fireEvent.pointerDown(tile as HTMLElement);

    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  it("keeps checkbox clicks local when checkbox affordance is enabled", () => {
    const onSelect = vi.fn();
    const onToggleSelected = vi.fn();

    render(
      <AssetMasonryTile
        asset={asset}
        selected
        onSelect={onSelect}
        onOpen={vi.fn()}
        onToggleSelected={onToggleSelected}
      />,
    );

    const checkbox = screen.getByRole("checkbox");

    fireEvent.pointerDown(checkbox);
    fireEvent.click(checkbox);

    expect(onToggleSelected).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("toggles selection on repeated checkbox clicks without affecting tile double click open", () => {
    const onOpen = vi.fn();

    function Harness() {
      const [selected, setSelected] = useState(false);

      return (
        <AssetMasonryTile
          asset={asset}
          selected={selected}
          onSelect={vi.fn()}
          onOpen={onOpen}
          onToggleSelected={() => setSelected((prev) => !prev)}
        />
      );
    }

    const { container } = render(<Harness />);
    const checkbox = screen.getByRole("checkbox");
    const tile = container.querySelector('[data-asset-tile="true"]');

    fireEvent.pointerDown(checkbox);
    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute("data-state", "checked");

    fireEvent.pointerDown(checkbox);
    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute("data-state", "unchecked");

    fireEvent.click(tile as HTMLElement, { detail: 2 });
    expect(onOpen).toHaveBeenCalledWith(asset);
  });

  it("uses tile-level selected styling without rendering a checkbox in tile affordance mode", () => {
    const { container } = render(
      <AssetMasonryTile
        asset={asset}
        selected
        selectionAffordance="tile"
        onSelect={vi.fn()}
        onOpen={vi.fn()}
      />,
    );

    const tile = container.querySelector('[data-asset-tile="true"]');

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(tile).toHaveAttribute("data-selected", "true");
    expect(tile).toHaveClass("rounded-lg");
    expect(tile).toHaveClass("border-primary/80");
    expect(
      screen.queryByRole("button", { name: "assets:ASSET_CLEAR_SELECTION" }),
    ).not.toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass("inset-0", "rounded-lg");
  });

  it("keeps edit actions local to the action button", () => {
    const onSelect = vi.fn();
    const onEdit = vi.fn();

    render(<AssetMasonryTile asset={asset} onSelect={onSelect} onOpen={vi.fn()} onEdit={onEdit} />);

    fireEvent.pointerDown(screen.getByLabelText("assets:ASSET_ACTION_EDIT"));
    fireEvent.click(screen.getByLabelText("assets:ASSET_ACTION_EDIT"));

    expect(onEdit).toHaveBeenCalledWith(asset);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("includes edit asset in the more actions menu", () => {
    const menuItems = buildAssetMoreMenuItems({
      t: (key: string) => key,
      asset,
      publicUrl: "https://cdn.example.com/hero.png",
    });

    expect(menuItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "item",
          key: "edit_asset",
          label: "assets:ASSET_ACTION_EDIT",
        }),
      ]),
    );
  });

  it("includes view details in the more actions menu", () => {
    const menuItems = buildAssetMoreMenuItems({
      t: (key: string) => key,
      asset,
      publicUrl: "https://cdn.example.com/hero.png",
    });

    expect(menuItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "item",
          key: "view_details",
          label: "assets:ASSET_ACTION_VIEW_DETAILS",
        }),
      ]),
    );
  });

  it("keeps the hover actions visible while the more menu is opening", () => {
    const onMoreAction = vi.fn();
    const menuItems = buildAssetMoreMenuItems({
      t: (key: string) => key,
      asset,
      publicUrl: "https://cdn.example.com/hero.png",
    });

    const { container } = render(
      <AssetMasonryTile
        asset={asset}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        moreMenuItems={menuItems}
        onMoreAction={onMoreAction}
      />,
    );

    const actions = container.querySelector('[data-tile-actions-visible="false"]');
    expect(actions).not.toBeNull();

    fireEvent.pointerDown(screen.getByLabelText("common:MORE"));
    fireEvent.click(screen.getByLabelText("common:MORE"));

    expect(container.querySelector('[data-tile-actions-visible="true"]')).not.toBeNull();
    expect(screen.getByRole("group")).toHaveClass("bg-black/55");
    expect(screen.getByRole("group")).not.toHaveClass("transition-opacity");
    expect(screen.getByRole("group")).not.toHaveClass("-translate-y-1");
    expect(onMoreAction).not.toHaveBeenCalled();
  });

  it("hides the hover toolbar after preview loading fails", () => {
    const menuItems = buildAssetMoreMenuItems({
      t: (key: string) => key,
      asset: previewAsset,
      publicUrl: "https://cdn.example.com/hero.png",
    });

    const { container } = render(
      <AssetMasonryTile
        asset={previewAsset}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        moreMenuItems={menuItems}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "hero.png" }));

    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("common:MORE")).not.toBeInTheDocument();
    expect(container.querySelector('[data-tile-actions-visible="true"]')).toBeNull();
    expect(container.querySelector('[data-tile-actions-visible="false"]')).toBeNull();
  });

  it("uses a larger and tighter hover toolbar treatment", () => {
    const menuItems = buildAssetMoreMenuItems({
      t: (key: string) => key,
      asset,
      publicUrl: "https://cdn.example.com/hero.png",
    });

    render(
      <AssetMasonryTile
        asset={asset}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        moreMenuItems={menuItems}
      />,
    );

    const toolbar = screen.getByRole("group");

    expect(toolbar).toHaveClass("rounded-md");
    expect(toolbar).not.toHaveClass("rounded-lg");
    expect(screen.getByLabelText("assets:ASSET_ACTION_EDIT")).toHaveAttribute(
      "data-size",
      "icon-sm",
    );
    expect(screen.getByLabelText("assets:ASSET_ACTION_DELETE")).toHaveAttribute(
      "data-size",
      "icon-sm",
    );
    expect(screen.getByLabelText("common:MORE")).toHaveAttribute("data-size", "icon-sm");
    expect(screen.getByLabelText("common:MORE")).toHaveClass("bg-white/10", "hover:bg-white/16");
    expect(screen.getByRole("group")).toHaveClass("bg-black/55");
  });
});
