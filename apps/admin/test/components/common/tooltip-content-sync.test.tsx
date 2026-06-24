import * as React from "react";
import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";

function ExampleTooltip(props: { label: string }) {
  return (
    <TooltipProvider openDelay={0} closeDelay={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button">Trigger</button>
        </TooltipTrigger>
        <TooltipContent>{props.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

describe("Tooltip content sync", () => {
  it("updates overlay content after label rerender", async () => {
    const user = userEvent.setup();
    const view = render(<ExampleTooltip label="en-US label" />);

    const trigger = screen.getByRole("button", { name: "Trigger" });
    await user.hover(trigger);

    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
        "en-US label",
      );
    });

    await user.unhover(trigger);
    view.rerender(<ExampleTooltip label="zh-CN 文案" />);
    await user.hover(trigger);

    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
        "zh-CN 文案",
      );
    });
  });

  it("stays stable under StrictMode when the trigger rerenders repeatedly", () => {
    function StressTooltip() {
      const [tick, setTick] = React.useState(0);

      React.useEffect(() => {
        if (tick >= 8) return;
        setTick((current) => current + 1);
      }, [tick]);

      return (
        <TooltipProvider openDelay={0} closeDelay={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">Trigger {tick}</button>
            </TooltipTrigger>
            <TooltipContent>Tooltip body</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    expect(() =>
      render(
        <StrictMode>
          <StressTooltip />
        </StrictMode>,
      ),
    ).not.toThrow();
  });

  it("removes the overlay when the hovered trigger unmounts", async () => {
    const user = userEvent.setup();

    function ToggleTooltip() {
      const [visible, setVisible] = React.useState(true);

      return (
        <TooltipProvider openDelay={0} closeDelay={0}>
          {visible ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button">Trigger</button>
              </TooltipTrigger>
              <TooltipContent>Unmounting tooltip</TooltipContent>
            </Tooltip>
          ) : null}
          <button type="button" onClick={() => setVisible(false)}>
            Remove trigger
          </button>
        </TooltipProvider>
      );
    }

    render(<ToggleTooltip />);

    await user.hover(screen.getByRole("button", { name: "Trigger" }));
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
        "Unmounting tooltip",
      );
    });

    await user.click(screen.getByRole("button", { name: "Remove trigger" }));

    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="tooltip-content"]')).toBeNull();
    });
  });
});
