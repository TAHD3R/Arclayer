import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Aurora from "@/components/Aurora";

describe("Aurora", () => {
  it("does not take down the surrounding page when WebGL is unavailable", () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    render(
      <div>
        <Aurora />
        <p>Authentication form</p>
      </div>,
    );

    expect(screen.getByText("Authentication form")).toBeVisible();
    expect(getContext).toHaveBeenCalledWith("webgl2", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    });
    expect(warn).toHaveBeenCalledWith("Aurora was not rendered because WebGL is unavailable.");
  });
});
