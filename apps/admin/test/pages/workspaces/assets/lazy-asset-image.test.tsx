import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { LazyAssetImage } from "@/pages/workspaces/assets/components/lazy-asset-image";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("LazyAssetImage", () => {
  const completeDescriptor = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "complete",
  );
  const naturalWidthDescriptor = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "naturalWidth",
  );
  const naturalHeightDescriptor = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "naturalHeight",
  );
  let imageComplete = false;
  let imageWidth = 0;
  let imageHeight = 0;

  beforeAll(() => {
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
      configurable: true,
      get: () => imageComplete,
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true,
      get: () => imageWidth,
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", {
      configurable: true,
      get: () => imageHeight,
    });
  });

  afterAll(() => {
    if (completeDescriptor) {
      Object.defineProperty(HTMLImageElement.prototype, "complete", completeDescriptor);
    }
    if (naturalWidthDescriptor) {
      Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", naturalWidthDescriptor);
    }
    if (naturalHeightDescriptor) {
      Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", naturalHeightDescriptor);
    }
  });

  it("clears the loading overlay when the browser cache already completed the image", async () => {
    imageComplete = true;
    imageWidth = 640;
    imageHeight = 320;

    render(<LazyAssetImage eager src="/assets/example.png" alt="Asset preview" />);

    await waitFor(() => {
      expect(screen.queryByRole("status", { name: /loading/i })).not.toBeInTheDocument();
    });

    expect(screen.getByRole("img", { name: "Asset preview" })).not.toHaveClass("opacity-0");
  });

  it("settles cached images only once even if a load event arrives afterward", async () => {
    imageComplete = true;
    imageWidth = 640;
    imageHeight = 320;
    const onLoaded = vi.fn();

    render(
      <LazyAssetImage eager src="/assets/example.png" alt="Asset preview" onLoaded={onLoaded} />,
    );

    const image = await screen.findByRole("img", { name: "Asset preview" });

    await waitFor(() => {
      expect(onLoaded).toHaveBeenCalledTimes(1);
    });

    fireEvent.load(image);

    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it("renders a compact icon-only error state when requested", async () => {
    imageComplete = true;
    imageWidth = 0;
    imageHeight = 0;
    const { container } = render(
      <div className="relative size-12">
        <LazyAssetImage
          eager
          src="/assets/missing.png"
          alt="Broken asset"
          errorVariant="icon-only"
        />
      </div>,
    );

    await waitFor(() => {
      expect(screen.queryByText("assets:ASSET_PREVIEW_LOAD_FAILED")).not.toBeInTheDocument();
    });

    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector(".rounded-full")).toBeNull();
  });
});
