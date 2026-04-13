import type { VariantProps } from "class-variance-authority";

import { cva } from "class-variance-authority";
import { type PlateStaticProps, PlateStatic } from "platejs/static";

import { cn } from "@arclayer/lib/utils";

export const editorVariants = cva(
  cn(
    "group/editor",
    "relative w-full cursor-text select-text overflow-x-hidden whitespace-pre-wrap break-words",
    "rounded-md ring-offset-background focus-visible:outline-none",
    "placeholder:text-label-secondary/80 **:data-slate-placeholder:top-[auto_!important] **:data-slate-placeholder:text-label-secondary/80 **:data-slate-placeholder:opacity-100!",
    "[&_strong]:font-bold",
  ),
  {
    defaultVariants: {
      variant: "none",
    },
    variants: {
      disabled: {
        true: "cursor-not-allowed opacity-50",
      },
      focused: {
        true: "ring-2 ring-ring ring-offset-2",
      },
      variant: {
        ai: "w-full px-0 text-body md:text-footnote",
        aiChat:
          "max-h-[min(70vh,320px)] w-full overflow-y-auto px-5 py-3 text-body md:text-footnote",
        default: "size-full px-16 pt-4 pb-72 text-body sm:px-[max(64px,calc(50%-350px))]",
        demo: "size-full px-16 pt-4 pb-72 text-body sm:px-[max(64px,calc(50%-350px))]",
        fullWidth: "size-full px-16 pt-4 pb-72 text-body sm:px-24",
        none: "",
        select: "px-3 py-2 text-body data-readonly:w-fit",
      },
    },
  },
);

export function EditorStatic({
  className,
  variant,
  ...props
}: PlateStaticProps & VariantProps<typeof editorVariants>) {
  return <PlateStatic className={cn(editorVariants({ variant }), className)} {...props} />;
}
