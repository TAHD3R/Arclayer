import { useId, type ReactNode } from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

export type MiniCategoryNavItem = {
  key: string;
  label: ReactNode;
  disabled?: boolean;
};

export type MiniCategoryNavProps = {
  items: readonly MiniCategoryNavItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
  className?: string;
  itemClassName?: string;
  itemHeightClassName?: string;
  indicatorLayoutId?: string;
  ariaLabel?: string;
};

export function MiniCategoryNav({
  items,
  selectedKey,
  onSelect,
  className,
  itemClassName,
  itemHeightClassName = "h-10",
  indicatorLayoutId,
  ariaLabel,
}: MiniCategoryNavProps) {
  const localId = useId();
  const layoutId = indicatorLayoutId ?? `mini-category-indicator:${localId}`;

  return (
    <nav aria-label={ariaLabel} className={cn("space-y-1.5", className)}>
      {items.map((item) => {
        const isActive = item.key === selectedKey;
        const isDisabled = Boolean(item.disabled);

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              if (isDisabled) return;
              onSelect(item.key);
            }}
            aria-current={isActive ? "true" : undefined}
            aria-disabled={isDisabled ? "true" : undefined}
            disabled={isDisabled}
            data-active={isActive ? "true" : "false"}
            className={cn(
              "relative flex w-full min-w-0 items-center rounded-lg",
              itemHeightClassName,
              "px-2 pl-6",
              "text-footnote",
              "transition-[color,background-color,transform,box-shadow] duration-200 ease-out",
              "motion-reduce:transition-none",
              "text-label-secondary hover:text-label-primary",
              "bg-transparent hover:bg-card/80 data-[active=true]:bg-accent/50",
              "data-[active=true]:font-semibold data-[active=true]:text-foreground",
              "data-[active=true]:translate-x-0.5",
              isDisabled
                ? cn(
                    "opacity-60 cursor-not-allowed",
                    "hover:bg-transparent hover:text-label-secondary",
                  )
                : "cursor-pointer",
              itemClassName,
            )}
          >
            {isActive ? (
              <motion.span
                layoutId={layoutId}
                layout="position"
                className="absolute left-2 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-primary/60"
                transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
              />
            ) : null}
            <span className="min-w-0 truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
