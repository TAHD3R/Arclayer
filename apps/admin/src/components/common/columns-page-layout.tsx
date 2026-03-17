import type { CSSProperties, ReactNode } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@arclayer/ui/sheet";

const COLUMNS_PAGE_SIDE_SLOT_MIN_WIDTH = "18rem";
const COLUMNS_PAGE_SIDE_SLOT_MAX_WIDTH = "28rem";
const COLUMNS_PAGE_SIDE_SLOT_DEFAULT_WIDTH = "22rem";
const COLUMNS_PAGE_SIDE_SLOT_TRANSITION = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1] as const,
};

export type ColumnsPageSideSlot = {
  content: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  mobileLabel?: ReactNode;
  className?: string;
  minWidth?: number | string;
  maxWidth?: number | string;
  defaultWidth?: number | string;
  sticky?: boolean;
  stickyTop?: number | string;
};

export type ColumnsPageSideSlots = {
  left?: ColumnsPageSideSlot;
  right?: ColumnsPageSideSlot;
};

export type ColumnsPagePaneToggle = {
  side: "left" | "right";
  slot: ColumnsPageSideSlot;
};

type ColumnsPageSideSlotStyle = CSSProperties & {
  "--columns-page-side-slot-default-width"?: string;
  "--columns-page-side-slot-max-width"?: string;
  "--columns-page-side-slot-min-width"?: string;
  "--columns-page-side-slot-sticky-top"?: string;
};

function resolvePageSlotSize(value: number | string | undefined, fallback: string): string {
  if (typeof value === "number") return `${value}px`;
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

function createPageSideSlotStyle(slot: ColumnsPageSideSlot): ColumnsPageSideSlotStyle {
  return {
    "--columns-page-side-slot-default-width": resolvePageSlotSize(
      slot.defaultWidth,
      COLUMNS_PAGE_SIDE_SLOT_DEFAULT_WIDTH,
    ),
    "--columns-page-side-slot-min-width": resolvePageSlotSize(
      slot.minWidth,
      COLUMNS_PAGE_SIDE_SLOT_MIN_WIDTH,
    ),
    "--columns-page-side-slot-max-width": resolvePageSlotSize(
      slot.maxWidth,
      COLUMNS_PAGE_SIDE_SLOT_MAX_WIDTH,
    ),
    "--columns-page-side-slot-sticky-top": resolvePageSlotSize(slot.stickyTop, "0px"),
  };
}

export function getColumnsPagePaneLabel(
  slot: ColumnsPageSideSlot,
  side: "left" | "right",
): ReactNode {
  return slot.mobileLabel ?? slot.title ?? (side === "left" ? "Left panel" : "Right panel");
}

export function ColumnsPageDesktopPane(props: {
  side: "left" | "right";
  slot: ColumnsPageSideSlot;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: props.side === "left" ? -12 : 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: props.side === "left" ? -12 : 12 }}
      transition={COLUMNS_PAGE_SIDE_SLOT_TRANSITION}
      className={clsx(
        "flex min-h-0 shrink-0 self-start",
        "[width:var(--columns-page-side-slot-default-width)]",
        "min-w-[var(--columns-page-side-slot-min-width)]",
        "max-w-[var(--columns-page-side-slot-max-width)]",
      )}
      data-slot="columns-page-side-slot"
      data-side={props.side}
      data-sticky={props.slot.sticky ? "true" : "false"}
      style={createPageSideSlotStyle(props.slot)}
    >
      <aside
        className={clsx(
          "flex min-h-0 w-full min-w-0 flex-col self-start",
          props.slot.sticky &&
            "sticky top-[var(--columns-page-side-slot-sticky-top)] max-h-[calc(100vh-var(--columns-page-side-slot-sticky-top))]",
          props.slot.className,
        )}
      >
        {props.slot.content}
      </aside>
    </motion.div>
  );
}

export function ColumnsPageMobilePaneSheet(props: {
  toggle: ColumnsPagePaneToggle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side={props.toggle.side} className="w-[min(90vw,28rem)] p-0" showCloseButton>
        <SheetHeader>
          <SheetTitle>{getColumnsPagePaneLabel(props.toggle.slot, props.toggle.side)}</SheetTitle>
          {props.toggle.slot.description ? (
            <SheetDescription>{props.toggle.slot.description}</SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="flex min-h-0 flex-1 overflow-auto">{props.toggle.slot.content}</div>
      </SheetContent>
    </Sheet>
  );
}
