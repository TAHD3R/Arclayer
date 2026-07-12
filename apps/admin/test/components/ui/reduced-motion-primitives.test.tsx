import * as React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@arclayer/hooks/use-prefers-reduced-motion", () => ({
  usePrefersReducedMotion: () => true,
}));

vi.mock("motion/react", async () => {
  const ReactModule = await import("react");
  type MotionDivProps = React.HTMLAttributes<HTMLDivElement> & {
    initial?: unknown;
    animate?: unknown;
    exit?: unknown;
    transition?: unknown;
  };

  const MotionDiv = ReactModule.forwardRef<HTMLDivElement, MotionDivProps>(function MotionDiv(
    { initial, animate: _animate, exit: _exit, transition, ...props },
    ref,
  ) {
    return (
      <div
        ref={ref}
        data-motion-initial={initial === false ? "false" : JSON.stringify(initial)}
        data-motion-transition={JSON.stringify(transition)}
        {...props}
      />
    );
  });

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: { div: MotionDiv },
  };
});

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@arclayer/ui/radix-primitives/radix-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@arclayer/ui/radix-primitives/radix-popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
} from "@arclayer/ui/radix-primitives/radix-sheet";

const REDUCED_MOTION_TRANSITION = JSON.stringify({ duration: 0 });

describe("reduced-motion primitives", () => {
  it("disables Dialog initial and transition motion", () => {
    render(
      <Dialog open>
        <DialogPortal>
          <DialogOverlay />
          <DialogContent>
            <DialogTitle>Dialog title</DialogTitle>
            <DialogDescription>Dialog description</DialogDescription>
          </DialogContent>
        </DialogPortal>
      </Dialog>,
    );

    expectReducedMotion(document.querySelector('[data-slot="dialog-overlay"]'));
    expectReducedMotion(document.querySelector('[data-slot="dialog-content"]'));
  });

  it("disables Popover initial and transition motion", () => {
    render(
      <Popover open>
        <PopoverTrigger>Open popover</PopoverTrigger>
        <PopoverContent>Popover content</PopoverContent>
      </Popover>,
    );

    expectReducedMotion(document.querySelector('[data-slot="popover-content"]'));
  });

  it("disables Sheet initial and transition motion", () => {
    render(
      <Sheet open>
        <SheetPortal>
          <SheetOverlay />
          <SheetContent>
            <SheetTitle>Sheet title</SheetTitle>
            <SheetDescription>Sheet description</SheetDescription>
          </SheetContent>
        </SheetPortal>
      </Sheet>,
    );

    expectReducedMotion(document.querySelector('[data-slot="sheet-overlay"]'));
    expectReducedMotion(document.querySelector('[data-slot="sheet-content"]'));
  });
});

function expectReducedMotion(element: Element | null) {
  expect(element).not.toBeNull();
  expect(element).toHaveAttribute("data-motion-initial", "false");
  expect(element).toHaveAttribute("data-motion-transition", REDUCED_MOTION_TRANSITION);
}
