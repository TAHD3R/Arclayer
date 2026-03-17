import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { AssetMasonryTile } from "@/pages/workspaces/assets/components/asset-masonry-tile";
import type { AssetMasonryItem } from "@/types/assets-masonry";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/common/entity-avatar", () => ({
  UserAvatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
}));

const asset: AssetMasonryItem = {
  id: "asset-1",
  name: "hero.png",
  ext: "png",
  mimeType: "image/png",
  aspectRatio: 1.2,
  uploaderName: "Jane Doe",
};

describe("AssetMasonryTile", () => {
  it("opens the asset on the second click even after selection rerender", () => {
    const onOpen = vi.fn();

    function Harness() {
      const [selected, setSelected] = useState(false);

      return (
        <AssetMasonryTile
          asset={asset}
          selected={selected}
          onSelect={() => setSelected(true)}
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

  it("keeps checkbox clicks local to the checkbox", () => {
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
});
