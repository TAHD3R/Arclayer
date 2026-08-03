import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PlatformAurora } from "@/components/platform-aurora";

describe("PlatformAurora", () => {
  it("keeps the sign-in surface usable when WebGL is unavailable", () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    render(
      <div>
        <PlatformAurora />
        <p>Administrator sign-in</p>
      </div>,
    );

    expect(screen.getByText("Administrator sign-in")).toBeVisible();
    expect(getContext).toHaveBeenCalledWith("webgl2", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    });
    expect(warn).toHaveBeenCalledWith("Aurora was not rendered because WebGL is unavailable.");
  });
});
