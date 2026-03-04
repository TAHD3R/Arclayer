import { useEffect, useId, useState, type ReactNode } from "react";
import { motion } from "motion/react";

import { cn } from "@celestial/lib/utils";

export type MiniCategoryNavItem = {
  key: string;
  label: ReactNode;
  disabled?: boolean;
};

export type MiniCategoryNavAnchorFollowOptions = {
  getAnchorId: (key: string) => string;
  root?: Element | null;
  rootMargin?: string;
  threshold?: number | number[];
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
  /**
   * When provided, the nav highlights the item whose anchor section is currently in view.
   *
   * - This is a *visual* follow behavior only: it doesn't call `onSelect`
   * - Keeps existing controlled `selectedKey` contract intact (no scroll loops)
   */
  anchorFollow?: MiniCategoryNavAnchorFollowOptions;
};

function useAnchorFollowedKey(
  items: readonly MiniCategoryNavItem[],
  options: MiniCategoryNavAnchorFollowOptions | undefined,
): string | null {
  const [followedKey, setFollowedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!options) return;
    if (typeof window === "undefined") return;
    if (typeof IntersectionObserver === "undefined") return;

    const elementToKey = new Map<Element, string>();
    for (const item of items) {
      const id = options.getAnchorId(item.key);
      const el = document.getElementById(id);
      if (!el) continue;
      elementToKey.set(el, item.key);
    }

    if (elementToKey.size === 0) return;

    const root = options.root ?? null;
    const rootMargin = options.rootMargin ?? "-20% 0px -70% 0px";
    const threshold = options.threshold ?? 0;

    const visibleTopsByKey = new Map<string, number>();

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = elementToKey.get(entry.target);
          if (!key) continue;

          if (entry.isIntersecting) visibleTopsByKey.set(key, entry.boundingClientRect.top);
          else visibleTopsByKey.delete(key);
        }

        let bestKey: string | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const [key, top] of visibleTopsByKey.entries()) {
          const distance = Math.abs(top);
          if (distance >= bestDistance) continue;
          bestDistance = distance;
          bestKey = key;
        }

        if (!bestKey) return;
        setFollowedKey(bestKey);
      },
      { root, rootMargin, threshold },
    );

    for (const el of elementToKey.keys()) obs.observe(el);

    return () => obs.disconnect();
  }, [items, options]);

  return followedKey;
}

export function MiniCategoryNav({
  items,
  selectedKey,
  onSelect,
  className,
  itemClassName,
  itemHeightClassName = "h-10",
  indicatorLayoutId,
  ariaLabel,
  anchorFollow,
}: MiniCategoryNavProps) {
  const localId = useId();
  const layoutId = indicatorLayoutId ?? `mini-category-indicator:${localId}`;
  const followedKey = useAnchorFollowedKey(items, anchorFollow);
  const activeKey = followedKey ?? selectedKey;

  return (
    <nav aria-label={ariaLabel} className={cn("space-y-1.5", className)}>
      {items.map((item) => {
        const isActive = item.key === activeKey;
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
