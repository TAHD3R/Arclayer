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
});
