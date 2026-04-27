import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssetPreviewCell } from "@/pages/workspaces/assets/components/assets-view-table-cells";

const lazyImageCalls: Array<Record<string, unknown>> = [];

vi.mock("@/pages/workspaces/assets/components/lazy-asset-image", () => ({
  LazyAssetImage: (props: Record<string, unknown>) => {
    lazyImageCalls.push(props);
    return (
      <button
        type="button"
        data-testid="lazy-asset-image"
        onClick={() => {
          const onError = props.onError;
          if (typeof onError === "function") onError();
        }}
      />
    );
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

  it("shows the file type icon when a table thumbnail fails to load", () => {
    const { container } = render(
      <AssetPreviewCell
        asset={{
          id: "asset-1",
          name: "GeoMotion_PRD.pdf",
          ext: "pdf",
          mimeType: "application/pdf",
          previewUrl: "/assets/document-thumb.jpg",
        }}
        subtitle="PDF · 3 KB"
      />,
    );

    fireEvent.click(screen.getByTestId("lazy-asset-image"));

    expect(container.querySelector('[data-asset-file-type-icon="true"]')).not.toBeNull();
  });

  it("renders the file type icon instead of an extension text fallback", () => {
    const { container } = render(
      <AssetPreviewCell
        asset={{
          id: "asset-1",
          name: "clip.mp4",
          ext: "mp4",
          mimeType: "video/mp4",
        }}
        subtitle="MP4 · 12 MB"
      />,
    );

    expect(lazyImageCalls).toHaveLength(0);
    expect(container.querySelector('[data-asset-file-type-icon="true"]')).not.toBeNull();
    expect(screen.queryByText("mp4")).not.toBeInTheDocument();
  });
});
