import type { CSSProperties, ReactNode } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { Button } from "@arclayer/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@arclayer/ui/sheet";

const DEFAULT_PAGE_SIDE_SLOT_MIN_WIDTH = "18rem";
const DEFAULT_PAGE_SIDE_SLOT_MAX_WIDTH = "28rem";
const DEFAULT_PAGE_SIDE_SLOT_DEFAULT_WIDTH = "22rem";
const DEFAULT_PAGE_SIDE_SLOT_TRANSITION = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1] as const,
};

export type DefaultPageSideSlot = {
  content: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  mobileLabel?: ReactNode;
  className?: string;
  minWidth?: number | string;
  maxWidth?: number | string;
  defaultWidth?: number | string;
};

export type DefaultPageSideSlots = {
  left?: DefaultPageSideSlot;
  right?: DefaultPageSideSlot;
};

export type PaneToggle = {
  side: "left" | "right";
  slot: DefaultPageSideSlot;
};

type DefaultPageSideSlotStyle = CSSProperties & {
  "--default-page-side-slot-default-width"?: string;
  "--default-page-side-slot-max-width"?: string;
  "--default-page-side-slot-min-width"?: string;
};

export function resolvePageSlotSize(value: number | string | undefined, fallback: string): string {
  if (typeof value === "number") return `${value}px`;
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

function createPageSideSlotStyle(slot: DefaultPageSideSlot): DefaultPageSideSlotStyle {
  return {
    "--default-page-side-slot-default-width": resolvePageSlotSize(
      slot.defaultWidth,
      DEFAULT_PAGE_SIDE_SLOT_DEFAULT_WIDTH,
    ),
    "--default-page-side-slot-min-width": resolvePageSlotSize(
      slot.minWidth,
      DEFAULT_PAGE_SIDE_SLOT_MIN_WIDTH,
    ),
    "--default-page-side-slot-max-width": resolvePageSlotSize(
      slot.maxWidth,
      DEFAULT_PAGE_SIDE_SLOT_MAX_WIDTH,
    ),
  };
}

export function getPaneLabel(slot: DefaultPageSideSlot, side: "left" | "right"): ReactNode {
  return slot.mobileLabel ?? slot.title ?? (side === "left" ? "Left panel" : "Right panel");
}

export function DefaultPageDesktopPane(props: {
  side: "left" | "right";
  slot: DefaultPageSideSlot;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: props.side === "left" ? -12 : 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: props.side === "left" ? -12 : 12 }}
      transition={DEFAULT_PAGE_SIDE_SLOT_TRANSITION}
      className={clsx(
        "flex h-full min-h-0 shrink-0",
        "[width:var(--default-page-side-slot-default-width)]",
        "min-w-[var(--default-page-side-slot-min-width)]",
        "max-w-[var(--default-page-side-slot-max-width)]",
      )}
      data-slot="default-page-side-slot"
      data-side={props.side}
      style={createPageSideSlotStyle(props.slot)}
    >
      <aside
        className={clsx(
          "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden",
          props.slot.className,
        )}
      >
        {props.slot.content}
      </aside>
    </motion.div>
  );
}

export function DefaultPageMobilePaneSheet(props: {
  toggle: PaneToggle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side={props.toggle.side} className="w-[min(90vw,28rem)] p-0" showCloseButton>
        <SheetHeader>
          <SheetTitle>{getPaneLabel(props.toggle.slot, props.toggle.side)}</SheetTitle>
          {props.toggle.slot.description ? (
            <SheetDescription>{props.toggle.slot.description}</SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="flex min-h-0 flex-1 overflow-auto">{props.toggle.slot.content}</div>
      </SheetContent>
    </Sheet>
  );
}

export function DefaultPageMainRegion(props: {
  title?: ReactNode;
  description?: ReactNode;
  titleAdornment?: ReactNode;
  action?: ReactNode;
  extra?: ReactNode;
  contentClassName?: string;
  paneToggles: PaneToggle[];
  onOpenPane: (side: "left" | "right") => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={clsx("flex h-full min-h-0 min-w-0 w-full flex-1 flex-col", props.contentClassName)}
      data-slot="default-page-main-region"
    >
      {props.title ||
      props.description ||
      props.action ||
      props.extra ||
      props.paneToggles.length > 0 ? (
        <header className="mb-4">
          {props.title || props.action || props.paneToggles.length > 0 ? (
            <div className="flex items-center justify-between gap-4">
              <div className="my-2 flex min-w-0 items-end gap-2">
                {props.title ? (
                  <div className="text-title text-label-primary select-none">{props.title}</div>
                ) : null}
                {props.titleAdornment}
              </div>
              <div className="inline-flex shrink-0 items-center gap-2.5">
                {props.paneToggles.length > 0 ? (
                  <div className="inline-flex items-center gap-1 lg:hidden">
                    {props.paneToggles.map((toggle) => (
                      <Button
                        key={toggle.side}
                        variant="outline"
                        size="sm"
                        onClick={() => props.onOpenPane(toggle.side)}
                        aria-label={String(getPaneLabel(toggle.slot, toggle.side))}
                      >
                        {toggle.side === "left" ? (
                          <PanelLeftOpen className="size-4" />
                        ) : (
                          <PanelRightOpen className="size-4" />
                        )}
                        <span className="sr-only">{getPaneLabel(toggle.slot, toggle.side)}</span>
                      </Button>
                    ))}
                  </div>
                ) : null}
                {props.action}
              </div>
            </div>
          ) : null}
          {props.description ? (
            <div className="text-callout text-label-secondary select-none">{props.description}</div>
          ) : null}
          {props.extra ? <div className="mt-3.5">{props.extra}</div> : null}
        </header>
      ) : null}
      {props.children ? (
        <div className="min-h-0 min-w-0 w-full flex-1">{props.children}</div>
      ) : null}
    </div>
  );
}
