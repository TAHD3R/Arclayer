import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssetPreviewCell } from "@/pages/workspaces/assets/components/assets-view-table-cells";

const lazyImageCalls: Array<Record<string, unknown>> = [];

vi.mock("@/pages/workspaces/assets/components/lazy-asset-image", () => ({
  LazyAssetImage: (props: Record<string, unknown>) => {
    lazyImageCalls.push(props);
    return <div data-testid="lazy-asset-image" />;
  },
}));

describe("AssetPreviewCell", () => {
  beforeEach(() => {
    lazyImageCalls.length = 0;
  });

  it("uses the compact image-error fallback variant in table thumbnails", () => {
    render(
      <AssetPreviewCell
        asset={{
          id: "asset-1",
          name: "hero.png",
          mimeType: "image/png",
          previewUrl: "/assets/hero.png",
        }}
        subtitle="PNG · 2 MB"
      />,
    );

    expect(lazyImageCalls).toHaveLength(1);
    expect(lazyImageCalls[0]).toMatchObject({
      src: "/assets/hero.png",
      alt: "hero.png",
      fit: "cover",
      errorVariant: "icon-only",
    });
  });
});
