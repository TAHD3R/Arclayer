"use client";

// Animate UI components expect this module path for Sheet primitives.
// We reuse the project's existing Radix-based Sheet implementation to avoid style drift.
export {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
