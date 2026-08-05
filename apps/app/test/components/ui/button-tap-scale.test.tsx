import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("motion/react", async () => {
  const ReactModule = await import("react");
  type MotionButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    whileTap?: { scale?: number };
  };

  const MotionButton = ReactModule.forwardRef<HTMLButtonElement, MotionButtonProps>(
    function MotionButton({ whileTap, ...props }, ref) {
      return (
        <button
          ref={ref}
          data-while-tap-scale={whileTap?.scale === undefined ? undefined : String(whileTap.scale)}
          {...props}
        />
      );
    },
  );

  return {
    motion: {
      button: MotionButton,
    },
  };
});

import { Button } from "@arclayer/ui/button";

describe("Button tap scale", () => {
  it("keeps tap motion enabled by default", () => {
    render(<Button>Open</Button>);

    expect(screen.getByRole("button", { name: "Open" })).toHaveAttribute(
      "data-while-tap-scale",
      "0.98",
    );
  });

  it("does not register tap motion when tapScale is disabled", () => {
    render(<Button tapScale={1}>Open dialog</Button>);

    expect(screen.getByRole("button", { name: "Open dialog" })).not.toHaveAttribute(
      "data-while-tap-scale",
    );
  });
});
